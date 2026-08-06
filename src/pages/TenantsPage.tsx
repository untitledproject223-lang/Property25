import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import TerminateLeaseModal from '../components/TerminateLeaseModal'
import { terminateLease } from '../data/api'
import { useDashboard } from '../data/DashboardContext'
import { ContactActions } from '../dashboard/ContactActions'
import { TenantDocsActions } from '../dashboard/TenantDocsActions'
import { formatDate, formatMoney, paymentBadge } from '../data/utils'

export default function TenantsPage() {
  const { state, refresh } = useDashboard()
  const [query, setQuery] = useState('')
  const [terminatingId, setTerminatingId] = useState<string | null>(null)
  const [terminateBusy, setTerminateBusy] = useState(false)
  const [terminateError, setTerminateError] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.tenants
      .map((tenant) => {
        const apartment = state.apartments.find((a) => a.id === tenant.apartmentId)!
        const building = state.buildings.find((b) => b.id === apartment.buildingId)!
        const lastPayment = state.payments
          .filter((p) => p.tenantId === tenant.id && p.status === 'paid')
          .sort((a, b) => b.date.localeCompare(a.date))[0]
        const openIssues = state.issues.filter(
          (i) => i.tenantId === tenant.id && i.status !== 'resolved',
        ).length
        const badge = paymentBadge(tenant.balance, apartment.nextDueDate)
        return { tenant, apartment, building, lastPayment, openIssues, badge }
      })
      .filter(({ tenant, apartment, building }) => {
        if (!q) return true
        return (
          tenant.name.toLowerCase().includes(q) ||
          tenant.phone.includes(q) ||
          tenant.email.toLowerCase().includes(q) ||
          apartment.unitNumber.toLowerCase().includes(q) ||
          building.name.toLowerCase().includes(q)
        )
      })
  }, [state, query])

  const terminating = rows.find((r) => r.tenant.id === terminatingId) ?? null

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Tenants</h1>
          <p>All tenants you have onboarded, linked to their apartment and building.</p>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search name, unit, building, phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search tenants"
        />
      </div>

      <div className="panel">
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Building / unit</th>
                <th>Lease end</th>
                <th>Rent</th>
                <th>Balance</th>
                <th>Last payment</th>
                <th>Issues</th>
                <th>Contact</th>
                <th>Documents</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ tenant, apartment, building, lastPayment, openIssues, badge }) => (
                <tr key={tenant.id}>
                  <td>
                    <Link className="link-quiet" to={`/tenants/${tenant.id}`}>
                      {tenant.name}
                    </Link>
                    <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                      <span className={`badge tone-${badge.tone}`}>{badge.label}</span>
                      {tenant.status === 'former' ? (
                        <>
                          {' '}
                          <span className="badge">Terminated</span>
                        </>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {building.name}
                    <div style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>
                      Unit {apartment.unitNumber}
                    </div>
                  </td>
                  <td>{formatDate(tenant.leaseEnd)}</td>
                  <td>{formatMoney(apartment.rent)}</td>
                  <td>{formatMoney(tenant.balance)}</td>
                  <td>
                    {lastPayment
                      ? `${formatDate(lastPayment.date)} · ${formatMoney(lastPayment.amount)}`
                      : '—'}
                  </td>
                  <td>{openIssues || '—'}</td>
                  <td>
                    <ContactActions
                      person={tenant}
                      tenantId={tenant.id}
                      subject={`Regarding ${building.name} Unit ${apartment.unitNumber}`}
                    />
                  </td>
                  <td>
                    <TenantDocsActions tenantId={tenant.id} />
                  </td>
                  <td>
                    {tenant.status === 'active' || tenant.status === 'notice' ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-compact"
                        onClick={() => {
                          setTerminateError(null)
                          setTerminatingId(tenant.id)
                        }}
                      >
                        Terminate lease
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <div className="empty-state">No tenants match your search.</div>
          ) : null}
        </div>
      </div>

      {terminating ? (
        <TerminateLeaseModal
          tenantName={terminating.tenant.name}
          unitLabel={`${terminating.building.name} Unit ${terminating.apartment.unitNumber}`}
          busy={terminateBusy}
          error={terminateError}
          onCancel={() => {
            if (terminateBusy) return
            setTerminatingId(null)
            setTerminateError(null)
          }}
          onConfirm={async (payload) => {
            setTerminateBusy(true)
            setTerminateError(null)
            try {
              await terminateLease(terminating.tenant.id, payload)
              setTerminatingId(null)
              await refresh()
            } catch (e) {
              setTerminateError(
                e instanceof Error ? e.message : 'Could not terminate lease',
              )
            } finally {
              setTerminateBusy(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}
