import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary, OfflineBanner, HealthPage } from '@cn-kis/ui-kit'
import { useNetworkStatus } from '@cn-kis/feishu-sdk'
import { AppLayout } from './layouts/AppLayout'
import { ToastContainer } from './components/ToastContainer'
import { useApiInit } from './hooks/useApiInit'
import DashboardPage from './pages/DashboardPage'
import PlansPage from './pages/PlansPage'
import PlanDetailPage from './pages/PlanDetailPage'
import RegistrationsPage from './pages/RegistrationsPage'
import PreScreeningListPage from './pages/PreScreeningListPage'
import PreScreeningDetailPage from './pages/PreScreeningDetailPage'
import ScreeningPage from './pages/ScreeningPage'
import EnrollmentPage from './pages/EnrollmentPage'
import SubjectsPage from './pages/SubjectsPage'
import SubjectDetailPage from './pages/SubjectDetailPage'
import AppointmentsPage from './pages/AppointmentsPage'
import CheckinPage from './pages/CheckinPage'
import CompliancePage from './pages/CompliancePage'
import PaymentsPage from './pages/PaymentsPage'
import SupportTicketsPage from './pages/SupportTicketsPage'
import QuestionnairePage from './pages/QuestionnairePage'
import LoyaltyPage from './pages/LoyaltyPage'
import ChannelAnalyticsPage from './pages/ChannelAnalyticsPage'

export default function App() {
  useApiInit()
  const { offline } = useNetworkStatus()

  return (
    <ErrorBoundary workstation="recruitment">
      <OfflineBanner visible={offline} />
      <>
        <ToastContainer />
        <BrowserRouter basename="/recruitment">
          <Routes>
            <Route path="/health" element={<HealthPage workstation="recruitment" />} />
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="plans" element={<PlansPage />} />
              <Route path="plans/:id" element={<PlanDetailPage />} />
              <Route path="registrations" element={<RegistrationsPage />} />
              <Route path="pre-screening" element={<PreScreeningListPage />} />
              <Route path="pre-screening/:id" element={<PreScreeningDetailPage />} />
              <Route path="screening" element={<ScreeningPage />} />
              <Route path="enrollment" element={<EnrollmentPage />} />
              <Route path="subjects" element={<SubjectsPage />} />
              <Route path="subjects/:id" element={<SubjectDetailPage />} />
              <Route path="appointments" element={<AppointmentsPage />} />
              <Route path="checkin" element={<CheckinPage />} />
              <Route path="compliance" element={<CompliancePage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="support" element={<SupportTicketsPage />} />
              <Route path="questionnaires" element={<QuestionnairePage />} />
              <Route path="loyalty" element={<LoyaltyPage />} />
              <Route path="channel-analytics" element={<ChannelAnalyticsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </>
    </ErrorBoundary>
  )
}
