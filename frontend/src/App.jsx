import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ChatProvider } from './context/ChatContext'
import Navbar from './components/Navbar.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import ChatDashboard from './pages/ChatDashboard.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import './styles/global.css'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

const LoadingSpinner = (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', background: '#060b14',
    flexDirection: 'column', gap: 16,
  }}>
    <div style={{
      width: 40, height: 40,
      border: '3px solid rgba(15,118,110,0.2)',
      borderTopColor: '#0f766e',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <span style={{ color: '#475569', fontSize: '0.85rem' }}>Loading…</span>
  </div>
)

function AppRoutes() {
  const { user, loading } = useAuth()

  return (
    <BrowserRouter>
      <Routes>
        {/* Auth pages — redirect to "/" if already logged in */}
        <Route
          path="/login"
          element={user && !loading ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/register"
          element={user && !loading ? <Navigate to="/" replace /> : <RegisterPage />}
        />

        {["/", "/chat/:sessionId"].map((path) => (
          <Route
            key={path}
            path={path}
            element={
              loading
                ? LoadingSpinner
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                    <Navbar />
                    <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <ChatDashboard />
                    </main>
                  </div>
                )
            }
          />
        ))}

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <ChatProvider>
          <AppRoutes />
        </ChatProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  )
}
