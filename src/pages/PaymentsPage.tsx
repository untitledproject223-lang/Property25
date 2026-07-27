import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDashboard } from '../data/DashboardContext'
import { formatDate, formatMoney, statusTone } from '../data/utils'

export default function PaymentsPage() {
  const { state, tenantApartment } = useDashboard()
  const [buildingId, setBuildingId] = useState('')
  const [status, setStatus] = useState('')
  const [tenantId, setTenantId] = useState('')

  const rows = useMemo(() => {
    return state.payments
      .map((payment) => {
        const ctx = tenantApartment(payment.tenantId)
        return { payment, ctx }
      })
      .filter(({ payment, ctx }) => {
        if (!ctx) return false
        if (buildingId && ctx.building.id !== buildingId) return false
        if (status && payment.status !== status) return false
        if (tenantId && payment.tenantId !== tenantId) return false
        return true
      })
      .sort((a, b) => b.payment.date.localeCompare(a.payment.date))
  }, [state.payments, buildingId, status, tenantId, tenantApartment])

  const arrears = state.tenants.filter((t) => t.balance > 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Payments</h1>
          <p>Ledger of tenant payments and outstanding balances across the portfolio.</p>
        </div>
      </div>

      {arrears.length > 0 ? (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-header">
            <h2>Balances due</h2>
          </div>
          <div className="panel-body" style={{ paddingTop: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Unit</th>
                  <th>Balance</th>
                  <th>Next due</th>
                </tr>
              </thead>
              <tbody>
                {arrears.map((t) => {
                  const ctx = tenantApartment(t.id)
                  if (!ctx) return null
                  return (
                    <tr key={t.id}>
                      <td>
                        <Link className="link-quiet" to={`/tenants/${t.id}`}>
                          {t.name}
                        </Link>
                      </td>
                      <td>
                        {ctx.building.name} · {ctx.apartment.unitNumber}
                      </td>
                      <td>{formatMoney(t.balance)}</td>
                      <td>{formatDate(ctx.apartment.nextDueDate)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="toolbar">
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
        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          aria-label="Filter by tenant"
        >
          <option value="">All tenants</option>
          {state.tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="panel">
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Tenant</th>
                <th>Unit</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Proof</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ payment, ctx }) =>
                ctx ? (
                  <tr key={payment.id}>
                    <td>{formatDate(payment.date)}</td>
                    <td>
                      <Link className="link-quiet" to={`/tenants/${ctx.tenant.id}`}>
                        {ctx.tenant.name}
                      </Link>
                    </td>
                    <td>
                      {ctx.building.name} · {ctx.apartment.unitNumber}
                    </td>
                    <td>{payment.type}</td>
                    <td>{formatMoney(payment.amount)}</td>
                    <td>{payment.method}</td>
                    <td>
                      <span className={`badge ${statusTone(payment.status)}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td>{payment.proofName ?? '—'}</td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <div className="empty-state">No payments match these filters.</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
