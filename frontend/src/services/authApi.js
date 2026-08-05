import axios from 'axios'

// No baseURL — all requests use relative paths (e.g. /api/auth/login)
// so they are forwarded by the Vite dev proxy to the backend.
// In production, configure a reverse proxy or set VITE_API_URL at build time.
const API = axios.create({
  baseURL:         import.meta.env.VITE_API_URL || '',
  withCredentials: true, // Send/receive HttpOnly cookies automatically
})

// ── In-memory token store ────────────────────────────────────────────────────
let currentToken = null;

// The AuthProvider will call this to give Axios the token behind the scenes
export const setApiToken = (token) => {
  currentToken = token;
}

// ── Logout callback ───────────────────────────────────────────────────────────
// AuthProvider registers its logout fn here so the response interceptor can
// trigger a clean logout on refresh failure — without a circular import.
let _onLogout = null;
export const setOnLogout = (fn) => { _onLogout = fn; }

// ── Dedicated refresh client ──────────────────────────────────────────────────
// A plain Axios instance with NO interceptors, used only for the /refresh call.
// This is the key to preventing infinite loops: the main API interceptor
// will never intercept requests made through this client.
const refreshClient = axios.create({
  baseURL:         import.meta.env.VITE_API_URL || '',
  withCredentials: true,
})

// ── Shared refresh promise ────────────────────────────────────────────────────
// Ensures that only ONE /refresh request is ever in flight at a time.
// If multiple requests receive 401 simultaneously, they all await the same
// promise instead of each firing their own /refresh call.
let refreshPromise = null;

function doRefresh() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = refreshClient
    .post('/api/auth/refresh')
    .then(({ data }) => {
      setApiToken(data.accessToken);
      return data.accessToken;
    })
    .finally(() => {
      // Always clear the shared promise so the next genuine 401
      // can start a fresh refresh cycle.
      refreshPromise = null;
    });

  return refreshPromise;
}

// ── Request interceptor: attach access token ─────────────────────────────────
API.interceptors.request.use(
  (config) => {
    if (currentToken) {
      config.headers.Authorization = `Bearer ${currentToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptors ─────────────────────────────────────────────────────
// Stage 1 — Auto-refresh on 401.
// When a request fails with 401 (expired access token), this interceptor:
//   1. Marks the original config with _retry to prevent infinite retries.
//   2. Calls doRefresh() which fans all concurrent 401s into a single
//      /api/auth/refresh request via the interceptor-free refreshClient.
//      The HttpOnly cookie is sent automatically (withCredentials: true).
//   3. Updates the in-memory token and retries the original request.
//   4. On refresh failure, clears auth state and rejects the refresh error
//      (not the original 401) so callers get actionable error info.
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh for 401s on protected routes that haven't already been retried.
    // Auth endpoints (login, register, google) intentionally return 401 for wrong credentials
    // — we must NOT intercept those or we'll swallow the user-facing error message.
    const url = originalRequest?.url || '';
    const isAuthEndpoint = /\/api\/auth\/(login|register|google)/.test(url);

    if (error?.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        // Fan all concurrent 401s into a single shared refresh request
        const newToken = await doRefresh();

        // Replay the original request with the fresh token
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return API(originalRequest);
      } catch (refreshError) {
        // Refresh failed (expired/missing cookie) — force logout.
        // Reject with the refresh error (not the original 401) so callers
        // get the actual failure reason for debugging.
        setApiToken(null);
        if (_onLogout) _onLogout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Stage 2 — Map server error messages to friendly Error objects.
// Runs after the refresh interceptor so retried requests also get
// friendly messages if they still fail for a non-auth reason.
API.interceptors.response.use(
  (response) => response,
  (error) => {
    const serverMessage = error?.response?.data?.message;
    if (serverMessage) {
      const friendlyError = new Error(serverMessage);
      // Preserve any extra fields (e.g. needsVerification, errors)
      Object.assign(friendlyError, error.response.data);
      return Promise.reject(friendlyError);
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const register = (data) =>
  API.post('/api/auth/register', data).then((r) => r.data)

export const login = (data) =>
  API.post('/api/auth/login', data).then((r) => r.data)

export const googleLogin = (credential) =>
  API.post('/api/auth/google', { credential }).then((r) => r.data)

// No body needed — the HttpOnly cookie is sent automatically by the browser
export const refreshToken = () =>
  API.post('/api/auth/refresh').then((r) => r.data)

// Token is now attached automatically by the interceptor!
export const logout = () =>
  API.post('/api/auth/logout').then((r) => r.data)

// ── Chat Sessions ─────────────────────────────────────────────────────────────

export const getSessions = () =>
  API.get('/api/chat/sessions').then((r) => r.data)

export const createSession = (title = 'New Chat') =>
  API.post('/api/chat/sessions', { title }).then((r) => r.data)

export const deleteSession = (sessionId) =>
  API.delete(`/api/chat/sessions/${sessionId}`).then((r) => r.data)

export const renameSession = (sessionId, title) =>
  API.patch(`/api/chat/sessions/${sessionId}/title`, { title }).then((r) => r.data)

// ── Messages ──────────────────────────────────────────────────────────────────
export const getMessages = (sessionId) =>
  API.get(`/api/chat/sessions/${sessionId}/messages`).then((r) => r.data)

export const saveMessage = (sessionId, role, content) =>
  API.post(`/api/chat/sessions/${sessionId}/messages`, { role, content }).then((r) => r.data)