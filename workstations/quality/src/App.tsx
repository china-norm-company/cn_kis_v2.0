import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { DeviationListPage } from './pages/DeviationListPage'
import { DeviationDetailPage } from './pages/DeviationDetailPage'
import { CAPAListPage } from './pages/CAPAListPage'
import { CAPADetailPage } from './pages/CAPADetailPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { AuditManagementPage } from './pages/AuditManagementPage'
import { AuditDetailPage } from './pages/AuditDetailPage'
import { SOPListPage } from './pages/SOPListPage'
import { QueryListPage } from './pages/QueryListPage'
import { ChangeControlPage } from './pages/ChangeControlPage'
import { ProjectQualityReportPage } from './pages/ProjectQualityReportPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { AdverseEventListPage } from './pages/AdverseEventListPage'
import { AdverseEventDetailPage } from './pages/AdverseEventDetailPage'
import { useApiInit } from './hooks/useApiInit'

function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="quality">
      <OfflineBanner visible={offline} />
      <HashRouter>
        <Routes>
          <Route path="/health" element={<HealthPage workstation="quality" />} />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="deviations" element={<DeviationListPage />} />
            <Route path="deviations/:id" element={<DeviationDetailPage />} />
            <Route path="capa" element={<CAPAListPage />} />
            <Route path="capa/:id" element={<CAPADetailPage />} />
            <Route path="queries" element={<QueryListPage />} />
            <Route path="audit-management" element={<AuditManagementPage />} />
            <Route path="audit-management/:id" element={<AuditDetailPage />} />
            <Route path="audit-logs" element={<AuditLogPage />} />
            <Route path="sop" element={<SOPListPage />} />
            <Route path="changes" element={<ChangeControlPage />} />
            <Route path="report" element={<ProjectQualityReportPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="adverse-events" element={<AdverseEventListPage />} />
            <Route path="adverse-events/:id" element={<AdverseEventDetailPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}

export default App
