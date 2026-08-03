import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './data/AuthContext'
import { DashboardProvider } from './data/DashboardContext'
import { DashboardShell } from './dashboard/DashboardShell'
import { LandlordShell, TenantShell } from './portal/PortalShell'
import { homePathForRole } from './portal/homePath'
import PortfolioPage from './pages/PortfolioPage'
import TenantsPage from './pages/TenantsPage'
import TenantDetailPage from './pages/TenantDetailPage'
import PaymentsPage from './pages/PaymentsPage'
import InvoicesPage from './pages/InvoicesPage'
import IssuesPage from './pages/IssuesPage'
import LandlordsPage from './pages/LandlordsPage'
import UnitsPage from './pages/UnitsPage'
import UnitDetailPage from './pages/UnitDetailPage'
import ApplicationPage from './pages/ApplicationPage'
import LoginPage from './pages/LoginPage'
import InvitePage from './pages/InvitePage'
import TenantHomePage from './pages/tenant/TenantHomePage'
import TenantApplicationsPage from './pages/tenant/TenantApplicationsPage'
import TenantStaysPage from './pages/tenant/TenantStaysPage'
import TenantStayDetailPage from './pages/tenant/TenantStayDetailPage'
import TenantProfilePage from './pages/tenant/TenantProfilePage'
import LandlordPortfolioPage from './pages/landlord/LandlordPortfolioPage'
import LandlordApplicationsPage from './pages/landlord/LandlordApplicationsPage'
import LandlordProfilePage from './pages/landlord/LandlordProfilePage'
import IssuesInboxPage from './pages/shared/IssuesInboxPage'
import './App.css'

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      Loading…
    </div>
  )
}

function Protected() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return (
    <DashboardProvider>
      <Outlet />
    </DashboardProvider>
  )
}

function AgentOnly() {
  const { user } = useAuth()
  if (user?.role !== 'admin' && user?.role !== 'agent') {
    return <Navigate to={homePathForRole(user)} replace />
  }
  return <Outlet />
}

function TenantOnly() {
  const { user } = useAuth()
  if (user?.role !== 'tenant') {
    return <Navigate to={homePathForRole(user)} replace />
  }
  return <Outlet />
}

function LandlordOnly() {
  const { user } = useAuth()
  if (user?.role !== 'landlord') {
    return <Navigate to={homePathForRole(user)} replace />
  }
  return <Outlet />
}

function RoleHome() {
  const { user } = useAuth()
  return <Navigate to={homePathForRole(user)} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />

          <Route element={<Protected />}>
            <Route path="apply" element={<ApplicationPage />} />
            <Route path="apply/:id" element={<ApplicationPage />} />

            <Route element={<AgentOnly />}>
              <Route element={<DashboardShell />}>
                <Route index element={<PortfolioPage />} />
                <Route path="tenants" element={<TenantsPage />} />
                <Route path="tenants/:id" element={<TenantDetailPage />} />
                <Route path="units" element={<UnitsPage />} />
                <Route path="units/:id" element={<UnitDetailPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="invoices" element={<InvoicesPage />} />
                <Route path="issues" element={<IssuesPage />} />
                <Route path="landlords" element={<LandlordsPage />} />
              </Route>
            </Route>

            <Route element={<TenantOnly />}>
              <Route path="tenant" element={<TenantShell />}>
                <Route index element={<TenantHomePage />} />
                <Route path="applications" element={<TenantApplicationsPage />} />
                <Route path="stays" element={<TenantStaysPage />} />
                <Route path="stays/:id" element={<TenantStayDetailPage />} />
                <Route
                  path="issues"
                  element={
                    <IssuesInboxPage
                      title="Tickets"
                      allowCreate
                      allowDecision={false}
                    />
                  }
                />
                <Route path="profile" element={<TenantProfilePage />} />
              </Route>
            </Route>

            <Route element={<LandlordOnly />}>
              <Route path="landlord" element={<LandlordShell />}>
                <Route index element={<LandlordPortfolioPage />} />
                <Route path="applications" element={<LandlordApplicationsPage />} />
                <Route
                  path="issues"
                  element={
                    <IssuesInboxPage
                      title="Tickets"
                      allowCreate={false}
                      allowDecision
                    />
                  }
                />
                <Route path="profile" element={<LandlordProfilePage />} />
              </Route>
            </Route>

            <Route path="home" element={<RoleHome />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
