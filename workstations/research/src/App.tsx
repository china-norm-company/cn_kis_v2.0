import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { AppLayout } from './layouts/AppLayout'

/* ------------------------------------------------------------------ */
/* Route-level code splitting — 按路由懒加载，显著降低首屏体积          */
/* ------------------------------------------------------------------ */
const ManagerDashboardPage = lazy(() => import('./pages/ManagerDashboardPage'))
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'))
const FeasibilityPage = lazy(() => import('./pages/FeasibilityPage'))
const ProposalListPage = lazy(() => import('./pages/ProposalListPage'))
const ProposalDetailPage = lazy(() => import('./pages/ProposalDetailPage'))
const ProposalCreatePage = lazy(() => import('./pages/ProposalCreatePage'))
const QualityCheckPage = lazy(() => import('./pages/QualityCheckPage'))
const AdminPermissionsPage = lazy(() => import('./pages/AdminPermissionsPage'))
const CloseoutPage = lazy(() => import('./pages/CloseoutPage'))
const PerformanceSettlementPage = lazy(() => import('./pages/PerformanceSettlementPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBasePage'))
const ProjectDashboardPage = lazy(() => import('./pages/ProjectDashboardPage'))
const AIAssistantPage = lazy(() => import('./pages/AIAssistantPage'))
const MyWorkbenchPage = lazy(() => import('./pages/MyWorkbenchPage'))
const NotificationInboxPage = lazy(() => import('./pages/NotificationInboxPage'))
const ClientOverviewPage = lazy(() => import('./pages/ClientOverviewPage'))
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'))
const BusinessPipelinePage = lazy(() => import('./pages/BusinessPipelinePage'))
const ChangeManagementPage = lazy(() => import('./pages/ChangeManagementPage'))
const TaskDelegationPage = lazy(() => import('./pages/TaskDelegationPage'))
const ProjectFullLinkListPage = lazy(() => import('./pages/ProjectFullLinkListPage'))
const ProjectFullLinkDetailPage = lazy(() => import('./pages/ProjectFullLinkDetailPage'))
const ProjectFullLinkEditPage = lazy(() => import('./pages/ProjectFullLinkEditPage'))
const WeeklyLayout = lazy(() => import('./layouts/WeeklyLayout'))
const WeeklyReportPage = lazy(() => import('./pages/WeeklyReportPage'))
const WeeklyMyTasksPage = lazy(() => import('./pages/WeeklyMyTasksPage'))
const WeeklyProjectListPage = lazy(() => import('./pages/WeeklyProjectListPage'))
const WeeklyProjectCreatePage = lazy(() => import('./pages/WeeklyProjectCreatePage'))
const WeeklyProjectDetailPage = lazy(() => import('./pages/WeeklyProjectDetailPage'))
const WeeklyProjectEditPage = lazy(() => import('./pages/WeeklyProjectEditPage'))
const WeeklyDashboardPage = lazy(() => import('./pages/WeeklyDashboardPage'))
const LipScalinessPage = lazy(() => import('./pages/LipScalinessPage'))
const DataCollectionMonitorPage = lazy(() => import('./pages/DataCollectionMonitorPage'))
const DataStatisticsPage = lazy(() => import('./pages/DataStatisticsPage'))
const DataReportPreparationPage = lazy(() => import('./pages/DataReportPreparationPage'))
const TrialReportPreparationPage = lazy(() => import('./pages/TrialReportPreparationPage'))
const ProposalDesignPage = lazy(() => import('./pages/ProposalDesignPage'))
const TrialInitiationPage = lazy(() => import('./pages/TrialInitiationPage'))
const ImageAnalysisPage = lazy(() => import('./pages/ImageAnalysisPage'))
const FaceImageAnalysisPage = lazy(() => import('./pages/FaceImageAnalysisPage'))
const LipImageAnalysisPage = lazy(() => import('./pages/LipImageAnalysisPage'))
const HandImageAnalysisPage = lazy(() => import('./pages/HandImageAnalysisPage'))
const OtherImageAnalysisPage = lazy(() => import('./pages/OtherImageAnalysisPage'))

/* 非新建页面保持直接 import（体积较小或共享频繁） */
import { ProtocolListPage } from './pages/ProtocolListPage'
import { ProtocolDetailPage } from './pages/ProtocolDetailPage'
import { VisitListPage } from './pages/VisitListPage'
import { SubjectListPage } from './pages/SubjectListPage'
import { OverviewPage } from './pages/OverviewPage'
import { useApiInit } from './hooks/useApiInit'

/* ------------------------------------------------------------------ */
/* 路由加载占位符                                                      */
/* ------------------------------------------------------------------ */
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-400">加载中...</span>
      </div>
    </div>
  )
}

