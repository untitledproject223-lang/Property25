import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDashboard } from '../data/DashboardContext'
import { isUnitVacant } from '../data/unitHelpers'
import { formatMoney, paymentBadge, formatDate, nextMonthEndDate } from '../data/utils'

type TableFilter = 'all' | 'active' | 'vacant' | 'balance' | 'issues'

export default function PortfolioPage() {
  const { state } = useDashboard()
  const [buildingId, setBuildingId] = useState('')
  const [filter, setFilter] = useState<TableFilter>('all')
  const monthEndDue = nextMonthEndDate()

  const activeTenants = state.tenants.filter((t) => t.status !== 'former').length
  const vacantUnits = state.apartments.filter((a) =>
    isUnitVacant(a.id, state.tenants),
  ).length
  const openIssues = state.issues.filter((i) => i.status !== 'resolved').length
  const overduePayments = state.tenants.filter((t) => t.balance > 0).length

  const rows = useMemo(() => {
    return state.apartments
      .filter((a) => !buildingId || a.buildingId === buildingId)
      .map((apartment) => {
        const building = state.buildings.find((b) => b.id === apartment.buildingId)!
        const tenant = state.tenants.find(
          (t) =>
            t.apartmentId === apartment.id &&
            (t.status === 'active' || t.status === 'notice'),
        )
        const vacant = isUnitVacant(apartment.id, state.tenants)
        const openIssueCount = tenant
          ? state.issues.filter(
              (i) => i.tenantId === tenant.id && i.status !== 'resolved',
            ).length
          : 0
        const badge = tenant
          ? paymentBadge(tenant.balance, monthEndDue)
          : { label: 'Vacant', tone: 'neutral' as const }
        const depositBalance =
          apartment.depositBalance != null ? apartment.depositBalance : apartment.deposit
        return {
          apartment,
          building,
          tenant,
          vacant,
          openIssueCount,
          badge,
          depositBalance,
        }
      })
      .filter((row) => {
        if (filter === 'active') return Boolean(row.tenant)
        if (filter === 'vacant') return row.vacant
        if (filter === 'balance') return Boolean(row.tenant && row.tenant.balance > 0)
        if (filter === 'issues') return row.openIssueCount > 0
        return true
      })
  }, [state, buildingId, filter, monthEndDue])

  function toggleFilter(next: TableFilter) {
    setFilter((prev) => (prev === next ? 'all' : next))
  }

  const filterLabel =
    filter === 'active'
      ? 'Active tenants'
      : filter === 'vacant'
        ? 'Vacant units'
        : filter === 'balance'
          ? 'Balances due'
          : filter === 'issues'
            ? 'Open issues'
            : null

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of tenants and units across your book.</p>
        </div>
      </div>

      <div className="stat-grid stat-grid-4">
        <button
          type="button"
          className={`stat-card stat-card-btn${filter === 'active' ? ' active' : ''}`}
          onClick={() => toggleFilter('active')}
        >
          <div className="label">Active tenants</div>
          <div className="value">{activeTenants}</div>
        </button>
        <button
          type="button"
          className={`stat-card stat-card-btn${filter === 'vacant' ? ' active' : ''}`}
          onClick={() => toggleFilter('vacant')}
        >
          <div className="label">Units vacant</div>
          <div className="value">{vacantUnits}</div>
        </button>
        <button
          type="button"
          className={`stat-card stat-card-btn${filter === 'balance' ? ' active' : ''}`}
          onClick={() => toggleFilter('balance')}
        >
          <div className="label">Balances due</div>
          <div className="value">{overduePayments}</div>
        </button>
        <button
          type="button"
          className={`stat-card stat-card-btn${filter === 'issues' ? ' active' : ''}`}
          onClick={() => toggleFilter('issues')}
        >
          <div className="label">Open issues</div>
          <div className="value">{openIssues}</div>
        </button>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>
            {filterLabel ? `Filtered: ${filterLabel}` : 'Tenants & units'}
          </h2>
          <div className="btn-row">
            {filter !== 'all' ? (
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={() => setFilter('all')}
              >
                Clear filter
              </button>
            ) : null}
            <select
              value={buildingId}
              onChange={(e) => setBuildingId(e.target.value)}
              aria-label="Filter by building"
            >
              <option value="">All buildings</option>
              {state.buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Building / unit</th>
                <th>Rent</th>
                <th>Next due</th>
                <th>Deposit balance</th>
                <th>Status</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ apartment, building, tenant, openIssueCount, badge, depositBalance }) => (
                <tr key={apartment.id}>
                  <td>
                    {tenant ? (
                      <>
                        <Link className="link-quiet" to={`/tenants/${tenant.id}`}>
                          <strong>{tenant.name}</strong>
                        </Link>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                          {tenant.email}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--ink-muted)' }}>No tenant assigned</span>
                    )}
                  </td>
                  <td>
                    <div>
                      <strong>{building.name}</strong>
                    </div>
                    <div style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>
                      Unit {apartment.unitNumber}
                    </div>
                  </td>
                  <td>{formatMoney(apartment.rent)}</td>
                  <td>{tenant ? formatDate(monthEndDue) : '—'}</td>
                  <td>{tenant ? formatMoney(depositBalance) : '—'}</td>
                  <td>
                    <span className={`badge tone-${badge.tone}`}>{badge.label}</span>
                    {openIssueCount > 0 ? (
                      <>
                        {' '}
                        <span className="badge tone-issue">Issue open</span>
                      </>
                    ) : null}
                  </td>
                  <td>{openIssueCount || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <div className="empty-state">No rows match this filter.</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
