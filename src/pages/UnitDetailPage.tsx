import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ContactActions } from '../dashboard/ContactActions'
import { useDashboard } from '../data/DashboardContext'
import {
  downloadDocument,
  fetchApartmentHistory,
  type ApartmentHistory,
  type DocumentMeta,
} from '../data/api'
import type { InvoiceBillingKind, InvoiceItemType } from '../data/types'
import { invoiceReason } from '../data/invoiceHelpers'
import { isUnitVacant } from '../data/unitHelpers'
import { formatDate, formatMoney, statusTone } from '../data/utils'
import './TenantDetail.css'

const TABS = [
  'Overview',
  'Tenants',
  'Invoices & payments',
  'Documents',
  'KYC & credit',
] as const

type Tab = (typeof TABS)[number]

function asString(value: unknown) {
  return value == null ? '' : String(value)
}

function asNumber(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export default function UnitDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, updateUnit, deleteUnit, createInvoice } = useDashboard()
  const [tab, setTab] = useState<Tab>('Overview')
  const [history, setHistory] = useState<ApartmentHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState('')
  const [unitNumber, setUnitNumber] = useState('')
  const [rent, setRent] = useState('')
  const [deposit, setDeposit] = useState('')
  const [landlordId, setLandlordId] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [docBusy, setDocBusy] = useState<string | null>(null)
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [invoiceError, setInvoiceError] = useState('')
  const [invoiceBusy, setInvoiceBusy] = useState(false)
  const [billingKind, setBillingKind] = useState<InvoiceBillingKind>('recurring')
  const [oneTimeType, setOneTimeType] = useState<InvoiceItemType>('deposit')
  const [invoiceAmount, setInvoiceAmount] = useState('')
  const [invoiceDescription, setInvoiceDescription] = useState('')
  const [invoiceDueDate, setInvoiceDueDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  )
  const [invoiceTenantId, setInvoiceTenantId] = useState('')

  const apartment = id ? state.apartments.find((a) => a.id === id) : undefined
  const vacant = apartment ? isUnitVacant(apartment.id, state.tenants) : false

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError('')
    fetchApartmentHistory(id)
      .then((res) => {
        if (!cancelled) setHistory(res.data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load unit history')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!apartment) return
    setUnitNumber(apartment.unitNumber)
    setRent(String(apartment.rent))
    setDeposit(String(apartment.deposit))
    setLandlordId(apartment.landlordId)
    setBuildingId(apartment.buildingId)
  }, [apartment])

  const tenantNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of history?.tenants ?? []) {
      map.set(asString(t.id), asString(t.name))
    }
    return map
  }, [history])

  const docsByTenant = useMemo(() => {
    const map = new Map<string, DocumentMeta[]>()
    for (const doc of history?.documents ?? []) {
      const key = doc.tenantId || doc.applicationId || 'unlinked'
      const list = map.get(key) ?? []
      list.push(doc)
      map.set(key, list)
    }
    return map
  }, [history])

  const billableTenants = useMemo(() => {
    return (history?.tenants ?? []).filter((t) => {
      const status = asString(t.status)
      return status === 'active' || status === 'notice'
    })
  }, [history])

  useEffect(() => {
    if (!billableTenants.length) {
      setInvoiceTenantId('')
      return
    }
    if (!billableTenants.some((t) => asString(t.id) === invoiceTenantId)) {
      setInvoiceTenantId(asString(billableTenants[0].id))
    }
  }, [billableTenants, invoiceTenantId])

  function openCreateInvoice() {
    setShowCreateInvoice(true)
    setInvoiceError('')
    setBillingKind('recurring')
    setOneTimeType('deposit')
    setInvoiceDescription('')
    const depositValue = history?.apartment.deposit ?? apartment?.deposit ?? 0
    setInvoiceAmount(depositValue ? String(depositValue) : '')
    setInvoiceDueDate(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
  }

  async function submitInvoice(e: FormEvent) {
    e.preventDefault()
    if (!history) return
    setInvoiceError('')
    if (!invoiceTenantId) {
      setInvoiceError('Select a tenant for this invoice.')
      return
    }

    const rentAmount = history.apartment.rent
    let type: InvoiceItemType
    let description: string
    let amount: number

    if (billingKind === 'recurring') {
      type = 'rent'
      description = `Monthly rent — ${history.apartment.buildingName} Unit ${history.apartment.unitNumber}`
      amount = rentAmount
    } else {
      type = oneTimeType
      amount = Number(invoiceAmount)
      if (!amount || amount < 0) {
        setInvoiceError('Enter a valid amount.')
        return
      }
      const defaultLabels: Record<string, string> = {
        deposit: 'Security deposit',
        maintenance: 'Maintenance',
        admin: 'Admin fee',
        other: 'One-time charge',
      }
      description =
        invoiceDescription.trim() ||
        defaultLabels[type] ||
        `One-time charge — Unit ${history.apartment.unitNumber}`
    }

    setInvoiceBusy(true)
    try {
      await createInvoice({
        tenantId: invoiceTenantId,
        dueDate: invoiceDueDate,
        billingKind,
        isRecurring: billingKind === 'recurring',
        status: 'sent',
        items: [{ type, description, amount }],
        notes:
          billingKind === 'recurring'
            ? 'Recurring monthly rent invoice'
            : 'One-time invoice',
      })
      const refreshed = await fetchApartmentHistory(history.apartment.id)
      setHistory(refreshed.data)
      setShowCreateInvoice(false)
    } catch (err) {
      setInvoiceError(err instanceof Error ? err.message : 'Could not create invoice')
    } finally {
      setInvoiceBusy(false)
    }
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!id) return
    setEditError('')
    try {
      await updateUnit(id, {
        buildingId,
        unitNumber: unitNumber.trim(),
        rent: Number(rent),
        deposit: Number(deposit) || Number(rent) * 2,
        landlordId,
      })
      setEditing(false)
      const refreshed = await fetchApartmentHistory(id)
      setHistory(refreshed.data)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not update unit')
    }
  }

  async function handleDelete() {
    if (!id) return
    const ok = window.confirm(
      vacant
        ? 'Delete this unit? It will move to Previous units.'
        : 'Delete this unit? The current lease will end, the tenant will move to Previous tenants, and the unit will move to Previous units.',
    )
    if (!ok) return
    setEditError('')
    const result = await deleteUnit(id)
    if (!result.ok) {
      setEditError(result.error ?? 'Could not delete unit')
      return
    }
    navigate('/units')
  }

  async function handleDownload(docId: string) {
    setDocBusy(docId)
    try {
      await downloadDocument(docId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDocBusy(null)
    }
  }

  if (!id || (!apartment && !loading && !history)) {
    return (
      <div className="empty-state">
        Unit not found. <Link to="/units">Back to units</Link>
      </div>
    )
  }

  const unit = history?.apartment
  const titleUnit = unit?.unitNumber ?? apartment?.unitNumber ?? '…'
  const buildingName = unit?.buildingName ?? 'Unit'
  const rentValue = unit?.rent ?? apartment?.rent ?? 0

  return (
    <div className="tenant-detail">
      <div className="page-header">
        <div>
          <p className="muted" style={{ margin: '0 0 0.35rem' }}>
            <Link className="link-quiet" to="/units">
              ← Units
            </Link>
          </p>
          <h1>
            {buildingName} · Unit {titleUnit}
          </h1>
          <p>
            {unit?.buildingAddress ?? ''} · {formatMoney(rentValue)}/mo · Landlord:{' '}
            {unit?.landlordName ??
              state.landlords.find((l) => l.id === apartment?.landlordId)?.name ??
              '—'}{' '}
            ·{' '}
            <span className={`badge ${vacant ? 'tone-due' : 'tone-paid'}`}>
              {vacant ? 'Vacant' : 'Occupied'}
            </span>
          </p>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? 'Close edit' : 'Edit unit'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            title="Delete unit and move it to Previous units"
            onClick={() => void handleDelete()}
          >
            Delete
          </button>
        </div>
      </div>

      {error ? (
        <p className="muted" style={{ color: '#9b2c2c', marginBottom: '0.75rem' }}>
          {error}
        </p>
      ) : null}

      {editing ? (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-header">
            <h2>Edit unit</h2>
          </div>
          <form className="panel-body form-stack" onSubmit={saveEdit}>
            {editError ? (
              <p className="muted" style={{ color: '#9b2c2c', margin: 0 }}>
                {editError}
              </p>
            ) : null}
            <label>
              Building
              <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
                {state.buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unit number
              <input
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                required
              />
            </label>
            <label>
              Rent
              <input
                type="number"
                min={0}
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                required
              />
            </label>
            <label>
              Deposit
              <input
                type="number"
                min={0}
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
            </label>
            <label>
              Landlord
              <select value={landlordId} onChange={(e) => setLandlordId(e.target.value)}>
                {state.landlords.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-primary btn-compact">
              Save changes
            </button>
          </form>
        </div>
      ) : null}

      <div className="tenant-tabs" role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            className={`tenant-tab${tab === name ? ' active' : ''}`}
            aria-selected={tab === name}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {loading ? <div className="empty-state">Loading unit history…</div> : null}

      {!loading && history && tab === 'Overview' ? (
        <div className="detail-grid">
          <div className="panel">
            <div className="panel-header">
              <h2>Unit details</h2>
            </div>
            <div className="panel-body detail-list">
              <div>
                <span>Building</span>
                <strong>
                  {history.apartment.buildingName}
                  <div className="muted">{history.apartment.buildingAddress}</div>
                </strong>
              </div>
              <div>
                <span>Unit</span>
                <strong>{history.apartment.unitNumber}</strong>
              </div>
              <div>
                <span>Rent / deposit</span>
                <strong>
                  {formatMoney(history.apartment.rent)} /{' '}
                  {formatMoney(history.apartment.deposit)}
                </strong>
              </div>
              <div>
                <span>Next due</span>
                <strong>
                  {history.apartment.nextDueDate
                    ? formatDate(String(history.apartment.nextDueDate))
                    : '—'}
                </strong>
              </div>
              <div>
                <span>Tenants on record</span>
                <strong>{history.tenants.length}</strong>
              </div>
              <div>
                <span>Landlord</span>
                <strong>{history.apartment.landlordName}</strong>
              </div>
              <div>
                <span>Applications</span>
                <strong>{history.applications.length}</strong>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Invoices</h2>
              <button
                type="button"
                className="btn btn-primary btn-compact"
                onClick={openCreateInvoice}
                disabled={billableTenants.length === 0}
                title={
                  billableTenants.length === 0
                    ? 'Add an active tenant before creating an invoice'
                    : 'Create invoice'
                }
              >
                Create Invoice
              </button>
            </div>
            <div className="panel-body">
              {showCreateInvoice ? (
                <form className="form-stack" onSubmit={submitInvoice} style={{ marginBottom: '1rem' }}>
                  {invoiceError ? (
                    <p className="muted" style={{ color: '#9b2c2c', margin: 0 }}>
                      {invoiceError}
                    </p>
                  ) : null}
                  <label>
                    Tenant
                    <select
                      value={invoiceTenantId}
                      onChange={(e) => setInvoiceTenantId(e.target.value)}
                      required
                    >
                      {billableTenants.map((t) => (
                        <option key={asString(t.id)} value={asString(t.id)}>
                          {asString(t.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '0.75rem' }}>
                    <legend style={{ padding: '0 0.35rem', fontSize: '0.85rem', fontWeight: 700 }}>
                      Invoice type
                    </legend>
                    <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.45rem' }}>
                      <input
                        type="radio"
                        name="billingKind"
                        checked={billingKind === 'recurring'}
                        onChange={() => setBillingKind('recurring')}
                      />
                      <span>
                        Recurring (monthly rent)
                        <div className="muted" style={{ fontSize: '0.78rem', fontWeight: 400 }}>
                          Uses this unit’s rent of {formatMoney(history.apartment.rent)}
                        </div>
                      </span>
                    </label>
                    <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="radio"
                        name="billingKind"
                        checked={billingKind === 'one_time'}
                        onChange={() => {
                          setBillingKind('one_time')
                          if (!invoiceAmount) {
                            setInvoiceAmount(String(history.apartment.deposit || ''))
                          }
                        }}
                      />
                      <span>
                        One-time (deposit, maintenance, or other)
                      </span>
                    </label>
                  </fieldset>
                  {billingKind === 'one_time' ? (
                    <>
                      <label>
                        One-time category
                        <select
                          value={oneTimeType}
                          onChange={(e) => {
                            const next = e.target.value as InvoiceItemType
                            setOneTimeType(next)
                            if (next === 'deposit') {
                              setInvoiceAmount(String(history.apartment.deposit || ''))
                            }
                          }}
                        >
                          <option value="deposit">Deposit</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="admin">Admin</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label>
                        Amount
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={invoiceAmount}
                          onChange={(e) => setInvoiceAmount(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Description (optional)
                        <input
                          type="text"
                          value={invoiceDescription}
                          onChange={(e) => setInvoiceDescription(e.target.value)}
                          placeholder="e.g. Broken geyser repair"
                        />
                      </label>
                    </>
                  ) : null}
                  <label>
                    Due date
                    <input
                      type="date"
                      value={invoiceDueDate}
                      onChange={(e) => setInvoiceDueDate(e.target.value)}
                      required
                    />
                  </label>
                  <div className="btn-row">
                    <button
                      type="submit"
                      className="btn btn-primary btn-compact"
                      disabled={invoiceBusy}
                    >
                      {invoiceBusy ? 'Saving…' : 'Save invoice'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-compact"
                      onClick={() => setShowCreateInvoice(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}

              {billableTenants.length === 0 && !showCreateInvoice ? (
                <p className="muted" style={{ marginTop: 0 }}>
                  Occupied units with an active tenant can be invoiced from here.
                </p>
              ) : null}

              <table className="data-table invoice-side-table">
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Reason</th>
                    <th>Due</th>
                    <th>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {history.invoices.slice(0, 6).map((inv) => (
                    <tr key={asString(inv.id)}>
                      <td>{tenantNameById.get(asString(inv.tenantId)) ?? '—'}</td>
                      <td className="invoice-reason-cell">{invoiceReason(inv)}</td>
                      <td>{formatDate(asString(inv.dueDate))}</td>
                      <td>{formatMoney(asNumber(inv.total))}</td>
                      <td>
                        <Link
                          className="btn-invoice-view"
                          to={`/invoices/${asString(inv.id)}/view`}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {history.invoices.length === 0 ? (
                <div className="empty-state">No invoices for this unit yet.</div>
              ) : null}
              {history.invoices.length > 6 ? (
                <p className="muted" style={{ marginBottom: 0, marginTop: '0.75rem' }}>
                  Showing latest 6. See the Invoices & payments tab for the full list.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {!loading && history && tab === 'Tenants' ? (
        <div className="panel">
          <div className="panel-header">
            <h2>Current & previous tenants</h2>
          </div>
          <div className="panel-body" style={{ paddingTop: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Status</th>
                  <th>Lease</th>
                  <th>Balance</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {history.tenants.map((t) => {
                  const tenantId = asString(t.id)
                  return (
                    <tr key={tenantId}>
                      <td>
                        <Link className="link-quiet" to={`/tenants/${tenantId}`}>
                          {asString(t.name)}
                        </Link>
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          {asString(t.email)}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${statusTone(asString(t.status))}`}>
                          {asString(t.status)}
                        </span>
                      </td>
                      <td>
                        {formatDate(asString(t.leaseStart))} →{' '}
                        {formatDate(asString(t.leaseEnd))}
                      </td>
                      <td>{formatMoney(asNumber(t.balance))}</td>
                      <td>
                        <ContactActions
                          person={{
                            name: asString(t.name),
                            email: asString(t.email),
                            phone: asString(t.phone),
                            whatsapp: asString(t.whatsapp) || undefined,
                          }}
                          tenantId={tenantId}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {history.tenants.length === 0 ? (
              <div className="empty-state">No tenants have been linked to this unit yet.</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!loading && history && tab === 'Invoices & payments' ? (
        <div className="detail-grid">
          <div className="panel">
            <div className="panel-header">
              <h2>Invoices</h2>
            </div>
            <div className="panel-body" style={{ paddingTop: 0 }}>
              <table className="data-table invoice-side-table">
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Reason</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {history.invoices.map((inv) => (
                    <tr key={asString(inv.id)}>
                      <td>{tenantNameById.get(asString(inv.tenantId)) ?? '—'}</td>
                      <td className="invoice-reason-cell">{invoiceReason(inv)}</td>
                      <td>{formatDate(asString(inv.issuedAt))}</td>
                      <td>{formatDate(asString(inv.dueDate))}</td>
                      <td>{formatMoney(asNumber(inv.total))}</td>
                      <td>
                        <Link
                          className="btn-invoice-view"
                          to={`/invoices/${asString(inv.id)}/view`}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {history.invoices.length === 0 ? (
                <div className="empty-state">No invoices for this unit.</div>
              ) : null}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Payments</h2>
            </div>
            <div className="panel-body" style={{ paddingTop: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.payments.map((p) => (
                    <tr key={asString(p.id)}>
                      <td>{tenantNameById.get(asString(p.tenantId)) ?? '—'}</td>
                      <td>{formatDate(asString(p.date))}</td>
                      <td>{asString(p.type)}</td>
                      <td>{formatMoney(asNumber(p.amount))}</td>
                      <td>{asString(p.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {history.payments.length === 0 ? (
                <div className="empty-state">No payments for this unit.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {!loading && history && tab === 'Documents' ? (
        <div className="panel">
          <div className="panel-header">
            <h2>Application & tenant documents</h2>
          </div>
          <div className="panel-body" style={{ paddingTop: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Type</th>
                  <th>Linked to</th>
                  <th>Uploaded</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.filename}</td>
                    <td>{doc.docType}</td>
                    <td>
                      {doc.tenantId
                        ? tenantNameById.get(doc.tenantId) ?? 'Tenant'
                        : doc.applicationId
                          ? 'Application'
                          : '—'}
                    </td>
                    <td>
                      {doc.createdAt ? formatDate(String(doc.createdAt).slice(0, 10)) : '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-contact"
                        disabled={docBusy === doc.id}
                        onClick={() => void handleDownload(doc.id)}
                      >
                        {docBusy === doc.id ? '…' : 'Download'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.documents.length === 0 ? (
              <div className="empty-state">
                No uploaded documents yet for tenants of this unit.
              </div>
            ) : null}

            {history.tenants.length > 0 ? (
              <div style={{ marginTop: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.65rem' }}>
                  By tenant
                </h3>
                <ul className="timeline-list">
                  {history.tenants.map((t) => {
                    const tenantId = asString(t.id)
                    const docs = docsByTenant.get(tenantId) ?? []
                    return (
                      <li key={tenantId}>
                        <strong>{asString(t.name)}</strong>
                        <div className="muted">
                          {docs.length
                            ? `${docs.length} file${docs.length === 1 ? '' : 's'}`
                            : 'No files linked'}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!loading && history && tab === 'KYC & credit' ? (
        <div className="detail-grid">
          <div className="panel">
            <div className="panel-header">
              <h2>KYC / credit screening</h2>
            </div>
            <div className="panel-body">
              {history.screening.length === 0 ? (
                <div className="empty-state">
                  No KYC or credit reports stored for this unit yet. Completing an
                  application with KYC details will save them here.
                </div>
              ) : (
                <ul className="timeline-list">
                  {history.screening.map((s) => {
                    const summary =
                      s.summary && typeof s.summary === 'object'
                        ? (s.summary as Record<string, unknown>)
                        : {}
                    const app = history.applications.find(
                      (a) => asString(a.id) === asString(s.applicationId),
                    )
                    return (
                      <li key={asString(s.id)}>
                        <strong>
                          {asString(app?.applicantName) || 'Applicant'} ·{' '}
                          {asString(s.enquiryType)}
                        </strong>
                        <div className="muted">
                          {asString(s.status)}
                          {s.createdAt
                            ? ` · ${formatDate(String(s.createdAt).slice(0, 10))}`
                            : ''}
                        </div>
                        <div style={{ marginTop: '0.35rem', fontSize: '0.9rem' }}>
                          {asString(summary.kycStatus) ? (
                            <div>KYC status: {asString(summary.kycStatus)}</div>
                          ) : null}
                          {asString(summary.creditScore) ? (
                            <div>Credit score: {asString(summary.creditScore)}</div>
                          ) : null}
                          {asString(summary.creditRecommendation) ? (
                            <div>
                              Recommendation: {asString(summary.creditRecommendation)}
                            </div>
                          ) : null}
                          {asString(summary.kycSummary) ? (
                            <div className="muted">{asString(summary.kycSummary)}</div>
                          ) : null}
                          {asString(summary.kycRef) ? (
                            <div className="muted">Ref: {asString(summary.kycRef)}</div>
                          ) : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Affordability</h2>
            </div>
            <div className="panel-body">
              {history.affordability.length === 0 && history.income.length === 0 ? (
                <div className="empty-state">No affordability results on file.</div>
              ) : (
                <>
                  <ul className="timeline-list">
                    {history.affordability.map((r) => (
                      <li key={asString(r.id)}>
                        <strong>Band: {asString(r.band)}</strong>
                        {r.score != null ? (
                          <div className="muted">Score: {asString(r.score)}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {history.income.length > 0 ? (
                    <ul className="timeline-list" style={{ marginTop: '1rem' }}>
                      {history.income.map((i) => (
                        <li key={asString(i.id)}>
                          <strong>Income snapshot</strong>
                          <div className="muted">
                            Gross:{' '}
                            {i.grossSalary != null
                              ? formatMoney(asNumber(i.grossSalary))
                              : '—'}
                            {' · '}
                            Target rent:{' '}
                            {i.targetRent != null
                              ? formatMoney(asNumber(i.targetRent))
                              : '—'}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}
