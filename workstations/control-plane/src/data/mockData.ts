import type { ManagedObject, Ticket, UnifiedEvent } from '@/types'

export const managedObjects: ManagedObject[] = [
  {
    id: 'obj-core-sw-01',
    assetCode: 'NET-CORE-001',
    name: '核心交换机 01',
    type: 'network_device',
    subtype: 'core_switch',
    zone: '管理域',
    location: '机房 A',
    owner: '网络组',
    status: 'active',
    riskLevel: 'medium',
    lastSeenAt: '2026-03-10 09:18',
    summary: '主干链路稳定，接口利用率处于可控范围。',
  },
  {
    id: 'obj-vm-app-01',
    assetCode: 'CMP-VM-012',
    name: '应用虚拟机 01',
    type: 'compute_node',
    subtype: 'vm_instance',
    zone: '平台服务域',
    location: '虚拟化集群',
    owner: '平台组',
    status: 'warning',
    riskLevel: 'high',
    lastSeenAt: '2026-03-10 09:12',
    summary: 'CPU 峰值升高，近 1 小时出现服务抖动。',
  },
  {
    id: 'obj-nas-01',
    assetCode: 'STO-NAS-001',
    name: 'NAS 存储节点',
    type: 'storage_node',
    subtype: 'nas_node',
    zone: '平台服务域',
    location: '机房 A',
    owner: '平台组',
    status: 'warning',
    riskLevel: 'high',
    lastSeenAt: '2026-03-10 09:15',
    summary: '容量使用率已接近预警阈值。',
  },
  {
    id: 'obj-room-eh-01',
    assetCode: 'FAC-ROOM-021',
    name: '功效评估室 1',
    type: 'facility',
    subtype: 'controlled_room',
    zone: '实验执行域',
    location: '3F A 区',
    owner: '设施组',
    status: 'active',
    riskLevel: 'medium',
    lastSeenAt: '2026-03-10 09:16',
    summary: '温湿度稳定，环境记录连续。',
  },
  {
    id: 'obj-edge-collector-01',
    assetCode: 'EDG-COL-003',
    name: '仪器采集主机 03',
    type: 'endpoint',
    subtype: 'edge_collector_host',
    zone: '仪器采集域',
    location: '功效评估室 1',
    owner: '仪器组',
    status: 'offline',
    riskLevel: 'high',
    lastSeenAt: '2026-03-10 08:42',
    summary: '最近一次采集上报已中断，需人工确认主机与 Agent 状态。',
  },
]

export const unifiedEvents: UnifiedEvent[] = [
  {
    id: 'evt-20260310-001',
    title: '仪器采集主机离线',
    category: 'data_ingest',
    severity: 'critical',
    status: 'investigating',
    sourceObjectId: 'obj-edge-collector-01',
    location: '功效评估室 1',
    detectedAt: '2026-03-10 08:44',
    owner: '仪器组',
    summary: '连续 20 分钟未收到心跳，已影响仪器数据采集链路。',
  },
  {
    id: 'evt-20260310-002',
    title: '应用虚拟机 CPU 超阈值',
    category: 'performance',
    severity: 'high',
    status: 'new',
    sourceObjectId: 'obj-vm-app-01',
    location: '虚拟化集群',
    detectedAt: '2026-03-10 09:03',
    owner: '平台组',
    summary: 'CPU 使用率在 15 分钟内持续高于 85%。',
  },
  {
    id: 'evt-20260310-003',
    title: 'NAS 容量预警',
    category: 'capacity',
    severity: 'high',
    status: 'new',
    sourceObjectId: 'obj-nas-01',
    location: '机房 A',
    detectedAt: '2026-03-10 09:05',
    owner: '平台组',
    summary: '可用空间低于 20%，建议清理归档或扩容。',
  },
]

export const tickets: Ticket[] = [
  {
    id: 'ticket-001',
    title: '排查采集主机 03 离线原因',
    relatedEventId: 'evt-20260310-001',
    assignee: '张工',
    status: 'processing',
    updatedAt: '2026-03-10 08:58',
  },
  {
    id: 'ticket-002',
    title: '评估应用虚拟机负载与扩容方案',
    relatedEventId: 'evt-20260310-002',
    assignee: '李工',
    status: 'todo',
    updatedAt: '2026-03-10 09:07',
  },
]

export function getObjectById(objectId: string) {
  return managedObjects.find((item) => item.id === objectId)
}

export function getEventById(eventId: string) {
  return unifiedEvents.find((item) => item.id === eventId)
}

export function getTicketsByEventId(eventId: string) {
  return tickets.filter((item) => item.relatedEventId === eventId)
}

export function getEventsByObjectId(objectId: string) {
  return unifiedEvents.filter((item) => item.sourceObjectId === objectId)
}
