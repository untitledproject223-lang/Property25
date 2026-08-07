import { useEffect, useMemo, useState } from 'react'
import {
  setUnitTicketManager,
  fetchLandlordPortfolio,
  createUnitAgentInvite,
  terminateLease,
} from '../../data/api'
import { formatDate, formatMoney, nextMonthEndDate, paymentBadge } from '../../data/utils'
import TerminateLeaseModal from '../../components/TerminateLeaseModal'
import SearchableSelect from '../../components/SearchableSelect'
import '../../pages/TenantDetail.css'

export default function LandlordPortfolioPage() {
  const [units, setUnits] = useState<Array<Record<string, unknown>>>([])
  const [landlord, setLandlord] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [agentInviteUrl, setAgentInviteUrl] = useState<string | null>(null)
  const [terminating, setTerminating] = useState<Record<string, unknown> | null>(null)
  const [terminateBusy, setTerminateBusy] = useState(false)
  const [terminateError, setTerminateError] = useState<string | null>(null)
  const [buildingFilter, setBuildingFilter] = useState('')
  const [tenantFilter, setTenantFilter] = useState('')
  const [profileUnit, setProfileUnit] = useState<Record<string, unknown> | null>(null)
  const monthEndDue = nextMonthEndDate()

  async function load() {
    try {
      const r = await fetchLandlordPortfolio()
      setUnits(r.data.units)
      setLandlord(r.data.landlord)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }

  useEffect(() => {
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  async function onHandoff(unitId: string, ticketManager: 'landlord' | 'agent') {
    setSavingId(unitId)
    setError(null)
    try {
      await setUnitTicketManager(unitId, ticketManager)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update management')
    } finally {
      setSavingId(null)
    }
  }

  async function onChangeAgent(unitId: string) {
    setSavingId(unitId)
    setError(null)
    setAgentInviteUrl(null)
    try {
      const result = await createUnitAgentInvite(unitId)
      setAgentInviteUrl(result.data.inviteUrl)
      await navigator.clipboard.writeText(result.data.inviteUrl).catch(() => undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create agent invite link')
    } finally {
      setSavingId(null)
    }
  }

  const occupied = useMemo(() => units.filter((u) => u.tenantId), [units])
  const vacant = useMemo(() => units.filter((u) => !u.tenantId), [units])

  const buildingOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of units) {
      const name = String(u.buildingName ?? '')
      if (name) map.set(name, name)
    }
    return Array.from(map.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name, searchText: name }))
  }, [units])

  const tenantOptions = useMemo(
    () =>
      occupied
        .map((u) => ({
          value: String(u.tenantId),
          label: String(u.tenantName ?? ''),
          searchText: `${String(u.tenantName ?? '')} ${String(u.buildingName ?? '')} ${String(u.unitNumber ?? '')}`,
        }))
        .filter((o) => o.value && o.label)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [occupied],
  )

  const filteredOccupied = useMemo(() => {
    return occupied.filter((u) => {
      if (buildingFilter && String(u.buildingName) !== buildingFilter) return false
      if (tenantFilter && String(u.tenantId) !== tenantFilter) return false
      return true
    })
  }, [occupied, buildingFilter, tenantFilter])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>
            {landlord
              ? `Active tenants and the units they occupy for ${String(landlord.name)}.`
              : 'Active tenants from completed applications and the units they occupy.'}
          </p>
        </div>
      </header>
      {error ? <p className="login-error">{error}</p> : null}
      {agentInviteUrl ? (
        <p className="role-callout role-agent" role="status" style={{ marginBottom: '1rem' }}>
          <strong>Agent invite link (copied if clipboard allowed)</strong>
          <span style={{ wordBreak: 'break-all' }}>{agentInviteUrl}</span>
          <span className="field-hint">
            Share this link with an agent. They sign in with their normal login and accept the
            unit to receive admin rights.
          </span>
        </p>
      ) : null}

      <section style={{ marginBottom: '1.75rem' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.75rem',
          }}
        >
          <h2 style={{ margin: 0 }}>Current tenants</h2>
          <div className="btn-row">
            <SearchableSelect
              value={buildingFilter}
              onChange={setBuildingFilter}
              options={buildingOptions}
              placeholder="Search buildings…"
              allLabel="All buildings"
              ariaLabel="Filter by building"
            />
            <SearchableSelect
              value={tenantFilter}
              onChange={setTenantFilter}
              options={tenantOptions}
              placeholder="Search tenants…"
              allLabel="All tenants"
              ariaLabel="Filter by tenant"
            />
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Unit</th>
                <th>Lease term</th>
                <th>Rent</th>
                <th>Balance</th>
                <th>Deposit balance</th>
                <th>Payment status</th>
                <th>Open tickets</th>
                <th>Ticket management</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredOccupied.map((u) => {
                const hasAgent = Boolean(u.managingAgentId)
                const badge = paymentBadge(Number(u.balance) || 0, monthEndDue)
                return (
                  <tr key={String(u.id)}>
                    <td>
                      <button
                        type="button"
                        className="link-quiet"
                        style={{
                          background: 'none',
                          border: 0,
                          padding: 0,
                          cursor: 'pointer',
                          font: 'inherit',
                          textAlign: 'left',
                        }}
                        onClick={() => setProfileUnit(u)}
                      >
                        <strong>{String(u.tenantName)}</strong>
                      </button>
                    </td>
                    <td>
                      {String(u.buildingName)} · Unit {String(u.unitNumber)}
                      <br />
                      <small>{String(u.buildingAddress)}</small>
                    </td>
                    <td>
                      {formatDate(String(u.leaseStart ?? ''))} →{' '}
                      {formatDate(String(u.leaseEnd ?? ''))}
                    </td>
                    <td>{formatMoney(Number(u.rent) || 0)}</td>
                    <td>{formatMoney(Number(u.balance) || 0)}</td>
                    <td>
                      {formatMoney(
                        Number(
                          u.depositBalance != null ? u.depositBalance : u.deposit,
                        ) || 0,
                      )}
                    </td>
                    <td>
                      <span className={`badge tone-${badge.tone}`}>{badge.label}</span>
                    </td>
                    <td>{String(u.openIssues ?? 0)}</td>
                    <td>
                      <div style={{ display: 'grid', gap: '0.35rem', minWidth: '12rem' }}>
                        {hasAgent ? (
                          <small>
                            Current agent: {String(u.managingAgentName || 'Assigned')}
                          </small>
                        ) : (
                          <small>No agent assigned</small>
                        )}
                        <select
                          value={String(u.ticketManager ?? 'landlord')}
                          disabled={savingId === String(u.id)}
                          onChange={(e) => {
                            const value = e.target.value
                            if (value === 'change-agent') {
                              void onChangeAgent(String(u.id))
                              return
                            }
                            void onHandoff(String(u.id), value as 'landlord' | 'agent')
                          }}
                        >
                          <option value="landlord">Landlord manages</option>
                          {hasAgent ? (
                            <option value="agent">Stay with current agent</option>
                          ) : null}
                          <option value="change-agent">
                            {hasAgent ? 'Change agent (invite link)' : 'Assign agent (invite link)'}
                          </option>
                        </select>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-compact"
                        onClick={() => {
                          setTerminateError(null)
                          setTerminating(u)
                        }}
                      >
                        Terminate lease
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filteredOccupied.length === 0 ? (
            <div className="empty-state">
              {occupied.length === 0
                ? 'No tenants yet. Tenants appear here after an application is completed.'
                : 'No tenants match the selected filters.'}
            </div>
          ) : null}
        </div>
      </section>

      {vacant.length > 0 ? (
        <section>
          <h2 style={{ marginBottom: '0.75rem' }}>Vacant units</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Status</th>
                  <th>Rent</th>
                  <th>Agent admin</th>
                </tr>
              </thead>
              <tbody>
                {vacant.map((u) => (
                  <tr key={String(u.id)}>
                    <td>
                      {String(u.buildingName)} · Unit {String(u.unitNumber)}
                      <br />
                      <small>{String(u.buildingAddress)}</small>
                    </td>
                    <td>{String(u.status)}</td>
                    <td>{formatMoney(Number(u.rent) || 0)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-compact"
                        disabled={savingId === String(u.id)}
                        onClick={() => void onChangeAgent(String(u.id))}
                      >
                        {u.managingAgentId ? 'Change agent' : 'Assign agent'}
                      </button>
                      {u.managingAgentName ? (
                        <div>
                          <small>{String(u.managingAgentName)}</small>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {profileUnit ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setProfileUnit(null)}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tenant-profile-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="page-header" style={{ marginBottom: '0.75rem' }}>
              <div>
                <p className="brand-eyebrow" style={{ margin: 0 }}>
                  Tenant profile
                </p>
                <h2 id="tenant-profile-title" style={{ margin: '0.25rem 0 0' }}>
                  {String(profileUnit.tenantName)}
                </h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={() => setProfileUnit(null)}
              >
                Close
              </button>
            </header>
            <dl className="success-panel-meta" style={{ width: '100%' }}>
              <div>
                <dt>Unit</dt>
                <dd>
                  {String(profileUnit.buildingName)} · Unit {String(profileUnit.unitNumber)}
                </dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{String(profileUnit.buildingAddress)}</dd>
              </div>
              <div>
                <dt>Lease term</dt>
                <dd>
                  {formatDate(String(profileUnit.leaseStart ?? ''))} →{' '}
                  {formatDate(String(profileUnit.leaseEnd ?? ''))}
                </dd>
              </div>
              <div>
                <dt>Rent</dt>
                <dd>{formatMoney(Number(profileUnit.rent) || 0)} / month</dd>
              </div>
              <div>
                <dt>Balance</dt>
                <dd>{formatMoney(Number(profileUnit.balance) || 0)}</dd>
              </div>
              <div>
                <dt>Deposit balance</dt>
                <dd>
                  {formatMoney(
                    Number(
                      profileUnit.depositBalance != null
                        ? profileUnit.depositBalance
                        : profileUnit.deposit,
                    ) || 0,
                  )}
                </dd>
              </div>
              <div>
                <dt>Payment status</dt>
                <dd>
                  {
                    paymentBadge(Number(profileUnit.balance) || 0, monthEndDue)
                      .label
                  }
                </dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{String(profileUnit.tenantEmail || '—')}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{String(profileUnit.tenantPhone || '—')}</dd>
              </div>
              <div>
                <dt>Open tickets</dt>
                <dd>{String(profileUnit.openIssues ?? 0)}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}

      {terminating ? (
        <TerminateLeaseModal
          tenantName={String(terminating.tenantName)}
          unitLabel={`${String(terminating.buildingName)} Unit ${String(terminating.unitNumber)}`}
          busy={terminateBusy}
          error={terminateError}
          onCancel={() => {
            if (terminateBusy) return
            setTerminating(null)
            setTerminateError(null)
          }}
          onConfirm={async (payload) => {
            setTerminateBusy(true)
            setTerminateError(null)
            try {
              await terminateLease(String(terminating.tenantId), payload, {
                asLandlord: true,
              })
              setTerminating(null)
              await load()
            } catch (e) {
              setTerminateError(
                e instanceof Error ? e.message : 'Could not terminate lease',
              )
            } finally {
              setTerminateBusy(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}
