import { Link } from 'react-router-dom'
import { useAuth } from '../../data/AuthContext'

export default function LandlordProfilePage() {
  const { user } = useAuth()
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Profile</h1>
          <p>Your landlord account and unit management shortcuts.</p>
        </div>
        <Link to="/landlord/units?add=1" className="btn btn-primary btn-compact">
          Add unit
        </Link>
      </header>
      <dl className="banking-details">
        <div>
          <dt>Name</dt>
          <dd>{user?.name}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{user?.email}</dd>
        </div>
        <div>
          <dt>Organisation</dt>
          <dd>{user?.org.name}</dd>
        </div>
      </dl>
      <p style={{ marginTop: '1.25rem' }}>
        <Link to="/landlord/units" className="btn btn-ghost btn-compact">
          View my units
        </Link>
      </p>
    </div>
  )
}
