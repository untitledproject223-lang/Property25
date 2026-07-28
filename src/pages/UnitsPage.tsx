import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useDashboard } from '../data/DashboardContext'
import { isUnitVacant } from '../data/unitHelpers'
import { formatMoney, formatDate } from '../data/utils'
import './TenantDetail.css'

type FormMode = 'closed' | 'add' | 'edit'

export default function UnitsPage() {
  const { state, addUnit, updateUnit, deleteUnit, addBuilding } = useDashboard()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<FormMode>('closed')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const [buildingId, setBuildingId] = useState(state.buildings[0]?.id ?? '')
  const [newBuildingName, setNewBuildingName] = useState('')
  const [newBuildingAddress, setNewBuildingAddress] = useState('')
  const [unitNumber, setUnitNumber] = useState('')
  const [rent, setRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [landlordId, setLandlordId] = useState(state.landlords[0]?.id ?? '')

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

  function resetForm() {
    setMode('closed')
    setEditingId(null)
    setError('')
    setUnitNumber('')
    setRent('')
    setDeposit('')
    setNewBuildingName('')
    setNewBuildingAddress('')
    setBuildingId(state.buildings[0]?.id ?? '')
    setLandlordId(state.landlords[0]?.id ?? '')
  }

  function openAdd() {
    resetForm()
    setMode('add')
  }

  function openEdit(id: string) {
    const apartment = state.apartments.find((a) => a.id === id)
    if (!apartment) return
    setMode('edit')
    setEditingId(id)
    setError('')
    setBuildingId(apartment.buildingId)
    setUnitNumber(apartment.unitNumber)
    setRent(String(apartment.rent))
    setDeposit(String(apartment.deposit))
    setLandlordId(apartment.landlordId)
    setNewBuildingName('')
    setNewBuildingAddress('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      let targetBuildingId = buildingId
      if (newBuildingName.trim()) {
        const building = await addBuilding({
          name: newBuildingName.trim(),
          address: newBuildingAddress.trim() || 'Address TBD',
        })
        targetBuildingId = building.id
      }
      if (!targetBuildingId) {
        setError('Select or create a building.')
        return
      }
      if (!unitNumber.trim()) {
        setError('Unit number is required.')
        return
      }
      if (!landlordId) {
        setError('Select a landlord.')
        return
      }
      const rentValue = Number(rent)
      const depositValue = Number(deposit)
      if (!rentValue || rentValue < 0) {
        setError('Enter a valid rent amount.')
        return
      }

      if (mode === 'add') {
        await addUnit({
          buildingId: targetBuildingId,
          unitNumber: unitNumber.trim(),
          rent: rentValue,
          deposit: depositValue || rentValue * 2,
          landlordId,
          status: 'vacant',
        })
      } else if (mode === 'edit' && editingId) {
        updateUnit(editingId, {
          buildingId: targetBuildingId,
          unitNumber: unitNumber.trim(),
          rent: rentValue,
          deposit: depositValue || rentValue * 2,
          landlordId,
        })
      }
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save unit')
    }
  }

  function handleDelete(id: string) {
    const result = deleteUnit(id)
    if (!result.ok) {
      setError(result.error ?? 'Could not delete unit.')
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Units</h1>
          <p>
            All rental units you have onboarded. Vacant units are available for new
            tenant applications.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-compact" onClick={openAdd}>
          Add unit
        </button>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search unit, building, tenant…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search units"
        />
      </div>

      {error ? (
        <p className="muted" style={{ color: '#9b2c2c', marginBottom: '0.75rem' }}>
          {error}
        </p>
      ) : null}

      {mode !== 'closed' ? (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-header">
            <h2>{mode === 'add' ? 'Add unit' : 'Edit unit'}</h2>
            <button type="button" className="btn btn-ghost btn-compact" onClick={resetForm}>
              Cancel
            </button>
          </div>
          <form className="panel-body form-stack" onSubmit={submit}>
            <label>
              Existing building
              <select
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
                disabled={Boolean(newBuildingName.trim())}
              >
                <option value="">Select…</option>
                {state.buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Or create new building name
              <input
                type="text"
                value={newBuildingName}
                onChange={(e) => setNewBuildingName(e.target.value)}
                placeholder="Harbor View Residences"
              />
            </label>
            {newBuildingName.trim() ? (
              <label>
                New building address
                <input
                  type="text"
                  value={newBuildingAddress}
                  onChange={(e) => setNewBuildingAddress(e.target.value)}
                  placeholder="18 Quayside Road"
                />
              </label>
            ) : null}
            <label>
              Unit number
              <input
                type="text"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                placeholder="4B"
                required
              />
            </label>
            <label>
              Monthly rent
              <input
                type="number"
                min={0}
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                required
              />
            </label>
            <label>
              Deposit
              <input
                type="number"
                min={0}
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                placeholder="Defaults to 2× rent if empty"
              />
            </label>
            <label>
              Landlord
              <select
                value={landlordId}
                onChange={(e) => setLandlordId(e.target.value)}
                required
              >
                {state.landlords.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-primary btn-compact">
              {mode === 'add' ? 'Save unit' : 'Update unit'}
            </button>
          </form>
        </div>
      ) : null}

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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ apartment, building, landlord, tenant, vacant }) => (
                <tr key={apartment.id}>
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
                      <Link className="link-quiet" to={`/tenants/${tenant.id}`}>
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
                    <div className="btn-row">
                      <button
                        type="button"
                        className="btn btn-ghost btn-compact"
                        onClick={() => openEdit(apartment.id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-compact"
                        disabled={!vacant}
                        title={
                          vacant
                            ? 'Delete unit'
                            : 'Occupied units cannot be deleted'
                        }
                        onClick={() => handleDelete(apartment.id)}
                      >
                        Delete
                      </button>
                    </div>
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
    </div>
  )
}
