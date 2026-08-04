import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  createLandlordUnit,
  fetchLandlordBuildings,
  fetchLandlordPortfolio,
} from '../../data/api'
import { formatMoney } from '../../data/utils'

export default function LandlordUnitsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [units, setUnits] = useState<Array<Record<string, unknown>>>([])
  const [buildings, setBuildings] = useState<Array<{ id: string; name: string; address: string }>>(
    [],
  )
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(searchParams.get('add') === '1')

  const [buildingId, setBuildingId] = useState('')
  const [newBuildingName, setNewBuildingName] = useState('')
  const [newBuildingAddress, setNewBuildingAddress] = useState('')
  const [unitNumber, setUnitNumber] = useState('')
  const [rent, setRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const [portfolio, b] = await Promise.all([
        fetchLandlordPortfolio(),
        fetchLandlordBuildings(),
      ])
      setUnits(portfolio.data.units)
      setBuildings(b.data)
      if (!buildingId && b.data[0]) setBuildingId(b.data[0].id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load units')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openAdd() {
    setShowAdd(true)
    setError(null)
    setSearchParams({ add: '1' })
  }

  function closeAdd() {
    setShowAdd(false)
    setError(null)
    setUnitNumber('')
    setRent('')
    setDeposit('')
    setNewBuildingName('')
    setNewBuildingAddress('')
    setSearchParams({})
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const rentValue = Number(rent)
    const depositValue = Number(deposit)
    if (!unitNumber.trim()) {
      setError('Unit number is required.')
      return
    }
    if (!rentValue || rentValue < 0) {
      setError('Enter a valid rent amount.')
      return
    }
    if (!buildingId && !newBuildingName.trim()) {
      setError('Select or create a building.')
      return
    }
    setSaving(true)
    try {
      await createLandlordUnit({
        buildingId: newBuildingName.trim() ? undefined : buildingId || undefined,
        newBuildingName: newBuildingName.trim() || undefined,
        newBuildingAddress: newBuildingAddress.trim() || undefined,
        unitNumber: unitNumber.trim(),
        rent: rentValue,
        deposit: depositValue || rentValue * 2,
      })
      closeAdd()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add unit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>My units</h1>
          <p>Units registered under your landlord profile.</p>
        </div>
        <button type="button" className="btn btn-primary btn-compact" onClick={openAdd}>
          Add unit
        </button>
      </header>

      {error ? <p className="login-error">{error}</p> : null}

      {showAdd ? (
        <form className="form-grid" onSubmit={onSubmit} style={{ marginBottom: '1.5rem' }}>
          <fieldset className="form-section">
            <legend>Add unit</legend>
            <label className="field field-span">
              <span className="field-label">Existing building</span>
              <select
                value={buildingId}
                onChange={(e) => setBuildingId(e.target.value)}
                disabled={Boolean(newBuildingName.trim())}
              >
                <option value="">Select…</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.address}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Or new building name</span>
              <input
                value={newBuildingName}
                onChange={(e) => setNewBuildingName(e.target.value)}
                placeholder="Leave blank to use existing"
              />
            </label>
            <label className="field">
              <span className="field-label">New building address</span>
              <input
                value={newBuildingAddress}
                onChange={(e) => setNewBuildingAddress(e.target.value)}
                placeholder="Street address"
                disabled={!newBuildingName.trim()}
              />
            </label>
            <label className="field">
              <span className="field-label">Unit number</span>
              <input
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Monthly rent</span>
              <input
                type="number"
                min={0}
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Deposit</span>
              <input
                type="number"
                min={0}
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                placeholder="Defaults to 2× rent"
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save unit'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={closeAdd}>
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      ) : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Address</th>
              <th>Rent</th>
              <th>Deposit</th>
              <th>Status</th>
              <th>Tenant</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={String(u.id)}>
                <td>
                  {String(u.buildingName)} · {String(u.unitNumber)}
                </td>
                <td>{String(u.buildingAddress)}</td>
                <td>{formatMoney(Number(u.rent) || 0)}</td>
                <td>{formatMoney(Number(u.deposit) || 0)}</td>
                <td>
                  <span className="badge">{String(u.status)}</span>
                </td>
                <td>{u.tenantName ? String(u.tenantName) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {units.length === 0 ? (
          <div className="empty-state">
            No units yet.{' '}
            <button type="button" className="btn btn-ghost btn-compact" onClick={openAdd}>
              Add your first unit
            </button>
          </div>
        ) : null}
      </div>

      <p className="muted" style={{ marginTop: '1rem' }}>
        <Link to="/landlord/profile">Back to profile</Link>
      </p>
    </div>
  )
}
