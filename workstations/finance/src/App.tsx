import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppLayout } from './layouts/AppLayout'
import { QuoteListPage } from './pages/QuoteListPage'
import { QuoteDetailPage } from './pages/QuoteDetailPage'
import { ContractListPage } from './pages/ContractListPage'
import { ContractDetailPage } from './pages/ContractDetailPage'
import { FinanceDashboardPage } from './pages/FinanceDashboardPage'
import { ProfitAnalysisPage } from './pages/ProfitAnalysisPage'
import { FinanceReportPage } from './pages/FinanceReportPage'
import { PayableListPage } from './pages/PayableListPage'
import { ExpenseListPage } from './pages/ExpenseListPage'
import { BudgetListPage } from './pages/BudgetListPage'
import { BudgetDetailPage } from './pages/BudgetDetailPage'
import { CostListPage } from './pages/CostListPage'
import { SettlementPage } from './pages/SettlementPage'
import { CashFlowPage } from './pages/CashFlowPage'
import { ARAgingPage } from './pages/ARAgingPage'
import { RevenueAnalysisPage } from './pages/RevenueAnalysisPage'
import { CostAnalysisPage } from './pages/CostAnalysisPage'
import { RiskDashboardPage } from './pages/RiskDashboardPage'
import { EfficiencyPage } from './pages/EfficiencyPage'
import { InvoiceManagementNewPage } from './pages/new/InvoiceManagementNewPage'
import StipendPayPage from './pages/StipendPayPage'
import { useApiInit } from './hooks/useApiInit'
import { FinanceHomeRedirect } from './components/FinanceHomeRedirect'

function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="finance">
      <OfflineBanner visible={offline} />
      <Toaster position="top-center" richColors />
      <HashRouter>
        <Routes>
          <Route path="/health" element={<HealthPage workstation="finance" />} />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<FinanceHomeRedirect />} />
            <Route path="dashboard" element={<FinanceDashboardPage />} />
            <Route path="profit-analysis" element={<ProfitAnalysisPage />} />
            <Route path="reports" element={<FinanceReportPage />} />
            <Route path="quotes" element={<QuoteListPage />} />
            <Route path="quotes/:quoteId" element={<QuoteDetailPage />} />
            <Route path="contracts" element={<ContractListPage />} />
            <Route path="contracts/:contractId" element={<ContractDetailPage />} />
            <Route path="invoices" element={<InvoiceManagementNewPage />} />
            <Route path="payables" element={<PayableListPage />} />
            <Route path="expenses" element={<ExpenseListPage />} />
            <Route path="budgets" element={<BudgetListPage />} />
            <Route path="budgets/:budgetId" element={<BudgetDetailPage />} />
            <Route path="costs" element={<CostListPage />} />
            <Route path="settlement" element={<SettlementPage />} />
            <Route path="cashflow" element={<CashFlowPage />} />
            <Route path="ar-aging" element={<ARAgingPage />} />
            <Route path="revenue-analysis" element={<RevenueAnalysisPage />} />
            <Route path="cost-analysis" element={<CostAnalysisPage />} />
            <Route path="risk-dashboard" element={<RiskDashboardPage />} />
            <Route path="efficiency" element={<EfficiencyPage />} />
            <Route path="stipend-pay" element={<StipendPayPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}

export default App
