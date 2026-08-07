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
import LandlordsPage from './pages/LandlordsPage'
import UnitsPage from './pages/UnitsPage'
import UnitDetailPage from './pages/UnitDetailPage'
import ApplicationPage from './pages/ApplicationPage'
import LoginPage from './pages/LoginPage'
import InvitePage from './pages/InvitePage'
import UnitAgentInvitePage from './pages/UnitAgentInvitePage'
import TenantHomePage from './pages/tenant/TenantHomePage'
import TenantApplicationsPage from './pages/tenant/TenantApplicationsPage'
import TenantStaysPage from './pages/tenant/TenantStaysPage'
import TenantStayDetailPage from './pages/tenant/TenantStayDetailPage'
import TenantProfilePage from './pages/tenant/TenantProfilePage'
import TenantInvoicesPage from './pages/tenant/TenantInvoicesPage'
import LandlordPortfolioPage from './pages/landlord/LandlordPortfolioPage'
import LandlordInvoicesPage from './pages/landlord/LandlordInvoicesPage'
import LandlordApplicationsPage from './pages/landlord/LandlordApplicationsPage'
import LandlordProfilePage from './pages/landlord/LandlordProfilePage'
import LandlordUnitsPage from './pages/landlord/LandlordUnitsPage'
import LandlordTenantsPage from './pages/landlord/LandlordTenantsPage'
import AgentApplicationsPage from './pages/agent/AgentApplicationsPage'
import IssuesInboxPage from './pages/shared/IssuesInboxPage'
import InvoiceViewPage from './pages/shared/InvoiceViewPage'
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
          <Route path="/unit-invite/:token" element={<UnitAgentInvitePage />} />

          <Route element={<Protected />}>
            <Route path="apply" element={<ApplicationPage />} />
            <Route path="apply/:id" element={<ApplicationPage />} />
            <Route path="unit-invite/:token" element={<UnitAgentInvitePage />} />

            <Route element={<AgentOnly />}>
              <Route
                path="invoices/:id/view"
                element={<InvoiceViewPage backTo="/" backLabel="Back to dashboard" />}
              />
              <Route element={<DashboardShell />}>
                <Route index element={<PortfolioPage />} />
                <Route path="applications" element={<AgentApplicationsPage />} />
                <Route path="tenants" element={<TenantsPage />} />
                <Route path="tenants/:id" element={<TenantDetailPage />} />
                <Route path="units" element={<UnitsPage />} />
                <Route path="units/:id" element={<UnitDetailPage />} />
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="invoices" element={<InvoicesPage />} />
                <Route
                  path="issues"
                  element={
                    <IssuesInboxPage
                      title="Tickets"
                      allowCreate={false}
                      allowDecision
                      allowClose={false}
                    />
                  }
                />
                <Route path="landlords" element={<LandlordsPage />} />
              </Route>
            </Route>

            <Route element={<TenantOnly />}>
              <Route
                path="tenant/invoices/:id/view"
                element={<InvoiceViewPage backTo="/tenant/invoices" />}
              />
              <Route path="tenant" element={<TenantShell />}>
                <Route index element={<TenantHomePage />} />
                <Route path="stays" element={<TenantStaysPage />} />
                <Route path="stays/:id" element={<TenantStayDetailPage />} />
                <Route path="invoices" element={<TenantInvoicesPage />} />
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
                <Route path="applications" element={<TenantApplicationsPage />} />
              </Route>
            </Route>

            <Route element={<LandlordOnly />}>
              <Route
                path="landlord/invoices/:id/view"
                element={
                  <InvoiceViewPage backTo="/landlord" backLabel="Back to dashboard" />
                }
              />
              <Route path="landlord" element={<LandlordShell />}>
                <Route index element={<LandlordPortfolioPage />} />
                <Route path="units" element={<LandlordUnitsPage />} />
                <Route path="tenants" element={<LandlordTenantsPage />} />
                <Route path="invoices" element={<LandlordInvoicesPage />} />
                <Route path="applications" element={<LandlordApplicationsPage />} />
                <Route
                  path="issues"
                  element={
                    <IssuesInboxPage
                      title="Tickets"
                      allowCreate={false}
                      allowDecision
                      allowClose={false}
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
