import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../data/AuthContext'
import { useDashboard } from '../data/DashboardContext'
import './DashboardShell.css'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/units', label: 'Units' },
  { to: '/landlords', label: 'Landlord' },
  { to: '/tenants', label: 'Tenants' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/issues', label: 'Tickets' },
  { to: '/applications', label: 'Applications' },
]

export function DashboardShell() {
  const { user, logout } = useAuth()
  const { loading, error } = useDashboard()

  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <div className="dash-brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="brand-eyebrow">Property25</p>
            <p className="dash-brand-title">Agent Desk</p>
          </div>
        </div>
        <nav className="dash-nav" aria-label="Dashboard">
          {NAV.map((item) => (
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
        <div className="dash-sidebar-footer">
          <button type="button" className="dash-signout" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-topbar">
          <div>
            <p className="dash-topbar-label">
              {user?.org.name ?? 'Tenant management'}
              {loading ? ' · syncing…' : ''}
            </p>
            {error ? (
              <p className="dash-topbar-agent" style={{ color: '#b42318' }}>
                API: {error} (showing fallback)
              </p>
            ) : null}
          </div>
          <p className="dash-topbar-agent">
            {user?.name ?? 'Agent'} · {user?.role}
          </p>
        </header>
        <div className="dash-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
