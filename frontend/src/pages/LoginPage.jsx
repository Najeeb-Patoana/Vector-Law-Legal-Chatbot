import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useForm } from 'react-hook-form'
import { useAuth } from '../context/AuthContext'
import { FiShield, FiAlertCircle, FiCheckCircle } from 'react-icons/fi'
import styles from '../styles/Auth.module.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading]         = useState(false)
  const [bannerError, setBannerError] = useState('')
  const [info, setInfo]               = useState('')

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ mode: 'onTouched' })

  const onSubmit = async ({ email, password }) => {
    setBannerError('')
    setInfo('')
    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      if (err.needsVerification || err.message?.toLowerCase().includes('verify')) {
        setInfo(err.message)
      } else if (err.errors) {
        if (err.errors.email)    setError('email',    { message: err.errors.email })
        if (err.errors.password) setError('password', { message: err.errors.password })
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

        <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Email */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
              type="email"
              placeholder="you@example.com"
              disabled={loading}
              autoComplete="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              {...register('email', {
                required: 'Email is required.',
                pattern: { value: EMAIL_RE, message: 'Please enter a valid email address (e.g. you@example.com).' },
              })}
            />
            {errors.email && (
              <p id="login-email-error" className={styles.fieldError} role="alert">
                <FiAlertCircle size={12} style={{ marginRight: 4, flexShrink: 0 }} />
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
              type="password"
              placeholder="••••••••"
              disabled={loading}
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
              {...register('password', {
                required: 'Password is required.',
              })}
            />
            {errors.password && (
              <p id="login-password-error" className={styles.fieldError} role="alert">
                <FiAlertCircle size={12} style={{ marginRight: 4, flexShrink: 0 }} />
                {errors.password.message}
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
