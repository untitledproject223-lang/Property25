import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDashboard } from '../data/DashboardContext'
import { formatMoney, paymentBadge, formatDate } from '../data/utils'

export default function PortfolioPage() {
  const { state } = useDashboard()
  const [buildingId, setBuildingId] = useState('')

  const activeTenants = state.tenants.filter((t) => t.status !== 'former').length
  const vacantUnits = state.apartments.filter((a) => a.status === 'vacant').length
  const openIssues = state.issues.filter((i) => i.status !== 'resolved').length
  const overduePayments = state.tenants.filter((t) => t.balance > 0).length
  const rentDue = state.apartments
    .filter((a) => a.status !== 'vacant')
    .reduce((sum, a) => sum + a.rent, 0)

  const rows = useMemo(() => {
    return state.apartments
      .filter((a) => !buildingId || a.buildingId === buildingId)
      .map((apartment) => {
        const building = state.buildings.find((b) => b.id === apartment.buildingId)!
        const tenant = state.tenants.find((t) => t.apartmentId === apartment.id)
        const openIssueCount = tenant
          ? state.issues.filter(
              (i) => i.tenantId === tenant.id && i.status !== 'resolved',
            ).length
          : 0
        const badge = tenant
          ? paymentBadge(tenant.balance, apartment.nextDueDate)
          : { label: 'Vacant', tone: 'neutral' as const }
        return { apartment, building, tenant, openIssueCount, badge }
      })
  }, [state, buildingId])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Portfolio</h1>
          <p>Overview of buildings, units, and onboarded tenants across your book.</p>
        </div>
        <Link to="/apply" className="btn btn-primary btn-compact">
          New application
        </Link>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Active tenants</div>
          <div className="value">{activeTenants}</div>
        </div>
        <div className="stat-card">
          <div className="label">Units vacant</div>
          <div className="value">{vacantUnits}</div>
        </div>
        <div className="stat-card">
          <div className="label">Rent book / mo</div>
          <div className="value">{formatMoney(rentDue)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Balances due</div>
          <div className="value">{overduePayments}</div>
        </div>
        <div className="stat-card">
          <div className="label">Open issues</div>
          <div className="value">{openIssues}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Apartments</h2>
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
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Building / unit</th>
                <th>Tenant</th>
                <th>Rent</th>
                <th>Next due</th>
                <th>Status</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ apartment, building, tenant, openIssueCount, badge }) => (
                <tr key={apartment.id}>
                  <td>
                    <div>
                      <strong>{building.name}</strong>
                    </div>
                    <div style={{ color: 'var(--ink-muted)', fontSize: '0.85rem' }}>
                      Unit {apartment.unitNumber} · {apartment.status}
                    </div>
                  </td>
                  <td>
                    {tenant ? (
                      <Link className="link-quiet" to={`/tenants/${tenant.id}`}>
                        {tenant.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{formatMoney(apartment.rent)}</td>
                  <td>{formatDate(apartment.nextDueDate)}</td>
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
        </div>
      </div>
    </div>
  )
}
