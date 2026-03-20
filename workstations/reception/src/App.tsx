import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary, HealthPage, OfflineBanner } from '@cn-kis/ui-kit'
import { useNetworkStatus, useFeishuContext } from '@cn-kis/feishu-sdk'
import { AppLayout, ReceptionAuthGuard, ReceptionLoginFallback } from './layouts/AppLayout'
import { useApiInit } from './hooks/useApiInit'
import ReceptionDashboardPage from './pages/ReceptionDashboardPage'
import ReceptionDisplayPage from './pages/ReceptionDisplayPage'
import ReceptionJourneyPage from './pages/ReceptionJourneyPage'
import ReceptionAnalyticsPage from './pages/ReceptionAnalyticsPage'
import AppointmentsPage from './pages/AppointmentsPage'
import CheckinPage from './pages/CheckinPage'
import QRScanCheckinPage from './pages/QRScanCheckinPage'
import StationQRPage from './pages/StationQRPage'
import AlertPage from './pages/AlertPage'
import SchedulePage from './pages/SchedulePage'

function LoginPage() {
  const { isAuthenticated } = useFeishuContext()
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <ReceptionLoginFallback />
}

export default function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="reception">
      <OfflineBanner visible={offline} />
      <HashRouter>
        <Routes>
          <Route path="/health" element={<HealthPage workstation="reception" />} />
          <Route path="/login" element={<ReceptionAuthGuard><LoginPage /></ReceptionAuthGuard>} />
          <Route
            path="/display"
            element={
              <ReceptionAuthGuard>
                <ReceptionDisplayPage />
              </ReceptionAuthGuard>
            }
          />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<ReceptionDashboardPage />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="journey" element={<ReceptionJourneyPage />} />
            <Route path="analytics" element={<ReceptionAnalyticsPage />} />
            <Route path="appointments" element={<AppointmentsPage />} />
            <Route path="checkin" element={<CheckinPage />} />
            <Route path="scan" element={<QRScanCheckinPage />} />
            <Route path="station-qr" element={<StationQRPage />} />
            <Route path="alerts" element={<AlertPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}
