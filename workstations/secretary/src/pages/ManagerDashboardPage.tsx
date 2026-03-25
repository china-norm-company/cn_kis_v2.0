import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, StatCard, Badge, Button } from '@cn-kis/ui-kit'
import { api, assistantGovernanceApi } from '@cn-kis/api-client'
import { FolderOpen, Play, CheckCircle, ClipboardList, AlertTriangle } from 'lucide-react'

interface ProjectItem {
  id: number
  title: string
  status: string
  progress?: number
  workorder_count?: number
  deviation_count?: number
}

interface ManagerOverviewResponse {
  projects: ProjectItem[]
  summary: {
    total_projects?: number
    active_projects?: number
    completion_rate?: number
  }
  route_governance_preset_coverage?: {
    total_accounts: number
    enabled_accounts: number
    coverage_rate: number
    approval_modes: {
      graded: number
      direct: number
    }
  }
  route_governance_preset_trend?: {
    window_days: number
    applied_window?: number
    applied_7d: number
    applied_30d: number
    daily_window?: Array<{ date: string; applied: number }>
    daily_30d?: Array<{ date: string; applied: number }>
  }
  route_governance_preset_alert?: {
    enabled: boolean
    level: 'healthy' | 'warning' | 'critical'
    message: string
    thresholds?: {
      coverage_rate_min: number
      applied_7d_min: number
    }
  }
  route_governance_threshold_change_timeline?: {
    window_days: number
    limit?: number
    items: Array<{
      at: string
      operator_id: number
      operator_name: string
      description: string
      changed_fields: string[]
      old_value: Record<string, unknown>
      new_value: Record<string, unknown>
    }>
  }
  route_governance_threshold_change_summary?: {
    window_days: number
    total_changes: number
    operators_count: number
    top_changed_fields: Array<{ field: string; count: number }>
  }
}

interface FallbackMetricsResponse {
  summary: {
    total_calls: number
    fallback_success: number
    fallback_failed: number
    fallback_rate: number
    success_rate: number
  }
  by_agent: Array<{
    agent_id: string
    fallback_success: number
    fallback_failed: number
    fallback_rate: number
  }>
  error_types: Array<{
    type: string
    count: number
  }>
}

const STATUS_LABELS: Record<string, string> = {
  active: '进行中',
  completed: '已完成',
  pending: '待启动',
  on_hold: '暂停',
}

