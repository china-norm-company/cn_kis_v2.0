export type ManagedObjectStatus = 'active' | 'warning' | 'offline'

export type EventSeverity = 'info' | 'medium' | 'high' | 'critical'

export type EventStatus = 'new' | 'investigating' | 'resolved'

export type TicketStatus = 'todo' | 'processing' | 'done'

export interface ManagedObject {
  id: string
  assetCode: string
  name: string
  type: string
  subtype: string
  zone: string
  location: string
  owner: string
  status: ManagedObjectStatus
  riskLevel: 'low' | 'medium' | 'high'
  lastSeenAt: string
  summary: string
  extra?: Record<string, unknown>
}

export interface UnifiedEvent {
  id: string
  title: string
  category: string
  severity: EventSeverity
  status: EventStatus
  sourceObjectId: string
  location: string
  detectedAt: string
  owner: string
  summary: string
}

export interface Ticket {
  id: string
  title: string
  relatedEventId: string
  assignee: string
  status: TicketStatus
  updatedAt: string
}

export interface DashboardSummary {
  objectCount: number
  openEventCount: number
  processingTicketCount: number
  highRiskObjects: ManagedObject[]
  openEvents: UnifiedEvent[]
}

export interface ManagementBlueprintResource {
  id: string
  name: string
  assetCode: string
  location: string
  status: string
  riskLevel: 'low' | 'medium' | 'high'
}

export interface ManagementBlueprintCategory {
  id: string
  name: string
  goal: string
  resourceCount: number
  highRiskCount: number
  pendingMonitoringCount: number
  frontendModules: string[]
  backendCapabilities: string[]
  managementMode: string[]
  smartActions: string[]
  metrics: string[]
  resources: ManagementBlueprintResource[]
}

export interface ManagementRuntimeStrategySummary {
  id: string
  name: string
  count: number
}

export interface ManagementRuntimeCheck {
  id: string
  title: string
  category: string
  strategy: string
  status: 'healthy' | 'warning' | 'error'
  location: string
  detail: string
  actionHint: string
}

export interface ManagementBlueprint {
  vision: {
    title: string
    summary: string
    frontendValue: string[]
    backendValue: string[]
    managementValue: string[]
  }
  categories: ManagementBlueprintCategory[]
  runtime: {
    strategySummary: ManagementRuntimeStrategySummary[]
    checks: ManagementRuntimeCheck[]
    lastCheckAt?: string | null
  }
}

export interface NetworkInterface {
  name: string
  short_name: string
  phy_status: string
  protocol_status: string
  in_utilization: number
  out_utilization: number
  in_errors: number
  out_errors: number
  description: string
}

export interface NetworkSnapshot {
  core_switch: {
    host: string
    model: string
    software_version: string
    uptime: string
    stack_members: { slot: number; role: string; mac: string; priority: number; device_type: string }[]
    cpu: { current_percent: number; max_percent: number; five_seconds: number; one_minute: number; five_minutes: number }
    memory: { total_bytes: number; used_bytes: number; used_percent: number }
    temperature: { slot: number; status: string; celsius: number }[]
    power: { slot: number; id: string; online: boolean; mode: string; state: string; watts: number }[]
  }
  interfaces: {
    total: number
    up: number
    down: number
    hot_links: { name: string; in: number; out: number }[]
    details: NetworkInterface[]
  }
  vlans: { vlan_id: number; name: string; status: string }[]
  arp: {
    summary: { total: number; dynamic: number; static: number; interface: number }
    by_vlan: Record<string, { total: number; active: number; incomplete: number }>
  }
  routing: {
    total_routes: number
    default_gateway: string
    routes: { destination: string; protocol: string; preference: number; cost: number; nexthop: string; interface: string }[]
  }
  lldp_neighbors: { local_interface: string; neighbor_device: string; neighbor_interface: string; expire_seconds: number }[]
  discovered_devices: { name: string; type: string; connected_via: string[]; neighbor_ports: string[]; link_count: number }[]
  firewall: { host: string; model: string; management_url: string; vrrp_vip: string; connected_via: string }
  wireless_controller: { model: string; connected_via: string }
}
