import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary, HealthPage, OfflineBanner } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { AppLayout } from './layouts/AppLayout'
import PlaceholderPage from './pages/PlaceholderPage'
import RosterPage from './pages/RosterPage'
import SkillsPage from './pages/SkillsPage'
import WorkflowsPage from './pages/WorkflowsPage'
import ExecutionsPage from './pages/ExecutionsPage'
import PerformancePage from './pages/PerformancePage'
import GrowthPage from './pages/GrowthPage'
import BehaviorPage from './pages/BehaviorPage'
import KnowledgeInfusionPage from './pages/KnowledgeInfusionPage'
import EvidenceGatePage from './pages/EvidenceGatePage'
import ValueDashboardPage from './pages/ValueDashboardPage'
import ChangeAuditPage from './pages/ChangeAuditPage'
import EvergreenWatchPage from './pages/EvergreenWatchPage'
import ChannelHealthPage from './pages/ChannelHealthPage'
import { PortalPage } from './pages/PortalPage'
import OpsOverviewPage from './pages/OpsOverviewPage'
import ActionsCenterPage from './pages/ActionsCenterPage'
import ReplayCenterPage from './pages/ReplayCenterPage'
import ReplayDetailPage from './pages/ReplayDetailPage'
import PolicyCenterPage from './pages/PolicyCenterPage'
import DailyBriefPage from './pages/DailyBriefPage'
import MyAssistantsPage from './pages/MyAssistantsPage'
import MyActivityPage from './pages/MyActivityPage'
import MemoryArchivePage from './pages/MemoryArchivePage'
import PolicyLearningPage from './pages/PolicyLearningPage'
import OrchestrationMonitorPage from './pages/OrchestrationMonitorPage'
import AgentDirectoryPage from './pages/AgentDirectoryPage'
import SkillRegistryPage from './pages/SkillRegistryPage'
import MatrixPage from './pages/MatrixPage'
import PositionsPage from './pages/PositionsPage'
import RoleDetailPage from './pages/RoleDetailPage'
import ToolsPage from './pages/ToolsPage'
import OrgChartPage from './pages/OrgChartPage'
import KnowledgeReviewPage from './pages/KnowledgeReviewPage'
import EvergreenWatchDetailPage from './pages/EvergreenWatchDetailPage'
import { DevTokenInjectPage } from './pages/DevTokenInjectPage'
import { MailSignalListPage } from './pages/MailSignalListPage'
import { MailSignalDetailPage } from './pages/MailSignalDetailPage'
import { MailTaskDraftPage } from './pages/MailTaskDraftPage'
import ChatPage from './pages/ChatPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { ProactiveInsightListPage } from './pages/ProactiveInsightListPage'
import { ProactiveInsightDetailPage } from './pages/ProactiveInsightDetailPage'
import { ProactiveAnalyticsPage } from './pages/ProactiveAnalyticsPage'

export default function App() {
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="digital-workforce">
      <OfflineBanner visible={offline} />
      <HashRouter>
        <Routes>
          <Route path="/health" element={<HealthPage workstation="digital-workforce" />} />
          <Route path="/dev-inject-token" element={<DevTokenInjectPage />} />
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to="/portal" replace />} />
            {/* 运营总览 */}
            <Route path="portal" element={<PortalPage />} />
            <Route path="roles/:roleCode" element={<RoleDetailPage />} />
            <Route path="ops-overview" element={<OpsOverviewPage />} />
            <Route path="actions" element={<ActionsCenterPage />} />
            <Route path="replay" element={<ReplayCenterPage />} />
            <Route path="replay/:taskId" element={<ReplayDetailPage />} />
            <Route path="policies" element={<PolicyCenterPage />} />
            <Route path="my-assistants" element={<MyAssistantsPage />} />
            <Route path="my-activity" element={<MyActivityPage />} />
            <Route path="daily-brief" element={<DailyBriefPage />} />
            {/* 邮件信号 */}
            <Route path="mail-signals" element={<MailSignalListPage />} />
            <Route path="mail-signals/:signalId" element={<MailSignalDetailPage />} />
            <Route path="mail-tasks" element={<MailTaskDraftPage />} />
            {/* 对话与分析（与 origin/main 合并） */}
            <Route path="chat" element={<ChatPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="proactive-insights" element={<ProactiveInsightListPage />} />
            <Route path="proactive-insights/:insightId" element={<ProactiveInsightDetailPage />} />
            <Route path="proactive-analytics" element={<ProactiveAnalyticsPage />} />
            {/* 组织与花名册 */}
            <Route path="roster" element={<RosterPage />} />
            <Route path="agents" element={<AgentDirectoryPage />} />
            <Route path="matrix" element={<MatrixPage />} />
            <Route path="positions" element={<PositionsPage />} />
            <Route path="teams" element={<OrgChartPage />} />
            {/* 流程与协作 */}
            <Route path="workflows" element={<WorkflowsPage />} />
            <Route path="n8n" element={<PlaceholderPage />} />
            <Route path="executions" element={<ExecutionsPage />} />
            <Route path="orchestration-monitor" element={<OrchestrationMonitorPage />} />
            <Route path="tasks" element={<PlaceholderPage />} />
            {/* 赋能中心 */}
            <Route path="skills" element={<SkillsPage />} />
            <Route path="skill-registry" element={<SkillRegistryPage />} />
            <Route path="tools" element={<ToolsPage />} />
            <Route path="permissions" element={<PlaceholderPage />} />
            <Route path="knowledge" element={<KnowledgeInfusionPage />} />
            <Route path="memory" element={<MemoryArchivePage />} />
            <Route path="policy-learning" element={<PolicyLearningPage />} />
            <Route path="behavior" element={<BehaviorPage />} />
            <Route path="knowledge-review" element={<KnowledgeReviewPage />} />
            {/* 绩效与洞察 */}
            <Route path="performance" element={<PerformancePage />} />
            <Route path="value" element={<ValueDashboardPage />} />
            <Route path="growth" element={<GrowthPage />} />
            {/* 治理与合规 */}
            <Route path="audit" element={<ChangeAuditPage />} />
            <Route path="health" element={<ChannelHealthPage />} />
            <Route path="gates" element={<EvidenceGatePage />} />
            <Route path="upgrades" element={<EvergreenWatchPage />} />
            <Route path="upgrades/:reportId" element={<EvergreenWatchDetailPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}
