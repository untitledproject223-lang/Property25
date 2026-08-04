import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../data/AuthContext'
import { createInvoice, createIssue, listIssues, patchIssue } from '../../data/api'
import {
  isTenantBillableTicket,
  tenantMaintenanceAmount,
  ticketInvoiceDescription,
} from '../../data/invoiceHelpers'
import './IssuesInboxPage.css'

type IssueRow = Record<string, unknown>

function authorLabel(author: string) {
  if (author === 'tenant') return 'Tenant'
  if (author === 'landlord') return 'Landlord'
  if (author === 'agent') return 'Agent'
  return author
}

function statusLabel(status: string) {
  if (status === 'resolved') return 'Closed'
  if (status === 'rejected') return 'Rejected'
  if (status === 'pending') return 'In progress'
  return 'Open'
}

function managerLabel(owner: string) {
  return owner === 'agent' ? 'managing agent' : 'landlord'
}

export default function IssuesInboxPage({
  title,
  allowCreate,
  allowDecision,
  allowClose = true,
}: {
  title: string
  allowCreate: boolean
  allowDecision: boolean
  allowClose?: boolean
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
  const [closing, setClosing] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [invoicing, setInvoicing] = useState(false)
  const [invoiceNotice, setInvoiceNotice] = useState<string | null>(null)

  const [decisionOutcome, setDecisionOutcome] = useState<'accept' | 'reject' | 'conditional'>(
    'accept',
  )
  const [payer, setPayer] = useState<'tenant' | 'split'>('tenant')
  const [workDescription, setWorkDescription] = useState('')
  const [materialsCost, setMaterialsCost] = useState('')
  const [labourCost, setLabourCost] = useState('')
  const [landlordShare, setLandlordShare] = useState('50')
  const [tenantShare, setTenantShare] = useState('50')
  const [decisionNote, setDecisionNote] = useState('')

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
  const myAuthor =
    user?.role === 'tenant' ? 'tenant' : user?.role === 'landlord' ? 'landlord' : 'agent'
  const status = String(selected?.status ?? '')
  const isClosed = status === 'resolved' || status === 'rejected'
  const decision = (selected?.decision ?? {}) as Record<string, unknown>
  const managementOwner = String(selected?.managementOwner ?? 'landlord')
  const isMaintenance = String(selected?.issueType) === 'maintenance'
  const isAccepted =
    decision.outcome === 'accept' || decision.outcome === 'conditional'
  const awaitingDecision = Boolean(selected && !decision.outcome && !isClosed)
  const canDecide =
    Boolean(allowDecision) &&
    Boolean(selected) &&
    awaitingDecision &&
    (user?.role === 'admin' ||
      (managementOwner === 'landlord' && user?.role === 'landlord') ||
      (managementOwner === 'agent' && user?.role === 'agent'))
  const chatOpen = isAccepted && !isClosed
  const closureResult = String(decision.closureResult ?? '')
  const canCreateTicketInvoice =
    Boolean(selected) &&
    (user?.role === 'landlord' || user?.role === 'agent' || user?.role === 'admin') &&
    isTenantBillableTicket({
      issueType: selected?.issueType,
      decision,
    })

  async function onCreateTicketInvoice() {
    if (!selected || !canCreateTicketInvoice) return
    setInvoicing(true)
    setError(null)
    setInvoiceNotice(null)
    try {
      const amount = tenantMaintenanceAmount(decision)
      if (amount <= 0) {
        throw new Error('Ticket has no maintenance amount to invoice')
      }
      const dueDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
      await createInvoice({
        tenantId: String(selected.tenantId),
        dueDate,
        status: 'sent',
        billingKind: 'one_time',
        isRecurring: false,
        issueId: String(selected.id),
        notes: `Linked to ticket: ${String(selected.subject)}`,
        items: [
          {
            type: 'maintenance',
            description: ticketInvoiceDescription(String(selected.subject), decision),
            amount,
          },
        ],
      })
      setInvoiceNotice(
        'Maintenance invoice created and issued to the tenant. It now appears on their invoice page.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create invoice')
    } finally {
      setInvoicing(false)
    }
  }

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
    if (!selectedId || !reply.trim() || !chatOpen) return
    try {
      await patchIssue(selectedId, {
        reply: {
          body: reply.trim(),
          author: myAuthor,
        },
      })
      setReply('')
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reply failed')
    }
  }

  async function onClose(result: 'successful' | 'unsuccessful') {
    if (!selectedId || !chatOpen) return
    setClosing(true)
    setError(null)
    try {
      await patchIssue(selectedId, { close: { result } })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close ticket')
    } finally {
      setClosing(false)
    }
  }

  async function onDecision(e: FormEvent) {
    e.preventDefault()
    if (!selectedId || !canDecide) return
    setDeciding(true)
    setError(null)
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
          workDescription:
            isMaintenance && decisionOutcome !== 'reject'
              ? workDescription.trim() || undefined
              : undefined,
          materialsCost:
            isMaintenance && decisionOutcome !== 'reject' && materialsCost
              ? Number(materialsCost)
              : undefined,
          labourCost:
            isMaintenance && decisionOutcome !== 'reject' && labourCost
              ? Number(labourCost)
              : undefined,
          note: decisionNote.trim() || undefined,
        },
      })
      setWorkDescription('')
      setMaterialsCost('')
      setLabourCost('')
      setDecisionNote('')
      setDecisionOutcome('accept')
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decision failed')
    } finally {
      setDeciding(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p>
            Tickets are reviewed by the landlord or managing agent first. Correspondence opens
            only after acceptance.
          </p>
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

      <div className="tickets-layout">
        <aside className="ticket-list-panel">
          <h2>Inbox</h2>
          <ul className="ticket-list">
            {issues.map((issue) => {
              const d = (issue.decision ?? {}) as Record<string, unknown>
              const awaiting = !d.outcome && issue.status !== 'resolved' && issue.status !== 'rejected'
              return (
                <li key={String(issue.id)}>
                  <button
                    type="button"
                    className={`ticket-list-item${selectedId === String(issue.id) ? ' active' : ''}`}
                    onClick={() => setSelectedId(String(issue.id))}
                  >
                    <strong>{String(issue.subject)}</strong>
                    <div className="ticket-list-meta">
                      <span className="badge-status">{String(issue.issueType)}</span>
                      <span className={`badge-status ${String(issue.status)}`}>
                        {awaiting ? 'Awaiting review' : statusLabel(String(issue.status))}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
          {issues.length === 0 ? <div className="empty-state">No tickets yet.</div> : null}
        </aside>

        <section className="ticket-thread-panel">
          {selected ? (
            <>
              <header className="ticket-thread-header">
                <h2>{String(selected.subject)}</h2>
                <p className="ticket-thread-sub">
                  {String(selected.issueType)} ·{' '}
                  {awaitingDecision
                    ? 'Awaiting review'
                    : statusLabel(status)}
                  {` · Managed by ${managerLabel(managementOwner)}`}
                </p>

                {awaitingDecision ? (
                  <div className="ticket-awaiting-banner" role="status">
                    <strong>Review required</strong>
                    <span>
                      {canDecide
                        ? `Accept or reject this ticket before correspondence begins.`
                        : `Waiting for the ${managerLabel(managementOwner)} to accept or reject this ticket. Chat will open after acceptance.`}
                    </span>
                  </div>
                ) : null}

                {decision.outcome ? (
                  <div className="role-callout role-shared" role="status">
                    <strong>
                      Decision: {String(decision.outcome)}
                      {decision.payer ? ` · payer: ${String(decision.payer)}` : ''}
                    </strong>
                    <span>
                      {decision.outcome === 'accept'
                        ? isMaintenance
                          ? 'Ticket accepted. Cost for maintenance is incurred by the landlord. Correspondence is open.'
                          : 'Ticket accepted. Correspondence is open.'
                        : decision.outcome === 'reject'
                          ? 'Ticket rejected — no further correspondence on this ticket.'
                          : 'Conditional approval — see payment responsibility in the thread. Correspondence is open.'}
                      {decision.totalCost != null
                        ? ` Total estimated: R${String(decision.totalCost)}.`
                        : ''}
                    </span>
                  </div>
                ) : null}

                {closureResult ? (
                  <p
                    className={`ticket-closed-banner${closureResult === 'unsuccessful' ? ' unsuccessful' : ''}`}
                  >
                    Closed as {closureResult === 'successful' ? 'successful' : 'not successful'}
                    {decision.closedBy ? ` by ${authorLabel(String(decision.closedBy))}` : ''}
                  </p>
                ) : null}

                {canCreateTicketInvoice ? (
                  <div className="ticket-close-bar">
                    <p>
                      Tenant is responsible for maintenance payment on this ticket. Create an
                      invoice to bill them.
                    </p>
                    <div className="ticket-close-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-compact"
                        disabled={invoicing}
                        onClick={() => void onCreateTicketInvoice()}
                      >
                        {invoicing ? 'Creating invoice…' : 'Create maintenance invoice'}
                      </button>
                    </div>
                    {invoiceNotice ? <p className="muted">{invoiceNotice}</p> : null}
                  </div>
                ) : null}
              </header>

              <div className="ticket-chat" aria-live="polite">
                {messages.map((m) => {
                  const author = String(m.author)
                  const mine = author === myAuthor
                  const isSystem =
                    /ticket closed|ticket accepted|ticket rejected|ticket approved|correspondence is now open|maintenance accepted|maintenance approved|maintenance request rejected|no work will be carried/i.test(
                      String(m.body),
                    )
                  return (
                    <article
                      key={String(m.id)}
                      className={`ticket-bubble${mine ? ' mine' : ''}${isSystem ? ' system' : ''}`}
                    >
                      <div className="ticket-bubble-meta">
                        <span>{authorLabel(author)}</span>
                        <span>{new Date(String(m.at)).toLocaleString()}</span>
                      </div>
                      <p className="ticket-bubble-body">{String(m.body)}</p>
                    </article>
                  )
                })}
                {messages.length === 0 ? (
                  <p className="empty-state">
                    {awaitingDecision
                      ? 'No request details were attached to this ticket.'
                      : 'No correspondence yet.'}
                  </p>
                ) : null}
              </div>

              {canDecide ? (
                <div className="ticket-compose ticket-decision-first">
                  <form className="form-grid" onSubmit={onDecision}>
                    <fieldset className="form-section">
                      <legend>Accept or reject ticket</legend>
                      <p className="ticket-decision-intro">
                        Review the request above, then accept to open correspondence, or reject to
                        close the ticket.
                      </p>
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
                          <option value="accept">
                            {isMaintenance ? 'Accept (landlord pays)' : 'Accept ticket'}
                          </option>
                          <option value="reject">Reject ticket</option>
                          {isMaintenance ? (
                            <option value="conditional">
                              Conditional (tenant pays or split)
                            </option>
                          ) : null}
                        </select>
                      </label>
                      {isMaintenance && decisionOutcome === 'conditional' ? (
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
                      {isMaintenance &&
                      decisionOutcome === 'conditional' &&
                      payer === 'split' ? (
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
                      {isMaintenance && decisionOutcome !== 'reject' ? (
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
                      <label className="field field-span">
                        <span className="field-label">
                          {decisionOutcome === 'reject' ? 'Rejection note' : 'Note'} (optional)
                        </span>
                        <textarea
                          rows={2}
                          value={decisionNote}
                          onChange={(e) => setDecisionNote(e.target.value)}
                        />
                      </label>
                      <div className="ticket-close-actions">
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={deciding}
                        >
                          {decisionOutcome === 'reject'
                            ? 'Reject ticket'
                            : decisionOutcome === 'conditional'
                              ? 'Approve conditionally'
                              : 'Accept ticket'}
                        </button>
                      </div>
                    </fieldset>
                  </form>
                </div>
              ) : null}

              <div className="ticket-compose">
                {chatOpen ? (
                  <form className="ticket-compose-row" onSubmit={onReply}>
                    <label className="field" style={{ margin: 0 }}>
                      <span className="field-label">Official reply</span>
                      <textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="Write a clear, professional update…"
                        rows={3}
                      />
                    </label>
                    <button type="submit" className="btn btn-primary" disabled={!reply.trim()}>
                      Send
                    </button>
                  </form>
                ) : isClosed ? (
                  <p className="ticket-closed-banner">
                    This ticket is closed. Further replies are disabled.
                  </p>
                ) : awaitingDecision ? (
                  <p className="ticket-awaiting-banner compact">
                    Chat is unavailable until this ticket is accepted.
                  </p>
                ) : null}

                {allowClose && chatOpen ? (
                  <div className="ticket-close-bar">
                    <p>
                      When the matter is finished, close the ticket and record the outcome.
                    </p>
                    <div className="ticket-close-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-compact"
                        disabled={closing}
                        onClick={() => void onClose('successful')}
                      >
                        Close as successful
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-compact"
                        disabled={closing}
                        onClick={() => void onClose('unsuccessful')}
                      >
                        Close as not successful
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ margin: '2rem' }}>
              Select a ticket to view the conversation.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
