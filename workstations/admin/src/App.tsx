import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { DashboardPage } from './pages/DashboardPage'
import { RolesPage } from './pages/RolesPage'
import { AccountsPage } from './pages/AccountsPage'
import { PermissionsPage } from './pages/PermissionsPage'
import { AuditLogPage } from './pages/AuditLogPage'
import { WorkstationOverviewPage } from './pages/WorkstationOverviewPage'
import { SessionsPage } from './pages/SessionsPage'
import { SystemConfigPage } from './pages/SystemConfigPage'
import { FeishuSyncPage } from './pages/FeishuSyncPage'
import { PilotConfigPage } from './pages/PilotConfigPage'
import { useApiInit } from './hooks/useApiInit'

export default function App() {
  useApiInit()
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/roles" element={<RolesPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/permissions" element={<PermissionsPage />} />
          <Route path="/audit" element={<AuditLogPage />} />
          <Route path="/workstations" element={<WorkstationOverviewPage />} />
          <Route path="/pilot-config" element={<PilotConfigPage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/config" element={<SystemConfigPage />} />
          <Route path="/feishu" element={<FeishuSyncPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
