import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DashboardProvider } from './data/DashboardContext'
import { DashboardShell } from './dashboard/DashboardShell'
import PortfolioPage from './pages/PortfolioPage'
import TenantsPage from './pages/TenantsPage'
import TenantDetailPage from './pages/TenantDetailPage'
import PaymentsPage from './pages/PaymentsPage'
import InvoicesPage from './pages/InvoicesPage'
import IssuesPage from './pages/IssuesPage'
import LandlordsPage from './pages/LandlordsPage'
import ApplicationPage from './pages/ApplicationPage'
import './App.css'

export default function App() {
  return (
    <DashboardProvider>
      <HashRouter>
        <Routes>
          <Route element={<DashboardShell />}>
            <Route index element={<PortfolioPage />} />
            <Route path="tenants" element={<TenantsPage />} />
            <Route path="tenants/:id" element={<TenantDetailPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="issues" element={<IssuesPage />} />
            <Route path="landlords" element={<LandlordsPage />} />
          </Route>
          <Route path="apply" element={<ApplicationPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </DashboardProvider>
  )
}
