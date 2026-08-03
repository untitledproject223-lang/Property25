import { useEffect, useState } from 'react'
import { fetchTenantProfile } from '../../data/api'

export default function TenantProfilePage() {
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTenantProfile()
      .then((r) => setProfile(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Profile</h1>
          <p>Your account details on the platform.</p>
        </div>
      </header>
      {error ? <p className="login-error">{error}</p> : null}
      {profile ? (
        <dl className="banking-details">
          <div>
            <dt>Name</dt>
            <dd>{String(profile.displayName ?? profile.name)}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{String(profile.email)}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{String(profile.phone ?? '—')}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  )
}
