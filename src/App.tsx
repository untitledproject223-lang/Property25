import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './data/AuthContext'
import { DashboardProvider } from './data/DashboardContext'
import { DashboardShell } from './dashboard/DashboardShell'
import PortfolioPage from './pages/PortfolioPage'
import TenantsPage from './pages/TenantsPage'
import TenantDetailPage from './pages/TenantDetailPage'
import PaymentsPage from './pages/PaymentsPage'
import InvoicesPage from './pages/InvoicesPage'
import IssuesPage from './pages/IssuesPage'
import LandlordsPage from './pages/LandlordsPage'
import UnitsPage from './pages/UnitsPage'
import ApplicationPage from './pages/ApplicationPage'
import LoginPage from './pages/LoginPage'
import './App.css'

function ProtectedDashboard() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        Loading…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return (
    <DashboardProvider>
      <Outlet />
    </DashboardProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedDashboard />}>
            <Route element={<DashboardShell />}>
              <Route index element={<PortfolioPage />} />
              <Route path="tenants" element={<TenantsPage />} />
              <Route path="tenants/:id" element={<TenantDetailPage />} />
              <Route path="units" element={<UnitsPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="issues" element={<IssuesPage />} />
              <Route path="landlords" element={<LandlordsPage />} />
            </Route>
            <Route path="apply" element={<ApplicationPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
