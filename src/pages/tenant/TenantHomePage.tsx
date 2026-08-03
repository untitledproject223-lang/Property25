import { Link } from 'react-router-dom'
import { useAuth } from '../../data/AuthContext'

export default function TenantHomePage() {
  const { user } = useAuth()
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Welcome, {user?.name}</h1>
          <p>Track your applications, stays, and tickets in one place.</p>
        </div>
      </header>
      <div className="card-grid" style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Link to="/tenant/applications" className="btn btn-primary">
          Applications
        </Link>
        <Link to="/tenant/stays" className="btn btn-ghost">
          My stays
        </Link>
        <Link to="/tenant/issues" className="btn btn-ghost">
          Open a ticket
        </Link>
      </div>
    </div>
  )
}