export function ManagerDashboardPage() {
  const [trendDays, setTrendDays] = useState(30)
  const [timelineDays, setTimelineDays] = useState(30)
  const [timelineLimit, setTimelineLimit] = useState(20)
  const [timelineOperator, setTimelineOperator] = useState('all')
  const [timelineField, setTimelineField] = useState('all')
  const [copyingKey, setCopyingKey] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'manager-overview', trendDays, timelineDays, timelineLimit],
    queryFn: () =>
      assistantGovernanceApi.getManagerOverview({
        preset_trend_days: trendDays,
        threshold_timeline_days: timelineDays,
        threshold_timeline_limit: timelineLimit,
      }),
  })
  const { data: fallbackRes, isLoading: fallbackLoading } = useQuery({
    queryKey: ['agent-fallback-metrics'],
    queryFn: () => api.get<FallbackMetricsResponse>('/agents/fallback/metrics', { params: { days: 7 } }),
  })

  const overview = data?.data as unknown as ManagerOverviewResponse | undefined
  const projects = overview?.projects ?? []
  const summary = overview?.summary ?? {}
  const routeCoverage = overview?.route_governance_preset_coverage
  const routeTrend = overview?.route_governance_preset_trend
  const routeAlert = overview?.route_governance_preset_alert
  const routeThresholds = routeAlert?.thresholds || { coverage_rate_min: 0.5, applied_7d_min: 1 }
  const thresholdTimeline = overview?.route_governance_threshold_change_timeline
  const thresholdSummary = overview?.route_governance_threshold_change_summary
  const thresholdTimelineItems = thresholdTimeline?.items || []

  const timelineOperators = useMemo(() => {
    const names = new Set<string>()
    thresholdTimelineItems.forEach((item) => {
      if (item.operator_name) names.add(item.operator_name)
      else names.add(`账号#${item.operator_id}`)
    })
    return Array.from(names)
  }, [thresholdTimelineItems])

  const timelineFields = useMemo(() => {
    const fields = new Set<string>()
    thresholdTimelineItems.forEach((item) => {
      ;(item.changed_fields || []).forEach((f) => fields.add(f))
    })
    return Array.from(fields)
  }, [thresholdTimelineItems])

  const filteredTimelineItems = useMemo(() => {
    return thresholdTimelineItems.filter((item) => {
      const operatorLabel = item.operator_name || `账号#${item.operator_id}`
      if (timelineOperator !== 'all' && operatorLabel !== timelineOperator) return false
      if (timelineField !== 'all' && !(item.changed_fields || []).includes(timelineField)) return false
      return true
    })
  }, [thresholdTimelineItems, timelineOperator, timelineField])

  const formatDiffValue = (value: unknown) => {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(3)
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  }

  const buildDiffSummary = (item: {
    at: string
    operator_id: number
    operator_name: string
    changed_fields: string[]
    old_value: Record<string, unknown>
    new_value: Record<string, unknown>
  }) => {
    const operatorLabel = item.operator_name || `账号#${item.operator_id}`
    const lines = (item.changed_fields || []).map((field) => {
      const oldVal = formatDiffValue((item.old_value || {})[field])
      const newVal = formatDiffValue((item.new_value || {})[field])
      return `${field}: ${oldVal} -> ${newVal}`
    })
    const header = `时间: ${item.at || '-'} | 操作人: ${operatorLabel}`
    return [header, ...lines].join('\n')
  }

  const exportTimelineCsv = () => {
    const rows = filteredTimelineItems.map((item) => {
      const operatorLabel = item.operator_name || `账号#${item.operator_id}`
      const changedFields = (item.changed_fields || []).join(';')
      const diffSummary = (item.changed_fields || [])
        .map((field) => {
          const oldVal = formatDiffValue((item.old_value || {})[field])
          const newVal = formatDiffValue((item.new_value || {})[field])
          return `${field}: ${oldVal} -> ${newVal}`
        })
        .join(' | ')
      return [
        item.at || '',
        operatorLabel,
        item.description || '',
        changedFields,
        diffSummary,
      ]
    })
    const escapeCell = (value: string) => `"${String(value || '').replace(/"/g, '""')}"`
    const header = ['at', 'operator', 'description', 'changed_fields', 'diff_summary']
    const csv = [header, ...rows].map((r) => r.map((c) => escapeCell(c)).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'route-governance-threshold-timeline.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const copyDiffSummary = async (item: {
    at: string
    operator_id: number
    operator_name: string
    changed_fields: string[]
    old_value: Record<string, unknown>
    new_value: Record<string, unknown>
  }) => {
    const key = `${item.at}-${item.operator_id}`
    setCopyingKey(key)
    try {
      await navigator.clipboard.writeText(buildDiffSummary(item))
    } finally {
      window.setTimeout(() => setCopyingKey(''), 1000)
    }
  }

  const totalProjects = summary.total_projects ?? projects.length
  const activeProjects = summary.active_projects ?? projects.filter((p) => p.status === 'active').length
  const completionRate = summary.completion_rate ?? 0
  const fallback = fallbackRes?.data

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 md:text-xl">管理驾驶舱</h2>
        <p className="mt-1 text-sm text-slate-500">项目全局概览</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        <StatCard
          title="项目总数"
          value={isLoading ? '-' : totalProjects}
          icon={<FolderOpen className="w-6 h-6" />}
        />
        <StatCard
          title="进行中"
          value={isLoading ? '-' : activeProjects}
          icon={<Play className="w-6 h-6" />}
        />
        <StatCard
          title="完成率"
          value={isLoading ? '-' : `${completionRate}%`}
          icon={<CheckCircle className="w-6 h-6" />}
        />
      </div>

      <Card title="智能体通道稳定性（近7天）" subtitle="ARK/Kimi 回退与成功率">
        {fallbackLoading ? (
          <div className="py-6 text-sm text-slate-500">加载中...</div>
        ) : fallback ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">调用总数</p>
                <p className="text-lg font-semibold text-slate-800">{fallback.summary.total_calls}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">回退触发率</p>
                <p className="text-lg font-semibold text-slate-800">{(fallback.summary.fallback_rate * 100).toFixed(1)}%</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">回退失败</p>
                <p className="text-lg font-semibold text-slate-800">{fallback.summary.fallback_failed}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">整体成功率</p>
                <p className="text-lg font-semibold text-slate-800">{(fallback.summary.success_rate * 100).toFixed(1)}%</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">高回退智能体</p>
                <ul className="space-y-1.5 text-sm text-slate-600">
                  {(fallback.by_agent || []).slice(0, 5).map((a) => (
                    <li key={a.agent_id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span>{a.agent_id}</span>
                      <span className="text-slate-500">
                        {(a.fallback_rate * 100).toFixed(0)}% / 失败 {a.fallback_failed}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">主要错误类型</p>
                <ul className="space-y-1.5 text-sm text-slate-600">
                  {(fallback.error_types || []).slice(0, 5).map((e) => (
                    <li key={e.type} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span>{e.type}</span>
                      <span className="text-slate-500">{e.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-sm text-slate-500">暂无通道监控数据</div>
        )}
      </Card>

      <Card title="路径治理预设覆盖率" subtitle="自动审批策略在活跃账号中的应用情况">
        {isLoading ? (
          <div className="py-6 text-sm text-slate-500">加载中...</div>
        ) : routeCoverage ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">活跃账号</p>
                <p className="text-lg font-semibold text-slate-800">{routeCoverage.total_accounts}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">已启用自动审批</p>
                <p className="text-lg font-semibold text-slate-800">{routeCoverage.enabled_accounts}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">覆盖率</p>
                <p className="text-lg font-semibold text-slate-800">{(routeCoverage.coverage_rate * 100).toFixed(1)}%</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              审批模式分布：graded {routeCoverage.approval_modes.graded} · direct {routeCoverage.approval_modes.direct}
            </p>
          </div>
        ) : (
          <div className="py-6 text-sm text-slate-500">暂无覆盖率数据</div>
        )}
      </Card>

      <Card title="预设变更趋势" subtitle="路径治理预设应用活跃度与阈值告警">
        {isLoading ? (
          <div className="py-6 text-sm text-slate-500">加载中...</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-600">
                趋势窗口
                <select
                  value={trendDays}
                  onChange={(e) => setTrendDays(Number(e.target.value || 30))}
                  className="mt-1 w-full min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  title="趋势窗口天数"
                >
                  <option value={7}>近7天</option>
                  <option value={30}>近30天</option>
                  <option value={90}>近90天</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">近{routeTrend?.window_days ?? trendDays}天应用次数</p>
                <p className="text-lg font-semibold text-slate-800">{routeTrend?.applied_window ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">近30天应用次数</p>
                <p className="text-lg font-semibold text-slate-800">{routeTrend?.applied_30d ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">当前状态</p>
                <p className="text-sm font-semibold text-slate-800">
                  {routeAlert?.enabled ? (routeAlert.level === 'critical' ? '需立即关注' : '建议关注') : '正常'}
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-600">
                  阈值来源：账号级配置 · 覆盖率阈值 {(routeThresholds.coverage_rate_min * 100).toFixed(1)}% · 近7天应用阈值 {routeThresholds.applied_7d_min} 次
                </p>
                <Button
                  className="min-h-10"
                  size="sm"
                  variant="secondary"
                  onClick={() => { window.location.hash = '/assistant/preferences' }}
                  title="前往偏好中心配置路径治理阈值"
                >
                  配置阈值
                </Button>
              </div>
            </div>
            <p className={`text-xs ${routeAlert?.enabled ? 'text-amber-600' : 'text-slate-500'}`}>
              {routeAlert?.message || '暂无告警'}
            </p>
          </div>
        )}
      </Card>

      <Card title="阈值变更审计时间线" subtitle={`最近 ${thresholdTimeline?.window_days ?? timelineDays} 天阈值配置变更记录`}>
        {isLoading ? (
          <div className="py-6 text-sm text-slate-500">加载中...</div>
        ) : !(thresholdTimelineItems.length) ? (
          <div className="py-6 text-sm text-slate-500">暂无阈值变更记录</div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <label className="text-xs text-slate-600">
                时间窗口
                <select
                  value={timelineDays}
                  onChange={(e) => setTimelineDays(Number(e.target.value || 30))}
                  className="mt-1 w-full min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  title="时间窗口天数"
                >
                  <option value={7}>近7天</option>
                  <option value={30}>近30天</option>
                  <option value={90}>近90天</option>
                </select>
              </label>
              <label className="text-xs text-slate-600">
                返回条数
                <select
                  value={timelineLimit}
                  onChange={(e) => setTimelineLimit(Number(e.target.value || 20))}
                  className="mt-1 w-full min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  title="时间线返回条数"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <label className="text-xs text-slate-600">
                按操作人筛选
                <select
                  value={timelineOperator}
                  onChange={(e) => setTimelineOperator(e.target.value)}
                  className="mt-1 w-full min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  title="按操作人筛选"
                >
                  <option value="all">全部</option>
                  {timelineOperators.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-600">
                按阈值字段筛选
                <select
                  value={timelineField}
                  onChange={(e) => setTimelineField(e.target.value)}
                  className="mt-1 w-full min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  title="按阈值字段筛选"
                >
                  <option value="all">全部</option>
                  {timelineFields.map((field) => (
                    <option key={field} value={field}>{field}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs text-slate-600">
                统计：变更 {thresholdSummary?.total_changes ?? thresholdTimelineItems.length} 次 · 涉及操作者 {thresholdSummary?.operators_count ?? 0} 人
              </p>
              {!!(thresholdSummary?.top_changed_fields || []).length && (
                <p className="mt-1 text-xs text-slate-500">
                  高频字段：
                  {(thresholdSummary?.top_changed_fields || []).map((x) => `${x.field}(${x.count})`).join('，')}
                </p>
              )}
            </div>
            <div className="flex justify-end">
              <Button
                className="min-h-10"
                size="sm"
                variant="secondary"
                onClick={exportTimelineCsv}
                title="导出当前筛选结果为CSV"
              >
                导出 CSV
              </Button>
            </div>
            {filteredTimelineItems.map((item) => (
              <div key={`${item.at}-${item.operator_id}`} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {item.operator_name || `账号#${item.operator_id}`} · {item.description || '更新阈值'}
                    </p>
                    <p className="text-xs text-slate-500">{item.at ? item.at.replace('T', ' ').slice(0, 19) : '-'}</p>
                  </div>
                  <Button
                    className="min-h-9"
                    size="sm"
                    variant="secondary"
                    onClick={() => void copyDiffSummary(item)}
                    title="复制本条差异摘要"
                  >
                    {copyingKey === `${item.at}-${item.operator_id}` ? '已复制' : '复制差异'}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  变更字段：{(item.changed_fields || []).join('，') || '无'}
                </p>
                {!!(item.changed_fields || []).length && (
                  <div className="mt-1 space-y-1">
                    {(item.changed_fields || []).map((field) => {
                      const oldVal = formatDiffValue((item.old_value || {})[field])
                      const newVal = formatDiffValue((item.new_value || {})[field])
                      return (
                        <p key={field} className="text-xs text-slate-500">
                          {field}: {oldVal}{' -> '}{newVal}
                        </p>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
            {!filteredTimelineItems.length && (
              <div className="py-4 text-sm text-slate-500">当前筛选条件下暂无记录</div>
            )}
          </div>
        )}
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">暂无项目</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((proj) => (
            <Card key={proj.id}>
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-800 truncate flex-1">{proj.title}</p>
                  <Badge variant={proj.status === 'active' ? 'primary' : proj.status === 'completed' ? 'success' : 'default'}>
                    {STATUS_LABELS[proj.status] ?? proj.status}
                  </Badge>
                </div>
                {typeof proj.progress === 'number' && (
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                      <span>进度</span>
                      <span>{proj.progress}%</span>
                    </div>
                    <progress
                      max={100}
                      value={proj.progress}
                      className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:bg-primary-500 [&::-moz-progress-bar]:bg-primary-500"
                    />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                  <span className="flex items-center gap-1">
                    <ClipboardList className="w-4 h-4" />
                    {proj.workorder_count ?? 0} 工单
                  </span>
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {proj.deviation_count ?? 0} 偏差
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
