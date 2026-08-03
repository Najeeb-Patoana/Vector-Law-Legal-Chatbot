import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import * as authApi from '../services/authApi'
import { setApiToken } from '../services/authApi'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null)
  const [accessToken, setAccessToken] = useState(null)
  const [loading, setLoading]         = useState(true)  

  // ── Silent token refresh on page load ──────────────────────────────────────
  useEffect(() => {
    // No stored refresh token to check — the browser sends the HttpOnly cookie
    // automatically. Just attempt a silent refresh on every page load.
    authApi.refreshToken()
      .then((data) => {
        if (data.success) {
          setAccessToken(data.accessToken)
          setApiToken(data.accessToken)
          setUser(data.user)
        }
      })
      .catch(() => {
        // No valid session — user stays logged out
      })
      .finally(() => setLoading(false))
  }, [])

  // ── Access-token auto-refresh (every 13 minutes) ───────────────────────────
  useEffect(() => {
    if (!accessToken) return
    const interval = setInterval(async () => {
      try {
        // Cookie is sent automatically — no token argument needed
        const data = await authApi.refreshToken()
        if (data.success) {
          setAccessToken(data.accessToken)
          setApiToken(data.accessToken)
        }
      } catch {
        // Let the next API call surface the 401
      }
    }, 13 * 60 * 1000)
    return () => clearInterval(interval)
  }, [accessToken])

  // ── Auth helpers ───────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const data = await authApi.login({ email, password })
    if (!data.success) throw new Error(data.message)
    _storeSession(data)
    return data
  }, [])

  const register = useCallback(async (name, email, password) => {
    const data = await authApi.register({ name, email, password })
    if (!data.success) throw new Error(data.message)
    return data
  }, [])

  const loginWithGoogle = useCallback(async (credential) => {
    const data = await authApi.googleLogin(credential)
    if (!data.success) throw new Error(data.message)
    _storeSession(data)
    return data
  }, [])

 const logout = useCallback(async () => {
    try { if (accessToken) await authApi.logout() } catch { /* ignore */ }
    // No localStorage refresh token to remove — the server clears the HttpOnly cookie
    localStorage.removeItem('user')
    setAccessToken(null)
    setUser(null)
    setApiToken(null) 
  }, [accessToken])

  function _storeSession(data) {
    // refreshToken is now an HttpOnly cookie set by the server — never touch it here
    localStorage.setItem('user', JSON.stringify(data.user))
    setAccessToken(data.accessToken)
    setUser(data.user)
    setApiToken(data.accessToken) 
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, register, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
