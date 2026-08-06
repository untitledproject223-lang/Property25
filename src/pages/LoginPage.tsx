import { useMemo, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../data/AuthContext'
import { homePathForRole } from '../portal/homePath'
import './LoginPage.css'

type Mode = 'signin' | 'signup'
type SignupRole = 'agent' | 'landlord'

export default function LoginPage() {
  const { user, loading, login, signup } = useAuth()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')
  const [mode, setMode] = useState<Mode>('signin')
  const [signupRole, setSignupRole] = useState<SignupRole | null>(null)
  const [fullName, setFullName] = useState('')
  const [agencyName, setAgencyName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const passwordsMatch =
    password.length >= 6 && confirmPassword.length >= 6 && password === confirmPassword

  const canSubmitSignup = useMemo(() => {
    if (!signupRole || !fullName.trim() || !email.trim() || !passwordsMatch || submitting) {
      return false
    }
    if (signupRole === 'landlord' && phone.trim().length < 5) return false
    return true
  }, [signupRole, fullName, email, passwordsMatch, submitting, phone])

  if (!loading && user) {
    const safeNext =
      next && next.startsWith('/') && !next.startsWith('//') ? next : null
    return <Navigate to={safeNext || homePathForRole(user)} replace />
  }

  function startSignup(role: SignupRole) {
    setMode('signup')
    setSignupRole(role)
    setError(null)
    setPassword('')
    setConfirmPassword('')
  }

  function backToSignIn() {
    setMode('signin')
    setSignupRole(null)
    setError(null)
    setFullName('')
    setAgencyName('')
    setPhone('')
    setConfirmPassword('')
  }

  async function onSignIn(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await login(email.trim(), password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function onSignUp(e: FormEvent) {
    e.preventDefault()
    if (!signupRole || !canSubmitSignup) return
    setSubmitting(true)
    setError(null)
    try {
      await signup({
        role: signupRole,
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        agencyName: agencyName.trim() || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account')
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'signup' && signupRole) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={onSignUp}>
          <p className="login-eyebrow">Property25</p>
          <h1>Sign up as {signupRole === 'agent' ? 'agent' : 'landlord'}</h1>
          <p className="login-sub">
            {signupRole === 'agent'
              ? 'Create an agent account to manage units, tenants, and applications.'
              : 'Create a landlord account to manage your units, tenants, and invoices.'}
          </p>

          <label>
            Full name
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
            />
          </label>

          {signupRole === 'agent' ? (
            <label>
              Agency / brokerage name
              <input
                type="text"
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                placeholder="Optional — defaults to your name"
                autoComplete="organization"
              />
            </label>
          ) : (
            <label>
              Phone
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+27 82 000 0000"
                required
                autoComplete="tel"
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </label>
          {confirmPassword.length > 0 ? (
            <p
              className="login-sub"
              style={{ margin: 0, color: passwordsMatch ? '#8fd4a8' : '#f0b4b0' }}
            >
              {passwordsMatch ? 'Password matches' : 'Passwords do not match'}
            </p>
          ) : null}

          {error ? <p className="login-error">{error}</p> : null}

          <button type="submit" disabled={!canSubmitSignup}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>

          <button type="button" className="login-secondary-btn" onClick={backToSignIn}>
            Back to sign in
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSignIn}>
        <p className="login-eyebrow">Property25</p>
        <h1>Sign in</h1>
        <p className="login-sub">
          {next?.startsWith('/unit-invite/')
            ? 'Sign in with your agent account to accept the unit.'
            : 'Use your Property25 account to continue.'}
        </p>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>

        {error ? <p className="login-error">{error}</p> : null}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="login-signup-block">
          <p className="login-sub" style={{ margin: 0 }}>
            New here? Create an account:
          </p>
          <div className="login-signup-actions">
            <button
              type="button"
              className="login-secondary-btn"
              onClick={() => startSignup('agent')}
            >
              Sign up as agent
            </button>
            <button
              type="button"
              className="login-secondary-btn"
              onClick={() => startSignup('landlord')}
            >
              Sign up as landlord
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
