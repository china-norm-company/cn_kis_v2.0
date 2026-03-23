import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { UsersPage } from './pages/UsersPage'
import { RolesPage } from './pages/RolesPage'
import { PermissionsPage } from './pages/PermissionsPage'
import { SessionsPage } from './pages/SessionsPage'
import { ActivityPage } from './pages/ActivityPage'
import { FeatureUsagePage } from './pages/FeatureUsagePage'
import { AiUsagePage } from './pages/AiUsagePage'
import { AuditPage } from './pages/AuditPage'
import { WorkstationOverviewPage } from './pages/WorkstationOverviewPage'
import { PilotConfigPage } from './pages/PilotConfigPage'
import { FeishuSyncPage } from './pages/FeishuSyncPage'
import { SystemConfigPage } from './pages/SystemConfigPage'
import { useApiInit } from './hooks/useApiInit'

export default function App() {
  useApiInit()
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/roles" element={<RolesPage />} />
          <Route path="/permissions" element={<PermissionsPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/feature-usage" element={<FeatureUsagePage />} />
          <Route path="/ai-usage" element={<AiUsagePage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/workstations" element={<WorkstationOverviewPage />} />
          <Route path="/pilot-config" element={<PilotConfigPage />} />
          <Route path="/feishu" element={<FeishuSyncPage />} />
          <Route path="/config" element={<SystemConfigPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
