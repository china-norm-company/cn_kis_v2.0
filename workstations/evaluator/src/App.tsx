import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { ExecutePage } from './pages/ExecutePage'
import { ScanPage } from './pages/ScanPage'
import { MeasurePage } from './pages/MeasurePage'
import { InstrumentMeasurePage } from './pages/InstrumentMeasurePage'
import { SchedulePage } from './pages/SchedulePage'
import { KnowledgePage } from './pages/KnowledgePage'
import { GrowthPage } from './pages/GrowthPage'
import { WorkOrderListPage } from './pages/WorkOrderListPage'
import { ProfilePage } from './pages/ProfilePage'
import { DetectionHistoryPage } from './pages/DetectionHistoryPage'
import { ExceptionListPage } from './pages/ExceptionListPage'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'
import { useApiInit } from './hooks/useApiInit'

export default function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="evaluator">
      <OfflineBanner visible={offline} />
      <BrowserRouter basename="/evaluator">
        <Routes>
          <Route path="/health" element={<HealthPage workstation="evaluator" />} />
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/workorders" element={<WorkOrderListPage />} />
            <Route path="/execute/:id" element={<ExecutePage />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/measure" element={<MeasurePage />} />
            <Route path="/instrument-measure" element={<InstrumentMeasurePage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/detections" element={<DetectionHistoryPage />} />
            <Route path="/exceptions" element={<ExceptionListPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/knowledge" element={<KnowledgePage />} />
            <Route path="/growth" element={<GrowthPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
