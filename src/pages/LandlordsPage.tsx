import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import UnitOnboardingForm, {
  type UnitOnboardingPayload,
} from '../components/UnitOnboardingForm'
import { useDashboard } from '../data/DashboardContext'
import { createInvite } from '../data/api'
import { formatDate, formatMoney, paymentBadge } from '../data/utils'
import { isUnitVacant } from '../data/unitHelpers'
import './TenantDetail.css'
import './landlord/LandlordUnitsPage.css'

export default function LandlordsPage() {
  const navigate = useNavigate()
  const { state, tenantApartment, addLandlord, addBuilding, addUnit } = useDashboard()
  const [selectedId, setSelectedId] = useState(state.landlords[0]?.id ?? '')
  const [showAdd, setShowAdd] = useState(false)
  const [showUnitOnboard, setShowUnitOnboard] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [unitSaving, setUnitSaving] = useState(false)
  const [justCreatedLandlordId, setJustCreatedLandlordId] = useState<string | null>(null)

  const landlord = state.landlords.find((l) => l.id === selectedId) ?? state.landlords[0]

  const landlordUnits = useMemo(() => {
    if (!landlord) return []
    return state.apartments.filter((a) => a.landlordId === landlord.id)
  }, [state.apartments, landlord])

  const relatedTenants = useMemo(() => {
    if (!landlord) return []
    const apartmentIds = new Set(landlordUnits.map((a) => a.id))
    return state.tenants.filter(
      (t) =>
        apartmentIds.has(t.apartmentId) &&
        (t.status === 'active' || t.status === 'notice'),
    )
  }, [state.tenants, landlord, landlordUnits])

  const vacantCount = landlordUnits.filter((a) => isUnitVacant(a.id, state.tenants)).length
  const occupiedCount = landlordUnits.length - vacantCount
  const openTickets = useMemo(() => {
    const tenantIds = new Set(relatedTenants.map((t) => t.id))
    return state.issues.filter(
      (i) =>
        tenantIds.has(i.tenantId) &&
        i.status !== 'resolved' &&
        i.status !== 'rejected',
    ).length
  }, [state.issues, relatedTenants])
  const balancesDue = relatedTenants.filter((t) => t.balance > 0).length
  const totalRentBook = relatedTenants.reduce((sum, t) => {
    const apt = state.apartments.find((a) => a.id === t.apartmentId)
    return sum + (apt?.rent ?? 0)
  }, 0)
  const totalArrears = relatedTenants.reduce((sum, t) => sum + Math.max(0, t.balance), 0)

  function resetAddForm() {
    setShowAdd(false)
    setName('')
    setEmail('')
    setPhone('')
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
      })
      setSelectedId(created.id)
      setJustCreatedLandlordId(created.id)
      try {
        const invite = await createInvite({
          email: email.trim(),
          role: 'landlord',
          landlordId: created.id,
        })
        setInviteUrl(invite.data.inviteUrl)
      } catch {
        // Landlord created even if invite fails
      }
      resetAddForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add landlord')
    }
  }

  async function inviteSelectedLandlord() {
    if (!landlord) return
    setError('')
    try {
      const invite = await createInvite({
        email: landlord.email,
        role: 'landlord',
        landlordId: landlord.id,
      })
      setInviteUrl(invite.data.inviteUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create invite')
    }
  }

  async function onUnitSubmit(payload: UnitOnboardingPayload) {
    const landlordId = payload.landlordId || justCreatedLandlordId || landlord?.id
    if (!landlordId) {
      setError('Select a landlord before onboarding a unit.')
      return
    }
    setUnitSaving(true)
    setError('')
    try {
      const building = await addBuilding({
        name: payload.buildingName,
        address: payload.buildingAddress,
      })
      const created = await addUnit({
        buildingId: building.id,
        landlordId,
        unitNumber: payload.unitNumber,
        rent: payload.rent,
        deposit: payload.deposit,
        postalCode: payload.postalCode,
        levies: payload.levies,
        municipal: payload.municipal,
        purchasePrice: payload.purchasePrice,
        bankOwed: payload.bankOwed,
        leaseConfig: payload.leaseConfig,
        status: 'vacant',
      })
      setShowUnitOnboard(false)
      setJustCreatedLandlordId(null)
      navigate(`/units/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not onboard unit')
    } finally {
      setUnitSaving(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Landlords</h1>
          <p>Manage landlords, their units, and tenant performance across the book.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-compact"
          onClick={() => {
            setShowAdd(true)
            setShowUnitOnboard(false)
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
                required
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
            <div className="btn-row">
              <button type="submit" className="btn btn-primary btn-compact">
                Save landlord
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {justCreatedLandlordId && !showUnitOnboard ? (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-body btn-row" style={{ alignItems: 'center' }}>
            <p className="muted" style={{ margin: 0, flex: 1 }}>
              Landlord saved. Invite them to the portal, or onboard their first unit now.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-compact"
              onClick={() => {
                setShowUnitOnboard(true)
                setError('')
              }}
            >
              Onboard a unit
            </button>
          </div>
        </div>
      ) : null}

      {showUnitOnboard ? (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-header">
            <h2>Onboard a unit</h2>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => setShowUnitOnboard(false)}
            >
              Cancel
            </button>
          </div>
          <div className="panel-body">
            <UnitOnboardingForm
              lockedLandlordId={justCreatedLandlordId || landlord?.id}
              submitting={unitSaving}
              error={error}
              onCancel={() => setShowUnitOnboard(false)}
              onSubmit={onUnitSubmit}
            />
          </div>
        </div>
      ) : null}

      {!landlord ? (
        <div className="panel">
          <div className="empty-state">
            No landlords on file yet. Click <strong>Add landlord</strong> to create one.
          </div>
        </div>
      ) : !showUnitOnboard ? (
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
                  onClick={() => setSelectedId(l.id)}
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
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={() => {
                  setJustCreatedLandlordId(landlord.id)
                  setShowUnitOnboard(true)
                  setError('')
                }}
              >
                Onboard a unit
              </button>
            </div>
            <div className="panel-body">
              <div className="stat-grid stat-grid-4" style={{ marginBottom: '1rem' }}>
                <div className="stat-card">
                  <div className="label">Units</div>
                  <div className="value">{landlordUnits.length}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Tenants</div>
                  <div className="value">{relatedTenants.length}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Vacant</div>
                  <div className="value">{vacantCount}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Occupied</div>
                  <div className="value">{occupiedCount}</div>
                </div>
              </div>

              <div className="stat-grid stat-grid-4" style={{ marginBottom: '1.25rem' }}>
                <div className="stat-card">
                  <div className="label">Open tickets</div>
                  <div className="value">{openTickets}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Balances due</div>
                  <div className="value">{balancesDue}</div>
                </div>
                <div className="stat-card">
                  <div className="label">Rent book</div>
                  <div className="value" style={{ fontSize: '1.15rem' }}>
                    {formatMoney(totalRentBook)}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="label">Arrears</div>
                  <div className="value" style={{ fontSize: '1.15rem' }}>
                    {formatMoney(totalArrears)}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  onClick={() => void inviteSelectedLandlord()}
                >
                  Invite to landlord portal
                </button>
                {inviteUrl ? (
                  <p className="muted" style={{ marginTop: '0.5rem', wordBreak: 'break-all' }}>
                    Invite link: {inviteUrl}
                  </p>
                ) : null}
                {error ? (
                  <p className="muted" style={{ color: '#9b2c2c' }}>
                    {error}
                  </p>
                ) : null}
              </div>

              <h3 style={{ margin: '0 0 0.65rem', fontSize: '1.05rem' }}>Related tenants</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tenant</th>
                      <th>Unit</th>
                      <th>Lease end</th>
                      <th>Balance</th>
                      <th>Payment status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatedTenants.map((t) => {
                      const ctx = tenantApartment(t.id)
                      const badge = paymentBadge(
                        t.balance,
                        ctx?.apartment.nextDueDate,
                      )
                      return (
                        <tr key={t.id}>
                          <td>
                            <Link className="link-quiet" to={`/tenants/${t.id}`}>
                              <strong>{t.name}</strong>
                            </Link>
                          </td>
                          <td>
                            {ctx
                              ? `${ctx.building.name} · Unit ${ctx.apartment.unitNumber}`
                              : '—'}
                          </td>
                          <td>{formatDate(t.leaseEnd)}</td>
                          <td>{formatMoney(t.balance)}</td>
                          <td>
                            <span className={`badge tone-${badge.tone}`}>{badge.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {relatedTenants.length === 0 ? (
                  <div className="empty-state">No active tenants for this landlord.</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
