import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { ClientListPage } from './pages/ClientListPage'
import ClientDetailPage from './pages/ClientDetailPage'
import { ClientInsightPage } from './pages/ClientInsightPage'
import { OpportunityListPage } from './pages/OpportunityListPage'
import { OpportunityDetailPage } from './pages/OpportunityDetailPage'
import { OpportunityKanbanPage } from './pages/OpportunityKanbanPage'
import { OpportunityEditPage } from './pages/OpportunityEditPage'
import { TicketListPage } from './pages/TicketListPage'
import { TicketDetailPage } from './pages/TicketDetailPage'
import { DashboardPage } from './pages/DashboardPage'
import { SalesReportPage } from './pages/SalesReportPage'
import { AlertCenterPage } from './pages/AlertCenterPage'
import { ProductLinePage } from './pages/ProductLinePage'
import { ValueInsightPage } from './pages/ValueInsightPage'
import { ClientBriefPage } from './pages/ClientBriefPage'
import { SatisfactionPage } from './pages/SatisfactionPage'
import { MilestonePage } from './pages/MilestonePage'
import { ClaimTrendPage } from './pages/ClaimTrendPage'
import { MarketTrendPage } from './pages/MarketTrendPage'
import { useApiInit } from './hooks/useApiInit'

function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="crm">
      <OfflineBanner visible={offline} />
      <HashRouter>
        <Routes>
          <Route path="/health" element={<HealthPage workstation="crm" />} />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />

            {/* 客户管理 */}
            <Route path="clients" element={<ClientListPage />} />
            <Route path="clients/:id" element={<ClientDetailPage />} />
            <Route path="clients/:id/insight" element={<ClientInsightPage />} />
            <Route path="product-lines" element={<ProductLinePage />} />

            {/* 商机管理 */}
            <Route path="opportunities" element={<OpportunityListPage />} />
            <Route path="opportunities/kanban" element={<OpportunityKanbanPage />} />
            <Route path="opportunities/:id/edit" element={<OpportunityEditPage />} />
            <Route path="opportunities/:id" element={<OpportunityDetailPage />} />

            {/* 客户赋能 */}
            <Route path="insights" element={<ValueInsightPage />} />
            <Route path="briefs" element={<ClientBriefPage />} />
            <Route path="market-trends" element={<MarketTrendPage />} />

            {/* 监控预警 */}
            <Route path="alerts" element={<AlertCenterPage />} />
            <Route path="surveys" element={<SatisfactionPage />} />
            <Route path="milestones" element={<MilestonePage />} />

            {/* 知识引擎 */}
            <Route path="claim-trends" element={<ClaimTrendPage />} />
            <Route path="sales-report" element={<SalesReportPage />} />

            {/* 原有保留 */}
            <Route path="tickets" element={<TicketListPage />} />
            <Route path="tickets/:id" element={<TicketDetailPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}

export default App
