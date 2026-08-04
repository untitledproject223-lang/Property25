import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useDashboard } from '../data/DashboardContext'
import {
  invoiceReason,
  isTenantBillableTicket,
  tenantMaintenanceAmount,
  ticketInvoiceDescription,
} from '../data/invoiceHelpers'
import type { InvoiceBillingKind, InvoiceItem, InvoiceItemType } from '../data/types'
import { formatDate, formatMoney, statusTone } from '../data/utils'
import { generateInvoicePdf } from '../utils/invoicePdf'
import './TenantDetail.css'

export default function InvoicesPage() {
  const { state, tenantApartment, createInvoice, updateInvoiceStatus } = useDashboard()
  const [status, setStatus] = useState('')
  const [selectedId, setSelectedId] = useState(state.invoices[0]?.id ?? '')
  const [tenantId, setTenantId] = useState(state.tenants[0]?.id ?? '')
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  )
  const [billingKind, setBillingKind] = useState<InvoiceBillingKind>('one_time')
  const [issueId, setIssueId] = useState('')
  const [includeRent, setIncludeRent] = useState(true)
  const [includeDeposit, setIncludeDeposit] = useState(false)
  const [includeAdmin, setIncludeAdmin] = useState(false)
  const [includeMaintenance, setIncludeMaintenance] = useState(false)
  const [adminAmount, setAdminAmount] = useState('350')
  const [maintenanceAmount, setMaintenanceAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [pdfError, setPdfError] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)

  const invoices = useMemo(() => {
    return state.invoices
      .filter((i) => !status || i.status === status)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  }, [state.invoices, status])

  const billableTickets = useMemo(() => {
    return state.issues.filter(
      (issue) =>
        issue.tenantId === tenantId && isTenantBillableTicket(issue),
    )
  }, [state.issues, tenantId])

  const selectedTicket = billableTickets.find((i) => i.id === issueId)
  const selected = invoices.find((i) => i.id === selectedId) ?? invoices[0]
  const selectedCtx = selected ? tenantApartment(selected.tenantId) : null
  const composeCtx = tenantId ? tenantApartment(tenantId) : null

  function onTicketChange(id: string) {
    setIssueId(id)
    if (!id) {
      setIncludeMaintenance(false)
      setBillingKind('one_time')
      return
    }
    const ticket = billableTickets.find((i) => i.id === id)
    if (!ticket) return
    const decision = (ticket.decision ?? {}) as Record<string, unknown>
    setBillingKind('one_time')
    setIncludeRent(false)
    setIncludeDeposit(false)
    setIncludeAdmin(false)
    setIncludeMaintenance(true)
    setMaintenanceAmount(String(tenantMaintenanceAmount(decision) || ''))
    setNotes(`Linked to ticket: ${ticket.subject}`)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!composeCtx) return
    const items: InvoiceItem[] = []
    const push = (type: InvoiceItemType, description: string, amount: number) => {
      items.push({ type, description, amount })
    }
    if (includeRent) {
      push(
        'rent',
        `Rent — ${composeCtx.building.name} Unit ${composeCtx.apartment.unitNumber}`,
        composeCtx.apartment.rent,
      )
    }
    if (includeDeposit) {
      push('deposit', 'Security deposit', composeCtx.apartment.deposit)
    }
    if (includeAdmin) {
      push('admin', 'Admin fees', Number(adminAmount) || 0)
    }
    if (includeMaintenance || issueId) {
      const decision = (selectedTicket?.decision ?? {}) as Record<string, unknown>
      const amount = Number(maintenanceAmount) || tenantMaintenanceAmount(decision)
      push(
        'maintenance',
        selectedTicket
          ? ticketInvoiceDescription(selectedTicket.subject, decision)
          : 'Maintenance',
        amount,
      )
    }
    if (items.length === 0) {
      setFormError('Select at least one invoice line.')
      return
    }
    if (issueId && !includeMaintenance && !items.some((i) => i.type === 'maintenance')) {
      setFormError('Ticket-linked invoices require a maintenance line.')
      return
    }
    try {
      const inv = await createInvoice({
        tenantId: composeCtx.tenant.id,
        dueDate,
        items,
        notes: notes || undefined,
        status: 'sent',
        billingKind: issueId ? 'one_time' : billingKind,
        isRecurring: !issueId && billingKind === 'recurring',
        issueId: issueId || undefined,
      })
      setSelectedId(inv.id)
      setNotes('')
      setIssueId('')
      setIncludeMaintenance(false)
      setMaintenanceAmount('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create invoice')
    }
  }

  async function downloadPdf() {
    if (!selected || !selectedCtx) return
    setPdfError('')
    setPdfBusy(true)
    try {
      await generateInvoicePdf(selected, {
        tenantName: selectedCtx.tenant.name,
        tenantEmail: selectedCtx.tenant.email,
        tenantPhone: selectedCtx.tenant.phone,
        buildingName: selectedCtx.building.name,
        buildingAddress: selectedCtx.building.address,
        unitNumber: selectedCtx.apartment.unitNumber,
        landlordName: selectedCtx.landlord.name,
        rent: selectedCtx.apartment.rent,
        deposit: selectedCtx.apartment.deposit,
      })
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Could not generate PDF.')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <p>
            Create invoices for tenants. New invoices are issued immediately and appear on the
            tenant invoice page.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter invoices"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      <div className="detail-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>All invoices</h2>
          </div>
          <div className="panel-body" style={{ paddingTop: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tenant</th>
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
                {invoices.map((inv) => {
                  const ctx = tenantApartment(inv.tenantId)
                  return (
                    <tr key={inv.id}>
                      <td>
                        {ctx ? (
                          <Link className="link-quiet" to={`/tenants/${ctx.tenant.id}`}>
                            {ctx.tenant.name}
                          </Link>
                        ) : (
                          inv.tenantId
                        )}
                      </td>
                      <td>{formatDate(inv.issuedAt)}</td>
                      <td>{formatDate(inv.dueDate)}</td>
                      <td className="invoice-reason-cell">{invoiceReason(inv)}</td>
                      <td>{formatMoney(inv.total)}</td>
                      <td>
                        {inv.billingKind === 'recurring' || inv.isRecurring
                          ? 'Recurring'
                          : inv.issueId
                            ? 'Ticket'
                            : 'One-time'}
                      </td>
                      <td>
                        <span className={`badge ${statusTone(inv.status)}`}>{inv.status}</span>
                      </td>
                      <td>
                        <div className="btn-row">
                          <Link
                            className="btn btn-primary btn-compact"
                            to={`/invoices/${inv.id}/view`}
                          >
                            View invoice
                          </Link>
                          <button
                            type="button"
                            className="btn btn-ghost btn-compact"
                            onClick={() => setSelectedId(inv.id)}
                          >
                            Manage
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {invoices.length === 0 ? (
              <div className="empty-state">No invoices match this filter.</div>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Create invoice</h2>
          </div>
          <form className="panel-body form-stack" onSubmit={submit}>
            <label>
              Tenant
              <select
                value={tenantId}
                onChange={(e) => {
                  setTenantId(e.target.value)
                  setIssueId('')
                  setIncludeMaintenance(false)
                }}
                required
              >
                {state.tenants.map((t) => {
                  const ctx = tenantApartment(t.id)
                  return (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {ctx
                        ? ` — ${ctx.building.name} Unit ${ctx.apartment.unitNumber}`
                        : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            {composeCtx ? (
              <p className="muted">
                Auto-filled rent {formatMoney(composeCtx.apartment.rent)} · deposit{' '}
                {formatMoney(composeCtx.apartment.deposit)}
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
                  name="billingKind"
                  checked={billingKind === 'one_time' || Boolean(issueId)}
                  disabled={Boolean(issueId)}
                  onChange={() => setBillingKind('one_time')}
                />
                One-time
              </label>
              <label className="check-inline">
                <input
                  type="radio"
                  name="billingKind"
                  checked={billingKind === 'recurring' && !issueId}
                  disabled={Boolean(issueId)}
                  onChange={() => setBillingKind('recurring')}
                />
                Recurring
              </label>
            </fieldset>
            <label>
              Attach to maintenance ticket
              <select value={issueId} onChange={(e) => onTicketChange(e.target.value)}>
                <option value="">None — standard invoice</option>
                {billableTickets.map((issue) => (
                  <option key={issue.id} value={issue.id}>
                    {issue.subject}
                  </option>
                ))}
              </select>
            </label>
            {billableTickets.length === 0 ? (
              <p className="muted">
                Ticket attach is available only when a maintenance ticket for this tenant was
                approved with the tenant responsible for payment.
              </p>
            ) : null}
            {!issueId ? (
              <>
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={includeRent}
                    onChange={(e) => setIncludeRent(e.target.checked)}
                  />
                  Rent
                </label>
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={includeDeposit}
                    onChange={(e) => setIncludeDeposit(e.target.checked)}
                  />
                  Deposit
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
              </>
            ) : (
              <label>
                Maintenance amount
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={maintenanceAmount}
                  onChange={(e) => setMaintenanceAmount(e.target.value)}
                  required
                />
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
            {formError ? <p className="login-error">{formError}</p> : null}
            <button type="submit" className="btn btn-primary btn-compact">
              Create &amp; issue to tenant
            </button>
          </form>

          {selected && selectedCtx ? (
            <div className="panel-body" style={{ paddingTop: 0 }}>
              <div className="invoice-view">
                <h3>
                  Invoice for {selectedCtx.tenant.name} · {selectedCtx.building.name} Unit{' '}
                  {selectedCtx.apartment.unitNumber}
                </h3>
                <p className="muted">
                  {selected.billingKind === 'recurring' || selected.isRecurring
                    ? 'Recurring'
                    : 'One-time'}
                  {selected.issueId ? ' · Linked to ticket' : ''}
                </p>
                <p>
                  <strong>Reason:</strong> {invoiceReason(selected)}
                </p>
                <ul>
                  {selected.items.map((item, idx) => (
                    <li key={idx}>
                      {item.description}: {formatMoney(item.amount)}
                    </li>
                  ))}
                </ul>
                <p>
                  <strong>Total: {formatMoney(selected.total)}</strong>
                </p>
                {selected.notes ? <p className="muted">{selected.notes}</p> : null}
                {pdfError ? (
                  <p className="muted" style={{ color: '#9b2c2c' }}>
                    {pdfError}
                  </p>
                ) : null}
                <div className="btn-row">
                  <Link
                    className="btn btn-primary btn-compact"
                    to={`/invoices/${selected.id}/view`}
                  >
                    View invoice
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={downloadPdf}
                    disabled={pdfBusy}
                  >
                    {pdfBusy ? 'Generating PDF…' : 'Download PDF invoice'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => void updateInvoiceStatus(selected.id, 'sent')}
                  >
                    Mark sent
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => void updateInvoiceStatus(selected.id, 'paid')}
                  >
                    Mark paid
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => void updateInvoiceStatus(selected.id, 'overdue')}
                  >
                    Mark overdue
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
