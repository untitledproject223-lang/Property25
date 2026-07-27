import { useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDashboard } from '../data/DashboardContext'
import { ContactActions } from '../dashboard/ContactActions'
import type { InvoiceItem, InvoiceItemType, PaymentMethod, PaymentType } from '../data/types'
import {
  formatDate,
  formatDateTime,
  formatMoney,
  initials,
  mailto,
  paymentBadge,
  statusTone,
} from '../data/utils'
import './TenantDetail.css'

const TABS = [
  'Overview',
  'Lease & docs',
  'Payments',
  'Invoices',
  'Contact',
  'Issues',
  'Inspections',
  'Landlord',
] as const

type Tab = (typeof TABS)[number]

export default function TenantDetailPage() {
  const { id } = useParams()
  const {
    tenantApartment,
    state,
    createInvoice,
    updateInvoiceStatus,
    addPayment,
    replyToIssue,
    setIssueStatus,
    logLandlordUpdate,
  } = useDashboard()
  const [tab, setTab] = useState<Tab>('Overview')
  const ctx = id ? tenantApartment(id) : null

  const payments = useMemo(
    () =>
      state.payments
        .filter((p) => p.tenantId === id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.payments, id],
  )
  const invoices = useMemo(
    () =>
      state.invoices
        .filter((i) => i.tenantId === id)
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
    [state.invoices, id],
  )
  const issues = useMemo(
    () =>
      state.issues
        .filter((i) => i.tenantId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.issues, id],
  )
  const activity = useMemo(
    () => state.activityLog.filter((a) => a.tenantId === id),
    [state.activityLog, id],
  )
  const landlordUpdates = useMemo(
    () =>
      state.landlordUpdates.filter(
        (u) => u.tenantId === id || (ctx && u.landlordId === ctx.landlord.id),
      ),
    [state.landlordUpdates, id, ctx],
  )

  if (!ctx) {
    return (
      <div className="empty-state">
        Tenant not found. <Link to="/tenants">Back to tenants</Link>
      </div>
    )
  }

  const { tenant, apartment, building, landlord } = ctx
  const badge = paymentBadge(tenant.balance, apartment.nextDueDate)

  return (
    <div className="tenant-detail">
      <div className="page-header">
        <div className="tenant-hero">
          <div className="tenant-avatar" aria-hidden="true">
            {initials(tenant.name)}
          </div>
          <div>
            <h1>{tenant.name}</h1>
            <p>
              {building.name} · Unit {apartment.unitNumber} · {formatMoney(apartment.rent)}/mo
            </p>
            <div className="btn-row" style={{ marginTop: '0.55rem' }}>
              <span className={`badge tone-${badge.tone}`}>{badge.label}</span>
              <span className={`badge ${statusTone(tenant.status)}`}>{tenant.status}</span>
            </div>
          </div>
        </div>
        <ContactActions
          person={tenant}
          tenantId={tenant.id}
          subject={`${building.name} Unit ${apartment.unitNumber}`}
        />
      </div>

      <div className="tenant-tabs" role="tablist" aria-label="Tenant sections">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`tenant-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="detail-grid">
          <div className="panel">
            <div className="panel-header">
              <h2>Tenancy</h2>
            </div>
            <div className="panel-body detail-list">
              <div>
                <span>Apartment</span>
                <strong>
                  {building.name}, Unit {apartment.unitNumber}
                </strong>
              </div>
              <div>
                <span>Address</span>
                <strong>{building.address}</strong>
              </div>
              <div>
                <span>Landlord</span>
                <strong>{landlord.name}</strong>
              </div>
              <div>
                <span>Lease</span>
                <strong>
                  {formatDate(tenant.leaseStart)} → {formatDate(tenant.leaseEnd)}
                </strong>
              </div>
              <div>
                <span>Deposit held</span>
                <strong>{formatMoney(apartment.deposit)}</strong>
              </div>
              <div>
                <span>Balance</span>
                <strong>{formatMoney(tenant.balance)}</strong>
              </div>
              <div>
                <span>Next due</span>
                <strong>{formatDate(apartment.nextDueDate)}</strong>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-header">
              <h2>Quick snapshot</h2>
            </div>
            <div className="panel-body detail-list">
              <div>
                <span>Open issues</span>
                <strong>{issues.filter((i) => i.status !== 'resolved').length}</strong>
              </div>
              <div>
                <span>Invoices</span>
                <strong>{invoices.length}</strong>
              </div>
              <div>
                <span>Payments on file</span>
                <strong>{payments.length}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{tenant.email}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>{tenant.phone}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'Lease & docs' && (
        <div className="panel">
          <div className="panel-header">
            <h2>Lease & documents</h2>
          </div>
          <div className="panel-body detail-list">
            <div>
              <span>Lease period</span>
              <strong>
                {formatDate(tenant.leaseStart)} – {formatDate(tenant.leaseEnd)}
              </strong>
            </div>
            <div>
              <span>Lease file</span>
              <strong>{tenant.docs?.leaseFile ?? 'Not on file'}</strong>
            </div>
            <div>
              <span>ID document</span>
              <strong>{tenant.docs?.idDoc ?? 'Not on file'}</strong>
            </div>
            <div>
              <span>Income document</span>
              <strong>{tenant.docs?.incomeDoc ?? 'Not on file'}</strong>
            </div>
          </div>
        </div>
      )}

      {tab === 'Payments' && (
        <PaymentsTab
          payments={payments}
          onAdd={(payload) =>
            addPayment({
              tenantId: tenant.id,
              ...payload,
            })
          }
        />
      )}

      {tab === 'Invoices' && (
        <InvoicesTab
          invoices={invoices}
          defaultRent={apartment.rent}
          defaultDeposit={apartment.deposit}
          onCreate={(payload) => createInvoice({ tenantId: tenant.id, ...payload })}
          onStatus={updateInvoiceStatus}
        />
      )}

      {tab === 'Contact' && (
        <div className="detail-grid">
          <div className="panel">
            <div className="panel-header">
              <h2>Contact tenant</h2>
            </div>
            <div className="panel-body">
              <ContactActions
                person={tenant}
                tenantId={tenant.id}
                subject={`${building.name} Unit ${apartment.unitNumber}`}
              />
              <p className="muted" style={{ marginTop: '1rem' }}>
                Opens email, WhatsApp, or phone with an activity log entry.
              </p>
            </div>
          </div>
          <div className="panel">
            <div className="panel-header">
              <h2>Activity log</h2>
            </div>
            <div className="panel-body">
              {activity.length === 0 ? (
                <div className="empty-state">No contact activity yet.</div>
              ) : (
                <ul className="timeline-list">
                  {activity.map((a) => (
                    <li key={a.id}>
                      <strong>{a.channel}</strong> · {formatDateTime(a.at)}
                      <div>{a.body}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'Issues' && (
        <IssuesTab
          issues={issues}
          landlord={landlord}
          onReply={replyToIssue}
          onStatus={setIssueStatus}
          onNotifyLandlord={(body) => {
            logLandlordUpdate({
              landlordId: landlord.id,
              tenantId: tenant.id,
              body,
              channel: 'email',
            })
            window.location.href = mailto(
              landlord.email,
              `Tenant issue — ${building.name} Unit ${apartment.unitNumber}`,
              body,
            )
          }}
        />
      )}

      {tab === 'Inspections' && (
        <div className="panel">
          <div className="panel-header">
            <h2>Move-in inspection</h2>
          </div>
          <div className="panel-body">
            {tenant.moveInInspection ? (
              <div className="detail-list">
                <div>
                  <span>Date</span>
                  <strong>{formatDate(tenant.moveInInspection.date)}</strong>
                </div>
                <div>
                  <span>Agent</span>
                  <strong>{tenant.moveInInspection.agent}</strong>
                </div>
                <div>
                  <span>Electricity meter</span>
                  <strong>{tenant.moveInInspection.meterElectric ?? '—'}</strong>
                </div>
                <div>
                  <span>Water meter</span>
                  <strong>{tenant.moveInInspection.meterWater ?? '—'}</strong>
                </div>
                <div>
                  <span>Summary</span>
                  <strong>{tenant.moveInInspection.summary}</strong>
                </div>
              </div>
            ) : (
              <div className="empty-state">No move-in inspection on file.</div>
            )}
            <div className="moveout-placeholder">
              <h3>Move-out comparison</h3>
              <p>
                When the tenant vacates, record a move-out inspection here and compare
                against this baseline for deposit decisions.
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'Landlord' && (
        <LandlordTab
          landlord={landlord}
          tenantId={tenant.id}
          updates={landlordUpdates.filter((u) => u.landlordId === landlord.id)}
          onSend={(body, channel) => {
            logLandlordUpdate({
              landlordId: landlord.id,
              tenantId: tenant.id,
              body,
              channel,
            })
            if (channel === 'email') {
              window.location.href = mailto(
                landlord.email,
                `Update — ${building.name} Unit ${apartment.unitNumber}`,
                body,
              )
            }
          }}
        />
      )}
    </div>
  )
}

function PaymentsTab({
  payments,
  onAdd,
}: {
  payments: ReturnType<typeof useDashboard>['state']['payments']
  onAdd: (p: {
    date: string
    type: PaymentType
    amount: number
    method: PaymentMethod
    proofName?: string
    note?: string
  }) => void
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState<PaymentType>('rent')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('eft')
  const [proofName, setProofName] = useState('')
  const [note, setNote] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    if (!value) return
    onAdd({
      date,
      type,
      amount: value,
      method,
      proofName: proofName || undefined,
      note: note || undefined,
    })
    setAmount('')
    setProofName('')
    setNote('')
  }

  return (
    <div className="detail-grid">
      <div className="panel">
        <div className="panel-header">
          <h2>Payment history</h2>
        </div>
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Proof</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.date)}</td>
                  <td>{p.type}</td>
                  <td>{formatMoney(p.amount)}</td>
                  <td>{p.method}</td>
                  <td>
                    <span className={`badge ${statusTone(p.status)}`}>{p.status}</span>
                  </td>
                  <td>{p.proofName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length === 0 ? (
            <div className="empty-state">No payments recorded.</div>
          ) : null}
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2>Record payment</h2>
        </div>
        <form className="panel-body form-stack" onSubmit={submit}>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as PaymentType)}>
              <option value="rent">Rent</option>
              <option value="deposit">Deposit</option>
              <option value="admin">Admin</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Amount
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </label>
          <label>
            Method
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              <option value="eft">EFT</option>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          <label>
            Proof file name
            <input
              type="text"
              value={proofName}
              onChange={(e) => setProofName(e.target.value)}
              placeholder="pop.pdf"
            />
          </label>
          <label>
            Note
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary btn-compact">
            Save payment
          </button>
        </form>
      </div>
    </div>
  )
}

function InvoicesTab({
  invoices,
  defaultRent,
  defaultDeposit,
  onCreate,
  onStatus,
}: {
  invoices: ReturnType<typeof useDashboard>['state']['invoices']
  defaultRent: number
  defaultDeposit: number
  onCreate: (p: {
    dueDate: string
    items: InvoiceItem[]
    notes?: string
    status?: 'draft' | 'sent'
  }) => void
  onStatus: (id: string, status: 'draft' | 'sent' | 'paid' | 'overdue') => void
}) {
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  )
  const [includeRent, setIncludeRent] = useState(true)
  const [includeDeposit, setIncludeDeposit] = useState(false)
  const [includeAdmin, setIncludeAdmin] = useState(false)
  const [adminAmount, setAdminAmount] = useState('350')
  const [notes, setNotes] = useState('')
  const [selected, setSelected] = useState<string | null>(invoices[0]?.id ?? null)

  const selectedInvoice = invoices.find((i) => i.id === selected) ?? invoices[0]

  function submit(e: FormEvent) {
    e.preventDefault()
    const items: InvoiceItem[] = []
    const push = (type: InvoiceItemType, description: string, amount: number) => {
      items.push({ type, description, amount })
    }
    if (includeRent) push('rent', 'Monthly rent', defaultRent)
    if (includeDeposit) push('deposit', 'Security deposit', defaultDeposit)
    if (includeAdmin) push('admin', 'Admin fees', Number(adminAmount) || 0)
    if (items.length === 0) return
    onCreate({ dueDate, items, notes: notes || undefined, status: 'draft' })
    setNotes('')
  }

  return (
    <div className="detail-grid">
      <div className="panel">
        <div className="panel-header">
          <h2>Invoices</h2>
        </div>
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Issued</th>
                <th>Due</th>
                <th>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{formatDate(inv.issuedAt)}</td>
                  <td>{formatDate(inv.dueDate)}</td>
                  <td>{formatMoney(inv.total)}</td>
                  <td>
                    <span className={`badge ${statusTone(inv.status)}`}>{inv.status}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-compact"
                      onClick={() => setSelected(inv.id)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {selectedInvoice ? (
            <div className="invoice-view">
              <h3>Invoice {selectedInvoice.id}</h3>
              <ul>
                {selectedInvoice.items.map((item, idx) => (
                  <li key={idx}>
                    {item.description}: {formatMoney(item.amount)}
                  </li>
                ))}
              </ul>
              <p>
                <strong>Total: {formatMoney(selectedInvoice.total)}</strong>
              </p>
              {selectedInvoice.notes ? <p className="muted">{selectedInvoice.notes}</p> : null}
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  onClick={() => onStatus(selectedInvoice.id, 'sent')}
                >
                  Mark sent
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  onClick={() => onStatus(selectedInvoice.id, 'paid')}
                >
                  Mark paid
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  onClick={() => onStatus(selectedInvoice.id, 'overdue')}
                >
                  Mark overdue
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2>Create invoice</h2>
        </div>
        <form className="panel-body form-stack" onSubmit={submit}>
          <label>
            Due date
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </label>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={includeRent}
              onChange={(e) => setIncludeRent(e.target.checked)}
            />
            Rent ({formatMoney(defaultRent)})
          </label>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={includeDeposit}
              onChange={(e) => setIncludeDeposit(e.target.checked)}
            />
            Deposit ({formatMoney(defaultDeposit)})
          </label>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={includeAdmin}
              onChange={(e) => setIncludeAdmin(e.target.checked)}
            />
            Admin fees
          </label>
          {includeAdmin ? (
            <label>
              Admin amount
              <input
                type="number"
                min={0}
                value={adminAmount}
                onChange={(e) => setAdminAmount(e.target.value)}
              />
            </label>
          ) : null}
          <label>
            Notes
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-compact">
            Create invoice
          </button>
        </form>
      </div>
    </div>
  )
}

function IssuesTab({
  issues,
  landlord,
  onReply,
  onStatus,
  onNotifyLandlord,
}: {
  issues: ReturnType<typeof useDashboard>['state']['issues']
  landlord: { name: string; email: string }
  onReply: (issueId: string, body: string) => void
  onStatus: (issueId: string, status: 'open' | 'pending' | 'resolved') => void
  onNotifyLandlord: (body: string) => void
}) {
  const [activeId, setActiveId] = useState(issues[0]?.id ?? '')
  const [reply, setReply] = useState('')
  const active = issues.find((i) => i.id === activeId) ?? issues[0]

  return (
    <div className="detail-grid issues-grid">
      <div className="panel">
        <div className="panel-header">
          <h2>Issues</h2>
        </div>
        <div className="panel-body issue-list">
          {issues.length === 0 ? (
            <div className="empty-state">No issues from this tenant.</div>
          ) : (
            issues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                className={`issue-item${active?.id === issue.id ? ' active' : ''}`}
                onClick={() => setActiveId(issue.id)}
              >
                <strong>{issue.subject}</strong>
                <span className={`badge ${statusTone(issue.status)}`}>{issue.status}</span>
              </button>
            ))
          )}
        </div>
      </div>
      {active ? (
        <div className="panel">
          <div className="panel-header">
            <h2>{active.subject}</h2>
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
              onSubmit={(e) => {
                e.preventDefault()
                if (!reply.trim()) return
                onReply(active.id, reply.trim())
                setReply('')
              }}
            >
              <label>
                Reply as agent
                <textarea
                  rows={3}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply…"
                />
              </label>
              <div className="btn-row">
                <button type="submit" className="btn btn-primary btn-compact">
                  Send reply
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  onClick={() => onStatus(active.id, 'resolved')}
                >
                  Mark resolved
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  onClick={() =>
                    onNotifyLandlord(
                      `Regarding issue "${active.subject}": ${active.messages.at(-1)?.body ?? ''}`,
                    )
                  }
                >
                  Notify {landlord.name}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function LandlordTab({
  landlord,
  tenantId,
  updates,
  onSend,
}: {
  landlord: { id: string; name: string; email: string; phone: string; whatsapp?: string }
  tenantId: string
  updates: ReturnType<typeof useDashboard>['state']['landlordUpdates']
  onSend: (body: string, channel: 'email' | 'phone' | 'note') => void
}) {
  const [body, setBody] = useState('')

  return (
    <div className="detail-grid">
      <div className="panel">
        <div className="panel-header">
          <h2>Landlord</h2>
        </div>
        <div className="panel-body">
          <div className="detail-list" style={{ marginBottom: '1rem' }}>
            <div>
              <span>Name</span>
              <strong>{landlord.name}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{landlord.email}</strong>
            </div>
            <div>
              <span>Phone</span>
              <strong>{landlord.phone}</strong>
            </div>
          </div>
          <ContactActions
            person={landlord}
            tenantId={tenantId}
            landlordId={landlord.id}
            subject="Important tenancy update"
          />
          <form
            className="form-stack"
            style={{ marginTop: '1.25rem' }}
            onSubmit={(e) => {
              e.preventDefault()
              if (!body.trim()) return
              onSend(body.trim(), 'email')
              setBody('')
            }}
          >
            <label>
              Important update to landlord
              <textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Describe the update…"
                required
              />
            </label>
            <button type="submit" className="btn btn-primary btn-compact">
              Log & email landlord
            </button>
          </form>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2>Update log</h2>
        </div>
        <div className="panel-body">
          {updates.length === 0 ? (
            <div className="empty-state">No landlord updates yet.</div>
          ) : (
            <ul className="timeline-list">
              {updates.map((u) => (
                <li key={u.id}>
                  <strong>{u.channel}</strong> · {formatDateTime(u.at)}
                  <div>{u.body}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
