import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useForm } from 'react-hook-form'
import { useAuth } from '../context/AuthContext'
import { FiShield, FiAlertCircle, FiCheckCircle } from 'react-icons/fi'
import styles from '../styles/Auth.module.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const NAME_RE  = /^[a-zA-Z\s'-]{2,60}$/

export default function RegisterPage() {
  const { register: registerUser, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading]     = useState(false)
  const [success, setSuccess]     = useState(false)
  const [bannerError, setBannerError] = useState('')

  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors },
  } = useForm({ mode: 'onTouched' })

  const onSubmit = async ({ name, email, password }) => {
    setBannerError('')
    setLoading(true)
    try {
      await registerUser(name.trim(), email.trim(), password)
      setSuccess(true)
    } catch (err) {
      if (err.errors) {
        if (err.errors.name)     setError('name',     { message: err.errors.name })
        if (err.errors.email)    setError('email',    { message: err.errors.email })
        if (err.errors.password) setError('password', { message: err.errors.password })
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
            We sent a verification link to <strong style={{ color: '#e2e8f0' }}>{getValues('email')}</strong>.
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

        <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
          {/* Full Name */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="reg-name">Full Name</label>
            <input
              id="reg-name"
              className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
              type="text"
              placeholder="Your Name"
              disabled={loading}
              autoComplete="name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'reg-name-error' : undefined}
              {...register('name', {
                required: 'Full name is required.',
                minLength: { value: 2, message: 'Name must be at least 2 characters.' },
                maxLength: { value: 60, message: 'Name must not exceed 60 characters.' },
                pattern: { value: NAME_RE, message: "Name may only contain letters, spaces, hyphens, and apostrophes." },
              })}
            />
            {errors.name && (
              <p id="reg-name-error" className={styles.fieldError} role="alert">
                <FiAlertCircle size={12} style={{ marginRight: 4, flexShrink: 0 }} />
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Email */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              className={`${styles.input} ${errors.email ? styles.inputError : ''}`}
              type="email"
              placeholder="you@example.com"
              disabled={loading}
              autoComplete="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'reg-email-error' : undefined}
              {...register('email', {
                required: 'Email is required.',
                pattern: { value: EMAIL_RE, message: 'Please enter a valid email address (e.g. you@example.com).' },
              })}
            />
            {errors.email && (
              <p id="reg-email-error" className={styles.fieldError} role="alert">
                <FiAlertCircle size={12} style={{ marginRight: 4, flexShrink: 0 }} />
                {errors.email.message}
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
              className={`${styles.input} ${errors.password ? styles.inputError : ''}`}
              type="password"
              placeholder="Create a strong password"
              disabled={loading}
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'reg-password-error' : undefined}
              {...register('password', {
                required: 'Password is required.',
                minLength: { value: 8, message: 'Password must be at least 8 characters.' },
                maxLength: { value: 72, message: 'Password must not exceed 72 characters.' },
              })}
            />
            {errors.password && (
              <p id="reg-password-error" className={styles.fieldError} role="alert">
                <FiAlertCircle size={12} style={{ marginRight: 4, flexShrink: 0 }} />
                {errors.password.message}
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
