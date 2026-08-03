import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchTenantStays } from '../../data/api'
import { formatMoney } from '../../data/utils'

export default function TenantStaysPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTenantStays()
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>My stays</h1>
          <p>Current and previous units since you joined the platform.</p>
        </div>
      </header>
      {error ? <p className="login-error">{error}</p> : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Address</th>
              <th>Rent</th>
              <th>Lease</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>
                  {String(row.buildingName)} · {String(row.unitNumber)}
                </td>
                <td>{String(row.buildingAddress)}</td>
                <td>{formatMoney(Number(row.rent) || 0)}</td>
                <td>
                  {String(row.leaseStart)} → {String(row.leaseEnd)}
                </td>
                <td>
                  <span className="badge">{String(row.status)}</span>
                </td>
                <td>
                  <Link to={`/tenant/stays/${row.id}`} className="btn btn-ghost btn-compact">
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="empty-state">No stays yet. Complete an application to activate a unit.</div>
        ) : null}
      </div>
    </div>
  )
}
