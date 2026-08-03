import { useAuth } from '../../data/AuthContext'

export default function LandlordProfilePage() {
  const { user } = useAuth()
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Profile</h1>
          <p>Your landlord account.</p>
        </div>
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
    </div>
  )
}
