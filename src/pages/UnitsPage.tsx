import { useMemo, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import UnitOnboardingForm, {
  type UnitOnboardingPayload,
} from '../components/UnitOnboardingForm'
import { useDashboard } from '../data/DashboardContext'
import { isUnitVacant } from '../data/unitHelpers'
import { formatMoney, formatDate } from '../data/utils'
import './TenantDetail.css'

export default function UnitsPage() {
  const navigate = useNavigate()
  const { state, addUnit, addBuilding } = useDashboard()
  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.apartments
      .map((apartment) => {
        const building = state.buildings.find((b) => b.id === apartment.buildingId)
        const landlord = state.landlords.find((l) => l.id === apartment.landlordId)
        const tenant = state.tenants.find(
          (t) =>
            t.apartmentId === apartment.id &&
            (t.status === 'active' || t.status === 'notice'),
        )
        const vacant = isUnitVacant(apartment.id, state.tenants)
        return { apartment, building, landlord, tenant, vacant }
      })
      .filter(({ apartment, building, tenant }) => {
        if (!q) return true
        return (
          apartment.unitNumber.toLowerCase().includes(q) ||
          (building?.name.toLowerCase().includes(q) ?? false) ||
          (building?.address.toLowerCase().includes(q) ?? false) ||
          (tenant?.name.toLowerCase().includes(q) ?? false)
        )
      })
      .sort((a, b) => {
        const an = `${a.building?.name ?? ''} ${a.apartment.unitNumber}`
        const bn = `${b.building?.name ?? ''} ${b.apartment.unitNumber}`
        return an.localeCompare(bn)
      })
  }, [state, query])

  async function onSubmit(payload: UnitOnboardingPayload) {
    if (!payload.landlordId) {
      setError('Select a landlord.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const building = await addBuilding({
        name: payload.buildingName,
        address: payload.buildingAddress,
      })
      const created = await addUnit({
        buildingId: building.id,
        landlordId: payload.landlordId,
        unitNumber: payload.unitNumber,
        rent: payload.rent,
        deposit: payload.deposit,
        postalCode: payload.postalCode,
        levies: payload.levies,
        municipal: payload.municipal,
        purchasePrice: payload.purchasePrice,
        bankOwed: payload.bankOwed,
        status: 'vacant',
      })
      setShowAdd(false)
      navigate(`/units/${created.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save unit')
    } finally {
      setSaving(false)
    }
  }

  function openUnit(id: string) {
    navigate(`/units/${id}`)
  }

  function onRowKeyDown(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openUnit(id)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Units</h1>
          <p>
            All rental units you have onboarded. Click a row for full history, documents,
            and screening data.
          </p>
        </div>
        {!showAdd ? (
          <button
            type="button"
            className="btn btn-primary btn-compact"
            onClick={() => {
              setError('')
              setShowAdd(true)
            }}
          >
            Add unit
          </button>
        ) : null}
      </div>

      {showAdd ? (
        <div className="panel">
          <div className="panel-header">
            <h2>Add unit</h2>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => {
                setShowAdd(false)
                setError('')
              }}
            >
              Cancel
            </button>
          </div>
          <div className="panel-body">
            <UnitOnboardingForm
              landlords={state.landlords.map((l) => ({ id: l.id, name: l.name }))}
              submitting={saving}
              error={error}
              onCancel={() => {
                setShowAdd(false)
                setError('')
              }}
              onSubmit={onSubmit}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <input
              type="search"
              placeholder="Search unit, building, tenant…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search units"
            />
          </div>

          <div className="panel">
            <div className="panel-body" style={{ paddingTop: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Building</th>
                    <th>Rent</th>
                    <th>Deposit</th>
                    <th>Landlord</th>
                    <th>Tenant</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ apartment, building, landlord, tenant, vacant }) => (
                    <tr
                      key={apartment.id}
                      className="clickable-row"
                      tabIndex={0}
                      onClick={() => openUnit(apartment.id)}
                      onKeyDown={(e) => onRowKeyDown(e, apartment.id)}
                    >
                      <td>
                        <strong>Unit {apartment.unitNumber}</strong>
                      </td>
                      <td>
                        {building?.name ?? '—'}
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          {building?.address}
                        </div>
                      </td>
                      <td>{formatMoney(apartment.rent)}</td>
                      <td>{formatMoney(apartment.deposit)}</td>
                      <td>{landlord?.name ?? '—'}</td>
                      <td>
                        {tenant ? (
                          <Link
                            className="link-quiet"
                            to={`/tenants/${tenant.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {tenant.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span className={`badge ${vacant ? 'tone-due' : 'tone-paid'}`}>
                          {vacant ? 'Vacant' : 'Occupied'}
                        </span>
                        {!vacant && apartment.nextDueDate ? (
                          <div className="muted" style={{ fontSize: '0.78rem' }}>
                            Due {formatDate(apartment.nextDueDate)}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 ? (
                <div className="empty-state">No units onboarded yet. Add your first unit.</div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
