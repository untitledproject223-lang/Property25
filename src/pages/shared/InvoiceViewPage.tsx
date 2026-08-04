import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchInvoice } from '../../data/api'
import { invoiceReason } from '../../data/invoiceHelpers'
import type { Invoice, InvoiceItem } from '../../data/types'
import { formatDate, formatMoney } from '../../data/utils'
import { generateInvoicePdf } from '../../utils/invoicePdf'
import './InvoiceViewPage.css'

export default function InvoiceViewPage({ backTo }: { backTo: string }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<'download' | 'share' | null>(null)
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchInvoice>>['data'] | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) return
      setBusy(true)
      setError(null)
      try {
        const result = await fetchInvoice(id)
        if (!cancelled) setDetail(result.data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load invoice')
        }
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  const invoice = useMemo((): Invoice | null => {
    if (!detail) return null
    return {
      id: detail.id,
      tenantId: detail.tenantId,
      issuedAt: String(detail.issuedAt).slice(0, 10),
      dueDate: String(detail.dueDate).slice(0, 10),
      items: (detail.items as InvoiceItem[]) ?? [],
      total: Number(detail.total) || 0,
      status: detail.status as Invoice['status'],
      notes: detail.notes ?? undefined,
      isRecurring: Boolean(detail.isRecurring),
      billingKind: detail.billingKind,
      issueId: detail.issueId ?? null,
    }
  }, [detail])

  const reason = detail
    ? invoiceReason({
        notes: detail.notes,
        billingKind: detail.billingKind,
        isRecurring: detail.isRecurring,
        issueId: detail.issueId,
        items: detail.items,
        issueSubject: detail.issueSubject,
      })
    : ''

  const invoiceNo = detail
    ? detail.id.replace(/\D/g, '').slice(-4) || detail.id.slice(0, 8).toUpperCase()
    : ''

  async function onDownload() {
    if (!detail || !invoice) return
    setActionBusy('download')
    setActionError(null)
    try {
      await generateInvoicePdf(invoice, {
        tenantName: detail.tenantName,
        tenantEmail: detail.tenantEmail,
        tenantPhone: detail.tenantPhone,
        buildingName: detail.buildingName,
        buildingAddress: detail.buildingAddress,
        unitNumber: detail.unitNumber,
        landlordName: detail.landlordName,
        rent: Number(detail.rent) || 0,
        deposit: Number(detail.deposit) || 0,
      })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setActionBusy(null)
    }
  }

  async function onShare() {
    if (!detail || !invoice) return
    setActionBusy('share')
    setActionError(null)
    const shareUrl = window.location.href
    const shareText = `Invoice #${invoiceNo} for ${detail.tenantName} — ${reason}. Total ${formatMoney(invoice.total)}. Due ${formatDate(invoice.dueDate)}.`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: `Invoice #${invoiceNo}`,
          text: shareText,
          url: shareUrl,
        })
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`)
        setActionError('Share is unavailable on this device. Invoice details copied to clipboard.')
      } else {
        setActionError('Sharing is not supported in this browser.')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // user cancelled share sheet
      } else {
        setActionError(err instanceof Error ? err.message : 'Share failed')
      }
    } finally {
      setActionBusy(null)
    }
  }

  return (
    <div className="invoice-view-screen">
      <header className="invoice-view-toolbar">
        <button
          type="button"
          className="btn btn-ghost btn-compact"
          onClick={() => navigate(backTo)}
        >
          ← Back to invoices
        </button>
        <div className="invoice-view-toolbar-actions">
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            disabled={!detail || actionBusy !== null}
            onClick={() => void onShare()}
          >
            {actionBusy === 'share' ? 'Sharing…' : 'Share'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-compact"
            disabled={!detail || actionBusy !== null}
            onClick={() => void onDownload()}
          >
            {actionBusy === 'download' ? 'Preparing…' : 'Download'}
          </button>
        </div>
      </header>

      {actionError ? <p className="invoice-view-banner">{actionError}</p> : null}

      <div className="invoice-view-frame">
        {busy ? <p className="empty-state">Loading invoice…</p> : null}
        {error ? (
          <div className="empty-state">
            <p className="login-error">{error}</p>
            <Link to={backTo} className="btn btn-ghost btn-compact">
              Return to invoices
            </Link>
          </div>
        ) : null}

        {detail && invoice ? (
          <article className="invoice-document" aria-label={`Invoice ${invoiceNo}`}>
            <header className="invoice-document-header">
              <div>
                <p className="invoice-document-brand">Property25</p>
                <h1>Invoice</h1>
              </div>
              <div className="invoice-document-meta">
                <p>
                  <span>Invoice #</span>
                  <strong>{invoiceNo}</strong>
                </p>
                <p>
                  <span>Issued</span>
                  <strong>{formatDate(invoice.issuedAt)}</strong>
                </p>
                <p>
                  <span>Due</span>
                  <strong>{formatDate(invoice.dueDate)}</strong>
                </p>
                <p>
                  <span>Status</span>
                  <strong className="invoice-document-status">{invoice.status}</strong>
                </p>
              </div>
            </header>

            <section className="invoice-document-parties">
              <div>
                <h2>Bill to</h2>
                <p className="invoice-document-name">{detail.tenantName}</p>
                <p>
                  {detail.buildingName} · Unit {detail.unitNumber}
                </p>
                <p>{detail.buildingAddress}</p>
                <p>
                  {detail.tenantEmail} · {detail.tenantPhone}
                </p>
              </div>
              <div>
                <h2>Property</h2>
                <p className="invoice-document-name">{detail.landlordName}</p>
                <p>
                  Landlord for {detail.buildingName}, Unit {detail.unitNumber}
                </p>
                <p>
                  Billing:{' '}
                  {invoice.billingKind === 'recurring' || invoice.isRecurring
                    ? 'Recurring'
                    : invoice.issueId
                      ? 'Ticket-linked'
                      : 'One-time'}
                </p>
              </div>
            </section>

            <section className="invoice-document-reason" aria-label="Reason for invoice">
              <h2>Reason for invoice</h2>
              <p>{reason}</p>
              {detail.issueSubject ? (
                <p className="invoice-document-ticket">Related ticket: {detail.issueSubject}</p>
              ) : null}
            </section>

            <table className="invoice-document-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, idx) => (
                  <tr key={`${item.type}-${idx}`}>
                    <td>{idx + 1}</td>
                    <td>{item.description}</td>
                    <td>{item.type}</td>
                    <td>{formatMoney(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <footer className="invoice-document-footer">
              <p>Please settle by the due date. Keep this invoice for your records.</p>
              <p className="invoice-document-total">
                Total due <strong>{formatMoney(invoice.total)}</strong>
              </p>
            </footer>
          </article>
        ) : null}
      </div>
    </div>
  )
}
