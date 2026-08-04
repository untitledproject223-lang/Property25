import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchTenantInvoices } from '../../data/api'
import { invoiceReason } from '../../data/invoiceHelpers'
import { formatMoney } from '../../data/utils'

export default function TenantInvoicesPage() {
  const [invoices, setInvoices] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const result = await fetchTenantInvoices()
        if (!cancelled) setInvoices(result.data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load invoices')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Invoices</h1>
          <p>Invoices created for your tenancy by your agent or landlord.</p>
        </div>
      </header>
      {error ? <p className="login-error">{error}</p> : null}
      {loading ? <p>Loading invoices…</p> : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Issued</th>
              <th>Due</th>
              <th>Unit</th>
              <th>Reason</th>
              <th>Amount</th>
              <th>Billing</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={String(inv.id)}>
                <td>{String(inv.issuedAt ?? '').slice(0, 10)}</td>
                <td>{String(inv.dueDate ?? '')}</td>
                <td>
                  {String(inv.buildingName)} · {String(inv.unitNumber)}
                </td>
                <td className="invoice-reason-cell">{invoiceReason(inv)}</td>
                <td>{formatMoney(Number(inv.total) || 0)}</td>
                <td>
                  {inv.billingKind === 'recurring' || inv.isRecurring
                    ? 'Recurring'
                    : inv.issueId
                      ? 'Ticket-linked'
                      : 'One-time'}
                </td>
                <td>
                  <span className="badge">{String(inv.status)}</span>
                </td>
                <td>
                  <Link
                    className="btn btn-primary btn-compact"
                    to={`/tenant/invoices/${String(inv.id)}/view`}
                  >
                    View invoice
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && invoices.length === 0 ? (
          <div className="empty-state">No invoices have been issued for you yet.</div>
        ) : null}
      </div>
    </div>
  )
}
