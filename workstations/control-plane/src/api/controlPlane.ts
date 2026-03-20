import { api } from '@cn-kis/api-client'
import type {
  DashboardSummary,
  ManagedObject,
  ManagementBlueprint,
  ManagementBlueprintCategory,
  ManagementRuntimeCheck,
  ManagementRuntimeStrategySummary,
  ManagementBlueprintResource,
  NetworkSnapshot,
  Ticket,
  UnifiedEvent,
} from '@/types'

interface ManagedObjectApiItem {
  id: string
  asset_code: string
  name: string
  type: string
  subtype: string
  zone: string
  location: string
  owner: string
  status: ManagedObject['status']
  risk_level: ManagedObject['riskLevel']
  last_seen_at: string
  summary: string
  extra?: Record<string, unknown>
}

interface UnifiedEventApiItem {
  id: string
  title: string
  category: string
  severity: UnifiedEvent['severity']
  status: UnifiedEvent['status']
  source_object_id: string
  location: string
  detected_at: string
  owner: string
  summary: string
}

interface TicketApiItem {
  id: string
  title: string
  related_event_id: string
  assignee: string
  status: Ticket['status']
  updated_at: string
}

interface DashboardSummaryApi {
  object_count: number
  open_event_count: number
  processing_ticket_count: number
  high_risk_objects: ManagedObjectApiItem[]
  open_events: UnifiedEventApiItem[]
}

interface ManagementBlueprintResourceApi {
  id: string
  name: string
  asset_code: string
  location: string
  status: string
  risk_level: ManagementBlueprintResource['riskLevel']
}

interface ManagementBlueprintCategoryApi {
  id: string
  name: string
  goal: string
  resource_count: number
  high_risk_count: number
  pending_monitoring_count: number
  frontend_modules: string[]
  backend_capabilities: string[]
  management_mode: string[]
  smart_actions: string[]
  metrics: string[]
  resources: ManagementBlueprintResourceApi[]
}

interface ManagementBlueprintApi {
  vision: {
    title: string
    summary: string
    frontend_value: string[]
    backend_value: string[]
    management_value: string[]
  }
  categories: ManagementBlueprintCategoryApi[]
  runtime: {
    strategy_summary: {
      id: string
      name: string
      count: number
    }[]
    checks: {
      id: string
      title: string
      category: string
      strategy: string
      status: ManagementRuntimeCheck['status']
      location: string
      detail: string
      action_hint: string
    }[]
    last_check_at?: string | null
  }
}

function mapManagedObject(item: ManagedObjectApiItem): ManagedObject {
  return {
    id: item.id,
    assetCode: item.asset_code,
    name: item.name,
    type: item.type,
    subtype: item.subtype,
    zone: item.zone,
    location: item.location,
    owner: item.owner,
    status: item.status,
    riskLevel: item.risk_level,
    lastSeenAt: item.last_seen_at,
    summary: item.summary,
    extra: item.extra,
  }
}

function mapUnifiedEvent(item: UnifiedEventApiItem): UnifiedEvent {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    severity: item.severity,
    status: item.status,
    sourceObjectId: item.source_object_id,
    location: item.location,
    detectedAt: item.detected_at,
    owner: item.owner,
    summary: item.summary,
  }
}

function mapTicket(item: TicketApiItem): Ticket {
  return {
    id: item.id,
    title: item.title,
    relatedEventId: item.related_event_id,
    assignee: item.assignee,
    status: item.status,
    updatedAt: item.updated_at,
  }
}

function mapBlueprintResource(item: ManagementBlueprintResourceApi): ManagementBlueprintResource {
  return {
    id: item.id,
    name: item.name,
    assetCode: item.asset_code,
    location: item.location,
    status: item.status,
    riskLevel: item.risk_level,
  }
}

function mapBlueprintCategory(item: ManagementBlueprintCategoryApi): ManagementBlueprintCategory {
  return {
    id: item.id,
    name: item.name,
    goal: item.goal,
    resourceCount: item.resource_count,
    highRiskCount: item.high_risk_count,
    pendingMonitoringCount: item.pending_monitoring_count,
    frontendModules: item.frontend_modules,
    backendCapabilities: item.backend_capabilities,
    managementMode: item.management_mode,
    smartActions: item.smart_actions,
    metrics: item.metrics,
    resources: item.resources.map(mapBlueprintResource),
  }
}

function mapRuntimeStrategySummary(item: { id: string; name: string; count: number }): ManagementRuntimeStrategySummary {
  return {
    id: item.id,
    name: item.name,
    count: item.count,
  }
}

function mapRuntimeCheck(item: {
  id: string
  title: string
  category: string
  strategy: string
  status: ManagementRuntimeCheck['status']
  location: string
  detail: string
  action_hint: string
}): ManagementRuntimeCheck {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    strategy: item.strategy,
    status: item.status,
    location: item.location,
    detail: item.detail,
    actionHint: item.action_hint,
  }
}

