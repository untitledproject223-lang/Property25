import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDashboard } from '../data/DashboardContext'
import {
  invoiceReason,
  isTenantBillableTicket,
  tenantMaintenanceAmount,
  ticketInvoiceDescription,
} from '../data/invoiceHelpers'
import type { InvoiceBillingKind, InvoiceItem, InvoiceItemType } from '../data/types'
import { formatDateTimeShort, formatMoney, statusTone } from '../data/utils'
import './TenantDetail.css'

export default function InvoicesPage() {
  const navigate = useNavigate()
  const { state, tenantApartment, createInvoice, updateInvoiceStatus } = useDashboard()
  const [status, setStatus] = useState('')
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
  const [oneTimeAmount, setOneTimeAmount] = useState('')
  const [oneTimeDescription, setOneTimeDescription] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const invoices = useMemo(() => {
    return state.invoices
      .filter((i) => !status || i.status === status)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  }, [state.invoices, status])

  const billableTickets = useMemo(() => {
    return state.issues.filter(
      (issue) => issue.tenantId === tenantId && isTenantBillableTicket(issue),
    )
  }, [state.issues, tenantId])

  const selectedTicket = billableTickets.find((i) => i.id === issueId)
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
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!composeCtx) return
    setBusy(true)
    const items: InvoiceItem[] = []
    const push = (type: InvoiceItemType, description: string, amount: number) => {
      items.push({ type, description, amount })
    }
    try {
      if (issueId) {
        const decision = (selectedTicket?.decision ?? {}) as Record<string, unknown>
        const amount = Number(maintenanceAmount) || tenantMaintenanceAmount(decision)
        push(
          'maintenance',
          selectedTicket
            ? ticketInvoiceDescription(selectedTicket.subject, decision)
            : 'Maintenance',
          amount,
        )
      } else if (billingKind === 'recurring') {
        if (includeRent) {
          push(
            'rent',
            `Rent — ${composeCtx.building.name} Unit ${composeCtx.apartment.unitNumber}`,
            composeCtx.apartment.rent,
          )
        }
      } else {
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
        if (includeMaintenance) {
          push('maintenance', 'Maintenance', Number(maintenanceAmount) || 0)
        }
        const customAmount = Number(oneTimeAmount)
        if (customAmount > 0) {
          push('other', oneTimeDescription.trim() || 'One-time charge', customAmount)
        }
      }
      if (items.length === 0) {
        setFormError(
          billingKind === 'one_time'
            ? 'Add at least one line, or enter a one-time amount.'
            : 'Select at least one invoice line.',
        )
        return
      }
      const inv = await createInvoice({
        tenantId: composeCtx.tenant.id,
        dueDate,
        items,
        status: 'sent',
        billingKind: issueId ? 'one_time' : billingKind,
        isRecurring: !issueId && billingKind === 'recurring',
        issueId: issueId || undefined,
      })
      setIssueId('')
      setIncludeMaintenance(false)
      setMaintenanceAmount('')
      setOneTimeAmount('')
      setOneTimeDescription('')
      navigate(`/invoices/${inv.id}/view`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create invoice')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <p>
            Create invoices for tenants. New invoices open in full view so you can share or
            download them.
          </p>
        </div>
      </div>

      <div className="panel invoice-compose-panel">
        <div className="panel-header">
          <h2>Create invoice</h2>
        </div>
        <form className="panel-body invoice-compose-form" onSubmit={submit}>
          <div className="invoice-compose-row invoice-compose-row-4">
            <label className="invoice-field">
              <span>Tenant</span>
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
                      {ctx ? ` — ${ctx.building.name} Unit ${ctx.apartment.unitNumber}` : ''}
                    </option>
                  )
                })}
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
              </div>
            </div>
            <label className="invoice-field">
              <span>Ticket</span>
              <select value={issueId} onChange={(e) => onTicketChange(e.target.value)}>
                <option value="">None</option>
                {billableTickets.map((issue) => (
                  <option key={issue.id} value={issue.id}>
                    {issue.subject}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {issueId ? (
            <div className="invoice-compose-row">
              <label className="invoice-field">
                <span>Maintenance amount</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={maintenanceAmount}
                  onChange={(e) => setMaintenanceAmount(e.target.value)}
                  required
                />
              </label>
            </div>
          ) : billingKind === 'one_time' ? (
            <>
              <div className="invoice-line-options">
                <label className="check-inline invoice-check-field">
                  <input
                    type="checkbox"
                    checked={includeRent}
                    onChange={(e) => setIncludeRent(e.target.checked)}
                  />
                  Rent
                </label>
                <label className="check-inline invoice-check-field">
                  <input
                    type="checkbox"
                    checked={includeDeposit}
                    onChange={(e) => setIncludeDeposit(e.target.checked)}
                  />
                  Deposit
                </label>
                <label className="check-inline invoice-check-field">
                  <input
                    type="checkbox"
                    checked={includeAdmin}
                    onChange={(e) => setIncludeAdmin(e.target.checked)}
                  />
                  Admin
                </label>
              </div>
              <div className="invoice-compose-row invoice-compose-row-3">
                {includeAdmin ? (
                  <label className="invoice-field">
                    <span>Admin amount</span>
                    <input
                      type="number"
                      min={0}
                      value={adminAmount}
                      onChange={(e) => setAdminAmount(e.target.value)}
                    />
                  </label>
                ) : null}
                <label className="invoice-field">
                  <span>One-time amount</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={oneTimeAmount}
                    onChange={(e) => setOneTimeAmount(e.target.value)}
                    placeholder="Optional custom amount"
                  />
                </label>
                <label className="invoice-field">
                  <span>One-time description</span>
                  <input
                    value={oneTimeDescription}
                    onChange={(e) => setOneTimeDescription(e.target.value)}
                    placeholder="Description for custom amount"
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

          <div className="invoice-compose-actions">
            {formError ? <p className="login-error">{formError}</p> : null}
            {composeCtx ? (
              <p className="muted">
                Rent {formatMoney(composeCtx.apartment.rent)} · deposit{' '}
                {formatMoney(composeCtx.apartment.deposit)}
              </p>
            ) : (
              <span />
            )}
            <button type="submit" className="btn btn-primary btn-compact" disabled={busy}>
              {busy ? 'Creating…' : 'Create & open'}
            </button>
          </div>
        </form>
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

      <div className="panel">
        <div className="panel-header">
          <h2>Issued invoices</h2>
        </div>
        <div className="panel-body table-wrap" style={{ paddingTop: 0 }}>
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
                    <td>{formatDateTimeShort(inv.issuedAt)}</td>
                    <td>{formatDateTimeShort(inv.dueDate)}</td>
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
                          View
                        </Link>
                        <button
                          type="button"
                          className="btn btn-ghost btn-compact"
                          onClick={() => void updateInvoiceStatus(inv.id, 'paid')}
                        >
                          Mark paid
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
    </div>
  )
}