/**
 * 研究台路由 — 研究经理全生命周期工作台
 *
 * 管理中心：
 * - /manager                 管理驾驶舱（A1/A2/C3 升级版）
 * - /portfolio               项目组合看板（A3）
 *
 * 项目生命周期：
 * - /feasibility             可行性评估（B1）
 * - /proposals               方案准备（B2）
 * - /proposals/create        创建方案
 * - /proposals/:id           方案详情（B2）
 * - /protocols               我的协议
 * - /protocols/:id           协议详情（含启动包生成 B3）
 * - /projects/:id/dashboard  项目级仪表板（F2 升级版）
 * - /closeout                结项管理（B4）
 *
 * 执行管理：
 * - /visits                  我的访视
 * - /subjects                我的受试者
 *
 * 团队与知识：
 * - /team                    团队全景（E1）
 * - /knowledge               知识库（D3）
 * - /ai-assistant            AI 助手（D1 升级版）
 * - /overview                研究概览
 */
export default function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="research">
      <OfflineBanner visible={offline} />
      <HashRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/health" element={<HealthPage workstation="research" />} />
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/workbench" replace />} />
              {/* 个人工作台 */}
              <Route path="/workbench" element={<MyWorkbenchPage />} />
              <Route path="/weekly" element={<WeeklyLayout />}>
                <Route index element={<WeeklyReportPage />} />
                <Route path="tasks" element={<WeeklyMyTasksPage />} />
                <Route path="projects" element={<WeeklyProjectListPage />} />
                <Route path="projects/create" element={<WeeklyProjectCreatePage />} />
                <Route path="projects/:id/edit" element={<WeeklyProjectEditPage />} />
                <Route path="projects/:id" element={<WeeklyProjectDetailPage />} />
                <Route path="dashboard" element={<WeeklyDashboardPage />} />
              </Route>
              <Route path="/notifications" element={<NotificationInboxPage />} />
              {/* 管理中心 */}
              <Route path="/manager" element={<ManagerDashboardPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              {/* 项目生命周期 */}
              <Route path="/feasibility" element={<FeasibilityPage />} />
              <Route path="/proposals" element={<ProposalListPage />} />
              <Route path="/proposals/create" element={<ProposalCreatePage />} />
              <Route path="/proposals/quality-check" element={<QualityCheckPage />} />
              <Route path="/proposals/:id" element={<ProposalDetailPage />} />
              {/* 管理员 */}
              <Route path="/admin/permissions" element={<AdminPermissionsPage />} />
              <Route path="/protocols" element={<ProtocolListPage />} />
              <Route path="/protocols/:id" element={<ProtocolDetailPage />} />
              <Route path="/project-full-link" element={<ProjectFullLinkListPage />} />
              <Route path="/project-full-link/:id" element={<ProjectFullLinkDetailPage />} />
              <Route path="/project-full-link/:id/edit" element={<ProjectFullLinkEditPage />} />
              <Route path="/projects/:id/dashboard" element={<ProjectDashboardPage />} />
              <Route path="/closeout" element={<CloseoutPage />} />
              <Route path="/closeout/settlement" element={<PerformanceSettlementPage />} />
              {/* 执行管理 */}
              <Route path="/visits" element={<VisitListPage />} />
              <Route path="/subjects" element={<SubjectListPage />} />
              {/* 客户与商务 */}
              <Route path="/clients" element={<ClientOverviewPage />} />
              <Route path="/clients/:id" element={<ClientDetailPage />} />
              <Route path="/business" element={<BusinessPipelinePage />} />
              {/* 变更与协调 */}
              <Route path="/changes" element={<ChangeManagementPage />} />
              <Route path="/tasks" element={<TaskDelegationPage />} />
              {/* 团队与知识 */}
              <Route path="/team" element={<TeamPage />} />
              <Route path="/knowledge" element={<KnowledgeBasePage />} />
              <Route path="/ai-assistant" element={<AIAssistantPage />} />
              <Route path="/overview" element={<OverviewPage />} />
              {/* 执行管理扩展 */}
              <Route path="/data-collection-monitor" element={<DataCollectionMonitorPage />} />
              {/* 项目生命周期扩展 */}
              <Route path="/trial-initiation" element={<TrialInitiationPage />} />
              <Route path="/image-analysis" element={<ImageAnalysisPage />} />
              <Route path="/image-analysis/face" element={<FaceImageAnalysisPage />} />
              <Route path="/image-analysis/lip" element={<LipImageAnalysisPage />} />
              <Route path="/image-analysis/lip/scaliness" element={<LipScalinessPage />} />
              <Route path="/image-analysis/hand" element={<HandImageAnalysisPage />} />
              <Route path="/image-analysis/other" element={<OtherImageAnalysisPage />} />
              <Route path="/data-statistics" element={<DataStatisticsPage />} />
              <Route path="/data-report-preparation" element={<DataReportPreparationPage />} />
              <Route path="/trial-report-preparation" element={<TrialReportPreparationPage />} />
              {/* 客户与商务扩展 */}
              <Route path="/proposal-design" element={<ProposalDesignPage />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </ErrorBoundary>
  )
}
