import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { VenueListPage } from './pages/VenueListPage'
import { VenueDetailPage } from './pages/VenueDetailPage'
import { ReservationPage } from './pages/ReservationPage'
import { ReservationCalendarPage } from './pages/ReservationCalendarPage'
import { EnvironmentMonitorPage } from './pages/EnvironmentMonitorPage'
import { EnvMonitorSettingsPage } from './pages/EnvMonitorSettingsPage'
import { IncidentPage } from './pages/IncidentPage'
import { IncidentDetailPage } from './pages/IncidentDetailPage'
import { CleaningRecordPage } from './pages/CleaningRecordPage'
import { useApiInit } from './hooks/useApiInit'

export default function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="facility">
      <OfflineBanner visible={offline} />
      <BrowserRouter basename="/facility">
        <Routes>
          <Route path="/health" element={<HealthPage workstation="facility" />} />
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/venues" element={<VenueListPage />} />
            <Route path="/venues/:id" element={<VenueDetailPage />} />
            <Route path="/reservations" element={<ReservationPage />} />
            <Route path="/reservations/calendar" element={<ReservationCalendarPage />} />
            <Route path="/environment" element={<EnvironmentMonitorPage />} />
            <Route path="/environment/settings" element={<EnvMonitorSettingsPage />} />
            <Route path="/incidents" element={<IncidentPage />} />
            <Route path="/incidents/:id" element={<IncidentDetailPage />} />
            <Route path="/cleaning" element={<CleaningRecordPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
