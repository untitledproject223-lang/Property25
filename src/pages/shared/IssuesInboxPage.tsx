import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../data/AuthContext'
import { createIssue, listIssues, patchIssue } from '../../data/api'
import {
  isTenantBillableTicket,
  tenantMaintenanceAmount,
} from '../../data/invoiceHelpers'
import { formatDateTimeShort, formatMoney } from '../../data/utils'
import './IssuesInboxPage.css'

type IssueRow = Record<string, unknown>
type DecisionChoice = 'accept_landlord' | 'accept_tenant' | 'reject' | 'accept'

function authorLabel(author: string) {
  if (author === 'tenant') return 'Tenant'
  if (author === 'landlord') return 'Landlord'
  if (author === 'agent') return 'Agent'
  if (author === 'system') return 'System'
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
  const [paying, setPaying] = useState(false)

  const [decisionChoice, setDecisionChoice] = useState<DecisionChoice>('accept_landlord')
  const [workDescription, setWorkDescription] = useState('')
  const [materialsCost, setMaterialsCost] = useState('')
  const [labourCost, setLabourCost] = useState('')
  const [decisionNote, setDecisionNote] = useState('')

  const refresh = useCallback(async (silent = false) => {
    try {
      const r = await listIssues()
      setIssues(r.data)
      if (!silent) setError(null)
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const poll = window.setInterval(() => void refresh(true), 3000)
    const onFocus = () => void refresh(true)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(poll)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  const selected = issues.find((i) => String(i.id) === selectedId) ?? null
  const messages = (selected?.messages as Array<Record<string, unknown>>) ?? []
  const myAuthor =
    user?.role === 'tenant' ? 'tenant' : user?.role === 'landlord' ? 'landlord' : 'agent'
  const status = String(selected?.status ?? '')
  const isClosed = status === 'resolved' || status === 'rejected'
  const decision = (selected?.decision ?? {}) as Record<string, unknown>
  const managementOwner = String(
    selected?.ticketManager ?? selected?.managementOwner ?? 'landlord',
  )
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
  const billable = isTenantBillableTicket({
    issueType: selected?.issueType,
    decision,
  })
  const tenantPayAccepted = Boolean(
    decision.tenantPayAccepted || decision.tenantPaymentMethod,
  )
  const chatOpen = isAccepted && !isClosed && (!billable || tenantPayAccepted)
  const closureResult = String(decision.closureResult ?? '')
  const tenantCanClose = allowClose && user?.role === 'tenant' && chatOpen
  const paymentMethod = String(decision.tenantPaymentMethod ?? '')
  const tenantNeedsPayAck =
    user?.role === 'tenant' &&
    Boolean(selected) &&
    billable &&
    !isClosed &&
    !tenantPayAccepted
  const hasCostRecord =
    decision.materialsCost != null ||
    decision.labourCost != null ||
    decision.totalCost != null ||
    Boolean(decision.workDescription)

  useEffect(() => {
    setDecisionChoice(isMaintenance ? 'accept_landlord' : 'accept')
  }, [selectedId, isMaintenance])

  async function onTenantAcceptPay() {
    if (!selectedId || !tenantNeedsPayAck) return
    setPaying(true)
    setError(null)
    try {
      await patchIssue(selectedId, { tenantPayment: { method: 'invoice' } })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm payment')
    } finally {
      setPaying(false)
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
      await refresh()
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
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reply failed')
    }
  }

  async function onClose(result: 'successful' | 'unsuccessful') {
    if (!selectedId || !tenantCanClose) return
    setClosing(true)
    setError(null)
    try {
      await patchIssue(selectedId, { close: { result } })
      await refresh()
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
      const choice = isMaintenance ? decisionChoice : decisionChoice === 'reject' ? 'reject' : 'accept'
      const outcome =
        choice === 'reject'
          ? 'reject'
          : choice === 'accept_tenant'
            ? 'conditional'
            : 'accept'
      const materials = Number(materialsCost)
      const labour = Number(labourCost)
      if (
        choice === 'accept_tenant' &&
        (!(Number.isFinite(materials) && materials >= 0) ||
          !(Number.isFinite(labour) && labour >= 0) ||
          materials + labour <= 0)
      ) {
        throw new Error('Enter materials and/or labour cost for Accept: tenant pays.')
      }
      await patchIssue(selectedId, {
        decision: {
          outcome,
          payer: choice === 'accept_tenant' ? 'tenant' : undefined,
          workDescription:
            isMaintenance && choice !== 'reject'
              ? workDescription.trim() || undefined
              : undefined,
          materialsCost:
            isMaintenance && choice !== 'reject' && materialsCost
              ? Number(materialsCost)
              : undefined,
          labourCost:
            isMaintenance && choice !== 'reject' && labourCost
              ? Number(labourCost)
              : undefined,
          note: decisionNote.trim() || undefined,
        },
      })
      setWorkDescription('')
      setMaterialsCost('')
      setLabourCost('')
      setDecisionNote('')
      setDecisionChoice(isMaintenance ? 'accept_landlord' : 'accept')
      await refresh()
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
            Tickets update automatically. Only the tenant can close a ticket once work is done.
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
        <form className="form-grid ticket-form-narrow" onSubmit={onCreate}>
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
              const awaiting =
                !d.outcome && issue.status !== 'resolved' && issue.status !== 'rejected'
              return (
                <li key={String(issue.id)}>
                  <button
                    type="button"
                    className={`ticket-list-item${selectedId === String(issue.id) ? ' active' : ''}`}
                    onClick={() => setSelectedId(String(issue.id))}
                  >
                    <strong>{String(issue.subject)}</strong>
                    {issue.tenantName ? (
                      <span className="ticket-list-tenant">{String(issue.tenantName)}</span>
                    ) : null}
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
                  {selected.tenantName ? `${String(selected.tenantName)} · ` : ''}
                  {String(selected.issueType)} ·{' '}
                  {awaitingDecision ? 'Awaiting review' : statusLabel(status)}
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
                      {decision.outcome === 'accept'
                        ? 'Accepted: landlord pays'
                        : decision.outcome === 'reject'
                          ? 'Rejected'
                          : decision.payer === 'tenant'
                            ? 'Accepted: tenant pays'
                            : `Decision: ${String(decision.outcome)}`}
                    </strong>
                    <span>
                      {decision.outcome === 'accept'
                        ? isMaintenance
                          ? 'Ticket accepted. Cost for maintenance is incurred by the landlord. Correspondence is open.'
                          : 'Ticket accepted. Correspondence is open.'
                        : decision.outcome === 'reject'
                          ? 'Ticket rejected — no further correspondence on this ticket.'
                          : tenantPayAccepted
                            ? 'Tenant accepted payment responsibility. Correspondence is open.'
                            : 'Waiting for the tenant to accept payment responsibility before chat continues.'}
                      {decision.totalCost != null
                        ? ` Total estimated: R${String(decision.totalCost)}.`
                        : ''}
                      {paymentMethod === 'deposit'
                        ? ` Paid from deposit (R${String(decision.depositDeductedAmount ?? '')}).`
                        : paymentMethod === 'invoice'
                          ? ' Invoice issued to the tenant.'
                          : ''}
                    </span>
                  </div>
                ) : null}

                {hasCostRecord ? (
                  <div className="ticket-cost-record" role="region" aria-label="Maintenance costs">
                    <strong>Maintenance cost record</strong>
                    {decision.workDescription ? (
                      <span>Work: {String(decision.workDescription)}</span>
                    ) : null}
                    <span>
                      Materials {formatMoney(Number(decision.materialsCost) || 0)} · Labour{' '}
                      {formatMoney(Number(decision.labourCost) || 0)} · Total{' '}
                      {formatMoney(Number(decision.totalCost) || 0)}
                    </span>
                    {decision.depositDeductedAmount != null ? (
                      <span>
                        Deposit deduction {formatMoney(Number(decision.depositDeductedAmount))}
                        {decision.depositBalanceAfter != null
                          ? ` · Balance after ${formatMoney(Number(decision.depositBalanceAfter))}`
                          : ''}
                      </span>
                    ) : null}
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

                {tenantNeedsPayAck ? (
                  <div className="ticket-close-bar">
                    <p>
                      You are responsible for{' '}
                      {formatMoney(tenantMaintenanceAmount(decision))} on this
                      maintenance ticket. An invoice has been issued. Confirm that you accept
                      payment responsibility to continue the conversation.
                    </p>
                    <div className="ticket-close-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-compact"
                        disabled={paying}
                        onClick={() => void onTenantAcceptPay()}
                      >
                        {paying ? 'Confirming…' : 'I accept that I will pay'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </header>

              <div className="ticket-chat" aria-live="polite">
                {messages.map((m) => {
                  const author = String(m.author)
                  const mine = author === myAuthor
                  const isSystem =
                    author === 'system' ||
                    /ticket closed|ticket accepted|ticket rejected|ticket approved|correspondence is now open|maintenance accepted|maintenance approved|maintenance request rejected|no work will be carried|chose to|deduct|invoice|accept responsibility|action required/i.test(
                      String(m.body),
                    )
                  return (
                    <article
                      key={String(m.id)}
                      className={`ticket-bubble${mine ? ' mine' : ''}${isSystem ? ' system' : ''}`}
                    >
                      <div className="ticket-bubble-meta">
                        <span>{authorLabel(author)}</span>
                        <span>{formatDateTimeShort(String(m.at))}</span>
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
                  <form className="form-grid ticket-form-narrow" onSubmit={onDecision}>
                    <fieldset className="form-section">
                      <legend>Accept or reject ticket</legend>
                      <p className="ticket-decision-intro">
                        Review the request above, then accept to open correspondence, or reject to
                        close the ticket.
                      </p>
                      <label className="field field-span">
                        <span className="field-label">Outcome</span>
                        <select
                          value={decisionChoice}
                          onChange={(e) =>
                            setDecisionChoice(e.target.value as DecisionChoice)
                          }
                        >
                          {isMaintenance ? (
                            <>
                              <option value="accept_landlord">Accept: landlord pays</option>
                              <option value="accept_tenant">Accept: tenant pays</option>
                              <option value="reject">Reject</option>
                            </>
                          ) : (
                            <>
                              <option value="accept">Accept ticket</option>
                              <option value="reject">Reject</option>
                            </>
                          )}
                        </select>
                      </label>
                      {isMaintenance && decisionChoice !== 'reject' ? (
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
                              required={decisionChoice === 'accept_tenant'}
                            />
                          </label>
                          <label className="field">
                            <span className="field-label">Labour cost</span>
                            <input
                              type="number"
                              min={0}
                              value={labourCost}
                              onChange={(e) => setLabourCost(e.target.value)}
                              required={decisionChoice === 'accept_tenant'}
                            />
                          </label>
                        </>
                      ) : null}
                      <label className="field field-span">
                        <span className="field-label">
                          {decisionChoice === 'reject' ? 'Rejection note' : 'Note'} (optional)
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
                          {decisionChoice === 'reject'
                            ? 'Reject ticket'
                            : decisionChoice === 'accept_tenant'
                              ? 'Accept: tenant pays'
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
                ) : billable && !tenantPayAccepted ? (
                  <p className="ticket-awaiting-banner compact">
                    Chat is unavailable until the tenant accepts payment responsibility.
                  </p>
                ) : null}

                {tenantCanClose ? (
                  <div className="ticket-close-bar">
                    <p>
                      When you are satisfied with the resolution, close the ticket and record the
                      outcome.
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
                ) : chatOpen && user?.role !== 'tenant' ? (
                  <p className="muted" style={{ marginTop: '0.75rem' }}>
                    Only the tenant can close this ticket once they are satisfied.
                  </p>
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
