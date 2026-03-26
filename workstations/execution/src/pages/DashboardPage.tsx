/**
 * 执行仪表盘 — 角色路由器（S5-1）
 *
 * 根据当前用户角色渲染不同的Dashboard：
 * - CRC主管 → 多项目交付指挥中心
 * - CRC协调员 → 我的项目工作台
 * - 排程专员 → 资源调度中心
 * - 其他角色 → 默认执行仪表盘
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useFeishuContext } from '@cn-kis/feishu-sdk'
import { workorderApi, protocolApi, notificationApi, resourceApi } from '@cn-kis/api-client'
import type { WorkOrder, AlertDashboard, ResourceStatusOverview } from '@cn-kis/api-client'
import { StatCard, Badge, Empty } from '@cn-kis/ui-kit'
import {
  ClipboardList, FlaskConical, AlertTriangle, CheckCircle,
  Users, Wrench, Package, FileText, Thermometer,
  Bell, ShieldAlert,
} from 'lucide-react'
import CRCSupervisorDashboard from './dashboards/CRCSupervisorDashboard'
import CRCDashboard from './dashboards/CRCDashboard'
import SchedulerDashboard from './dashboards/SchedulerDashboard'

const STATUS_LABELS: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' }> = {
  pending: { label: '待处理', color: 'default' },
  assigned: { label: '已分配', color: 'primary' },
  in_progress: { label: '进行中', color: 'warning' },
  completed: { label: '已完成', color: 'success' },
  review: { label: '待审核', color: 'warning' },
  approved: { label: '已批准', color: 'success' },
  rejected: { label: '已拒绝', color: 'error' },
  cancelled: { label: '已取消', color: 'default' },
}

const ALERT_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; route: string }> = {
  equipment_calibration: { label: '设备校准', icon: <Wrench className="w-4 h-4" />, route: '/scheduling' },
  material_expiry: { label: '材料过期', icon: <Package className="w-4 h-4" />, route: '/scheduling' },
  personnel_gcp: { label: '人员GCP', icon: <Users className="w-4 h-4" />, route: '/scheduling' },
  workorder_overdue: { label: '工单逾期', icon: <ClipboardList className="w-4 h-4" />, route: '/workorders' },
  visit_window: { label: '窗口超期', icon: <AlertTriangle className="w-4 h-4" />, route: '/visits' },
}

const DIMENSION_CONFIG = [
  { key: 'personnel', label: '人', icon: <Users className="w-5 h-5" />, color: 'blue' },
  { key: 'equipment', label: '机', icon: <Wrench className="w-5 h-5" />, color: 'green' },
  { key: 'material', label: '料', icon: <Package className="w-5 h-5" />, color: 'amber' },
  { key: 'method', label: '法', icon: <FileText className="w-5 h-5" />, color: 'purple' },
  { key: 'environment', label: '环', icon: <Thermometer className="w-5 h-5" />, color: 'teal' },
] as const

function isOverdue(wo: WorkOrder): boolean {
  if (!wo.due_date) return false
  if (['completed', 'approved', 'cancelled'].includes(wo.status)) return false
  return new Date(wo.due_date) < new Date()
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { hasRole } = useFeishuContext()

  // 不再对 receptionist 做自动跳转：用户点击维周执行台时应留在执行台，接待台由和序·接待台入口进入
  if (hasRole('crc_supervisor')) return <CRCSupervisorDashboard />
  if (hasRole('crc')) return <CRCDashboard />
  if (hasRole('scheduler')) return <SchedulerDashboard />

  return <DefaultDashboard />
}

/**
 * 默认执行仪表盘（保留原有功能，供 technician 等角色使用）
 */
