import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../data/AuthContext'
import { acceptUnitAgentInvite, fetchUnitAgentInvite } from '../data/api'
import { homePathForRole } from '../portal/homePath'
import './LoginPage.css'

export default function UnitAgentInvitePage() {
  const { token = '' } = useParams()
  const { user, loading } = useAuth()
  const [invite, setInvite] = useState<{
    unitNumber: string
    buildingName: string
    buildingAddress: string
    landlordName: string
    orgName: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingInvite, setLoadingInvite] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (!user || loading) return
    let cancelled = false
    async function load() {
      setLoadingInvite(true)
      try {
        const result = await fetchUnitAgentInvite(token)
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
  }, [token, user, loading])

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card">Loading…</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(`/unit-invite/${token}`)}`} replace />
  }

  if (user.role !== 'admin' && user.role !== 'agent') {
    return <Navigate to={homePathForRole(user)} replace />
  }

  async function onAccept() {
    setAccepting(true)
    setError(null)
    try {
      await acceptUnitAgentInvite(token)
      setAccepted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept unit')
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <p className="login-eyebrow">Property25</p>
        <h1>Accept unit admin</h1>
        {loadingInvite ? (
          <p className="login-sub">Loading invite…</p>
        ) : invite ? (
          <p className="login-sub">
            <strong>{invite.landlordName}</strong> invited you to manage{' '}
            <strong>
              {invite.buildingName} · Unit {invite.unitNumber}
            </strong>{' '}
            ({invite.orgName}).
          </p>
        ) : (
          <p className="login-sub">This invite link is invalid or expired.</p>
        )}

        {error ? <p className="login-error">{error}</p> : null}

        {accepted ? (
          <>
            <p className="login-sub" style={{ color: '#8fd4a8' }}>
              You now have admin rights for this unit.
            </p>
            <Link to="/" className="btn btn-primary" style={{ textAlign: 'center' }}>
              Go to dashboard
            </Link>
          </>
        ) : invite ? (
          <button type="button" disabled={accepting} onClick={() => void onAccept()}>
            {accepting ? 'Accepting…' : 'Accept unit'}
          </button>
        ) : null}

        <p className="login-sub" style={{ marginTop: '1rem' }}>
          Signed in as {user.email}. <Link to="/">Back</Link>
        </p>
      </div>
    </div>
  )
}