export const controlPlaneApi = {
  async getDashboardSummary(): Promise<DashboardSummary> {
    const response = await api.get<DashboardSummaryApi>('/control-plane/dashboard-summary')
    return {
      objectCount: response.data.object_count,
      openEventCount: response.data.open_event_count,
      processingTicketCount: response.data.processing_ticket_count,
      highRiskObjects: response.data.high_risk_objects.map(mapManagedObject),
      openEvents: response.data.open_events.map(mapUnifiedEvent),
    }
  },

  async getObjects(): Promise<ManagedObject[]> {
    const response = await api.get<{ items: ManagedObjectApiItem[] }>('/control-plane/objects')
    return response.data.items.map(mapManagedObject)
  },

  async getObject(objectId: string): Promise<ManagedObject> {
    const response = await api.get<ManagedObjectApiItem>(`/control-plane/objects/${objectId}`)
    return mapManagedObject(response.data)
  },

  async getObjectEvents(objectId: string): Promise<UnifiedEvent[]> {
    const response = await api.get<{ items: UnifiedEventApiItem[] }>(`/control-plane/objects/${objectId}/events`)
    return response.data.items.map(mapUnifiedEvent)
  },

  async getEvents(): Promise<UnifiedEvent[]> {
    const response = await api.get<{ items: UnifiedEventApiItem[] }>('/control-plane/events')
    return response.data.items.map(mapUnifiedEvent)
  },

  async getEvent(eventId: string): Promise<UnifiedEvent> {
    const response = await api.get<UnifiedEventApiItem>(`/control-plane/events/${eventId}`)
    return mapUnifiedEvent(response.data)
  },

  async getEventTickets(eventId: string): Promise<Ticket[]> {
    const response = await api.get<{ items: TicketApiItem[] }>(`/control-plane/events/${eventId}/tickets`)
    return response.data.items.map(mapTicket)
  },

  async getTickets(): Promise<Ticket[]> {
    const response = await api.get<{ items: TicketApiItem[] }>('/control-plane/tickets')
    return response.data.items.map(mapTicket)
  },

  async getTicket(ticketId: string): Promise<Ticket> {
    const response = await api.get<TicketApiItem>(`/control-plane/tickets/${ticketId}`)
    return mapTicket(response.data)
  },

  async transitionTicket(ticketId: string, status: 'todo' | 'processing' | 'done'): Promise<Ticket> {
    const response = await api.post<{ data: TicketApiItem }>(`/control-plane/tickets/${ticketId}/transition`, { status })
    const payload = response.data as { data?: TicketApiItem }
    return mapTicket(payload.data ?? (response.data as unknown as TicketApiItem))
  },

  async getNetworkSnapshot(): Promise<NetworkSnapshot> {
    const response = await api.get<NetworkSnapshot>('/control-plane/network/snapshot')
    return response.data
  },

  async getManagementBlueprint(): Promise<ManagementBlueprint> {
    const response = await api.get<ManagementBlueprintApi>('/control-plane/management-blueprint')
    return {
      vision: {
        title: response.data.vision.title,
        summary: response.data.vision.summary,
        frontendValue: response.data.vision.frontend_value,
        backendValue: response.data.vision.backend_value,
        managementValue: response.data.vision.management_value,
      },
      categories: response.data.categories.map(mapBlueprintCategory),
      runtime: {
        strategySummary: response.data.runtime.strategy_summary.map(mapRuntimeStrategySummary),
        checks: response.data.runtime.checks.map(mapRuntimeCheck),
        lastCheckAt: response.data.runtime.last_check_at ?? null,
      },
    }
  },

  async refreshRuntimeChecks(): Promise<void> {
    await api.post('/control-plane/refresh-runtime-checks')
  },

  async getResourceHealth(): Promise<ResourceHealthOverview> {
    const response = await api.get<ResourceHealthOverviewApi>('/control-plane/resource-health')
    return {
      collectedAt: response.data.collected_at,
      totalResources: response.data.total_resources,
      healthyCount: response.data.healthy_count,
      problemCount: response.data.problem_count,
      categories: response.data.categories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        total: c.total,
        online: c.online,
        warning: c.warning,
        offline: c.offline,
        other: c.other,
        health: c.health,
        items: c.items,
      })),
    }
  },

  async getDependencyCheck(): Promise<DependencyCheck> {
    const response = await api.get<DependencyCheckApi>('/control-plane/dependency-check')
    return {
      allOk: response.data.all_ok,
      totalChecks: response.data.total_checks,
      okCount: response.data.ok_count,
      errorCount: response.data.error_count,
      missingCount: response.data.missing_count,
      checks: response.data.checks,
      collectedAt: response.data.collected_at,
    }
  },

  async getScenarios(): Promise<ScenarioSummary[]> {
    const response = await api.get<{ items: ScenarioSummaryApi[] }>('/control-plane/scenarios')
    return response.data.items.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status,
      readyCount: s.ready_count,
      totalCount: s.total_count,
      blockedCategoryIds: s.blocked_category_ids || [],
    }))
  },

  async getScenarioDetail(scenarioId: string): Promise<ScenarioDetail> {
    const response = await api.get<ScenarioDetailApi>(`/control-plane/scenarios/${scenarioId}`)
    const d = response.data
    return {
      id: d.id,
      name: d.name,
      description: d.description,
      status: d.status,
      categories: d.categories.map((c) => ({
        id: c.id,
        name: c.name,
        health: c.health,
        total: c.total,
        online: c.online,
        warning: c.warning,
        offline: c.offline,
      })),
      readyCount: d.ready_count,
      totalCount: d.total_count,
    }
  },

  async getScenarioTopology(scenarioId: string): Promise<ScenarioTopology> {
    const response = await api.get<ScenarioTopologyApi>(`/control-plane/scenarios/${scenarioId}/topology`)
    return {
      nodes: response.data.nodes,
      edges: response.data.edges,
    }
  },

  async getObjectDependencies(objectId: string): Promise<ObjectDependencies> {
    const response = await api.get<ObjectDependenciesApi>(`/control-plane/objects/${objectId}/dependencies`)
    return {
      dependsOn: response.data.depends_on || [],
      dependedBy: response.data.depended_by || [],
    }
  },

  async getEventImpact(eventId: string): Promise<EventImpact> {
    const response = await api.get<EventImpactApi>(`/control-plane/events/${eventId}/impact`)
    const d = response.data
    return {
      eventId: d.event_id,
      sourceObjectId: d.source_object_id,
      impactLevel: d.impact_level,
      affectedScenarioIds: d.affected_scenario_ids || [],
      affectedScenarios: (d.affected_scenarios || []).map((s: { id: string; name: string; status: string }) => s),
      dependencyChain: d.dependency_chain || [],
      recommendation: d.recommendation || '',
    }
  },
}

