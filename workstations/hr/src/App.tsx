import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { QualificationPage } from './pages/QualificationPage'
import { StaffDetailPage } from './pages/StaffDetailPage'
import { CompetencyPage } from './pages/CompetencyPage'
import { AssessmentPage } from './pages/AssessmentPage'
import { AssessmentDetailPage } from './pages/AssessmentDetailPage'
import { TrainingPage } from './pages/TrainingPage'
import { TrainingDetailPage } from './pages/TrainingDetailPage'
import { WorkloadPage } from './pages/WorkloadPage'
import { ArchivePage } from './pages/ArchivePage'
import { RecruitmentPage } from './pages/RecruitmentPage'
import { PerformanceOpsPage } from './pages/PerformanceOpsPage'
import { CompensationPage } from './pages/CompensationPage'
import { CulturePage } from './pages/CulturePage'
import { CollaborationPage } from './pages/CollaborationPage'
import { StaffArchiveDetailPage } from './pages/StaffArchiveDetailPage'
import { ArchiveChangesPage } from './pages/ArchiveChangesPage'
import { ArchiveExitsPage } from './pages/ArchiveExitsPage'
import { RosterPage } from './pages/RosterPage'
import { useApiInit } from './hooks/useApiInit'

function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="hr">
      <OfflineBanner visible={offline} />
      <HashRouter>
        <Routes>
          <Route path="/health" element={<HealthPage workstation="hr" />} />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="roster" element={<RosterPage />} />
            <Route path="qualifications" element={<QualificationPage />} />
            <Route path="staff/:id" element={<StaffDetailPage />} />
            <Route path="competency" element={<CompetencyPage />} />
            <Route path="assessment" element={<AssessmentPage />} />
            <Route path="assessment/:id" element={<AssessmentDetailPage />} />
            <Route path="training" element={<TrainingPage />} />
            <Route path="training/:id" element={<TrainingDetailPage />} />
            <Route path="workload" element={<WorkloadPage />} />
            <Route path="archives" element={<ArchivePage />} />
            <Route path="archives/:staffId" element={<StaffArchiveDetailPage />} />
            <Route path="archive-changes" element={<ArchiveChangesPage />} />
            <Route path="archive-exits" element={<ArchiveExitsPage />} />
            <Route path="recruitment" element={<RecruitmentPage />} />
            <Route path="performance-ops" element={<PerformanceOpsPage />} />
            <Route path="compensation" element={<CompensationPage />} />
            <Route path="culture" element={<CulturePage />} />
            <Route path="collaboration" element={<CollaborationPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}

export default App
