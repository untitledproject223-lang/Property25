import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { downloadDocument, downloadTenantLease, fetchTenantStay } from '../../data/api'
import { invoiceReason } from '../../data/invoiceHelpers'
import { formatMoney } from '../../data/utils'

export default function TenantStayDetailPage() {
  const { id = '' } = useParams()
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaseBusy, setLeaseBusy] = useState(false)

  useEffect(() => {
    fetchTenantStay(id)
      .then((r) => setData(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [id])

  const stay = (data?.stay ?? null) as Record<string, unknown> | null
  const invoices = (data?.invoices ?? []) as Array<Record<string, unknown>>
  const documents = (data?.documents ?? []) as Array<Record<string, unknown>>
  const screening = (data?.screening ?? null) as Record<string, unknown> | null

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="brand-eyebrow">
            <Link to="/tenant/stays">← Stays</Link>
          </p>
          <h1>
            {stay
              ? `${String(stay.buildingName)} · Unit ${String(stay.unitNumber)}`
              : 'Stay'}
          </h1>
          <p>{stay ? String(stay.buildingAddress) : 'Loading…'}</p>
        </div>
      </header>
      {error ? <p className="login-error">{error}</p> : null}
      {stay ? (
        <>
          <section className="form-section" style={{ marginBottom: '1.5rem' }}>
            <h2>Unit details</h2>
            <p>
              Rent {formatMoney(Number(stay.rent) || 0)} · Deposit{' '}
              {formatMoney(Number(stay.deposit) || 0)} · Status {String(stay.status)}
            </p>
            <p>
              Lease {String(stay.leaseStart)} → {String(stay.leaseEnd)}
            </p>
            <p>
              Landlord: {String(stay.landlordName)} ({String(stay.landlordEmail)})
            </p>
            <button
              type="button"
              className="btn btn-primary btn-compact"
              disabled={leaseBusy}
              onClick={() => {
                setLeaseBusy(true)
                setError(null)
                void downloadTenantLease(id)
                  .catch((err) => {
                    setError(err instanceof Error ? err.message : 'Could not download lease')
                  })
                  .finally(() => setLeaseBusy(false))
              }}
            >
              {leaseBusy ? 'Preparing…' : 'Download lease agreement'}
            </button>
          </section>

          <section className="form-section" style={{ marginBottom: '1.5rem' }}>
            <h2>Invoices</h2>
            {invoices.length === 0 ? (
              <p className="empty-state">No invoices yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Due</th>
                    <th>Reason</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={String(inv.id)}>
                      <td>{String(inv.dueDate)}</td>
                      <td className="invoice-reason-cell">{invoiceReason(inv)}</td>
                      <td>{formatMoney(Number(inv.total) || 0)}</td>
                      <td>{String(inv.status)}</td>
                      <td>
                        {String(inv.status) !== 'draft' ? (
                          <Link
                            className="btn btn-primary btn-compact"
                            to={`/tenant/invoices/${String(inv.id)}/view`}
                          >
                            View invoice
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="form-section" style={{ marginBottom: '1.5rem' }}>
            <h2>Documents</h2>
            {documents.length === 0 ? (
              <p className="empty-state">No documents uploaded.</p>
            ) : (
              <ul>
                {documents.map((doc) => (
                  <li key={String(doc.id)}>
                    {String(doc.docType)} — {String(doc.fileName)}{' '}
                    <button
                      type="button"
                      className="btn btn-ghost btn-compact"
                      onClick={() => void downloadDocument(String(doc.id))}
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="form-section">
            <h2>KYC / screening</h2>
            {screening ? (
              <p>
                Status {String(screening.status ?? '—')} · Band{' '}
                {String(screening.band ?? '—')} · Score {String(screening.score ?? '—')}
              </p>
            ) : (
              <p className="empty-state">No screening summary available.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  )
}
