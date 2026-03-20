import { ErrorBoundary } from '@cn-kis/ui-kit'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { getStoredWorkspacePath } from '@/constants/workspace'
import { AppLayout } from '@/layouts/AppLayout'
import { AgentsCenterPage } from '@/pages/AgentsCenterPage'
import { AuditAndChangePage } from '@/pages/AuditAndChangePage'
import { DashboardPage } from '@/pages/DashboardPage'
import { DependenciesPage } from '@/pages/DependenciesPage'
import { EventDetailPage } from '@/pages/EventDetailPage'
import { EventsPage } from '@/pages/EventsPage'
import { ManagementBlueprintPage } from '@/pages/ManagementBlueprintPage'
import { NetworkPage } from '@/pages/NetworkPage'
import { ObjectDetailPage } from '@/pages/ObjectDetailPage'
import { ObjectsPage } from '@/pages/ObjectsPage'
import { ResourceHealthPage } from '@/pages/ResourceHealthPage'
import { ScenarioDetailPage } from '@/pages/ScenarioDetailPage'
import { ScenariosPage } from '@/pages/ScenariosPage'
import { StandardsPage } from '@/pages/StandardsPage'
import { TicketDetailPage } from '@/pages/TicketDetailPage'
import { TicketsPage } from '@/pages/TicketsPage'
import { TodayOperationsPage } from '@/pages/TodayOperationsPage'
import { DevTokenInjectPage } from '@/pages/DevTokenInjectPage'

export default function App() {
  return (
    <ErrorBoundary workstation="control-plane">
      <HashRouter>
        <Routes>
          <Route path="/dev-inject-token" element={<DevTokenInjectPage />} />
          <Route element={<AppLayout />}>
            <Route index element={<Navigate to={getStoredWorkspacePath()} replace />} />
            <Route
              path="/dashboard"
              element={(
                <PermissionGuard permission="control.dashboard.read">
                  <DashboardPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/objects"
              element={(
                <PermissionGuard permission="control.object.read">
                  <ObjectsPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/objects/:objectId"
              element={(
                <PermissionGuard permission="control.object.read">
                  <ObjectDetailPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/events"
              element={(
                <PermissionGuard permission="control.event.read">
                  <EventsPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/events/:eventId"
              element={(
                <PermissionGuard permission="control.event.read">
                  <EventDetailPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/resource-health"
              element={(
                <PermissionGuard permission="control.dashboard.read">
                  <ResourceHealthPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/today-ops"
              element={(
                <PermissionGuard permission="control.dashboard.read">
                  <TodayOperationsPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/scenarios"
              element={(
                <PermissionGuard permission="control.dashboard.read">
                  <ScenariosPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/scenarios/:sceneId"
              element={(
                <PermissionGuard permission="control.dashboard.read">
                  <ScenarioDetailPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/dependencies"
              element={(
                <PermissionGuard permission="control.dashboard.read">
                  <DependenciesPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/audit"
              element={(
                <PermissionGuard permission="control.dashboard.read">
                  <AuditAndChangePage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/agents"
              element={(
                <PermissionGuard permission="control.dashboard.read">
                  <AgentsCenterPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/standards"
              element={(
                <PermissionGuard permission="control.dashboard.read">
                  <StandardsPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/blueprint"
              element={(
                <PermissionGuard permission="control.dashboard.read">
                  <ManagementBlueprintPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/network"
              element={(
                <PermissionGuard permission="control.network.read">
                  <NetworkPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/tickets"
              element={(
                <PermissionGuard permission="control.ticket.read">
                  <TicketsPage />
                </PermissionGuard>
              )}
            />
            <Route
              path="/tickets/:ticketId"
              element={(
                <PermissionGuard permission="control.ticket.read">
                  <TicketDetailPage />
                </PermissionGuard>
              )}
            />
          </Route>
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}
