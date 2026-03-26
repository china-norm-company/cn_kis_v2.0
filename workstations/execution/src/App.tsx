import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
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
import SchedulePersonnelPage from './pages/SchedulePersonnelPage'
import ScheduleOfflinePage from './pages/ScheduleOfflinePage'
import TimeSlotDetailPage from './pages/TimeSlotDetailPage'
import AdverseEventListPage from './pages/AdverseEventListPage'
import AdverseEventDetailPage from './pages/AdverseEventDetailPage'
import AdverseEventDashboardPage from './pages/AdverseEventDashboardPage'

function LegacyReceptionRedirect({ target }: { target: string }) {
  window.location.assign(target)
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
          <Route
            path="/reception/display"
            element={<LegacyReceptionRedirect target={getWorkstationUrl('reception', '#/display')} />}
          />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="project-management" element={<ProjectManagementPage />} />
            <Route path="project-management/resource-demand/detail" element={<ResourceDemandDetailPage />} />
            <Route path="scheduling" element={<SchedulingPage />} />
            <Route path="scheduling/resource-approval/:demandId" element={<ResourceApprovalDetailPage />} />
            <Route path="scheduling/plan/:planId" element={<SchedulePlanDetailPage />} />
            <Route path="scheduling/timeline/:rowId" element={<TimelineRowDetailPage />} />
            <Route path="scheduling/schedule-core/:executionOrderId" element={<ScheduleCorePage />} />
            <Route path="scheduling/schedule-core/:executionOrderId/personnel" element={<SchedulePersonnelPage />} />
            <Route path="scheduling/schedule-offline/:planId" element={<ScheduleOfflinePage />} />
            <Route path="scheduling/timeslot/:id" element={<TimeSlotDetailPage />} />
            <Route path="visits" element={<VisitPage />} />
            <Route path="subjects" element={<SubjectPage />} />
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
