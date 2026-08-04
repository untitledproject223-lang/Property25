import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../data/AuthContext'
import '../dashboard/DashboardShell.css'

type NavItem = { to: string; label: string; end?: boolean }

export function PortalShell({
  title,
  nav,
}: {
  title: string
  nav: NavItem[]
}) {
  const { user, logout } = useAuth()

  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <div className="dash-brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="brand-eyebrow">Property25</p>
            <p className="dash-brand-title">{title}</p>
          </div>
        </div>
        <nav className="dash-nav" aria-label={title}>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `dash-nav-link${isActive ? ' active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="dash-main">
        <header className="dash-topbar">
          <div>
            <p className="dash-topbar-label">{user?.org.name ?? 'Property25'}</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <p className="dash-topbar-agent">
              {user?.name ?? 'User'} · {user?.role}
            </p>
            <button type="button" className="btn btn-ghost btn-compact" onClick={logout}>
              Sign out
            </button>
          </div>
        </header>
        <div className="dash-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

export function TenantShell() {
  return (
    <PortalShell
      title="Tenant Portal"
      nav={[
        { to: '/tenant', label: 'Home', end: true },
        { to: '/tenant/stays', label: 'Stays' },
        { to: '/tenant/invoices', label: 'Invoices' },
        { to: '/tenant/issues', label: 'Tickets' },
        { to: '/tenant/profile', label: 'Profile' },
        { to: '/tenant/applications', label: 'Applications' },
      ]}
    />
  )
}

export function LandlordShell() {
  return (
    <PortalShell
      title="Landlord Portal"
      nav={[
        { to: '/landlord', label: 'Portfolio', end: true },
        { to: '/landlord/units', label: 'Units' },
        { to: '/landlord/invoices', label: 'Invoices' },
        { to: '/landlord/issues', label: 'Tickets' },
        { to: '/landlord/profile', label: 'Profile' },
        { to: '/landlord/applications', label: 'Applications' },
      ]}
    />
  )
}