export interface ScenarioSummary {
  id: string
  name: string
  description: string
  status: string
  readyCount: number
  totalCount: number
  blockedCategoryIds: string[]
}

export interface ScenarioDetail {
  id: string
  name: string
  description: string
  status: string
  categories: Array<{ id: string; name: string; health: string; total: number; online: number; warning: number; offline: number }>
  readyCount: number
  totalCount: number
}

export interface ScenarioTopology {
  nodes: Array<{ id: string; label: string; type: string; health?: string }>
  edges: Array<{ from: string; to: string }>
}

export interface ObjectDependencies {
  dependsOn: Array<{ id: string; name: string; status: string }>
  dependedBy: Array<{ id: string; name: string; status: string }>
}

export interface EventImpact {
  eventId: string
  sourceObjectId: string
  impactLevel: string
  affectedScenarioIds: string[]
  affectedScenarios: Array<{ id: string; name: string; status: string }>
  dependencyChain: Array<{ id: string; name: string; status: string }>
  recommendation: string
}

interface ScenarioSummaryApi {
  id: string
  name: string
  description: string
  status: string
  ready_count: number
  total_count: number
  blocked_category_ids?: string[]
}

interface ScenarioDetailApi {
  id: string
  name: string
  description: string
  status: string
  categories: Array<{ id: string; name: string; health: string; total: number; online: number; warning: number; offline: number }>
  ready_count: number
  total_count: number
}

interface ScenarioTopologyApi {
  nodes: Array<{ id: string; label: string; type: string; health?: string }>
  edges: Array<{ from: string; to: string }>
}

interface ObjectDependenciesApi {
  depends_on?: Array<{ id: string; name: string; status: string }>
  depended_by?: Array<{ id: string; name: string; status: string }>
}

interface EventImpactApi {
  event_id: string
  source_object_id: string
  impact_level: string
  affected_scenario_ids?: string[]
  affected_scenarios?: Array<{ id: string; name: string; status: string }>
  dependency_chain?: Array<{ id: string; name: string; status: string }>
  recommendation?: string
}

interface ResourceHealthCategoryApi {
  id: string
  name: string
  icon: string
  total: number
  online: number
  warning: number
  offline: number
  other: number
  health: string
  items: Array<{
    id: string
    name: string
    location: string
    status: string
    type: string
    collected_at: string
    details: Record<string, unknown>
  }>
}

interface ResourceHealthOverviewApi {
  collected_at: string
  total_resources: number
  healthy_count: number
  problem_count: number
  categories: ResourceHealthCategoryApi[]
}

interface DependencyCheckApi {
  all_ok: boolean
  total_checks: number
  ok_count: number
  error_count: number
  missing_count: number
  checks: Array<{ id: string; name: string; required: boolean; status: string; message: string }>
  collected_at: string
}

export interface ResourceHealthCategory {
  id: string
  name: string
  icon: string
  total: number
  online: number
  warning: number
  offline: number
  other: number
  health: string
  items: Array<{
    id: string
    name: string
    location: string
    status: string
    type: string
    collected_at: string
    details: Record<string, unknown>
  }>
}

export interface ResourceHealthOverview {
  collectedAt: string
  totalResources: number
  healthyCount: number
  problemCount: number
  categories: ResourceHealthCategory[]
}

export interface DependencyCheck {
  allOk: boolean
  totalChecks: number
  okCount: number
  errorCount: number
  missingCount: number
  checks: Array<{ id: string; name: string; required: boolean; status: string; message: string }>
  collectedAt: string
}
