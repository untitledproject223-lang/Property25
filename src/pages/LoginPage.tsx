import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../data/AuthContext'
import { homePathForRole } from '../portal/homePath'
import './LoginPage.css'

export default function LoginPage() {
  const { user, loading, login } = useAuth()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) {
    const safeNext =
      next && next.startsWith('/') && !next.startsWith('//') ? next : null
    return <Navigate to={safeNext || homePathForRole(user)} replace />
  }

  async function onSubmit(e: FormEvent) {
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

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
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
      </form>
    </div>
  )
}
