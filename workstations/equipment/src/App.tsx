import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { EquipmentLedgerPage } from './pages/EquipmentLedgerPage'
import { CalibrationPlanPage } from './pages/CalibrationPlanPage'
import { MaintenancePage } from './pages/MaintenancePage'
import { UsageRecordPage } from './pages/UsageRecordPage'
import { DetectionMethodPage } from './pages/DetectionMethodPage'
import { AuthorizationPage } from './pages/AuthorizationPage'
import { CalibrationDetailPage } from './pages/CalibrationDetailPage'
import { MaintenanceDetailPage } from './pages/MaintenanceDetailPage'
import { EquipmentDetailPage } from './pages/EquipmentDetailPage'
import { AssetScanUsagePage } from './pages/AssetScanUsagePage'
import { useApiInit } from './hooks/useApiInit'

export default function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="equipment">
      <OfflineBanner visible={offline} />
      <BrowserRouter basename="/equipment">
        <Routes>
          <Route path="/health" element={<HealthPage workstation="equipment" />} />
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/scan" element={<AssetScanUsagePage />} />
            <Route path="/ledger" element={<EquipmentLedgerPage />} />
            <Route path="/ledger/:id" element={<EquipmentDetailPage />} />
            <Route path="/calibration" element={<CalibrationPlanPage />} />
            <Route path="/calibration/:id" element={<CalibrationDetailPage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />
            <Route path="/maintenance/:id" element={<MaintenanceDetailPage />} />
            <Route path="/usage" element={<UsageRecordPage />} />
            <Route path="/detection-methods" element={<DetectionMethodPage />} />
            <Route path="/authorizations" element={<AuthorizationPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
