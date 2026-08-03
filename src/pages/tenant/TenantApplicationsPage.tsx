import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listApplications } from '../../data/api'

export default function TenantApplicationsPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listApplications()
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Applications</h1>
          <p>Continue where you left off. Steps you cannot edit are view-only.</p>
        </div>
      </header>
      {error ? <p className="login-error">{error}</p> : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Status</th>
              <th>Progress</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>{String(row.applicant_name ?? row.applicantName ?? '—')}</td>
                <td>{String(row.status)}</td>
                <td>{String(row.completeness_pct ?? row.completenessPct ?? 0)}%</td>
                <td>
                  <Link to={`/apply/${row.id}`} className="btn btn-ghost btn-compact">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="empty-state">No applications yet.</div> : null}
      </div>
    </div>
  )
}
