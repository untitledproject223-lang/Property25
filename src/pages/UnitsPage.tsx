import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import UnitOnboardingForm, {
  type UnitOnboardingPayload,
} from '../components/UnitOnboardingForm'
import { listApartments } from '../data/api'
import { useDashboard } from '../data/DashboardContext'
import { isUnitVacant } from '../data/unitHelpers'
import { formatMoney, formatDate } from '../data/utils'
import './TenantDetail.css'

type ViewTab = 'current' | 'previous'

type PreviousRow = {
  id: string
  unitNumber: string
  rent: number
  deposit: number
  buildingName: string
  buildingAddress: string
  landlordName: string
  deletedAt: string
}

export default function UnitsPage() {
  const navigate = useNavigate()
  const { state, addUnit, addBuilding, deleteUnit, refresh } = useDashboard()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<ViewTab>('current')
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [previous, setPrevious] = useState<PreviousRow[]>([])

  async function loadPrevious() {
    try {
      const result = await listApartments('previous')
      setPrevious(
        result.data.map((row) => ({
          id: String(row.id),
          unitNumber: String(row.unit_number ?? row.unitNumber ?? ''),
          rent: Number(row.rent ?? 0),
          deposit: Number(row.deposit ?? 0),
          buildingName: String(row.building_name ?? row.buildingName ?? '—'),
          buildingAddress: String(row.building_address ?? row.buildingAddress ?? ''),
          landlordName: String(row.landlord_name ?? row.landlordName ?? '—'),
          deletedAt: String(row.deletedAt ?? row.deleted_at ?? '').slice(0, 10),
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load previous units')
    }
  }

  useEffect(() => {
    void loadPrevious()
  }, [state.apartments.length])

  const currentRows = useMemo(() => {
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

  const previousRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return previous
      .filter((row) => {
        if (!q) return true
        return (
          row.unitNumber.toLowerCase().includes(q) ||
          row.buildingName.toLowerCase().includes(q) ||
          row.buildingAddress.toLowerCase().includes(q) ||
          row.landlordName.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  }, [previous, query])

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
        leaseConfig: payload.leaseConfig,
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

  async function onDelete(id: string, vacant: boolean) {
    const ok = window.confirm(
      vacant
        ? 'Delete this unit? It will move to Previous units.'
        : 'Delete this unit? Any current lease will end and the unit will move to Previous units.',
    )
    if (!ok) return
    setDeletingId(id)
    setError('')
    try {
      const result = await deleteUnit(id)
      if (!result.ok) {
        setError(result.error ?? 'Could not delete unit')
        return
      }
      await refresh()
      await loadPrevious()
      setTab('previous')
    } finally {
      setDeletingId(null)
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
            Current units you manage, plus previous units kept after deletion. Click a
            current row for full history.
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
          <div className="tenant-tabs" role="tablist" aria-label="Unit views">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'current'}
              className={`tenant-tab${tab === 'current' ? ' active' : ''}`}
              onClick={() => setTab('current')}
            >
              Current ({currentRows.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'previous'}
              className={`tenant-tab${tab === 'previous' ? ' active' : ''}`}
              onClick={() => setTab('previous')}
            >
              Previous units ({previous.length})
            </button>
          </div>

          {error ? (
            <p className="muted" style={{ color: '#9b2c2c' }}>
              {error}
            </p>
          ) : null}

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
              {tab === 'current' ? (
                <>
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
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {currentRows.map(({ apartment, building, landlord, tenant, vacant }) => (
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
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-compact"
                              disabled={deletingId === apartment.id}
                              onClick={(e) => {
                                e.stopPropagation()
                                void onDelete(apartment.id, vacant)
                              }}
                            >
                              {deletingId === apartment.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {currentRows.length === 0 ? (
                    <div className="empty-state">No current units. Add a unit to get started.</div>
                  ) : null}
                </>
              ) : (
                <>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Unit</th>
                        <th>Building</th>
                        <th>Rent</th>
                        <th>Deposit</th>
                        <th>Landlord</th>
                        <th>Deleted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previousRows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong>Unit {row.unitNumber}</strong>
                          </td>
                          <td>
                            {row.buildingName}
                            <div className="muted" style={{ fontSize: '0.8rem' }}>
                              {row.buildingAddress}
                            </div>
                          </td>
                          <td>{formatMoney(row.rent)}</td>
                          <td>{formatMoney(row.deposit)}</td>
                          <td>{row.landlordName}</td>
                          <td>{row.deletedAt ? formatDate(row.deletedAt) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {previousRows.length === 0 ? (
                    <div className="empty-state">
                      No previous units yet. Deleted units appear here.
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
