/**
 * 访视管理（执行台视角）
 *
 * 全局管理所有项目的访视执行：
 * - 执行列表 DataTable（关联排程状态 + 工单完成率）
 * - 窗口期告警面板（红色/橙色标记）
 * - 筛选器：项目/执行人/日期范围/状态
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { visitApi, protocolApi } from '@cn-kis/api-client'
import { DataTable, Badge, Empty, StatCard } from '@cn-kis/ui-kit'
import { Calendar, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

const SLOT_STATUS_LABELS: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' }> = {
  unscheduled: { label: '未排程', color: 'default' },
  planned: { label: '已排程', color: 'default' },
  confirmed: { label: '已确认', color: 'primary' },
  completed: { label: '已完成', color: 'success' },
  cancelled: { label: '已取消', color: 'default' },
  conflict: { label: '冲突', color: 'error' },
}

const ALERT_SEVERITY_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  overdue: { label: '已超窗', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-300' },
  critical: { label: '即将超窗', color: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-300' },
  warning: { label: '窗口期预警', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-300' },
}

interface VisitExecutionItem {
  id: number
  plan_id: number
  protocol_id: number | null
  protocol_title: string
  name: string
  code: string
  baseline_day: number
  window_before: number
  window_after: number
  order: number
  slot_status: string
  slot_date: string | null
  workorder_total: number
  workorder_completed: number
  completion_rate: number
}

interface WindowAlert {
  slot_id: number
  visit_node_id: number
  visit_node_name: string
  plan_name: string
  scheduled_date: string
  window_start: string
  window_end: string
  days_remaining: number
  severity: 'overdue' | 'critical' | 'warning'
  status: string
}

export default function VisitPage() {
  const [activeTab, setActiveTab] = useState<'list' | 'alerts'>('list')
  const [filterProtocol, setFilterProtocol] = useState<string>('')
  const [page, setPage] = useState(1)

  // Execution list
  const { data: execRes, isLoading } = useQuery({
    queryKey: ['visit', 'execution-list', filterProtocol, page],
    queryFn: () => visitApi.executionList({
      protocol_id: filterProtocol ? Number(filterProtocol) : undefined,
      page,
      page_size: 20,
    }),
    refetchInterval: 30_000,
  })

  // Window alerts
  const { data: alertsRes } = useQuery({
    queryKey: ['visit', 'window-alerts'],
    queryFn: () => visitApi.windowAlerts(),
    refetchInterval: 60_000,
  })

  // Protocol list for filter
  const { data: protocolsRes } = useQuery({
    queryKey: ['protocol', 'list-for-filter'],
    queryFn: () => protocolApi.list({ page: 1, page_size: 100 }),
  })

  const execItems = ((execRes?.data as any)?.items ?? []) as VisitExecutionItem[]
  const totalExec = (execRes?.data as any)?.total ?? 0
  const alerts = ((alertsRes?.data as any)?.items ?? []) as WindowAlert[]
  const protocols = (protocolsRes?.data as any)?.items ?? []

  // Stats
  const overdueCount = alerts.filter(a => a.severity === 'overdue').length
  const criticalCount = alerts.filter(a => a.severity === 'critical').length
  const completedCount = execItems.filter(i => i.slot_status === 'completed').length

  const columns = [
    { key: 'name', header: '访视节点', render: (r: VisitExecutionItem) => (
      <div>
        <span className="font-medium text-slate-800">{r.name}</span>
        {r.code && <span className="text-xs text-slate-400 ml-1">({r.code})</span>}
      </div>
    )},
    { key: 'protocol_title', header: '项目', render: (r: VisitExecutionItem) => (
      <span className="text-sm text-slate-600 truncate max-w-[180px] block">{r.protocol_title || '-'}</span>
    )},
    { key: 'baseline_day', header: '基准天', render: (r: VisitExecutionItem) => `Day ${r.baseline_day}` },
    { key: 'window', header: '窗口期', render: (r: VisitExecutionItem) => (
      <span className="text-xs text-slate-500">-{r.window_before} / +{r.window_after} 天</span>
    )},
    { key: 'slot_date', header: '排程日期', render: (r: VisitExecutionItem) => r.slot_date || '-' },
    { key: 'slot_status', header: '排程状态', render: (r: VisitExecutionItem) => {
      const info = SLOT_STATUS_LABELS[r.slot_status] || { label: r.slot_status, color: 'default' as const }
      return <Badge variant={info.color}>{info.label}</Badge>
    }},
    { key: 'completion', header: '工单完成', render: (r: VisitExecutionItem) => (
      <div className="flex items-center gap-2">
        <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${r.completion_rate >= 100 ? 'bg-green-400' : r.completion_rate > 0 ? 'bg-blue-400' : 'bg-slate-200'}`}
            style={{ width: `${Math.min(100, r.completion_rate)}%` }}
          />
        </div>
        <span className="text-xs text-slate-500">{r.workorder_completed}/{r.workorder_total}</span>
      </div>
    )},
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">访视管理</h2>
        <p className="text-sm text-slate-500 mt-1">全局管理所有项目的访视执行进度</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard label="总访视节点" value={totalExec} icon={<Calendar className="w-5 h-5" />} color="blue" />
        <StatCard label="已完成" value={completedCount} icon={<CheckCircle className="w-5 h-5" />} color="green" />
        <StatCard label="已超窗" value={overdueCount} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
        <StatCard label="即将超窗" value={criticalCount} icon={<Clock className="w-5 h-5" />} color="amber" />
      </div>

      {/* Tab Switch */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('list')}
          className={`shrink-0 min-h-11 px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'list' ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          执行列表
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`shrink-0 min-h-11 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 ${activeTab === 'alerts' ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          窗口期告警
          {alerts.length > 0 && (
            <span className={`inline-flex items-center justify-center w-5 h-5 text-[10px] rounded-full ${activeTab === 'alerts' ? 'bg-white text-primary-600' : 'bg-red-500 text-white'}`}>
              {alerts.length}
            </span>
          )}
        </button>
      </div>

      {/* List Tab */}
      {activeTab === 'list' && (
        <>
          <div className="flex items-center gap-3 overflow-x-auto pb-1">
            <select
              className="shrink-0 min-h-11 text-sm border border-slate-200 rounded-lg px-3 py-2"
              value={filterProtocol}
              onChange={e => { setFilterProtocol(e.target.value); setPage(1) }}
              title="项目筛选"
            >
              <option value="">全部项目</option>
              {protocols.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>

          <div className="bg-white rounded-xl border border-slate-200">
            {isLoading ? (
              <div className="p-12 text-center text-slate-400">加载中...</div>
            ) : execItems.length === 0 ? (
              <div className="p-12"><Empty message="暂无访视执行数据" /></div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <div className="min-w-[980px]">
                    <DataTable columns={columns} data={execItems} />
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-6 py-3 border-t border-slate-100">
                  <span className="text-xs text-slate-500">共 {totalExec} 条</span>
                  <div className="flex gap-2">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="min-h-10 px-3 py-1 text-sm rounded border border-slate-200 disabled:opacity-50">上一页</button>
                    <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(totalExec / 20)} className="min-h-10 px-3 py-1 text-sm rounded border border-slate-200 disabled:opacity-50">下一页</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12"><Empty message="当前无窗口期告警" /></div>
          ) : (
            alerts.map(alert => {
              const config = ALERT_SEVERITY_CONFIG[alert.severity]
              return (
                <div key={alert.slot_id} className={`${config.bgColor} rounded-lg border ${config.borderColor} p-4`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertTriangle className={`w-4 h-4 ${config.color}`} />
                      <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
                      <span className="text-sm font-medium text-slate-800">{alert.visit_node_name}</span>
                    </div>
                    <Badge variant={alert.severity === 'overdue' ? 'error' : 'warning'}>
                      {alert.days_remaining < 0 ? `超出 ${Math.abs(alert.days_remaining)} 天` : `剩余 ${alert.days_remaining} 天`}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span>排程: {alert.plan_name}</span>
                    <span>排程日期: {alert.scheduled_date}</span>
                    <span>窗口: {alert.window_start} ~ {alert.window_end}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
