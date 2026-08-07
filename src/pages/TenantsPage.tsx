import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import TerminateLeaseModal from '../components/TerminateLeaseModal'
import { terminateLease } from '../data/api'
import { useDashboard } from '../data/DashboardContext'
import { ContactActions } from '../dashboard/ContactActions'
import { TenantDocsActions } from '../dashboard/TenantDocsActions'
import { formatDate, formatMoney, paymentBadge } from '../data/utils'

type ViewTab = 'current' | 'previous'

export default function TenantsPage() {
  const { state, refresh } = useDashboard()
  const [tab, setTab] = useState<ViewTab>('current')
  const [query, setQuery] = useState('')
  const [terminatingId, setTerminatingId] = useState<string | null>(null)
  const [terminateBusy, setTerminateBusy] = useState(false)
  const [terminateError, setTerminateError] = useState<string | null>(null)

  const mapped = useMemo(() => {
    return state.tenants
      .map((tenant) => {
        const apartment = state.apartments.find((a) => a.id === tenant.apartmentId)
        const building = apartment
          ? state.buildings.find((b) => b.id === apartment.buildingId)
          : undefined
        if (!apartment || !building) return null
        const lastPayment = state.payments
          .filter((p) => p.tenantId === tenant.id && p.status === 'paid')
          .sort((a, b) => b.date.localeCompare(a.date))[0]
        const openIssues = state.issues.filter(
          (i) =>
            i.tenantId === tenant.id &&
            i.status !== 'resolved' &&
            i.status !== 'rejected',
        ).length
        const badge = paymentBadge(tenant.balance, apartment.nextDueDate)
        return { tenant, apartment, building, lastPayment, openIssues, badge }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
  }, [state])

  const currentCount = mapped.filter(
    (r) => r.tenant.status === 'active' || r.tenant.status === 'notice',
  ).length
  const previousCount = mapped.filter((r) => r.tenant.status === 'former').length

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return mapped
      .filter(({ tenant }) =>
        tab === 'previous'
          ? tenant.status === 'former'
          : tenant.status === 'active' || tenant.status === 'notice',
      )
      .filter(({ tenant, apartment, building }) => {
        if (!q) return true
        return (
          tenant.name.toLowerCase().includes(q) ||
          tenant.phone.includes(q) ||
          tenant.email.toLowerCase().includes(q) ||
          apartment.unitNumber.toLowerCase().includes(q) ||
          building.name.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => {
        if (tab === 'previous') {
          const aEnd = String(a.tenant.terminatedAt ?? a.tenant.leaseEnd)
          const bEnd = String(b.tenant.terminatedAt ?? b.tenant.leaseEnd)
          return bEnd.localeCompare(aEnd)
        }
        return a.tenant.name.localeCompare(b.tenant.name)
      })
  }, [mapped, query, tab])

  const terminating = rows.find((r) => r.tenant.id === terminatingId) ?? null

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Tenants</h1>
          <p>
            Current leases and previous tenants kept after a lease ends or is terminated.
          </p>
        </div>
      </div>

      <div className="tenant-tabs" role="tablist" aria-label="Tenant views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'current'}
          className={`tenant-tab${tab === 'current' ? ' active' : ''}`}
          onClick={() => setTab('current')}
        >
          Current ({currentCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'previous'}
          className={`tenant-tab${tab === 'previous' ? ' active' : ''}`}
          onClick={() => setTab('previous')}
        >
          Previous tenants ({previousCount})
        </button>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search name, unit, building, phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search tenants"
        />
      </div>

      <div className="panel">
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Building / unit</th>
                <th>{tab === 'previous' ? 'Lease period' : 'Lease end'}</th>
                {tab === 'previous' ? <th>Ended</th> : null}
                {tab === 'previous' ? <th>Reason</th> : null}
                <th>Rent</th>
                {tab === 'current' ? <th>Balance</th> : null}
                {tab === 'current' ? <th>Last payment</th> : null}
                {tab === 'current' ? <th>Issues</th> : null}
                <th>Contact</th>
                <th>Documents</th>
                {tab === 'current' ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ tenant, apartment, building, lastPayment, openIssues, badge }) => (
                <tr key={tenant.id}>
                  <td>
                    <Link className="link-quiet" to={`/tenants/${tenant.id}`}>
                      {tenant.name}
                    </Link>
                    <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                      {tab === 'current' ? (
                        <span className={`badge tone-${badge.tone}`}>{badge.label}</span>
                      ) : (
                        <span className="badge">Former</span>
                      )}
                    </div>
                  </td>
                  <td>
                    {building.name}
                    <div style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>
                      Unit {apartment.unitNumber}
                    </div>
                  </td>
                  <td>
                    {tab === 'previous'
                      ? `${formatDate(tenant.leaseStart)} → ${formatDate(tenant.leaseEnd)}`
                      : formatDate(tenant.leaseEnd)}
                  </td>
                  {tab === 'previous' ? (
                    <td>{formatDate(String(tenant.terminatedAt ?? tenant.leaseEnd))}</td>
                  ) : null}
                  {tab === 'previous' ? (
                    <td style={{ maxWidth: '14rem' }}>
                      {tenant.terminationReason?.trim() || '—'}
                      {tenant.depositPaidOut ? (
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          Deposit paid out
                        </div>
                      ) : null}
                    </td>
                  ) : null}
                  <td>{formatMoney(apartment.rent)}</td>
                  {tab === 'current' ? <td>{formatMoney(tenant.balance)}</td> : null}
                  {tab === 'current' ? (
                    <td>
                      {lastPayment
                        ? `${formatDate(lastPayment.date)} · ${formatMoney(lastPayment.amount)}`
                        : '—'}
                    </td>
                  ) : null}
                  {tab === 'current' ? <td>{openIssues || '—'}</td> : null}
                  <td>
                    <ContactActions
                      person={tenant}
                      tenantId={tenant.id}
                      subject={`Regarding ${building.name} Unit ${apartment.unitNumber}`}
                    />
                  </td>
                  <td>
                    <TenantDocsActions tenantId={tenant.id} />
                  </td>
                  {tab === 'current' ? (
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-compact"
                        onClick={() => {
                          setTerminateError(null)
                          setTerminatingId(tenant.id)
                        }}
                      >
                        Terminate lease
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <div className="empty-state">
              {tab === 'previous'
                ? 'No previous tenants yet. Ended or terminated leases appear here.'
                : 'No current tenants match your search.'}
            </div>
          ) : null}
        </div>
      </div>

      {terminating ? (
        <TerminateLeaseModal
          tenantName={terminating.tenant.name}
          unitLabel={`${terminating.building.name} Unit ${terminating.apartment.unitNumber}`}
          busy={terminateBusy}
          error={terminateError}
          onCancel={() => {
            if (terminateBusy) return
            setTerminatingId(null)
            setTerminateError(null)
          }}
          onConfirm={async (payload) => {
            setTerminateBusy(true)
            setTerminateError(null)
            try {
              await terminateLease(terminating.tenant.id, payload)
              setTerminatingId(null)
              await refresh()
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
