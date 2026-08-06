import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../data/AuthContext'
import { fetchTenantStays } from '../../data/api'
import { formatMoney } from '../../data/utils'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function isCurrentStay(stay: Record<string, unknown>) {
  const status = String(stay.status ?? '')
  if (status !== 'active' && status !== 'notice') return false
  const start = String(stay.leaseStart ?? '')
  const end = String(stay.leaseEnd ?? '')
  const today = todayIso()
  if (start && start > today) return false
  if (end && end < today) return false
  return true
}

export default function TenantHomePage() {
  const { user } = useAuth()
  const [stays, setStays] = useState<Array<Record<string, unknown>>>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const result = await fetchTenantStays()
        if (!cancelled) setStays(result.data)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load stay')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const current =
    stays.find(isCurrentStay) ??
    stays.find((s) => s.status === 'active' || s.status === 'notice') ??
    null

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Welcome, {user?.name}</h1>
          <p>Your current stay and quick actions.</p>
        </div>
      </header>

      {error ? <p className="login-error">{error}</p> : null}
      {loading ? <p>Loading your stay…</p> : null}

      {!loading && current ? (
        <section className="success-panel" style={{ textAlign: 'left', justifyItems: 'stretch' }}>
          <p className="brand-eyebrow" style={{ margin: 0 }}>
            Current stay
          </p>
          <h3 style={{ margin: 0, textAlign: 'left' }}>
            {String(current.buildingName)} · Unit {String(current.unitNumber)}
          </h3>
          <p className="success-panel-lead" style={{ maxWidth: 'none', textAlign: 'left' }}>
            {String(current.buildingAddress)}
          </p>
          <dl className="success-panel-meta" style={{ width: '100%' }}>
            <div>
              <dt>Lease</dt>
              <dd>
                {String(current.leaseStart)} → {String(current.leaseEnd)}
              </dd>
            </div>
            <div>
              <dt>Rent</dt>
              <dd>{formatMoney(Number(current.rent) || 0)} / month</dd>
            </div>
            <div>
              <dt>Deposit</dt>
              <dd>
                {formatMoney(Number(current.deposit) || 0)}
                <span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>
                  {' '}
                  · Balance{' '}
                  {formatMoney(
                    Number(
                      current.depositBalance != null
                        ? current.depositBalance
                        : current.deposit,
                    ) || 0,
                  )}
                </span>
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{String(current.status)}</dd>
            </div>
            <div>
              <dt>Landlord</dt>
              <dd>
                {String(current.landlordName)}
                {current.landlordEmail ? ` · ${String(current.landlordEmail)}` : ''}
              </dd>
            </div>
            <div>
              <dt>Balance</dt>
              <dd>{formatMoney(Number(current.balance) || 0)}</dd>
            </div>
          </dl>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', marginTop: '0.5rem' }}>
            <Link to={`/tenant/stays/${String(current.id)}`} className="btn btn-ghost btn-compact">
              View stay details
            </Link>
            <Link to="/tenant/invoices" className="btn btn-ghost btn-compact">
              View invoices
            </Link>
            <Link to="/tenant/issues" className="btn btn-ghost btn-compact">
              View tickets
            </Link>
          </div>
        </section>
      ) : null}

      {!loading && !current ? (
        <div className="empty-state">
          No active stay yet. Once your application is completed and you move in, your
          current unit details will appear here.
          <div style={{ marginTop: '1rem' }}>
            <Link to="/tenant/applications" className="btn btn-ghost btn-compact">
              View applications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
