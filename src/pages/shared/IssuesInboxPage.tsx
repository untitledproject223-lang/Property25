import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../data/AuthContext'
import { createIssue, listIssues, patchIssue } from '../../data/api'

type IssueRow = Record<string, unknown>

export default function IssuesInboxPage({
  title,
  allowCreate,
  allowDecision,
}: {
  title: string
  allowCreate: boolean
  allowDecision: boolean
}) {
  const { user } = useAuth()
  const [issues, setIssues] = useState<IssueRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [issueType, setIssueType] = useState<'maintenance' | 'general' | 'invoice'>(
    'general',
  )

  const [decisionOutcome, setDecisionOutcome] = useState<'accept' | 'reject' | 'conditional'>(
    'accept',
  )
  const [payer, setPayer] = useState<'tenant' | 'split'>('tenant')
  const [workDescription, setWorkDescription] = useState('')
  const [materialsCost, setMaterialsCost] = useState('')
  const [labourCost, setLabourCost] = useState('')
  const [landlordShare, setLandlordShare] = useState('50')
  const [tenantShare, setTenantShare] = useState('50')

  const refresh = useCallback(() => {
    listIssues()
      .then((r) => setIssues(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const selected = issues.find((i) => String(i.id) === selectedId) ?? null
  const messages = (selected?.messages as Array<Record<string, unknown>>) ?? []

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const created = await createIssue({
        subject: subject.trim(),
        issueType,
        message: message.trim() || undefined,
      })
      setCreating(false)
      setSubject('')
      setMessage('')
      setIssueType('general')
      refresh()
      setSelectedId(String(created.data.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create ticket')
    }
  }

  async function onReply(e: FormEvent) {
    e.preventDefault()
    if (!selectedId || !reply.trim()) return
    try {
      await patchIssue(selectedId, {
        reply: {
          body: reply.trim(),
          author:
            user?.role === 'tenant'
              ? 'tenant'
              : user?.role === 'landlord'
                ? 'landlord'
                : 'agent',
        },
      })
      setReply('')
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reply failed')
    }
  }

  async function onDecision(e: FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    try {
      await patchIssue(selectedId, {
        decision: {
          outcome: decisionOutcome,
          payer: decisionOutcome === 'conditional' ? payer : undefined,
          landlordShare:
            decisionOutcome === 'conditional' && payer === 'split'
              ? Number(landlordShare)
              : undefined,
          tenantShare:
            decisionOutcome === 'conditional' && payer === 'split'
              ? Number(tenantShare)
              : undefined,
          workDescription: workDescription.trim() || undefined,
          materialsCost: materialsCost ? Number(materialsCost) : undefined,
          labourCost: labourCost ? Number(labourCost) : undefined,
        },
      })
      setWorkDescription('')
      setMaterialsCost('')
      setLabourCost('')
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decision failed')
    }
  }

  const decision = (selected?.decision ?? {}) as Record<string, unknown>
  const isMaintenance = String(selected?.issueType) === 'maintenance'
  const showDecisionForm =
    allowDecision &&
    selected &&
    isMaintenance &&
    !decision.outcome &&
    String(selected.status) !== 'rejected' &&
    String(selected.status) !== 'resolved'

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p>Transparent ticket threads between tenant and landlord/agent.</p>
        </div>
        {allowCreate ? (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            New ticket
          </button>
        ) : null}
      </header>

      {error ? <p className="login-error">{error}</p> : null}

      {creating ? (
        <form className="form-grid" onSubmit={onCreate} style={{ marginBottom: '1.5rem' }}>
          <fieldset className="form-section">
            <legend>New ticket</legend>
            <label className="field field-span">
              <span className="field-label">Type</span>
              <select
                value={issueType}
                onChange={(e) =>
                  setIssueType(e.target.value as 'maintenance' | 'general' | 'invoice')
                }
                required
              >
                <option value="maintenance">Maintenance</option>
                <option value="general">General question</option>
                <option value="invoice">Invoice</option>
              </select>
            </label>
            <label className="field field-span">
              <span className="field-label">Subject</span>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </label>
            <label className="field field-span">
              <span className="field-label">Message</span>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary">
                Submit
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 280px) 1fr',
          gap: '1rem',
        }}
      >
        <div className="table-wrap">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {issues.map((issue) => (
              <li key={String(issue.id)}>
                <button
                  type="button"
                  className={`dash-nav-link${selectedId === String(issue.id) ? ' active' : ''}`}
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => setSelectedId(String(issue.id))}
                >
                  <strong>{String(issue.subject)}</strong>
                  <br />
                  <small>
                    {String(issue.issueType)} · {String(issue.status)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
          {issues.length === 0 ? <div className="empty-state">No tickets yet.</div> : null}
        </div>

        <div>
          {selected ? (
            <>
              {decision.outcome ? (
                <div className="role-callout role-shared" role="status" style={{ marginBottom: '1rem' }}>
                  <strong>
                    Decision: {String(decision.outcome)}
                    {decision.payer ? ` · payer: ${String(decision.payer)}` : ''}
                  </strong>
                  <span>
                    {decision.outcome === 'accept'
                      ? 'Cost for this ticket is incurred by the landlord.'
                      : decision.outcome === 'reject'
                        ? 'Request rejected — no work under this ticket.'
                        : 'Conditional approval — see payment responsibility in the thread.'}
                    {decision.totalCost != null
                      ? ` Total estimated: R${String(decision.totalCost)}.`
                      : ''}
                  </span>
                </div>
              ) : null}

              <div
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '1rem',
                  minHeight: 240,
                  marginBottom: '1rem',
                  background: '#fff',
                }}
              >
                {messages.map((m) => (
                  <div key={String(m.id)} style={{ marginBottom: '0.85rem' }}>
                    <strong>{String(m.author)}</strong>{' '}
                    <small>{new Date(String(m.at)).toLocaleString()}</small>
                    <p style={{ margin: '0.25rem 0 0' }}>{String(m.body)}</p>
                  </div>
                ))}
                {messages.length === 0 ? <p className="empty-state">No messages yet.</p> : null}
              </div>

              <form onSubmit={onReply} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  style={{ flex: 1 }}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write an update…"
                />
                <button type="submit" className="btn btn-primary" disabled={!reply.trim()}>
                  Send
                </button>
              </form>

              {showDecisionForm ? (
                <form className="form-grid" onSubmit={onDecision} style={{ marginTop: '1.5rem' }}>
                  <fieldset className="form-section">
                    <legend>Maintenance decision</legend>
                    <label className="field">
                      <span className="field-label">Outcome</span>
                      <select
                        value={decisionOutcome}
                        onChange={(e) =>
                          setDecisionOutcome(
                            e.target.value as 'accept' | 'reject' | 'conditional',
                          )
                        }
                      >
                        <option value="accept">Accept (landlord pays)</option>
                        <option value="reject">Reject entirely</option>
                        <option value="conditional">
                          Conditional (tenant pays or split)
                        </option>
                      </select>
                    </label>
                    {decisionOutcome === 'conditional' ? (
                      <label className="field">
                        <span className="field-label">Who pays</span>
                        <select
                          value={payer}
                          onChange={(e) => setPayer(e.target.value as 'tenant' | 'split')}
                        >
                          <option value="tenant">Tenant pays</option>
                          <option value="split">Split costs</option>
                        </select>
                      </label>
                    ) : null}
                    {decisionOutcome === 'conditional' && payer === 'split' ? (
                      <>
                        <label className="field">
                          <span className="field-label">Landlord %</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={landlordShare}
                            onChange={(e) => setLandlordShare(e.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Tenant %</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={tenantShare}
                            onChange={(e) => setTenantShare(e.target.value)}
                          />
                        </label>
                      </>
                    ) : null}
                    {decisionOutcome !== 'reject' ? (
                      <>
                        <label className="field field-span">
                          <span className="field-label">Work description</span>
                          <textarea
                            rows={2}
                            value={workDescription}
                            onChange={(e) => setWorkDescription(e.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Materials cost</span>
                          <input
                            type="number"
                            min={0}
                            value={materialsCost}
                            onChange={(e) => setMaterialsCost(e.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span className="field-label">Labour cost</span>
                          <input
                            type="number"
                            min={0}
                            value={labourCost}
                            onChange={(e) => setLabourCost(e.target.value)}
                          />
                        </label>
                      </>
                    ) : null}
                    <button type="submit" className="btn btn-primary">
                      Submit decision
                    </button>
                  </fieldset>
                </form>
              ) : null}
            </>
          ) : (
            <div className="empty-state">Select a ticket to view the conversation.</div>
          )}
        </div>
      </div>
    </div>
  )
}
