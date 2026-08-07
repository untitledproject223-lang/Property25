import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listApplications } from '../data/api'
import { useDashboard } from '../data/DashboardContext'
import { isUnitVacant } from '../data/unitHelpers'
import { formatMoney } from '../data/utils'
import './landlord/LandlordDashboard.css'

const OPEN_APPLICATION_STATUSES = new Set([
  'invited',
  'in_progress',
  'submitted',
  'under_review',
  'awaiting_signature',
  'signed',
  'approved',
])

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

export default function PortfolioPage() {
  const { state, loading } = useDashboard()
  const [applications, setApplications] = useState<Array<Record<string, unknown>>>([])

  useEffect(() => {
    let cancelled = false
    void listApplications()
      .then((r) => {
        if (!cancelled) setApplications(r.data)
      })
      .catch(() => {
        if (!cancelled) setApplications([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const currentTenants = state.tenants.filter(
      (t) => t.status === 'active' || t.status === 'notice',
    )
    const occupiedUnits = state.apartments.filter(
      (a) => !isUnitVacant(a.id, state.tenants),
    )
    const vacantUnits = state.apartments.filter((a) =>
      isUnitVacant(a.id, state.tenants),
    )
    const endingSoonTenants = currentTenants.filter(
      (t) => t.status === 'notice' || leaseEndsWithinMonths(t.leaseEnd, 3),
    )
    const endingSoonUnitIds = new Set(endingSoonTenants.map((t) => t.apartmentId))

    const inApplicationUnitIds = new Set(
      applications
        .filter((app) => {
          const status = String(app.status ?? '')
          const apartmentId = String(app.apartmentId ?? app.apartment_id ?? '')
          return OPEN_APPLICATION_STATUSES.has(status) && Boolean(apartmentId)
        })
        .map((app) => String(app.apartmentId ?? app.apartment_id)),
    )

    const monthlyRentBook = occupiedUnits.reduce((sum, a) => sum + (a.rent || 0), 0)
    const vacantRentGap = vacantUnits.reduce((sum, a) => sum + (a.rent || 0), 0)

    const landlordRows = state.landlords.map((landlord) => {
      const units = state.apartments.filter((a) => a.landlordId === landlord.id)
      const tenants = currentTenants.filter((t) =>
        units.some((u) => u.id === t.apartmentId),
      )
      const vacant = units.filter((u) => isUnitVacant(u.id, state.tenants)).length
      const arrears = tenants.filter((t) => t.balance > 0).length
      return {
        id: landlord.id,
        units: units.length,
        tenants: tenants.length,
        vacant,
        arrears,
        rentBook: tenants.reduce((sum, t) => {
          const apt = units.find((u) => u.id === t.apartmentId)
          return sum + (apt?.rent || 0)
        }, 0),
      }
    })

    const landlordsWithTenants = landlordRows.filter((l) => l.tenants > 0).length
    const landlordsWithVacant = landlordRows.filter((l) => l.vacant > 0).length
    const avgUnitsPerLandlord =
      landlordRows.length > 0
        ? Math.round(
            (landlordRows.reduce((s, l) => s + l.units, 0) / landlordRows.length) * 10,
          ) / 10
        : 0

    const inArrears = currentTenants.filter((t) => t.balance > 0)
    const arrearsTotal = inArrears.reduce((sum, t) => sum + Math.max(0, t.balance), 0)
    const onNotice = currentTenants.filter((t) => t.status === 'notice').length
    const openTickets = state.issues.filter(
      (i) =>
        i.status !== 'resolved' &&
        i.status !== 'rejected' &&
        currentTenants.some((t) => t.id === i.tenantId),
    ).length

    const invoices = state.invoices
    const invoicePaid = invoices.filter((i) => i.status === 'paid').length
    const invoiceOpen = invoices.filter((i) =>
      ['sent', 'overdue', 'draft'].includes(i.status),
    ).length
    const invoiceOverdue = invoices.filter((i) => i.status === 'overdue').length
    const invoiceTotalValue = invoices.reduce((sum, i) => sum + (i.total || 0), 0)

    const ticketsOpen = state.issues.filter(
      (i) =>
        i.status === 'open' && currentTenants.some((t) => t.id === i.tenantId),
    ).length
    const ticketsInProgress = state.issues.filter(
      (i) =>
        i.status === 'pending' && currentTenants.some((t) => t.id === i.tenantId),
    ).length
    const ticketsClosed = state.issues.filter(
      (i) => i.status === 'resolved' || i.status === 'rejected',
    ).length

    return {
      unitTotal: state.apartments.length,
      occupied: occupiedUnits.length,
      vacant: vacantUnits.length,
      endingSoon: endingSoonUnitIds.size,
      inApplication: inApplicationUnitIds.size,
      occupancy: occupancyPct(occupiedUnits.length, state.apartments.length),
      monthlyRentBook,
      vacantRentGap,
      buildings: state.buildings.length,

      landlordCount: state.landlords.length,
      landlordsWithTenants,
      landlordsWithVacant,
      avgUnitsPerLandlord,
      landlordUnits: state.apartments.length,
      landlordTenants: currentTenants.length,

      tenantCount: currentTenants.length,
      arrearsCount: inArrears.length,
      arrearsTotal,
      onNotice,
      endingSoonTenants: endingSoonTenants.length,
      openTickets,
      payingOnTime: Math.max(0, currentTenants.length - inArrears.length),

      invoiceCount: invoices.length,
      invoicePaid,
      invoiceOpen,
      invoiceOverdue,
      invoiceTotalValue,

      ticketsTotal: state.issues.length,
      ticketsOpen,
      ticketsInProgress,
      ticketsClosed,

      openApplications: applications.filter((a) =>
        OPEN_APPLICATION_STATUSES.has(String(a.status ?? '')),
      ).length,
    }
  }, [state, applications])

  return (
    <div className="ll-dash">
      {loading ? <p className="muted">Loading dashboard…</p> : null}

      <div className="ll-dash-grid">
        <Link to="/units" className="ll-card ll-card-units">
          <div className="ll-card-top">
            <div>
              <p className="ll-card-label">Units</p>
              <h2>{stats.unitTotal}</h2>
              <p className="ll-card-sub">
                {stats.buildings} building{stats.buildings === 1 ? '' : 's'} across the book
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
              Occupied <strong>{stats.occupied}</strong>
            </div>
            <div className="ll-chip ll-chip-sand">
              <span className="ll-dot" />
              Vacant <strong>{stats.vacant}</strong>
            </div>
            <div className="ll-chip ll-chip-slate">
              <span className="ll-dot" />
              Ending soon <strong>{stats.endingSoon}</strong>
            </div>
            <div className="ll-chip ll-chip-rose">
              <span className="ll-dot" />
              In application <strong>{stats.inApplication}</strong>
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
              <dt>Open applications</dt>
              <dd>{stats.openApplications}</dd>
            </div>
          </dl>
          <span className="ll-card-link">View units →</span>
        </Link>

        <Link to="/landlords" className="ll-card ll-card-tenants">
          <div className="ll-card-top">
            <div>
              <p className="ll-card-label">Landlords</p>
              <h2>{stats.landlordCount}</h2>
              <p className="ll-card-sub">Owners on your agency book</p>
            </div>
            <div className="ll-icon-stack" aria-hidden="true">
              <span className="ll-person ll-person-1" />
              <span className="ll-person ll-person-2" />
              <span className="ll-person ll-person-3" />
            </div>
          </div>

          <div className="ll-metric-row">
            <div className="ll-chip ll-chip-teal">
              <span className="ll-dot" />
              With tenants <strong>{stats.landlordsWithTenants}</strong>
            </div>
            <div className="ll-chip ll-chip-sand">
              <span className="ll-dot" />
              With vacant units <strong>{stats.landlordsWithVacant}</strong>
            </div>
          </div>

          <dl className="ll-stat-list">
            <div>
              <dt>Total units managed</dt>
              <dd>{stats.landlordUnits}</dd>
            </div>
            <div>
              <dt>Total tenants</dt>
              <dd>{stats.landlordTenants}</dd>
            </div>
            <div>
              <dt>Avg units / landlord</dt>
              <dd>{stats.avgUnitsPerLandlord}</dd>
            </div>
          </dl>
          <span className="ll-card-link">View landlords →</span>
        </Link>

        <Link to="/tenants" className="ll-card ll-card-tenants">
          <div className="ll-card-top">
            <div>
              <p className="ll-card-label">Tenants</p>
              <h2>{stats.tenantCount}</h2>
              <p className="ll-card-sub">Active and notice leases</p>
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
              Notice / ending soon <strong>{stats.endingSoonTenants}</strong>
            </div>
            <div className="ll-chip ll-chip-teal">
              <span className="ll-dot" />
              Paying on time <strong>{stats.payingOnTime}</strong>
            </div>
          </div>

          <dl className="ll-stat-list">
            <div>
              <dt>Arrears total</dt>
              <dd>{formatMoney(stats.arrearsTotal)}</dd>
            </div>
            <div>
              <dt>On notice</dt>
              <dd>{stats.onNotice}</dd>
            </div>
            <div>
              <dt>Open tickets</dt>
              <dd>{stats.openTickets}</dd>
            </div>
          </dl>
          <span className="ll-card-link">View tenants →</span>
        </Link>

        <Link to="/invoices" className="ll-card ll-card-invoices">
          <div className="ll-card-top">
            <div>
              <p className="ll-card-label">Invoices</p>
              <h2>{stats.invoiceCount}</h2>
              <p className="ll-card-sub">Issued across the portfolio</p>
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
            <div className="ll-chip ll-chip-rose">
              <span className="ll-dot" />
              Overdue <strong>{stats.invoiceOverdue}</strong>
            </div>
          </div>

          <dl className="ll-stat-list">
            <div>
              <dt>Total invoiced</dt>
              <dd>{formatMoney(stats.invoiceTotalValue)}</dd>
            </div>
            <div>
              <dt>Total invoices</dt>
              <dd>{stats.invoiceCount}</dd>
            </div>
          </dl>
          <span className="ll-card-link">Open invoices →</span>
        </Link>

        <Link to="/issues" className="ll-card ll-card-tickets">
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
              <span
                style={{
                  width: `${stats.ticketsTotal ? (stats.ticketsOpen / stats.ticketsTotal) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="ll-bar ll-bar-mid">
              <span
                style={{
                  width: `${stats.ticketsTotal ? (stats.ticketsInProgress / stats.ticketsTotal) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="ll-bar ll-bar-done">
              <span
                style={{
                  width: `${stats.ticketsTotal ? (stats.ticketsClosed / stats.ticketsTotal) * 100 : 0}%`,
                }}
              />
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
