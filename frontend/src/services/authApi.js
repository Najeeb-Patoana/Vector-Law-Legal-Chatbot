import axios from 'axios'

// No baseURL — all requests use relative paths (e.g. /api/auth/login)
// so they are forwarded by the Vite dev proxy to the backend.
// In production, configure a reverse proxy or set VITE_API_URL at build time.
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
})
let currentToken = null;

// The AuthProvider will call this to give Axios the token behind the scenes
export const setApiToken = (token) => {
  currentToken = token;
}

API.interceptors.request.use(
  (config) => {
    if (currentToken) {
      config.headers.Authorization = `Bearer ${currentToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Extract user-friendly messages from server error responses
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

export const refreshToken = (refreshToken) =>
  API.post('/api/auth/refresh', { refreshToken }).then((r) => r.data)

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