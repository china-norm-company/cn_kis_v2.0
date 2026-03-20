import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { ApplicationListPage } from './pages/applications/ApplicationListPage'
import { ApplicationCreatePage } from './pages/applications/ApplicationCreatePage'
import { ApplicationDetailPage } from './pages/applications/ApplicationDetailPage'
import { ApprovalListPage } from './pages/approvals/ApprovalListPage'
import { ReviewOpinionListPage } from './pages/review-opinions/ReviewOpinionListPage'
import { ReviewOpinionDetailPage } from './pages/review-opinions/ReviewOpinionDetailPage'
import { SupervisionListPage } from './pages/supervisions/SupervisionListPage'
import { RegulationListPage } from './pages/regulations/RegulationListPage'
import { ComplianceListPage } from './pages/compliance/ComplianceListPage'
import { CorrespondenceListPage } from './pages/correspondences/CorrespondenceListPage'
import { TrainingListPage } from './pages/trainings/TrainingListPage'
import { useApiInit } from './hooks/useApiInit'

export default function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="ethics">
      <OfflineBanner visible={offline} />
      <BrowserRouter basename="/ethics">
        <Routes>
          <Route path="/health" element={<HealthPage workstation="ethics" />} />
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/applications" element={<ApplicationListPage />} />
            <Route path="/applications/create" element={<ApplicationCreatePage />} />
            <Route path="/applications/:id" element={<ApplicationDetailPage />} />
            <Route path="/approvals" element={<ApprovalListPage />} />
            <Route path="/review-opinions" element={<ReviewOpinionListPage />} />
            <Route path="/review-opinions/:id" element={<ReviewOpinionDetailPage />} />
            <Route path="/supervisions" element={<SupervisionListPage />} />
            <Route path="/regulations" element={<RegulationListPage />} />
            <Route path="/compliance" element={<ComplianceListPage />} />
            <Route path="/correspondences" element={<CorrespondenceListPage />} />
            <Route path="/trainings" element={<TrainingListPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
