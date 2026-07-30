import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDashboard } from '../data/DashboardContext'
import { formatDateTime, statusTone } from '../data/utils'
import './TenantDetail.css'

export default function IssuesPage() {
  const { state, tenantApartment, replyToIssue, setIssueStatus, logLandlordUpdate } =
    useDashboard()
  const [statusFilter, setStatusFilter] = useState('')
  const [activeId, setActiveId] = useState(state.issues[0]?.id ?? '')
  const [reply, setReply] = useState('')

  const issues = useMemo(() => {
    return state.issues
      .filter((i) => !statusFilter || i.status === statusFilter)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [state.issues, statusFilter])

  const active = issues.find((i) => i.id === activeId) ?? issues[0]
  const ctx = active ? tenantApartment(active.tenantId) : null

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Issues</h1>
          <p>Communications raised by tenants for the agent or landlord.</p>
        </div>
      </div>

      <div className="toolbar">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <div className="detail-grid issues-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Inbox ({issues.length})</h2>
          </div>
          <div className="panel-body issue-list">
            {issues.map((issue) => {
              const t = tenantApartment(issue.tenantId)
              return (
                <button
                  key={issue.id}
                  type="button"
                  className={`issue-item${active?.id === issue.id ? ' active' : ''}`}
                  onClick={() => setActiveId(issue.id)}
                >
                  <div>
                    <strong>{issue.subject}</strong>
                    <div className="muted">
                      {t?.tenant.name} · {t?.building.name} Unit {t?.apartment.unitNumber}
                    </div>
                  </div>
                  <span className={`badge ${statusTone(issue.status)}`}>{issue.status}</span>
                </button>
              )
            })}
            {issues.length === 0 ? (
              <div className="empty-state">No issues in this filter.</div>
            ) : null}
          </div>
        </div>

        {active && ctx ? (
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>{active.subject}</h2>
                <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                  <Link className="link-quiet" to={`/tenants/${ctx.tenant.id}`}>
                    {ctx.tenant.name}
                  </Link>{' '}
                  · {ctx.building.name} Unit {ctx.apartment.unitNumber} · {active.severity} ·{' '}
                  {active.severity}
                </p>
              </div>
              <span className={`badge ${statusTone(active.severity)}`}>{active.severity}</span>
            </div>
            <div className="panel-body">
              <ul className="message-thread">
                {active.messages.map((m) => (
                  <li key={m.id} className={`msg msg-${m.author}`}>
                    <div className="msg-meta">
                      {m.author} · {formatDateTime(m.at)}
                    </div>
                    <div>{m.body}</div>
                  </li>
                ))}
              </ul>
              <form
                className="form-stack"
                style={{ marginTop: '1rem' }}
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!reply.trim()) return
                  await replyToIssue(active.id, reply.trim())
                  setReply('')
                }}
              >
                <label>
                  Reply as agent
                  <textarea
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                </label>
                <div className="btn-row">
                  <button type="submit" className="btn btn-primary btn-compact">
                    Send reply
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => void setIssueStatus(active.id, 'resolved')}
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => {
                      const body = `Issue "${active.subject}" from ${ctx.tenant.name} (${ctx.building.name} Unit ${ctx.apartment.unitNumber}): ${active.messages.at(-1)?.body ?? ''}`
                      void logLandlordUpdate({
                        landlordId: ctx.landlord.id,
                        tenantId: ctx.tenant.id,
                        body,
                        channel: 'email',
                      })
                      window.location.href = `mailto:${ctx.landlord.email}?subject=${encodeURIComponent(active.subject)}&body=${encodeURIComponent(body)}`
                    }}
                  >
                    Notify landlord
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
