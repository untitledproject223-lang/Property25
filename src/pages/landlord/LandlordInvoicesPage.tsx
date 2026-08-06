import {
  createInvoice,
  fetchLandlordInvoices,
  fetchLandlordTenants,
  listIssues,
} from '../../data/api'
import {
  invoiceReason,
  isTenantBillableTicket,
  tenantMaintenanceAmount,
  ticketInvoiceDescription,
} from '../../data/invoiceHelpers'
import type { InvoiceBillingKind } from '../../data/types'
import { formatDateTimeShort, formatMoney } from '../../data/utils'
import { Link, useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import '../TenantDetail.css'

type Row = Record<string, unknown>

export default function LandlordInvoicesPage() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<Row[]>([])
  const [tenants, setTenants] = useState<Row[]>([])
  const [issues, setIssues] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [tenantId, setTenantId] = useState('')
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  )
  const [billingKind, setBillingKind] = useState<InvoiceBillingKind>('one_time')
  const [issueId, setIssueId] = useState('')
  const [includeRent, setIncludeRent] = useState(true)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')

  const refresh = useCallback(async () => {
    const [inv, t, iss] = await Promise.all([
      fetchLandlordInvoices(),
      fetchLandlordTenants(),
      listIssues(),
    ])
    setInvoices(inv.data)
    setTenants(t.data)
    setIssues(iss.data)
    if (!tenantId && t.data[0]) setTenantId(String(t.data[0].id))
  }, [tenantId])

  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [refresh])

  const selectedTenant = tenants.find((t) => String(t.id) === tenantId)
  const billableTickets = useMemo(
    () =>
      issues.filter(
        (issue) =>
          String(issue.tenantId) === tenantId && isTenantBillableTicket(issue),
      ),
    [issues, tenantId],
  )
  const selectedTicket = billableTickets.find((i) => String(i.id) === issueId)

  function onTicketChange(id: string) {
    setIssueId(id)
    if (!id) {
      setIncludeRent(true)
      setDescription('')
      setAmount('')
      return
    }
    const ticket = billableTickets.find((i) => String(i.id) === id)
    if (!ticket) return
    const decision = (ticket.decision ?? {}) as Record<string, unknown>
    setBillingKind('one_time')
    setIncludeRent(false)
    setAmount(String(tenantMaintenanceAmount(decision) || ''))
    setDescription(ticketInvoiceDescription(String(ticket.subject), decision))
    setNotes(`Linked to ticket: ${String(ticket.subject)}`)
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!selectedTenant) return
    setBusy(true)
    setError(null)
    try {
      let createdId = ''
      if (issueId) {
        const decision = (selectedTicket?.decision ?? {}) as Record<string, unknown>
        const maintenance = Number(amount) || tenantMaintenanceAmount(decision)
        const result = await createInvoice({
          tenantId,
          dueDate,
          status: 'sent',
          billingKind: 'one_time',
          isRecurring: false,
          issueId,
          notes: notes || undefined,
          items: [
            {
              type: 'maintenance',
              description:
                description.trim() ||
                ticketInvoiceDescription(
                  String(selectedTicket?.subject ?? 'Maintenance'),
                  decision,
                ),
              amount: maintenance,
            },
          ],
        })
        createdId = String(result.data.id)
      } else if (billingKind === 'one_time' && Number(amount) > 0 && !includeRent) {
        const result = await createInvoice({
          tenantId,
          dueDate,
          status: 'sent',
          billingKind: 'one_time',
          isRecurring: false,
          notes: notes || undefined,
          items: [
            {
              type: 'other',
              description: description.trim() || 'One-time charge',
              amount: Number(amount),
            },
          ],
        })
        createdId = String(result.data.id)
      } else if (billingKind === 'recurring' || includeRent) {
        const rent = Number(selectedTenant.rent) || 0
        const result = await createInvoice({
          tenantId,
          dueDate,
          status: 'sent',
          billingKind,
          isRecurring: billingKind === 'recurring',
          notes: notes || undefined,
          items: [
            {
              type: 'rent',
              description: `Rent — ${String(selectedTenant.buildingName)} Unit ${String(selectedTenant.unitNumber)}`,
              amount: rent,
            },
          ],
        })
        createdId = String(result.data.id)
      } else {
        throw new Error('Enter a valid one-time amount, or include monthly rent')
      }
      setNotes('')
      setIssueId('')
      setAmount('')
      setDescription('')
      await refresh()
      if (createdId) navigate(`/landlord/invoices/${createdId}/view`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create invoice')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Invoices</h1>
          <p>
            Issue invoices to tenants. New invoices open in full view so you can share or download
            them.
          </p>
        </div>
      </header>

      {error ? <p className="login-error">{error}</p> : null}

      <div className="panel invoice-compose-panel">
        <div className="panel-header">
          <h2>Create invoice</h2>
        </div>
        <form className="panel-body invoice-compose-form" onSubmit={onCreate}>
          <div className="invoice-compose-row invoice-compose-row-4">
            <label className="invoice-field">
              <span>Tenant</span>
              <select
                value={tenantId}
                onChange={(e) => {
                  setTenantId(e.target.value)
                  setIssueId('')
                }}
                required
              >
                {tenants.map((t) => (
                  <option key={String(t.id)} value={String(t.id)}>
                    {String(t.name)} — {String(t.buildingName)} Unit {String(t.unitNumber)}
                  </option>
                ))}
              </select>
            </label>
            <label className="invoice-field">
              <span>Due date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </label>
            <div className="invoice-billing-box">
              <span className="invoice-field-label">Billing</span>
              <div className="invoice-billing-options" role="radiogroup" aria-label="Billing">
                <label className="check-inline">
                  <input
                    type="radio"
                    name="llBilling"
                    checked={billingKind === 'one_time' || Boolean(issueId)}
                    disabled={Boolean(issueId)}
                    onChange={() => setBillingKind('one_time')}
                  />
                  One-time
                </label>
                <label className="check-inline">
                  <input
                    type="radio"
                    name="llBilling"
                    checked={billingKind === 'recurring' && !issueId}
                    disabled={Boolean(issueId)}
                    onChange={() => {
                      setBillingKind('recurring')
                      setIncludeRent(true)
                    }}
                  />
                  Recurring
                </label>
              </div>
            </div>
            <label className="invoice-field">
              <span>Ticket</span>
              <select value={issueId} onChange={(e) => onTicketChange(e.target.value)}>
                <option value="">None</option>
                {billableTickets.map((issue) => (
                  <option key={String(issue.id)} value={String(issue.id)}>
                    {String(issue.subject)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {issueId || (billingKind === 'one_time' && !includeRent) ? (
            <>
              {!issueId ? (
                <div className="invoice-line-options">
                  <label className="check-inline invoice-check-field">
                    <input
                      type="checkbox"
                      checked={includeRent}
                      onChange={(e) => setIncludeRent(e.target.checked)}
                    />
                    Use monthly rent
                  </label>
                </div>
              ) : null}
              <div className="invoice-compose-row">
                <label className="invoice-field">
                  <span>Description</span>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required={Boolean(issueId) || !includeRent}
                  />
                </label>
                <label className="invoice-field">
                  <span>Amount</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required={Boolean(issueId) || !includeRent}
                  />
                </label>
              </div>
            </>
          ) : billingKind === 'one_time' ? (
            <>
              <div className="invoice-line-options">
                <label className="check-inline invoice-check-field">
                  <input
                    type="checkbox"
                    checked={includeRent}
                    onChange={(e) => setIncludeRent(e.target.checked)}
                  />
                  Use monthly rent
                </label>
              </div>
              <div className="invoice-compose-row">
                <label className="invoice-field">
                  <span>One-time amount</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Required if not using rent"
                  />
                </label>
                <label className="invoice-field">
                  <span>Description</span>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="One-time charge"
                  />
                </label>
              </div>
            </>
          ) : (
            <div className="invoice-line-options">
              <label className="check-inline invoice-check-field">
                <input
                  type="checkbox"
                  checked={includeRent}
                  onChange={(e) => setIncludeRent(e.target.checked)}
                />
                Include monthly rent
              </label>
            </div>
          )}

          <label className="invoice-field invoice-notes-field">
            <span>Reason</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why this invoice is being issued…"
            />
          </label>

          <div className="invoice-compose-actions">
            {selectedTenant ? (
              <p className="muted">
                Rent {formatMoney(Number(selectedTenant.rent) || 0)} · Deposit{' '}
                {formatMoney(Number(selectedTenant.deposit) || 0)}
              </p>
            ) : (
              <span />
            )}
            <button
              type="submit"
              className="btn btn-primary btn-compact"
              disabled={busy || !tenantId}
            >
              {busy ? 'Creating…' : 'Create & open'}
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Issued invoices</h2>
        </div>
        <div className="panel-body table-wrap" style={{ paddingTop: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Unit</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Reason</th>
                <th>Total</th>
                <th>Billing</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={String(inv.id)}>
                  <td>{String(inv.tenantName)}</td>
                  <td>
                    {String(inv.buildingName)} · {String(inv.unitNumber)}
                  </td>
                  <td>{formatDateTimeShort(String(inv.issuedAt ?? inv.dueDate))}</td>
                  <td>{formatDateTimeShort(String(inv.dueDate))}</td>
                  <td className="invoice-reason-cell">{invoiceReason(inv)}</td>
                  <td>{formatMoney(Number(inv.total) || 0)}</td>
                  <td>
                    {inv.billingKind === 'recurring' || inv.isRecurring
                      ? 'Recurring'
                      : inv.issueId
                        ? 'Ticket'
                        : 'One-time'}
                  </td>
                  <td>
                    <span className="badge">{String(inv.status)}</span>
                  </td>
                  <td>
                    <div className="btn-row">
                      <Link
                        className="btn btn-primary btn-compact"
                        to={`/landlord/invoices/${String(inv.id)}/view`}
                      >
                        View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 ? (
            <div className="empty-state">No invoices yet.</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
