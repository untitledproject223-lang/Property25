import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useDashboard } from '../data/DashboardContext'
import { ContactActions } from '../dashboard/ContactActions'
import { formatDateTime, mailto } from '../data/utils'
import './TenantDetail.css'

export default function LandlordsPage() {
  const { state, tenantApartment, logLandlordUpdate, addLandlord } = useDashboard()
  const [selectedId, setSelectedId] = useState(state.landlords[0]?.id ?? '')
  const [body, setBody] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [error, setError] = useState('')

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

  function resetAddForm() {
    setShowAdd(false)
    setName('')
    setEmail('')
    setPhone('')
    setWhatsapp('')
    setError('')
  }

  async function submitAdd(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Name is required.')
      return
    }
    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    if (!phone.trim()) {
      setError('Phone is required.')
      return
    }
    try {
      const created = await addLandlord({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        whatsapp: whatsapp.trim() || undefined,
      })
      setSelectedId(created.id)
      setTenantId('')
      resetAddForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add landlord')
    }
  }

  function submitUpdate(e: FormEvent) {
    e.preventDefault()
    if (!landlord || !body.trim()) return
    void logLandlordUpdate({
      landlordId: landlord.id,
      tenantId: tenantId || undefined,
      body: body.trim(),
      channel: 'email',
    })
    window.location.href = mailto(landlord.email, 'Important tenancy update', body.trim())
    setBody('')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Landlords</h1>
          <p>Contact landlords and log important updates about their units and tenants.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-compact"
          onClick={() => {
            setShowAdd(true)
            setError('')
          }}
        >
          Add landlord
        </button>
      </div>

      {showAdd ? (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-header">
            <h2>Add landlord</h2>
            <button type="button" className="btn btn-ghost btn-compact" onClick={resetAddForm}>
              Cancel
            </button>
          </div>
          <form className="panel-body form-stack" onSubmit={submitAdd}>
            {error ? (
              <p className="muted" style={{ color: '#9b2c2c', margin: 0 }}>
                {error}
              </p>
            ) : null}
            <label>
              Full name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Priya Naidoo"
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="landlord@example.com"
                required
              />
            </label>
            <label>
              Phone
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+27821234501"
                required
              />
            </label>
            <label>
              WhatsApp (optional)
              <input
                type="text"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="27821234501"
              />
            </label>
            <button type="submit" className="btn btn-primary btn-compact">
              Save landlord
            </button>
          </form>
        </div>
      ) : null}

      {!landlord ? (
        <div className="panel">
          <div className="empty-state">
            No landlords on file yet. Click <strong>Add landlord</strong> to create one.
          </div>
        </div>
      ) : (
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

              <form
                className="form-stack"
                style={{ marginTop: '1.25rem' }}
                onSubmit={submitUpdate}
              >
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
      )}
    </div>
  )
}
