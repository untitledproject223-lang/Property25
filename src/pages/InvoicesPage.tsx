import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useDashboard } from '../data/DashboardContext'
import type { InvoiceItem, InvoiceItemType } from '../data/types'
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
  const [includeRent, setIncludeRent] = useState(true)
  const [includeDeposit, setIncludeDeposit] = useState(false)
  const [includeAdmin, setIncludeAdmin] = useState(false)
  const [adminAmount, setAdminAmount] = useState('350')
  const [notes, setNotes] = useState('')
  const [pdfError, setPdfError] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)

  const invoices = useMemo(() => {
    return state.invoices
      .filter((i) => !status || i.status === status)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  }, [state.invoices, status])

  const selected = invoices.find((i) => i.id === selectedId) ?? invoices[0]
  const selectedCtx = selected ? tenantApartment(selected.tenantId) : null
  const composeCtx = tenantId ? tenantApartment(tenantId) : null

  function submit(e: FormEvent) {
    e.preventDefault()
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
    if (items.length === 0) return
    const inv = createInvoice({
      tenantId: composeCtx.tenant.id,
      dueDate,
      items,
      notes: notes || undefined,
      status: 'draft',
    })
    setSelectedId(inv.id)
    setNotes('')
  }

  function downloadPdf() {
    if (!selected || !selectedCtx) return
    setPdfError('')
    setPdfBusy(true)
    try {
      generateInvoicePdf(selected, {
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
          <p>Create and track rent, deposit, and admin fee invoices for tenants.</p>
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
                  <th>Total</th>
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
                      <td>{formatMoney(inv.total)}</td>
                      <td>
                        <span className={`badge ${statusTone(inv.status)}`}>{inv.status}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-compact"
                          onClick={() => setSelectedId(inv.id)}
                        >
                          View
                        </button>
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
                onChange={(e) => setTenantId(e.target.value)}
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
            <label>
              Notes
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary btn-compact">
              Create invoice
            </button>
          </form>

          {selected && selectedCtx ? (
            <div className="panel-body" style={{ paddingTop: 0 }}>
              <div className="invoice-view">
                <h3>
                  Invoice for {selectedCtx.tenant.name} · {selectedCtx.building.name} Unit{' '}
                  {selectedCtx.apartment.unitNumber}
                </h3>
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
                  <button
                    type="button"
                    className="btn btn-primary btn-compact"
                    onClick={downloadPdf}
                    disabled={pdfBusy}
                  >
                    {pdfBusy ? 'Generating PDF…' : 'Download PDF invoice'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => updateInvoiceStatus(selected.id, 'sent')}
                  >
                    Mark sent
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => updateInvoiceStatus(selected.id, 'paid')}
                  >
                    Mark paid
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    onClick={() => updateInvoiceStatus(selected.id, 'overdue')}
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
