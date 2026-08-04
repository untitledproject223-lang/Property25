import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteApplication, listApplications } from '../../data/api'

const DELETABLE_STATUSES = new Set([
  'invited',
  'in_progress',
  'submitted',
  'under_review',
  'awaiting_signature',
  'signed',
  'approved',
  'rejected',
])

function unitLabel(row: Record<string, unknown>) {
  const building = row.building_name ?? row.buildingName
  const unit = row.unit_number ?? row.unitNumber
  if (building && unit) return `${String(building)} · ${String(unit)}`
  if (unit) return `Unit ${String(unit)}`
  return '—'
}

function progressLabel(row: Record<string, unknown>) {
  const pct = Number(row.completeness_pct ?? row.completenessPct ?? 0)
  const status = String(row.status ?? '')
  if (status === 'tenant') return 'Complete (tenant)'
  if (status === 'awaiting_signature') return `${pct}% · Awaiting signatures`
  if (status === 'under_review') return `${pct}% · Under review`
  if (status === 'in_progress' || status === 'invited') return `${pct}% · In progress`
  return `${pct}% · ${status}`
}

export default function ApplicationsListPage({
  title = 'Applications',
  description,
  allowDelete,
  emptyMessage = 'No applications yet.',
  newApplicationHref,
}: {
  title?: string
  description: string
  allowDelete: boolean
  emptyMessage?: string
  newApplicationHref?: string
}) {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    listApplications()
      .then((r) => setRows(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function onDelete(id: string, status: string) {
    if (!allowDelete || !DELETABLE_STATUSES.has(status) || status === 'tenant') {
      setError('Only in-progress applications can be deleted.')
      return
    }
    if (
      !window.confirm(
        'Delete this application for everyone? The tenant, landlord, and agent will no longer see it. This cannot be undone.',
      )
    ) {
      return
    }
    setDeletingId(id)
    setError(null)
    try {
      await deleteApplication(id)
      setRows((prev) => prev.filter((row) => String(row.id) !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete application')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {newApplicationHref ? (
          <Link to={newApplicationHref} className="btn btn-primary btn-compact">
            New application
          </Link>
        ) : null}
      </header>
      {error ? <p className="login-error">{error}</p> : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Unit</th>
              <th>Status</th>
              <th>Progress</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = String(row.id)
              const status = String(row.status)
              const canDelete =
                allowDelete && DELETABLE_STATUSES.has(status) && status !== 'tenant'
              return (
                <tr key={id}>
                  <td>
                    {String(row.applicant_name ?? row.applicantName ?? '—')}
                    <br />
                    <small>{String(row.applicant_email ?? row.applicantEmail ?? '')}</small>
                  </td>
                  <td>{unitLabel(row)}</td>
                  <td>
                    <span className="badge">{status}</span>
                  </td>
                  <td>{progressLabel(row)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <Link to={`/apply/${id}`} className="btn btn-ghost btn-compact">
                        Open
                      </Link>
                      {canDelete ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-compact"
                          style={{ color: '#b42318' }}
                          disabled={deletingId === id}
                          onClick={() => void onDelete(id, status)}
                        >
                          {deletingId === id ? 'Deleting…' : 'Delete'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="empty-state">{emptyMessage}</div> : null}
      </div>
    </div>
  )
}
