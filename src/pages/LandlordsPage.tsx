import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useDashboard } from '../data/DashboardContext'
import { ContactActions } from '../dashboard/ContactActions'
import { formatDateTime, mailto } from '../data/utils'
import './TenantDetail.css'

export default function LandlordsPage() {
  const { state, tenantApartment, logLandlordUpdate } = useDashboard()
  const [selectedId, setSelectedId] = useState(state.landlords[0]?.id ?? '')
  const [body, setBody] = useState('')
  const [tenantId, setTenantId] = useState('')

  const landlord = state.landlords.find((l) => l.id === selectedId) ?? state.landlords[0]

  const relatedTenants = useMemo(() => {
    if (!landlord) return []
    const apartmentIds = state.apartments
      .filter((a) => a.landlordId === landlord.id)
      .map((a) => a.id)
    return state.tenants.filter((t) => apartmentIds.includes(t.apartmentId))
  }, [state, landlord])

  const updates = useMemo(() => {
    if (!landlord) return []
    return state.landlordUpdates
      .filter((u) => u.landlordId === landlord.id)
      .sort((a, b) => b.at.localeCompare(a.at))
  }, [state.landlordUpdates, landlord])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!landlord || !body.trim()) return
    logLandlordUpdate({
      landlordId: landlord.id,
      tenantId: tenantId || undefined,
      body: body.trim(),
      channel: 'email',
    })
    window.location.href = mailto(landlord.email, 'Important tenancy update', body.trim())
    setBody('')
  }

  if (!landlord) {
    return <div className="empty-state">No landlords on file.</div>
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Landlords</h1>
          <p>Contact landlords and log important updates about their units and tenants.</p>
        </div>
      </div>

      <div className="detail-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Landlords</h2>
          </div>
          <div className="panel-body issue-list">
            {state.landlords.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`issue-item${landlord.id === l.id ? ' active' : ''}`}
                onClick={() => {
                  setSelectedId(l.id)
                  setTenantId('')
                }}
              >
                <div>
                  <strong>{l.name}</strong>
                  <div className="muted">{l.email}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>{landlord.name}</h2>
          </div>
          <div className="panel-body">
            <ContactActions
              person={landlord}
              landlordId={landlord.id}
              subject="Important tenancy update"
            />

            <h3 style={{ margin: '1.25rem 0 0.65rem', fontSize: '1.05rem' }}>
              Related tenants
            </h3>
            <ul className="timeline-list">
              {relatedTenants.map((t) => {
                const ctx = tenantApartment(t.id)
                return (
                  <li key={t.id}>
                    <Link className="link-quiet" to={`/tenants/${t.id}`}>
                      {t.name}
                    </Link>
                    <div className="muted">
                      {ctx?.building.name} Unit {ctx?.apartment.unitNumber}
                    </div>
                  </li>
                )
              })}
              {relatedTenants.length === 0 ? (
                <li className="muted">No active tenants for this landlord.</li>
              ) : null}
            </ul>

            <form className="form-stack" style={{ marginTop: '1.25rem' }} onSubmit={submit}>
              <label>
                Related tenant (optional)
                <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                  <option value="">General update</option>
                  {relatedTenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Update message
                <textarea
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  placeholder="What does the landlord need to know?"
                />
              </label>
              <button type="submit" className="btn btn-primary btn-compact">
                Log & email update
              </button>
            </form>

            <h3 style={{ margin: '1.5rem 0 0.65rem', fontSize: '1.05rem' }}>Update log</h3>
            {updates.length === 0 ? (
              <div className="empty-state">No updates logged yet.</div>
            ) : (
              <ul className="timeline-list">
                {updates.map((u) => (
                  <li key={u.id}>
                    <strong>{u.channel}</strong> · {formatDateTime(u.at)}
                    <div>{u.body}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
