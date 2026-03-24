import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { ProductLedgerPage } from './pages/ProductLedgerPage'
import { ConsumableLedgerPage } from './pages/ConsumableLedgerPage'
import { InventoryPage } from './pages/InventoryPage'
import { TransactionPage } from './pages/TransactionPage'
import { ExpiryAlertPage } from './pages/ExpiryAlertPage'
import { SampleManagementPage } from './pages/SampleManagementPage'
import { SampleReceiptPage } from './pages/SampleReceiptPage'
import { BatchManagementPage } from './pages/BatchManagementPage'
import { DestructionApprovalPage } from './pages/DestructionApprovalPage'
import { KitDispensingPage } from './pages/KitDispensingPage'
import { TemperatureChartPage } from './pages/TemperatureChartPage'
import { ComplianceManagementPage } from './pages/ComplianceManagementPage'
import { InventoryExecutionPage } from './pages/InventoryExecutionPage'
import { StorageHierarchyPage } from './pages/StorageHierarchyPage'
import { RetentionManagementPage } from './pages/RetentionManagementPage'
import { MaterialScanIssuePage } from './pages/MaterialScanIssuePage'
import { SampleDistributionPage } from './pages/SampleDistributionPage'
import SchedulePage from './pages/SchedulePage'
import { useApiInit } from './hooks/useApiInit'

export default function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="material">
      <OfflineBanner visible={offline} />
      <BrowserRouter basename="/material">
        <Routes>
          <Route path="/health" element={<HealthPage workstation="material" />} />
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/scan-issue" element={<MaterialScanIssuePage />} />
            <Route path="/products" element={<ProductLedgerPage />} />
            <Route path="/consumables" element={<ConsumableLedgerPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/transactions" element={<TransactionPage />} />
            <Route path="/expiry-alerts" element={<ExpiryAlertPage />} />
            <Route path="/samples" element={<SampleManagementPage />} />
            <Route path="/receipts" element={<SampleReceiptPage />} />
            <Route path="/batches" element={<BatchManagementPage />} />
            <Route path="/destructions" element={<DestructionApprovalPage />} />
            <Route path="/kits" element={<KitDispensingPage />} />
            <Route path="/inventory-execution" element={<InventoryExecutionPage />} />
            <Route path="/storage-hierarchy" element={<StorageHierarchyPage />} />
            <Route path="/retention" element={<RetentionManagementPage />} />
            <Route path="/sample-distribution" element={<SampleDistributionPage />} />
            <Route path="/temperature" element={<TemperatureChartPage />} />
            <Route path="/compliance" element={<ComplianceManagementPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
