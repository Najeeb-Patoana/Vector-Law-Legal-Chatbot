import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { FiShield, FiAlertCircle, FiCheckCircle } from 'react-icons/fi'
import styles from '../styles/Auth.module.css'

// ── Client-side validators (mirror the server) ────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const NAME_RE  = /^[a-zA-Z\s'-]{2,60}$/

function validateName(v) {
  if (!v?.trim())           return 'Full name is required.'
  if (v.trim().length < 2)  return 'Name must be at least 2 characters.'
  if (v.trim().length > 60) return 'Name must not exceed 60 characters.'
  if (!NAME_RE.test(v.trim())) return "Name may only contain letters, spaces, hyphens, and apostrophes."
  return ''
}

function validateEmail(v) {
  if (!v?.trim())              return 'Email is required.'
  if (!EMAIL_RE.test(v.trim())) return 'Please enter a valid email address (e.g. you@example.com).'
  return ''
}

function validatePassword(v) {
  if (!v)          return 'Password is required.'
  if (v.length < 8)  return 'Password must be at least 8 characters.'
  if (v.length > 72) return 'Password must not exceed 72 characters.'
  return ''
}

export default function RegisterPage() {
  const { register, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [success, setSuccess]   = useState(false)

  // Per-field error state
  const [fieldErrors, setFieldErrors] = useState({ name: '', email: '', password: '' })
  // General banner error (e.g. server errors)
  const [bannerError, setBannerError] = useState('')

  const setFieldError = (field, msg) =>
    setFieldErrors((prev) => ({ ...prev, [field]: msg }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBannerError('')

    // Run all validators
    const nameErr  = validateName(name)
    const emailErr = validateEmail(email)
    const passErr  = validatePassword(password)
    setFieldErrors({ name: nameErr, email: emailErr, password: passErr })
    if (nameErr || emailErr || passErr) return  // abort if any invalid

    setLoading(true)
    try {
      await register(name.trim(), email.trim(), password)
      setSuccess(true)
    } catch (err) {
      // Server may return per-field errors
      if (err.errors) {
        setFieldErrors((prev) => ({
          ...prev,
          name:     err.errors.name     || prev.name,
          email:    err.errors.email    || prev.email,
          password: err.errors.password || prev.password,
        }))
      } else {
        setBannerError(err.message || 'Registration failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.card} style={{ textAlign: 'center' }}>
          <div className={styles.logo}>
            <div className={styles.logoIcon} style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}>
              <FiCheckCircle size={26} />
            </div>
          </div>
          <h2 className={styles.heading}>Check your inbox!</h2>
          <p className={styles.subheading} style={{ maxWidth: 320, margin: '0 auto 24px' }}>
            We sent a verification link to <strong style={{ color: '#e2e8f0' }}>{email}</strong>.
            Click the link to activate your account, then come back to log in.
          </p>
          <Link to="/login" className={styles.submitBtn} style={{ textDecoration: 'none', display: 'inline-flex', width: 'auto', padding: '12px 32px' }}>
            Go to Login
          </Link>
        </div>
      </div>
    )
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

        <h2 className={styles.heading}>Create your account</h2>
        <p className={styles.subheading}>Free access to AI-powered legal research</p>

        {bannerError && (
          <div className={styles.errorBanner} role="alert">
            <FiAlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            {bannerError}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {/* Full Name */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="reg-name">Full Name</label>
            <input
              id="reg-name"
              className={`${styles.input} ${fieldErrors.name ? styles.inputError : ''}`}
              type="text"
              placeholder="Your Name"
              value={name}
              onChange={(e) => { setName(e.target.value); if (fieldErrors.name) setFieldError('name', validateName(e.target.value)) }}
              onBlur={() => setFieldError('name', validateName(name))}
              disabled={loading}
              autoComplete="name"
              aria-describedby={fieldErrors.name ? 'reg-name-error' : undefined}
              aria-invalid={!!fieldErrors.name}
            />
            {fieldErrors.name && (
              <p id="reg-name-error" className={styles.fieldError} role="alert">
                <FiAlertCircle size={12} style={{ marginRight: 4, flexShrink: 0 }} />
                {fieldErrors.name}
              </p>
            )}
          </div>

          {/* Email */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              className={`${styles.input} ${fieldErrors.email ? styles.inputError : ''}`}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldError('email', validateEmail(e.target.value)) }}
              onBlur={() => setFieldError('email', validateEmail(email))}
              disabled={loading}
              autoComplete="email"
              aria-describedby={fieldErrors.email ? 'reg-email-error' : undefined}
              aria-invalid={!!fieldErrors.email}
            />
            {fieldErrors.email && (
              <p id="reg-email-error" className={styles.fieldError} role="alert">
                <FiAlertCircle size={12} style={{ marginRight: 4, flexShrink: 0 }} />
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="reg-password">
              Password <span style={{ color: '#475569', textTransform: 'none', letterSpacing: 0 }}>(8–72 chars)</span>
            </label>
            <input
              id="reg-password"
              className={`${styles.input} ${fieldErrors.password ? styles.inputError : ''}`}
              type="password"
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (fieldErrors.password) setFieldError('password', validatePassword(e.target.value)) }}
              onBlur={() => setFieldError('password', validatePassword(password))}
              disabled={loading}
              autoComplete="new-password"
              aria-describedby={fieldErrors.password ? 'reg-password-error' : undefined}
              aria-invalid={!!fieldErrors.password}
            />
            {fieldErrors.password && (
              <p id="reg-password-error" className={styles.fieldError} role="alert">
                <FiAlertCircle size={12} style={{ marginRight: 4, flexShrink: 0 }} />
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            className={styles.submitBtn}
            type="submit"
            disabled={loading}
            id="register-submit-btn"
          >
            {loading ? <span className={styles.spinner} /> : null}
            {loading ? 'Creating account…' : 'Create Account'}
          </button>

          <div className={styles.divider}>or sign up with</div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <GoogleLogin
              onSuccess={async (credentialResponse) => {
                setLoading(true)
                setBannerError('')
                try {
                  await loginWithGoogle(credentialResponse.credential)
                  navigate('/', { replace: true })
                } catch (e) {
                  setBannerError(e.message || 'Google sign-up failed.')
                } finally {
                  setLoading(false)
                }
              }}
              onError={() => setBannerError('Google sign-up failed or was cancelled.')}
              theme="filled_black"
              shape="rectangular"
              size="large"
              text="signup_with"
              width="368"
            />
          </div>
        </form>

        <p className={styles.footer}>
          Already have an account?{' '}
          <Link to="/login" className={styles.footerLink}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
