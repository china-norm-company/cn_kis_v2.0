import { HashRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus, getWorkstationUrl } from '@cn-kis/feishu-sdk'
import { AppLayout } from './layouts/AppLayout'
import { useApiInit } from './hooks/useApiInit'
import DashboardPage from './pages/DashboardPage'
import ProjectManagementPage from './pages/ProjectManagementPage'
import SchedulingPage from './pages/SchedulingPage'
import WorkOrderPage from './pages/WorkOrderPage'
import WorkOrderDetailPage from './pages/WorkOrderDetailPage'
import ChangeManagementPage from './pages/ChangeManagementPage'
import EDCPage from './pages/EDCPage'
import LIMSPage from './pages/LIMSPage'
import SubjectPage from './pages/SubjectPage'
import VisitPage from './pages/VisitPage'
import QuickScanPage from './pages/QuickScanPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ProjectExecutionPage from './pages/ProjectExecutionPage'
import ResourceApprovalDetailPage from './pages/ResourceApprovalDetailPage'
import SchedulePlanDetailPage from './pages/SchedulePlanDetailPage'
import TimelineRowDetailPage from './pages/TimelineRowDetailPage'
import ResourceDemandDetailPage from './pages/ResourceDemandDetailPage'
import ScheduleCorePage from './pages/ScheduleCorePage'
import ScheduleOfflinePage from './pages/ScheduleOfflinePage'
import TimeSlotDetailPage from './pages/TimeSlotDetailPage'
import AdverseEventListPage from './pages/AdverseEventListPage'
import AdverseEventDetailPage from './pages/AdverseEventDetailPage'
import AdverseEventDashboardPage from './pages/AdverseEventDashboardPage'
import ConsentManagementPage from './pages/ConsentManagementPage'
import WitnessStaffPage from './pages/WitnessStaffPage'
import WitnessFaceVerifyPage from './pages/WitnessFaceVerifyPage'
import WitnessConsentDevPage from './pages/WitnessConsentDevPage'
import ConsentTestScanPage from './pages/ConsentTestScanPage'
import { ExecutionHomeRedirect } from './components/ExecutionHomeRedirect'

/** 接待台 URL：本地开发时 execution(3007) 与 reception(3016) 不同端口，需用完整 URL */
function getReceptionUrl(hashPath: string): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port === '3007') {
    return `http://${window.location.hostname}:3016/reception/#${hashPath}`
  }
  return `/reception/#${hashPath}`
}

function LegacyReceptionRedirect({ target }: { target: string }) {
  const url = target.startsWith('/reception/#') ? getReceptionUrl(target.replace('/reception/#', '')) : target
  window.location.assign(url)
  return null
}

export default function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="execution">
      <OfflineBanner visible={offline} />
      <HashRouter>
        <Routes>
          <Route path="/health" element={<HealthPage workstation="execution" />} />
          <Route path="/witness-verify" element={<WitnessFaceVerifyPage />} />
          <Route path="/witness-consent-dev" element={<WitnessConsentDevPage />} />
          <Route path="/consent-test-scan" element={<ConsentTestScanPage />} />
          <Route
            path="/reception/display"
            element={<LegacyReceptionRedirect target={getWorkstationUrl('reception', '#/display')} />}
          />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<ExecutionHomeRedirect />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="project-management" element={<ProjectManagementPage />} />
            <Route path="project-management/resource-demand/detail" element={<ResourceDemandDetailPage />} />
            <Route path="scheduling" element={<SchedulingPage />} />
            <Route path="scheduling/resource-approval/:demandId" element={<ResourceApprovalDetailPage />} />
            <Route path="scheduling/plan/:planId" element={<SchedulePlanDetailPage />} />
            <Route path="scheduling/timeline/:rowId" element={<TimelineRowDetailPage />} />
            <Route path="scheduling/schedule-core/:executionOrderId" element={<ScheduleCorePage />} />
            <Route path="scheduling/schedule-offline/:planId" element={<ScheduleOfflinePage />} />
            <Route path="scheduling/timeslot/:id" element={<TimeSlotDetailPage />} />
            <Route path="visits" element={<VisitPage />} />
            <Route path="subjects" element={<SubjectPage />} />
            <Route path="consent" element={<ConsentManagementPage />} />
            <Route path="consent/witness-staff" element={<WitnessStaffPage />} />
            <Route path="workorders" element={<WorkOrderPage />} />
            <Route path="workorders/:id" element={<WorkOrderDetailPage />} />
            <Route path="changes" element={<ChangeManagementPage />} />
            <Route path="edc" element={<EDCPage />} />
            <Route path="lims" element={<LIMSPage />} />
            <Route path="scan" element={<QuickScanPage />} />
            <Route
              path="reception"
              element={<LegacyReceptionRedirect target={getWorkstationUrl('reception', '#/dashboard')} />}
            />
            <Route path="adverse-events" element={<AdverseEventListPage />} />
            <Route path="adverse-events/:id" element={<AdverseEventDetailPage />} />
            <Route path="adverse-events/dashboard" element={<AdverseEventDashboardPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="projects/:id/execution" element={<ProjectExecutionPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}
