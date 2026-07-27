import { NavLink, Outlet } from 'react-router-dom'
import './DashboardShell.css'

const NAV = [
  { to: '/', label: 'Portfolio', end: true },
  { to: '/tenants', label: 'Tenants' },
  { to: '/payments', label: 'Payments' },
  { to: '/invoices', label: 'Invoices' },
  { to: '/issues', label: 'Issues' },
  { to: '/landlords', label: 'Landlords' },
  { to: '/apply', label: 'New application' },
]

export function DashboardShell() {
  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <div className="dash-brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="brand-eyebrow">Real Estate CRM</p>
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
      </aside>

      <div className="dash-main">
        <header className="dash-topbar">
          <p className="dash-topbar-label">Tenant management</p>
          <p className="dash-topbar-agent">Signed in as Jane Agent</p>
        </header>
        <div className="dash-content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
