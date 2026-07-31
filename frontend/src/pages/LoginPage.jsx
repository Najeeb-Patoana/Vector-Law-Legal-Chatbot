import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { FiShield, FiAlertCircle, FiCheckCircle } from 'react-icons/fi'
import styles from '../styles/Auth.module.css'

// ── Client-side validators ────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function validateEmail(v) {
  if (!v?.trim())               return 'Email is required.'
  if (!EMAIL_RE.test(v.trim())) return 'Please enter a valid email address (e.g. you@example.com).'
  return ''
}

function validatePassword(v) {
  if (!v) return 'Password is required.'
  return ''
}

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)

  // Per-field errors
  const [fieldErrors, setFieldErrors] = useState({ email: '', password: '' })
  // Banner: general errors or info (e.g. needs verification)
  const [bannerError, setBannerError] = useState('')
  const [info, setInfo]               = useState('')

  const setFieldError = (field, msg) =>
    setFieldErrors((prev) => ({ ...prev, [field]: msg }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBannerError('')
    setInfo('')

    const emailErr = validateEmail(email)
    const passErr  = validatePassword(password)
    setFieldErrors({ email: emailErr, password: passErr })
    if (emailErr || passErr) return

    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      if (err.needsVerification || err.message?.toLowerCase().includes('verify')) {
        setInfo(err.message)
      } else if (err.errors) {
        setFieldErrors((prev) => ({
          ...prev,
          email:    err.errors.email    || prev.email,
          password: err.errors.password || prev.password,
        }))
      } else {
        setBannerError(err.message || 'Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true)
    setBannerError('')
    setInfo('')
    try {
      await loginWithGoogle(credentialResponse.credential)
      navigate('/', { replace: true })
    } catch (err) {
      setBannerError(err.message || 'Google login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {/* Logo */}
        <Link to="/" className={styles.logo} style={{ textDecoration: 'none' }}>
          <div className={styles.logoIcon}><FiShield size={26} /></div>
          <h1 className={styles.logoTitle}>Vector Law</h1>
          <span className={styles.logoSub}>AI-Powered Legal Research</span>
        </Link>

        <h2 className={styles.heading}>Welcome back</h2>
        <p className={styles.subheading}>Sign in to continue your legal research</p>

        {bannerError && (
          <div className={styles.errorBanner} role="alert">
            <FiAlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            {bannerError}
          </div>
        )}
        {info && (
          <div className={styles.infoBanner} role="status">
            <FiCheckCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            {info}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className={`${styles.input} ${fieldErrors.email ? styles.inputError : ''}`}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldError('email', validateEmail(e.target.value)) }}
              onBlur={() => setFieldError('email', validateEmail(email))}
              disabled={loading}
              autoComplete="email"
              aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && (
              <p id="login-email-error" className={styles.fieldError} role="alert">
                <FiAlertCircle size={12} style={{ marginRight: 4, flexShrink: 0 }} />
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className={`${styles.input} ${fieldErrors.password ? styles.inputError : ''}`}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldError('password', validatePassword(e.target.value)) }}
              onBlur={() => setFieldError('password', validatePassword(password))}
              disabled={loading}
              autoComplete="current-password"
              aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
              aria-invalid={!!fieldErrors.password}
            />
            {fieldErrors.password && (
              <p id="login-password-error" className={styles.fieldError} role="alert">
                <FiAlertCircle size={12} style={{ marginRight: 4, flexShrink: 0 }} />
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            className={styles.submitBtn}
            type="submit"
            disabled={loading}
            id="login-submit-btn"
          >
            {loading ? <span className={styles.spinner} /> : null}
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <div className={styles.divider}>or continue with</div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setBannerError('Google sign-in failed or was cancelled.')}
              theme="filled_black"
              shape="rectangular"
              size="large"
              text="signin_with"
              width="368"
            />
          </div>
        </form>

        <p className={styles.footer}>
          Don&apos;t have an account?{' '}
          <Link to="/register" className={styles.footerLink}>Create one free</Link>
        </p>
      </div>
    </div>
  )
}