function DefaultDashboard() {
  const navigate = useNavigate()

  const { data: myTodayRes, isLoading: todayLoading } = useQuery({
    queryKey: ['workorder', 'my-today'],
    queryFn: () => workorderApi.myToday(),
    refetchInterval: 60_000,
  })

  const { data: statsRes } = useQuery({
    queryKey: ['workorder', 'stats'],
    queryFn: () => workorderApi.stats({}),
    refetchInterval: 60_000,
  })

  const { data: protocolsRes } = useQuery({
    queryKey: ['protocol', 'list-active'],
    queryFn: () => protocolApi.list({ status: 'active', page: 1, page_size: 10 }),
  })

  const { data: alertsRes } = useQuery({
    queryKey: ['notification', 'alerts-dashboard'],
    queryFn: () => notificationApi.alertsDashboard(),
    refetchInterval: 120_000,
  })

  const { data: statusRes } = useQuery({
    queryKey: ['resource', 'status-overview'],
    queryFn: () => resourceApi.statusOverview(),
    refetchInterval: 120_000,
  })

  const todayOrders = (myTodayRes?.data ?? []) as WorkOrder[]
  const stats = statsRes?.data
  const protocols = protocolsRes?.data
  const alertData = alertsRes?.data as AlertDashboard | undefined
  const statusData = statusRes?.data as ResourceStatusOverview | undefined

  const pendingCount = (stats?.pending ?? 0) + (stats?.assigned ?? 0)
  const inProgressCount = stats?.in_progress ?? 0
  const overdueOrders = todayOrders.filter(isOverdue)
  const totalAlerts = alertData?.total_count ?? 0

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">执行仪表盘</h2>
        <p className="text-sm text-slate-500 mt-1">全局项目执行状态概览</p>
      </div>

      {/* KPI 卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 md:gap-4">
        <StatCard
          label="活跃项目"
          value={protocols?.total ?? 0}
          icon={<FlaskConical className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          label="进行中工单"
          value={inProgressCount}
          icon={<ClipboardList className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          label="待处理工单"
          value={pendingCount}
          icon={<ClipboardList className="w-5 h-5" />}
          color="amber"
        />
        <StatCard
          label="逾期预警"
          value={overdueOrders.length}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="red"
        />
        <StatCard
          label="总预警数"
          value={totalAlerts}
          icon={<Bell className="w-5 h-5" />}
          color="red"
        />
      </div>

      {/* 预警中心 + 人机料法环概览 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 预警中心 */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            <h3 className="text-base font-semibold text-slate-700">预警中心</h3>
            {totalAlerts > 0 && (
              <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                {totalAlerts} 项预警
              </span>
            )}
          </div>
          {totalAlerts === 0 ? (
            <Empty message="暂无预警" />
          ) : (
            <div className="space-y-3">
              {Object.entries(ALERT_TYPE_LABELS).map(([key, config]) => {
                const items = (alertData as any)?.[key] ?? []
                if (items.length === 0) return null
                return (
                  <div
                    key={key}
                    onClick={() => navigate(config.route)}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {config.icon}
                      <span className="text-sm font-medium text-slate-700">{config.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-red-600">{items.length}</span>
                      <Badge variant={items.some((i: any) => i.severity === 'urgent') ? 'error' : 'warning'}>
                        {items.some((i: any) => i.severity === 'urgent') ? '紧急' : '注意'}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 人机料法环概览 */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-700 mb-4">人机料法环概览</h3>
          <div className="space-y-3">
            {DIMENSION_CONFIG.map(dim => {
              const data = statusData ? (statusData as any)[dim.key] : null
              const hasWarning = dim.key === 'personnel' ? (data?.gcp_expiring ?? 0) > 0
                : dim.key === 'equipment' ? (data?.calibration_expiring ?? 0) > 0
                : dim.key === 'material' ? (data?.expiring_soon ?? 0) > 0
                : dim.key === 'method' ? (data?.under_review ?? 0) > 0
                : (data?.non_compliant ?? 0) > 0

              const mainValue = dim.key === 'personnel' ? data?.total ?? 0
                : dim.key === 'equipment' ? data?.active ?? 0
                : dim.key === 'material' ? data?.in_stock ?? 0
                : dim.key === 'method' ? data?.effective ?? 0
                : `${data?.recent_compliance_rate ?? 100}%`

              const warningText = dim.key === 'personnel' ? `${data?.gcp_expiring ?? 0} 证书到期`
                : dim.key === 'equipment' ? `${data?.calibration_expiring ?? 0} 校准到期`
                : dim.key === 'material' ? `${data?.expiring_soon ?? 0} 即将过期`
                : dim.key === 'method' ? `${data?.under_review ?? 0} 待审核`
                : `${data?.non_compliant ?? 0} 不合规`

              return (
                <div key={dim.key} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${dim.color}-100 text-${dim.color}-600`}>
                    {dim.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-700">{dim.label}</div>
                    <div className="text-lg font-bold text-slate-800">{mainValue}</div>
                  </div>
                  {hasWarning && (
                    <Badge variant="warning">{warningText}</Badge>
                  )}
                  {!hasWarning && (
                    <Badge variant="success">正常</Badge>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 我的今日工单 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-700">我的今日工单</h3>
          <button
            onClick={() => navigate('/workorders')}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            查看全部
          </button>
        </div>

        {todayLoading ? (
          <p className="text-sm text-slate-400">加载中...</p>
        ) : todayOrders.length === 0 ? (
          <Empty message="今日暂无分配的工单" />
        ) : (
          <div className="space-y-3">
            {todayOrders.map((wo) => {
              const overdue = isOverdue(wo)
              const statusInfo = STATUS_LABELS[wo.status] || { label: wo.status, color: 'default' as const }
              return (
                <div
                  key={wo.id}
                  onClick={() => navigate(`/workorders/${wo.id}`)}
                  className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors hover:bg-slate-50 ${
                    overdue ? 'border-red-300 bg-red-50/50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-800 truncate">
                        {wo.title}
                      </span>
                      <Badge variant={statusInfo.color}>{statusInfo.label}</Badge>
                      {overdue && <Badge variant="error">逾期</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      {wo.protocol_title && <span>项目: {wo.protocol_title}</span>}
                      {wo.subject_name && <span>受试者: {wo.subject_name}</span>}
                      {wo.visit_node_name && <span>访视: {wo.visit_node_name}</span>}
                      {wo.activity_name && <span>活动: {wo.activity_name}</span>}
                    </div>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <div className="text-xs text-slate-400">
                      {wo.scheduled_date || wo.create_time?.split('T')[0]}
                    </div>
                    {wo.work_order_type && (
                      <div className="text-xs text-slate-400 mt-1">{wo.work_order_type}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 项目进度 + 工单概况 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-700 mb-4">项目执行进度</h3>
          {protocols?.items && protocols.items.length > 0 ? (
            <div className="space-y-3">
              {protocols.items.map((p: any) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}/execution`)}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <span className="text-sm text-slate-600 truncate flex-1">{p.title}</span>
                  <span className="text-xs text-slate-400 ml-2">
                    {p.sample_size ? `目标 ${p.sample_size}` : '进行中'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty message="暂无活跃项目" />
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-700 mb-4">工单概况</h3>
          {stats ? (
            <div className="space-y-2">
              {Object.entries(STATUS_LABELS).map(([key, info]) => {
                const count = (stats as any)[key] ?? 0
                if (count === 0) return null
                return (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{info.label}</span>
                    <span className="font-medium text-slate-800">{count}</span>
                  </div>
                )
              })}
              <div className="border-t pt-2 mt-2 flex items-center justify-between text-sm font-semibold">
                <span className="text-slate-700">总计</span>
                <span className="text-slate-800">{stats.total ?? 0}</span>
              </div>
            </div>
          ) : (
            <Empty message="暂无统计数据" />
          )}
        </div>
      </div>
    </div>
  )
}
