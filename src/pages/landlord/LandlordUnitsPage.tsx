import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import UnitOnboardingForm, {
  type UnitOnboardingPayload,
} from '../../components/UnitOnboardingForm'
import {
  createLandlordUnit,
  deleteLandlordUnit,
  fetchLandlordPortfolio,
  updateLandlordUnitDetails,
} from '../../data/api'
import { formatDate, formatMoney } from '../../data/utils'
import './LandlordUnitsPage.css'

type ViewTab = 'current' | 'previous'

function hasFinanceDetails(unit: Record<string, unknown>) {
  return (
    unit.levies != null &&
    unit.municipal != null &&
    unit.purchasePrice != null &&
    unit.bankOwed != null
  )
}

function monthsToPayOff(bankOwed: number, rent: number) {
  if (!(bankOwed > 0)) return 0
  if (!(rent > 0)) return null
  return Math.ceil(bankOwed / rent)
}

export default function LandlordUnitsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [units, setUnits] = useState<Array<Record<string, unknown>>>([])
  const [previousUnits, setPreviousUnits] = useState<Array<Record<string, unknown>>>([])
  const [tab, setTab] = useState<ViewTab>('current')
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(searchParams.get('add') === '1')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingDetails, setEditingDetails] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [postalCode, setPostalCode] = useState('')
  const [levies, setLevies] = useState('')
  const [municipal, setMunicipal] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [bankOwed, setBankOwed] = useState('')
  const [detailsSaving, setDetailsSaving] = useState(false)

  async function load() {
    try {
      const portfolio = await fetchLandlordPortfolio()
      const seen = new Set<string>()
      const uniqueUnits = portfolio.data.units.filter((u) => {
        const id = String(u.id)
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
      const previous = portfolio.data.previousUnits ?? []
      setUnits(uniqueUnits)
      setPreviousUnits(previous)
      const fromQuery = searchParams.get('unit')
      setSelectedId((prev) => {
        if (fromQuery && uniqueUnits.some((u) => String(u.id) === fromQuery)) {
          return fromQuery
        }
        if (prev && uniqueUnits.some((u) => String(u.id) === prev)) return prev
        return uniqueUnits[0] ? String(uniqueUnits[0].id) : null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load units')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const fromQuery = searchParams.get('unit')
    if (!fromQuery) return
    if (units.some((u) => String(u.id) === fromQuery)) {
      setSelectedId(fromQuery)
    }
  }, [searchParams, units])

  const selected = useMemo(
    () => units.find((u) => String(u.id) === selectedId) ?? null,
    [units, selectedId],
  )

  useEffect(() => {
    if (!selected) {
      setEditingDetails(false)
      return
    }
    setPostalCode(String(selected.postalCode ?? ''))
    setLevies(selected.levies != null ? String(selected.levies) : '')
    setMunicipal(selected.municipal != null ? String(selected.municipal) : '')
    setPurchasePrice(selected.purchasePrice != null ? String(selected.purchasePrice) : '')
    setBankOwed(selected.bankOwed != null ? String(selected.bankOwed) : '')
    setEditingDetails(!hasFinanceDetails(selected))
  }, [selected])

  function openAdd() {
    setShowAdd(true)
    setError(null)
    setSearchParams({ add: '1' })
  }

  function closeAdd() {
    setShowAdd(false)
    setError(null)
    setSearchParams({})
  }

  async function onSubmit(payload: UnitOnboardingPayload) {
    setError(null)
    setSaving(true)
    try {
      const created = await createLandlordUnit({
        newBuildingName: payload.buildingName,
        newBuildingAddress: payload.buildingAddress,
        unitNumber: payload.unitNumber,
        rent: payload.rent,
        deposit: payload.deposit,
        postalCode: payload.postalCode,
        levies: payload.levies,
        municipal: payload.municipal,
        purchasePrice: payload.purchasePrice,
        bankOwed: payload.bankOwed,
        leaseConfig: payload.leaseConfig,
      })
      closeAdd()
      await load()
      if (created.data.id) setSelectedId(String(created.data.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add unit')
    } finally {
      setSaving(false)
    }
  }

  async function onSaveDetails(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    setError(null)
    const leviesValue = Number(levies)
    const municipalValue = Number(municipal)
    const purchaseValue = Number(purchasePrice)
    const bankValue = Number(bankOwed)
    if (
      !Number.isFinite(leviesValue) ||
      !Number.isFinite(municipalValue) ||
      !Number.isFinite(purchaseValue) ||
      !Number.isFinite(bankValue)
    ) {
      setError('Enter valid amounts for levies, municipal, purchase price, and bank balance.')
      return
    }
    setDetailsSaving(true)
    try {
      await updateLandlordUnitDetails(String(selected.id), {
        postalCode: postalCode.trim() || null,
        levies: leviesValue,
        municipal: municipalValue,
        purchasePrice: purchaseValue,
        bankOwed: bankValue,
      })
      await load()
      setEditingDetails(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update unit details')
    } finally {
      setDetailsSaving(false)
    }
  }

  async function onDeleteSelected() {
    if (!selected) return
    const occupied = Boolean(selected.tenantId)
    const ok = window.confirm(
      occupied
        ? 'Delete this unit? The current lease will end, the tenant will move to Previous tenants, and the unit will move to Previous units.'
        : 'Delete this unit? It will move to Previous units.',
    )
    if (!ok) return
    setDeleting(true)
    setError(null)
    try {
      await deleteLandlordUnit(String(selected.id))
      await load()
      setTab('previous')
      setSelectedId(null)
      setSearchParams({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete unit')
    } finally {
      setDeleting(false)
    }
  }

  const rentAmount = Number(selected?.rent) || 0
  const bankAmount = Number(selected?.bankOwed) || 0
  const payoffMonths =
    selected && hasFinanceDetails(selected)
      ? monthsToPayOff(bankAmount, rentAmount)
      : null

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>My units</h1>
          <p>Current units under your landlord profile, plus previous units after deletion.</p>
        </div>
        {!showAdd ? (
          <button type="button" className="btn btn-primary btn-compact" onClick={openAdd}>
            Add unit
          </button>
        ) : null}
      </header>

      {showAdd ? (
        <div className="panel">
          <div className="panel-header">
            <h2>Add unit</h2>
            <button type="button" className="btn btn-ghost btn-compact" onClick={closeAdd}>
              Cancel
            </button>
          </div>
          <div className="panel-body">
            <UnitOnboardingForm
              submitting={saving}
              error={error}
              onCancel={closeAdd}
              onSubmit={onSubmit}
            />
          </div>
        </div>
      ) : (
        <>
          {error ? <p className="login-error">{error}</p> : null}

          <div className="tenant-tabs" role="tablist" aria-label="Unit views">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'current'}
              className={`tenant-tab${tab === 'current' ? ' active' : ''}`}
              onClick={() => setTab('current')}
            >
              Current ({units.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'previous'}
              className={`tenant-tab${tab === 'previous' ? ' active' : ''}`}
              onClick={() => setTab('previous')}
            >
              Previous units ({previousUnits.length})
            </button>
          </div>

          {tab === 'previous' ? (
            <div className="panel">
              <div className="panel-body" style={{ paddingTop: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Building</th>
                      <th>Rent</th>
                      <th>Deposit</th>
                      <th>Deleted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previousUnits.map((u) => (
                      <tr key={String(u.id)}>
                        <td>
                          <strong>Unit {String(u.unitNumber)}</strong>
                        </td>
                        <td>
                          {String(u.buildingName)}
                          <div className="muted" style={{ fontSize: '0.8rem' }}>
                            {String(u.buildingAddress ?? '')}
                          </div>
                        </td>
                        <td>{formatMoney(Number(u.rent) || 0)}</td>
                        <td>{formatMoney(Number(u.deposit) || 0)}</td>
                        <td>
                          {u.deletedAt
                            ? formatDate(String(u.deletedAt).slice(0, 10))
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previousUnits.length === 0 ? (
                  <div className="empty-state">
                    No previous units yet. Deleted units appear here.
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
          <div className="units-split">
            <section className="units-list-panel">
              <h2>Units</h2>
              <div className="units-list">
                {units.map((u) => {
                  const id = String(u.id)
                  const active = id === selectedId
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`units-list-item${active ? ' is-active' : ''}`}
                      onClick={() => {
                        setSelectedId(id)
                        setSearchParams({ unit: id })
                      }}
                    >
                      <strong>
                        {String(u.buildingName)} · Unit {String(u.unitNumber)}
                      </strong>
                      <span>{String(u.buildingAddress)}</span>
                      <span className="badge">{String(u.status)}</span>
                    </button>
                  )
                })}
              </div>
              {units.length === 0 ? (
                <div className="empty-state">
                  No current units.{' '}
                  <button type="button" className="btn btn-ghost btn-compact" onClick={openAdd}>
                    Add your first unit
                  </button>
                </div>
              ) : null}
            </section>

            <section className="units-summary-panel">
              {selected ? (
                <>
                  <header className="units-summary-header">
                    <div>
                      <p className="units-summary-eyebrow">Unit summary</p>
                      <h2>
                        {String(selected.buildingName)} · Unit {String(selected.unitNumber)}
                      </h2>
                      <p className="units-summary-sub">{String(selected.buildingAddress)}</p>
                    </div>
                    <div className="btn-row">
                      <span className="badge">{String(selected.status)}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-compact"
                        disabled={deleting}
                        onClick={() => void onDeleteSelected()}
                      >
                        {deleting ? 'Deleting…' : 'Delete unit'}
                      </button>
                    </div>
                  </header>

                  <dl className="units-summary-grid">
                    <div>
                      <dt>Postal / ZIP code</dt>
                      <dd>{String(selected.postalCode || '—')}</dd>
                    </div>
                    <div>
                      <dt>Deposit</dt>
                      <dd>{formatMoney(Number(selected.deposit) || 0)}</dd>
                    </div>
                    <div>
                      <dt>Deposit balance</dt>
                      <dd>
                        {formatMoney(
                          Number(
                            selected.depositBalance != null
                              ? selected.depositBalance
                              : selected.deposit,
                          ) || 0,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Lease term end</dt>
                      <dd>
                        {selected.leaseEnd
                          ? formatDate(String(selected.leaseEnd))
                          : 'No current tenant'}
                      </dd>
                    </div>
                  </dl>

                  {hasFinanceDetails(selected) && !editingDetails ? (
                    <>
                      <dl className="units-summary-grid units-summary-finance">
                        <div>
                          <dt>Levies (monthly)</dt>
                          <dd>{formatMoney(Number(selected.levies) || 0)}</dd>
                        </div>
                        <div>
                          <dt>Municipal (monthly)</dt>
                          <dd>{formatMoney(Number(selected.municipal) || 0)}</dd>
                        </div>
                        <div>
                          <dt>Purchase price</dt>
                          <dd>{formatMoney(Number(selected.purchasePrice) || 0)}</dd>
                        </div>
                        <div>
                          <dt>Still owed to bank</dt>
                          <dd>{formatMoney(bankAmount)}</dd>
                        </div>
                        <div className="units-summary-span">
                          <dt>Estimated months to pay off bank</dt>
                          <dd>
                            {payoffMonths == null
                              ? 'Add a rent amount to estimate payoff'
                              : payoffMonths === 0
                                ? 'Paid off / no balance owed'
                                : `${payoffMonths} month${payoffMonths === 1 ? '' : 's'} at current rent (${formatMoney(rentAmount)}/mo)`}
                          </dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        className="btn btn-ghost btn-compact"
                        onClick={() => setEditingDetails(true)}
                      >
                        Edit unit details
                      </button>
                    </>
                  ) : (
                    <form className="units-details-form" onSubmit={onSaveDetails}>
                      <p className="units-summary-sub">
                        {hasFinanceDetails(selected)
                          ? 'Update ownership and finance details for this unit.'
                          : 'Add levies, municipal costs, purchase price, and bank balance to unlock the unit summary.'}
                      </p>
                      <label>
                        Postal / ZIP code
                        <input
                          value={postalCode}
                          onChange={(e) => setPostalCode(e.target.value)}
                          placeholder="e.g. 8001"
                        />
                      </label>
                      <label>
                        Levies (monthly)
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={levies}
                          onChange={(e) => setLevies(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Municipal (monthly)
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={municipal}
                          onChange={(e) => setMunicipal(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Purchase price
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={purchasePrice}
                          onChange={(e) => setPurchasePrice(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Still owed to bank
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={bankOwed}
                          onChange={(e) => setBankOwed(e.target.value)}
                          required
                        />
                      </label>
                      <div className="units-details-actions">
                        <button type="submit" className="btn btn-primary" disabled={detailsSaving}>
                          {detailsSaving ? 'Saving…' : 'Update unit details'}
                        </button>
                        {hasFinanceDetails(selected) ? (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setEditingDetails(false)}
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </form>
                  )}
                </>
              ) : (
                <div className="empty-state">Select a unit to view its summary.</div>
              )}
            </section>
          </div>
          )}
        </>
      )}

      <p className="muted" style={{ marginTop: '1rem' }}>
        <Link to="/landlord/profile">Back to profile</Link>
      </p>
    </div>
  )
}
