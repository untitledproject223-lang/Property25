import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../data/AuthContext'
import { fetchInvite } from '../data/api'
import { homePathForRole } from '../portal/homePath'
import './LoginPage.css'

export default function InvitePage() {
  const { token = '' } = useParams()
  const { user, loading, acceptInvite } = useAuth()
  const [invite, setInvite] = useState<{
    email: string
    role: string
    orgName: string
  } | null>(null)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingInvite, setLoadingInvite] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const result = await fetchInvite(token)
        if (!cancelled) setInvite(result.data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Invalid invite')
        }
      } finally {
        if (!cancelled) setLoadingInvite(false)
      }
    }
    if (token) void load()
    return () => {
      cancelled = true
    }
  }, [token])

  if (!loading && user) return <Navigate to={homePathForRole(user)} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await acceptInvite({ token, fullName: fullName.trim(), password })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept invite')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <p className="login-eyebrow">Property25</p>
        <h1>Accept invite</h1>
        {loadingInvite ? (
          <p className="login-sub">Loading invite…</p>
        ) : invite ? (
          <p className="login-sub">
            Create your {invite.role} account for <strong>{invite.orgName}</strong> (
            {invite.email}).
          </p>
        ) : (
          <p className="login-sub">This invite link is invalid or expired.</p>
        )}

        {invite ? (
          <>
            <label>
              Full name
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
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
              />
            </label>
          </>
        ) : null}

        {error ? <p className="login-error">{error}</p> : null}

        {invite ? (
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account & sign in'}
          </button>
        ) : null}

        <p className="login-sub" style={{ marginTop: '1rem' }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
