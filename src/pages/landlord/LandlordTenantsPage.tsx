import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createUnitAgentInvite,
  downloadTenantLease,
  fetchLandlordPortfolio,
  fetchLandlordTenantHistory,
  setUnitTicketManager,
  terminateLease,
} from '../../data/api'
import { formatDate, formatMoney, nextMonthEndDate, paymentBadge } from '../../data/utils'
import TerminateLeaseModal from '../../components/TerminateLeaseModal'
import SearchableSelect from '../../components/SearchableSelect'
import '../../pages/TenantDetail.css'

type Row = Record<string, unknown>
type ViewTab = 'current' | 'previous'

export default function LandlordTenantsPage() {
  const [units, setUnits] = useState<Row[]>([])
  const [history, setHistory] = useState<Row[]>([])
  const [tab, setTab] = useState<ViewTab>('current')
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [agentInviteUrl, setAgentInviteUrl] = useState<string | null>(null)
  const [terminating, setTerminating] = useState<Row | null>(null)
  const [terminateBusy, setTerminateBusy] = useState(false)
  const [terminateError, setTerminateError] = useState<string | null>(null)
  const [buildingFilter, setBuildingFilter] = useState('')
  const [tenantFilter, setTenantFilter] = useState('')
  const [query, setQuery] = useState('')
  const [profileUnit, setProfileUnit] = useState<Row | null>(null)
  const [leaseBusy, setLeaseBusy] = useState(false)
  const [leaseError, setLeaseError] = useState<string | null>(null)
  const monthEndDue = nextMonthEndDate()

  async function load() {
    try {
      const [portfolio, former] = await Promise.all([
        fetchLandlordPortfolio(),
        fetchLandlordTenantHistory(),
      ])
      const seen = new Set<string>()
      setUnits(
        portfolio.data.units.filter((u) => {
          const id = String(u.id)
          if (seen.has(id)) return false
          seen.add(id)
          return true
        }),
      )
      setHistory(
        (() => {
          const seen = new Set<string>()
          return former.data.filter((row) => {
            const id = String(row.id)
            if (!id || seen.has(id)) return false
            seen.add(id)
            return true
          })
        })(),
      )
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tenants')
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

  const buildingOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of occupied) {
      const name = String(u.buildingName ?? '')
      if (name) map.set(name, name)
    }
    return Array.from(map.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name, searchText: name }))
  }, [occupied])

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

  const filtered = useMemo(() => {
    return occupied.filter((u) => {
      if (buildingFilter && String(u.buildingName) !== buildingFilter) return false
      if (tenantFilter && String(u.tenantId) !== tenantFilter) return false
      return true
    })
  }, [occupied, buildingFilter, tenantFilter])

  const filteredHistory = useMemo(() => {
    const q = query.trim().toLowerCase()
    return history.filter((u) => {
      if (!q) return true
      return (
        String(u.name ?? '').toLowerCase().includes(q) ||
        String(u.email ?? '').toLowerCase().includes(q) ||
        String(u.phone ?? '').includes(q) ||
        String(u.buildingName ?? '').toLowerCase().includes(q) ||
        String(u.unitNumber ?? '').toLowerCase().includes(q)
      )
    })
  }, [history, query])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Tenants</h1>
          <p>
            Current tenants on your units, plus previous tenants kept after a lease ends or is
            terminated.
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

      <div className="tenant-tabs" role="tablist" aria-label="Tenant views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'current'}
          className={`tenant-tab${tab === 'current' ? ' active' : ''}`}
          onClick={() => setTab('current')}
        >
          Current ({occupied.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'previous'}
          className={`tenant-tab${tab === 'previous' ? ' active' : ''}`}
          onClick={() => setTab('previous')}
        >
          Previous tenants ({history.length})
        </button>
      </div>

      {tab === 'current' ? (
        <>
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
                  <th>Payment status</th>
                  <th>Open tickets</th>
                  <th>Ticket management</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
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
                        <Link className="link-quiet" to={`/landlord/units?unit=${String(u.id)}`}>
                          {String(u.buildingName)} · Unit {String(u.unitNumber)}
                        </Link>
                      </td>
                      <td>
                        {formatDate(String(u.leaseStart ?? ''))} →{' '}
                        {formatDate(String(u.leaseEnd ?? ''))}
                      </td>
                      <td>{formatMoney(Number(u.rent) || 0)}</td>
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
                            <option value="landlord">Managed by landlord</option>
                            {hasAgent ? (
                              <option value="agent">Managed by agent</option>
                            ) : null}
                            <option value="change-agent">
                              {hasAgent
                                ? 'Change agent (invite link)'
                                : 'Assign agent (invite link)'}
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
            {filtered.length === 0 ? (
              <div className="empty-state">
                {occupied.length === 0
                  ? 'No tenants yet. Tenants appear here after an application is completed.'
                  : 'No tenants match the selected filters.'}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
            <input
              type="search"
              placeholder="Search previous tenants…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search previous tenants"
            />
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Unit</th>
                  <th>Lease period</th>
                  <th>Ended</th>
                  <th>Reason</th>
                  <th>Rent</th>
                  <th>Deposit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((t) => (
                  <tr key={String(t.id)}>
                    <td>
                      <strong>{String(t.name)}</strong>
                      <div className="muted" style={{ fontSize: '0.8rem' }}>
                        {String(t.email || '—')}
                      </div>
                    </td>
                    <td>
                      <Link
                        className="link-quiet"
                        to={`/landlord/units?unit=${String(t.apartmentId)}`}
                      >
                        {String(t.buildingName)} · Unit {String(t.unitNumber)}
                      </Link>
                    </td>
                    <td>
                      {formatDate(String(t.leaseStart ?? ''))} →{' '}
                      {formatDate(String(t.leaseEnd ?? ''))}
                    </td>
                    <td>{formatDate(String(t.terminatedAt ?? t.leaseEnd ?? ''))}</td>
                    <td style={{ maxWidth: '16rem' }}>
                      {String(t.terminationReason || '—')}
                      {t.depositPaidOut ? (
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          Deposit paid out
                        </div>
                      ) : null}
                    </td>
                    <td>{formatMoney(Number(t.rent) || 0)}</td>
                    <td>
                      {formatMoney(
                        Number(
                          t.depositBalance != null ? t.depositBalance : t.deposit,
                        ) || 0,
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-compact"
                        disabled={leaseBusy}
                        onClick={() => {
                          setLeaseBusy(true)
                          setError(null)
                          void downloadTenantLease(String(t.id))
                            .catch((err) => {
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : 'Could not download lease',
                              )
                            })
                            .finally(() => setLeaseBusy(false))
                        }}
                      >
                        Download lease
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredHistory.length === 0 ? (
              <div className="empty-state">
                No previous tenants yet. Ended or terminated leases appear here.
              </div>
            ) : null}
          </div>
        </>
      )}

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
                  {paymentBadge(Number(profileUnit.balance) || 0, monthEndDue).label}
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
            {profileUnit.tenantId ? (
              <div style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  disabled={leaseBusy}
                  onClick={() => {
                    setLeaseBusy(true)
                    setLeaseError(null)
                    void downloadTenantLease(String(profileUnit.tenantId))
                      .catch((err) => {
                        setLeaseError(
                          err instanceof Error ? err.message : 'Could not download lease',
                        )
                      })
                      .finally(() => setLeaseBusy(false))
                  }}
                >
                  {leaseBusy ? 'Preparing…' : 'Download lease agreement'}
                </button>
                {leaseError ? <p className="login-error">{leaseError}</p> : null}
              </div>
            ) : null}
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
              setTab('previous')
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
