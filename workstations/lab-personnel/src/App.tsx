import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { StaffListPage } from './pages/StaffListPage'
import { QualificationMatrixPage } from './pages/QualificationMatrixPage'
import { SchedulePage } from './pages/SchedulePage'
import { WorktimePage } from './pages/WorktimePage'
import { RiskAlertPage } from './pages/RiskAlertPage'
import { DispatchPage } from './pages/DispatchPage'
import { StaffDetailPage } from './pages/StaffDetailPage'
import { useApiInit } from './hooks/useApiInit'

export default function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="lab-personnel">
      <OfflineBanner visible={offline} />
      <BrowserRouter basename="/lab-personnel">
        <Routes>
          <Route path="/health" element={<HealthPage workstation="lab-personnel" />} />
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/staff" element={<StaffListPage />} />
            <Route path="/staff/:id" element={<StaffDetailPage />} />
            <Route path="/qualifications" element={<QualificationMatrixPage />} />
            <Route path="/schedules" element={<SchedulePage />} />
            <Route path="/worktime" element={<WorktimePage />} />
            <Route path="/risks" element={<RiskAlertPage />} />
            <Route path="/dispatch" element={<DispatchPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
