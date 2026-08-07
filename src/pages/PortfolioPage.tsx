import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import SearchableSelect from '../components/SearchableSelect'
import { useDashboard } from '../data/DashboardContext'
import { isUnitVacant } from '../data/unitHelpers'
import { formatMoney, paymentBadge, nextMonthEndDate } from '../data/utils'

type TableFilter = 'all' | 'active' | 'vacant' | 'balance' | 'issues'

export default function PortfolioPage() {
  const { state } = useDashboard()
  const [buildingId, setBuildingId] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [filter, setFilter] = useState<TableFilter>('all')
  const monthEndDue = nextMonthEndDate()

  const currentTenants = useMemo(
    () => state.tenants.filter((t) => t.status === 'active' || t.status === 'notice'),
    [state.tenants],
  )
  const currentTenantIds = useMemo(
    () => new Set(currentTenants.map((t) => t.id)),
    [currentTenants],
  )

  const activeTenants = currentTenants.length
  const vacantUnits = state.apartments.filter((a) =>
    isUnitVacant(a.id, state.tenants),
  ).length
  const openIssues = state.issues.filter(
    (i) =>
      i.status !== 'resolved' &&
      i.status !== 'rejected' &&
      currentTenantIds.has(i.tenantId),
  ).length
  const overduePayments = currentTenants.filter((t) => t.balance > 0).length

  const buildingOptions = useMemo(
    () =>
      state.buildings
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((b) => ({
          value: b.id,
          label: b.name,
          searchText: `${b.name} ${b.address}`,
        })),
    [state.buildings],
  )

  const tenantOptions = useMemo(
    () =>
      currentTenants
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => {
          const apartment = state.apartments.find((a) => a.id === t.apartmentId)
          const building = apartment
            ? state.buildings.find((b) => b.id === apartment.buildingId)
            : undefined
          return {
            value: t.id,
            label: t.name,
            searchText: `${t.name} ${apartment?.unitNumber ?? ''} ${building?.name ?? ''}`,
          }
        }),
    [currentTenants, state.apartments, state.buildings],
  )

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
              (i) =>
                i.tenantId === tenant.id &&
                i.status !== 'resolved' &&
                i.status !== 'rejected',
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
        if (tenantId && row.tenant?.id !== tenantId) return false
        if (filter === 'active') return Boolean(row.tenant)
        if (filter === 'vacant') return row.vacant
        if (filter === 'balance') return Boolean(row.tenant && row.tenant.balance > 0)
        if (filter === 'issues') return row.openIssueCount > 0
        return true
      })
  }, [state, buildingId, tenantId, filter, monthEndDue])

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
            <SearchableSelect
              value={buildingId}
              onChange={setBuildingId}
              options={buildingOptions}
              placeholder="Search buildings…"
              allLabel="All buildings"
              ariaLabel="Filter by building"
            />
            <SearchableSelect
              value={tenantId}
              onChange={setTenantId}
              options={tenantOptions}
              placeholder="Search tenants…"
              allLabel="All tenants"
              ariaLabel="Filter by tenant"
            />
          </div>
        </div>
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Building / unit</th>
                <th>Rent</th>
                <th>Deposit balance</th>
                <th>Payment status</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ apartment, building, tenant, openIssueCount, badge, depositBalance }) => (
                <tr key={apartment.id}>
                  <td>
                    {tenant ? (
                      <Link className="link-quiet" to={`/tenants/${tenant.id}`}>
                        <strong>{tenant.name}</strong>
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--ink-muted)' }}>No tenant assigned</span>
                    )}
                  </td>
                  <td>
                    <Link className="link-quiet" to={`/units/${apartment.id}`}>
                      <div>
                        <strong>{building.name}</strong>
                      </div>
                      <div style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>
                        Unit {apartment.unitNumber}
                      </div>
                    </Link>
                  </td>
                  <td>{formatMoney(apartment.rent)}</td>
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
