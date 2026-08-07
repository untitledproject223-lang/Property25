import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchLandlordInvoices,
  fetchLandlordPortfolio,
  listIssues,
} from '../../data/api'
import { formatMoney } from '../../data/utils'
import './LandlordDashboard.css'

type Row = Record<string, unknown>

function occupancyPct(occupied: number, total: number) {
  if (total <= 0) return 0
  return Math.round((occupied / total) * 100)
}

function leaseEndsWithinMonths(leaseEnd: unknown, months: number) {
  const raw = String(leaseEnd ?? '').trim()
  if (!raw) return false
  const end = new Date(raw)
  if (Number.isNaN(end.getTime())) return false
  const now = new Date()
  const limit = new Date(now)
  limit.setMonth(limit.getMonth() + months)
  return end >= now && end <= limit
}

function ringStyle(pct: number, color: string) {
  const clamped = Math.max(0, Math.min(100, pct))
  return {
    background: `conic-gradient(${color} ${clamped}%, rgba(15, 40, 55, 0.08) ${clamped}%)`,
  }
}

export default function LandlordPortfolioPage() {
  const [units, setUnits] = useState<Row[]>([])
  const [invoices, setInvoices] = useState<Row[]>([])
  const [issues, setIssues] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [portfolio, inv, tickets] = await Promise.all([
          fetchLandlordPortfolio(),
          fetchLandlordInvoices(),
          listIssues(),
        ])
        if (cancelled) return
        const seen = new Set<string>()
        setUnits(
          portfolio.data.units.filter((u) => {
            const id = String(u.id)
            if (seen.has(id)) return false
            seen.add(id)
            return true
          }),
        )
        setInvoices(inv.data)
        setIssues(tickets.data)
        setError(null)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load dashboard')
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

  const stats = useMemo(() => {
    const occupiedUnits = units.filter((u) => u.tenantId)
    const vacantUnits = units.filter((u) => !u.tenantId)
    const monthlyRentBook = occupiedUnits.reduce(
      (sum, u) => sum + (Number(u.rent) || 0),
      0,
    )
    const vacantRentGap = vacantUnits.reduce((sum, u) => sum + (Number(u.rent) || 0), 0)
    const buildings = new Set(
      units.map((u) => String(u.buildingName ?? '')).filter(Boolean),
    ).size
    const monthlyCosts = units.reduce((sum, u) => {
      return sum + (Number(u.levies) || 0) + (Number(u.municipal) || 0)
    }, 0)

    const tenants = occupiedUnits
    const inArrears = tenants.filter((u) => (Number(u.balance) || 0) > 0)
    const arrearsTotal = inArrears.reduce((sum, u) => sum + (Number(u.balance) || 0), 0)
    const endingSoon = tenants.filter(
      (u) =>
        String(u.tenantStatus) === 'notice' || leaseEndsWithinMonths(u.leaseEnd, 3),
    ).length
    const openTenantTickets = tenants.reduce(
      (sum, u) => sum + (Number(u.openIssues) || 0),
      0,
    )

    const invoiceCount = invoices.length
    const invoicePaid = invoices.filter((i) => String(i.status) === 'paid').length
    const invoiceOpen = invoices.filter((i) =>
      ['sent', 'overdue', 'draft'].includes(String(i.status)),
    ).length
    const invoiceOverdue = invoices.filter((i) => String(i.status) === 'overdue').length

    const currentTenantIds = new Set(
      tenants.map((u) => String(u.tenantId)).filter(Boolean),
    )
    const ticketsOpen = issues.filter(
      (i) =>
        String(i.status) === 'open' && currentTenantIds.has(String(i.tenantId)),
    ).length
    const ticketsInProgress = issues.filter(
      (i) =>
        String(i.status) === 'pending' && currentTenantIds.has(String(i.tenantId)),
    ).length
    const ticketsClosed = issues.filter((i) =>
      ['resolved', 'rejected'].includes(String(i.status)),
    ).length

    return {
      unitTotal: units.length,
      occupied: occupiedUnits.length,
      vacant: vacantUnits.length,
      occupancy: occupancyPct(occupiedUnits.length, units.length),
      monthlyRentBook,
      vacantRentGap,
      buildings,
      monthlyCosts,
      tenantCount: tenants.length,
      arrearsCount: inArrears.length,
      arrearsTotal,
      endingSoon,
      openTenantTickets,
      invoiceCount,
      invoicePaid,
      invoiceOpen,
      invoiceOverdue,
      ticketsOpen,
      ticketsInProgress,
      ticketsClosed,
      ticketsTotal: issues.length,
    }
  }, [units, invoices, issues])

  return (
    <div className="ll-dash">
      {error ? <p className="login-error">{error}</p> : null}
      {loading ? <p className="muted">Loading dashboard…</p> : null}

      <div className="ll-dash-grid">
        <Link to="/landlord/units" className="ll-card ll-card-units">
          <div className="ll-card-top">
            <div>
              <p className="ll-card-label">Units</p>
              <h2>{stats.unitTotal}</h2>
              <p className="ll-card-sub">
                {stats.buildings} building{stats.buildings === 1 ? '' : 's'} in portfolio
              </p>
            </div>
            <div
              className="ll-ring"
              style={ringStyle(stats.occupancy, '#1f6f8b')}
              title={`${stats.occupancy}% occupied`}
            >
              <div className="ll-ring-inner">
                <strong>{stats.occupancy}%</strong>
                <span>filled</span>
              </div>
            </div>
          </div>

          <div className="ll-metric-row">
            <div className="ll-chip ll-chip-teal">
              <span className="ll-dot" />
              Units Occupied <strong>{stats.occupied}</strong>
            </div>
            <div className="ll-chip ll-chip-sand">
              <span className="ll-dot" />
              Vacant <strong>{stats.vacant}</strong>
            </div>
          </div>

          <dl className="ll-stat-list">
            <div>
              <dt>Monthly rent book</dt>
              <dd>{formatMoney(stats.monthlyRentBook)}</dd>
            </div>
            <div>
              <dt>Vacant rent gap</dt>
              <dd>{formatMoney(stats.vacantRentGap)}</dd>
            </div>
            <div>
              <dt>All Levies + Municipal / mo</dt>
              <dd>{formatMoney(stats.monthlyCosts)}</dd>
            </div>
          </dl>
          <span className="ll-card-link">View units →</span>
        </Link>

        <Link to="/landlord/tenants" className="ll-card ll-card-tenants">
          <div className="ll-card-top">
            <div>
              <p className="ll-card-label">Tenants</p>
              <h2>{stats.tenantCount}</h2>
              <p className="ll-card-sub">Active leases on your units</p>
            </div>
            <div className="ll-icon-stack" aria-hidden="true">
              <span className="ll-person ll-person-1" />
              <span className="ll-person ll-person-2" />
              <span className="ll-person ll-person-3" />
            </div>
          </div>

          <div className="ll-metric-row">
            <div className="ll-chip ll-chip-rose">
              <span className="ll-dot" />
              In arrears <strong>{stats.arrearsCount}</strong>
            </div>
            <div className="ll-chip ll-chip-slate">
              <span className="ll-dot" />
              Notice / ending soon <strong>{stats.endingSoon}</strong>
            </div>
          </div>

          <dl className="ll-stat-list">
            <div>
              <dt>Arrears total</dt>
              <dd>{formatMoney(stats.arrearsTotal)}</dd>
            </div>
            <div>
              <dt>Open tenant tickets</dt>
              <dd>{stats.openTenantTickets}</dd>
            </div>
            <div>
              <dt>Paying on time</dt>
              <dd>{Math.max(0, stats.tenantCount - stats.arrearsCount)}</dd>
            </div>
          </dl>
          <span className="ll-card-link">Review tenants →</span>
        </Link>

        <Link to="/landlord/invoices" className="ll-card ll-card-invoices">
          <div className="ll-card-top">
            <div>
              <p className="ll-card-label">Invoices</p>
              <h2>{stats.invoiceCount}</h2>
              <p className="ll-card-sub">Issued across your book</p>
            </div>
            <div className="ll-orb ll-orb-invoice" aria-hidden="true">
              <span />
            </div>
          </div>

          <div className="ll-metric-row">
            <div className="ll-chip ll-chip-teal">
              <span className="ll-dot" />
              Paid <strong>{stats.invoicePaid}</strong>
            </div>
            <div className="ll-chip ll-chip-sand">
              <span className="ll-dot" />
              Outstanding <strong>{stats.invoiceOpen}</strong>
            </div>
          </div>

          <dl className="ll-stat-list">
            <div>
              <dt>Overdue</dt>
              <dd>{stats.invoiceOverdue}</dd>
            </div>
            <div>
              <dt>Total invoices</dt>
              <dd>{stats.invoiceCount}</dd>
            </div>
          </dl>
          <span className="ll-card-link">Open invoices →</span>
        </Link>

        <Link to="/landlord/issues" className="ll-card ll-card-tickets">
          <div className="ll-card-top">
            <div>
              <p className="ll-card-label">Tickets</p>
              <h2>{stats.ticketsTotal}</h2>
              <p className="ll-card-sub">Maintenance and requests</p>
            </div>
            <div className="ll-ticket-shapes" aria-hidden="true">
              <span className="ll-pill ll-pill-open" />
              <span className="ll-pill ll-pill-progress" />
              <span className="ll-pill ll-pill-closed" />
            </div>
          </div>

          <div className="ll-ticket-bars" aria-hidden="true">
            <div className="ll-bar">
              <span style={{ width: `${stats.ticketsTotal ? (stats.ticketsOpen / stats.ticketsTotal) * 100 : 0}%` }} />
            </div>
            <div className="ll-bar ll-bar-mid">
              <span style={{ width: `${stats.ticketsTotal ? (stats.ticketsInProgress / stats.ticketsTotal) * 100 : 0}%` }} />
            </div>
            <div className="ll-bar ll-bar-done">
              <span style={{ width: `${stats.ticketsTotal ? (stats.ticketsClosed / stats.ticketsTotal) * 100 : 0}%` }} />
            </div>
          </div>

          <dl className="ll-stat-list ll-stat-list-3">
            <div>
              <dt>Open</dt>
              <dd>{stats.ticketsOpen}</dd>
            </div>
            <div>
              <dt>In progress</dt>
              <dd>{stats.ticketsInProgress}</dd>
            </div>
            <div>
              <dt>Closed</dt>
              <dd>{stats.ticketsClosed}</dd>
            </div>
          </dl>
          <span className="ll-card-link">Manage tickets →</span>
        </Link>
      </div>
    </div>
  )
}
