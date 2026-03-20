import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { PortalPage } from './pages/PortalPage'
import { TodoCenterPage } from './pages/TodoCenterPage'
import { NotificationCenterPage } from './pages/NotificationCenterPage'
import { AlertCenterPage } from './pages/AlertCenterPage'
import { ManagerDashboardPage } from './pages/ManagerDashboardPage'
import { useApiInit } from './hooks/useApiInit'

export default function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="secretary">
      <OfflineBanner visible={offline} />
      <HashRouter>
        <Routes>
          <Route path="/health" element={<HealthPage workstation="secretary" />} />
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/portal" replace />} />
            <Route path="/portal" element={<PortalPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/todo" element={<TodoCenterPage />} />
            <Route path="/notifications" element={<NotificationCenterPage />} />
            <Route path="/alerts" element={<AlertCenterPage />} />
            <Route path="/manager" element={<ManagerDashboardPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}
