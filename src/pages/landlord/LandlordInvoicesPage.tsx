import {
  createInvoice,
  fetchLandlordInvoices,
  fetchLandlordTenants,
  listIssues,
  patchInvoice,
} from '../../data/api'
import {
  invoiceReason,
  isTenantBillableTicket,
  tenantMaintenanceAmount,
  ticketInvoiceDescription,
} from '../../data/invoiceHelpers'
import type { InvoiceBillingKind } from '../../data/types'
import { formatMoney } from '../../data/utils'
import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

type Row = Record<string, unknown>

export default function LandlordInvoicesPage() {
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
      if (issueId) {
        const decision = (selectedTicket?.decision ?? {}) as Record<string, unknown>
        const maintenance = Number(amount) || tenantMaintenanceAmount(decision)
        await createInvoice({
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
                ticketInvoiceDescription(String(selectedTicket?.subject ?? 'Maintenance'), decision),
              amount: maintenance,
            },
          ],
        })
      } else if (billingKind === 'recurring' || includeRent) {
        const rent = Number(selectedTenant.rent) || 0
        await createInvoice({
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
      } else {
        const oneTimeAmount = Number(amount)
        if (!oneTimeAmount || oneTimeAmount <= 0) {
          throw new Error('Enter a valid amount')
        }
        await createInvoice({
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
              amount: oneTimeAmount,
            },
          ],
        })
      }
      setNotes('')
      setIssueId('')
      setAmount('')
      setDescription('')
      await refresh()
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
            Issue invoices to tenants on your units. Created invoices appear on the tenant invoice
            page immediately.
          </p>
        </div>
      </header>

      {error ? <p className="login-error">{error}</p> : null}

      <div className="detail-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Issued invoices</h2>
          </div>
          <div className="panel-body" style={{ paddingTop: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Unit</th>
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
                    <td>{String(inv.dueDate)}</td>
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
                          View invoice
                        </Link>
                        {inv.status === 'sent' || inv.status === 'overdue' ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-compact"
                            onClick={() =>
                              void patchInvoice(String(inv.id), { status: 'paid' }).then(refresh)
                            }
                          >
                            Mark paid
                          </button>
                        ) : null}
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

        <div className="panel">
          <div className="panel-header">
            <h2>Create invoice</h2>
          </div>
          <form className="panel-body form-stack" onSubmit={onCreate}>
            <label>
              Tenant
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
            {selectedTenant ? (
              <p className="muted">
                Rent {formatMoney(Number(selectedTenant.rent) || 0)} · Deposit{' '}
                {formatMoney(Number(selectedTenant.deposit) || 0)}
              </p>
            ) : null}
            <label>
              Due date
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </label>
            <fieldset className="form-section" style={{ margin: 0, padding: '0.75rem' }}>
              <legend>Billing</legend>
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
                Recurring (monthly rent)
              </label>
            </fieldset>
            <label>
              Attach to maintenance ticket
              <select value={issueId} onChange={(e) => onTicketChange(e.target.value)}>
                <option value="">None — standard invoice</option>
                {billableTickets.map((issue) => (
                  <option key={String(issue.id)} value={String(issue.id)}>
                    {String(issue.subject)}
                  </option>
                ))}
              </select>
            </label>
            {billableTickets.length === 0 ? (
              <p className="muted">
                Available only when a maintenance ticket for this tenant was approved with the
                tenant responsible for payment.
              </p>
            ) : null}
            {issueId ? (
              <>
                <label>
                  Description
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Amount
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </label>
              </>
            ) : billingKind === 'one_time' && !includeRent ? (
              <>
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={includeRent}
                    onChange={(e) => setIncludeRent(e.target.checked)}
                  />
                  Use monthly rent
                </label>
                <label>
                  Description
                  <input value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
                <label>
                  Amount
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={includeRent}
                  onChange={(e) => setIncludeRent(e.target.checked)}
                />
                Include monthly rent
              </label>
            )}
            <label>
              Reason for invoice
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Why this invoice is being issued…"
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={busy || !tenantId}>
              {busy ? 'Creating…' : 'Create & issue to tenant'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
