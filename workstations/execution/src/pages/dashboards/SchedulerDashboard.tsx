/**
 * 排程专员仪表盘 — 资源调度中心
 *
 * 展示待分配工单队列、资源利用率概览、冲突预警面板和本周产能。
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { workorderApi, schedulingApi } from '@cn-kis/api-client'
import { StatCard, Badge, Empty } from '@cn-kis/ui-kit'
import {
  ClipboardList, Wrench, Users, MapPin,
  AlertTriangle, CalendarClock, BarChart3,
  TrendingUp, ChevronDown, ChevronUp,
} from 'lucide-react'

export default function SchedulerDashboard() {
  const navigate = useNavigate()
  const [predictionExpanded, setPredictionExpanded] = useState(false)
  const [selectedPredictPlanId, setSelectedPredictPlanId] = useState<number | null>(null)

  const { data: dashRes, isLoading } = useQuery({
    queryKey: ['workorder', 'scheduler-dashboard'],
    queryFn: () => workorderApi.schedulerDashboard(),
    refetchInterval: 60_000,
  })

  const { data: plansRes } = useQuery({
    queryKey: ['scheduling', 'plans-for-prediction'],
    queryFn: () => schedulingApi.listPlans({ page: 1, page_size: 100 }),
  })

  const { data: predictionRes } = useQuery({
    queryKey: ['scheduling', 'prediction', selectedPredictPlanId],
    queryFn: () => schedulingApi.predictProgress(selectedPredictPlanId!),
    enabled: !!selectedPredictPlanId && predictionExpanded,
  })

  const dashboard = dashRes?.data
  const plans = (plansRes?.data as any)?.items ?? []
  const prediction = predictionRes?.data as any

  if (isLoading) {
    return <div className="text-sm text-slate-400 p-6">加载中...</div>
  }

  const pending = dashboard?.pending_assignment
  const resources = dashboard?.resource_overview
  const conflicts = dashboard?.conflict_warnings ?? []
  const capacity = dashboard?.weekly_capacity

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">资源调度中心</h2>
        <p className="text-sm text-slate-500 mt-1">排程专员 — 资源编排与工单调度</p>
      </div>

      {/* 资源概览 KPI */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="待分配工单"
          value={pending?.total ?? 0}
          icon={<ClipboardList className="w-5 h-5" />}
          color="amber"
        />
        <StatCard
          label="设备可用"
          value={`${resources?.equipment?.active ?? 0}/${resources?.equipment?.total ?? 0}`}
          icon={<Wrench className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          label="人员在岗"
          value={`${resources?.personnel?.on_duty ?? 0}/${resources?.personnel?.total ?? 0}`}
          icon={<Users className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          label="场地可用"
          value={`${resources?.venue?.available ?? 0}/${resources?.venue?.total ?? 0}`}
          icon={<MapPin className="w-5 h-5" />}
          color="green"
        />
      </div>

      {/* 待分配工单 + 冲突预警 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 待分配工单队列 */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-700">待分配工单</h3>
            <button
              onClick={() => navigate('/workorders?status=pending')}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              查看全部
            </button>
          </div>
          {(!pending || pending.items.length === 0) ? (
            <Empty message="暂无待分配工单" />
          ) : (
            <div className="space-y-2">
              {pending.items.map((wo) => (
                <div
                  key={wo.id}
                  onClick={() => navigate(`/workorders/${wo.id}`)}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-slate-700 truncate block">{wo.title}</span>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      {wo.scheduled_date && <span>排程: {wo.scheduled_date}</span>}
                      {wo.work_order_type && <span>类型: {wo.work_order_type}</span>}
                    </div>
                  </div>
                  {wo.due_date && (
                    <span className="text-xs text-slate-400 ml-2 shrink-0">
                      截止: {wo.due_date.split('T')[0]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 排程冲突预警 */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-semibold text-slate-700">排程冲突</h3>
            {conflicts.length > 0 && (
              <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                {conflicts.length} 个冲突
              </span>
            )}
          </div>
          {conflicts.length === 0 ? (
            <Empty message="暂无排程冲突" />
          ) : (
            <div className="space-y-2">
              {conflicts.map((c) => (
                <div
                  key={c.slot_id}
                  onClick={() => navigate(`/scheduling?plan_id=${c.plan_id}`)}
                  className="p-3 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-amber-800">{c.plan_name}</span>
                    <span className="text-xs text-amber-600">{c.scheduled_date}</span>
                  </div>
                  <p className="text-xs text-amber-700 mt-1">
                    {c.visit_node_name}{c.conflict_reason ? `: ${c.conflict_reason}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 本周产能 + 产能预测 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-slate-600" />
          <h3 className="text-base font-semibold text-slate-700">本周产能</h3>
          {capacity && (
            <span className="ml-auto text-xs text-slate-400">
              {capacity.week_start} ~ {capacity.week_end}
            </span>
          )}
          <button
            onClick={() => setPredictionExpanded(!predictionExpanded)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary-50 text-primary-600 hover:bg-primary-100 rounded-lg transition-colors ml-2"
            data-testid="prediction-toggle"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            产能预测
            {predictionExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
        {!capacity || capacity.daily.length === 0 ? (
          <Empty message="暂无本周排程数据" />
        ) : (
          <>
            <div className="flex items-center gap-6 mb-4 text-sm">
              <div>
                <span className="text-slate-500">总排程: </span>
                <span className="font-medium text-slate-800">{capacity.total_scheduled}</span>
              </div>
              <div>
                <span className="text-slate-500">已完成: </span>
                <span className="font-medium text-green-600">{capacity.total_completed}</span>
              </div>
              <div>
                <span className="text-slate-500">完成率: </span>
                <span className="font-medium text-slate-800">
                  {capacity.total_scheduled > 0
                    ? Math.round((capacity.total_completed / capacity.total_scheduled) * 100)
                    : 0}%
                </span>
              </div>
            </div>

            {/* 每日柱状图（简化版） */}
            <div className="flex items-end gap-2 h-32">
              {capacity.daily.map((d) => {
                const maxHeight = Math.max(...capacity.daily.map(dd => dd.total), 1)
                const totalHeight = (d.total / maxHeight) * 100
                const completedHeight = (d.completed / maxHeight) * 100
                const dayName = new Date(d.date).toLocaleDateString('zh-CN', { weekday: 'short' })
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full relative" style={{ height: '100px' }}>
                      <div
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 bg-slate-200 rounded-t"
                        style={{ height: `${totalHeight}%` }}
                      />
                      <div
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 bg-primary-500 rounded-t"
                        style={{ height: `${completedHeight}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">{dayName}</span>
                    <span className="text-xs text-slate-500">{d.completed}/{d.total}</span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* 产能预测面板 */}
        {predictionExpanded && (
          <div className="mt-4 pt-4 border-t border-slate-100" data-testid="prediction-panel">
            <div className="flex items-center gap-3 mb-3">
              <select
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5"
                value={selectedPredictPlanId ?? ''}
                onChange={e => setSelectedPredictPlanId(e.target.value ? Number(e.target.value) : null)}
                title="选择排程计划"
              >
                <option value="">选择排程计划</option>
                {plans.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name || `计划 #${p.id}`}</option>
                ))}
              </select>
            </div>
            {!selectedPredictPlanId ? (
              <p className="text-xs text-slate-400">请选择排程计划以查看预测</p>
            ) : !prediction ? (
              <p className="text-xs text-slate-400">加载预测中...</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="text-sm font-bold text-blue-700">{prediction.predicted_completion_date}</div>
                    <div className="text-xs text-blue-600">预计完成日期</div>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="text-sm font-bold text-green-700">{Math.round((prediction.confidence ?? 0) * 100)}%</div>
                    <div className="text-xs text-green-600">置信度</div>
                  </div>
                </div>
                {prediction.bottleneck_resources?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-600 mb-1">瓶颈资源</h4>
                    <div className="space-y-1">
                      {prediction.bottleneck_resources.map((b: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs p-2 bg-amber-50 rounded">
                          <span className="text-amber-800">{b.resource_name}</span>
                          <span className="text-amber-600">利用率 {Math.round((b.utilization ?? 0) * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {prediction.risk_factors?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-600 mb-1">风险因素</h4>
                    <ul className="text-xs text-slate-500 space-y-0.5">
                      {prediction.risk_factors.map((r: string, i: number) => (
                        <li key={i}>• {r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
