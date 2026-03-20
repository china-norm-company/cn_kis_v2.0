/**
 * CRC协调员仪表盘 — 我的项目工作台
 *
 * 展示CRC负责的项目列表、今日任务时间线、个人统计和最近异常。
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { workorderApi } from '@cn-kis/api-client'
import { StatCard, Badge, Empty } from '@cn-kis/ui-kit'
import {
  ClipboardList, CheckCircle, AlertTriangle, Calendar,
  Clock, FileWarning,
} from 'lucide-react'

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error'> = {
  pending: 'default',
  assigned: 'primary',
  in_progress: 'warning',
  completed: 'success',
  review: 'warning',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  assigned: '已分配',
  in_progress: '进行中',
  completed: '已完成',
  review: '待审核',
  approved: '已批准',
  rejected: '已拒绝',
  cancelled: '已取消',
}

export default function CRCDashboard() {
  const navigate = useNavigate()

  const { data: dashRes, isLoading } = useQuery({
    queryKey: ['workorder', 'crc-my-dashboard'],
    queryFn: () => workorderApi.crcMyDashboard(),
    refetchInterval: 60_000,
  })

  const dashboard = dashRes?.data

  if (isLoading) {
    return <div className="text-sm text-slate-400 p-6">加载中...</div>
  }

  const projects = dashboard?.my_projects ?? []
  const timeline = (dashboard?.today_timeline ?? []) as any[]
  const stats = dashboard?.my_stats
  const exceptions = dashboard?.recent_exceptions ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">我的项目工作台</h2>
        <p className="text-sm text-slate-500 mt-1">CRC协调员 — 项目执行与任务管理</p>
      </div>

      {/* 个人统计 KPI */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard
          label="活跃工单"
          value={stats?.total_active ?? 0}
          icon={<ClipboardList className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          label="今日排程"
          value={stats?.today_scheduled ?? 0}
          icon={<Calendar className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          label="今日完成"
          value={stats?.today_completed ?? 0}
          icon={<CheckCircle className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          label="本周完成"
          value={stats?.week_completed ?? 0}
          icon={<Clock className="w-5 h-5" />}
          color="amber"
        />
        <StatCard
          label="逾期工单"
          value={stats?.overdue ?? 0}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="red"
        />
      </div>

      {/* 今日任务时间线 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-700">今日任务</h3>
          <button
            onClick={() => navigate('/workorders')}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            查看全部工单
          </button>
        </div>
        {timeline.length === 0 ? (
          <Empty message="今日暂无分配的工单" />
        ) : (
          <div className="space-y-3">
            {timeline.map((wo) => {
              const statusColor = STATUS_COLORS[wo.status] || 'default'
              const statusLabel = STATUS_LABELS[wo.status] || wo.status
              return (
                <div
                  key={wo.id}
                  onClick={() => navigate(`/workorders/${wo.id}`)}
                  className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
                  data-module="timeline-item"
                >
                  {/* 时间段指示器 */}
                  <div className="w-20 shrink-0 mr-4 text-center">
                    {wo.start_time ? (
                      <div data-stat="time-slot">
                        <span className="text-sm font-semibold text-slate-700">{wo.start_time}</span>
                        <span className="text-xs text-slate-400 block">
                          {wo.end_time ? `~ ${wo.end_time}` : ''}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">未排时段</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-800 truncate">{wo.title}</span>
                      <Badge variant={statusColor}>{statusLabel}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      {wo.protocol_title && <span>项目: {wo.protocol_title}</span>}
                      {wo.subject_name && <span>受试者: {wo.subject_name}</span>}
                      {wo.visit_node_name && <span>访视: {wo.visit_node_name}</span>}
                    </div>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <div className="text-xs text-slate-400">{wo.work_order_type || ''}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 我的项目 + 最近异常 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 我负责的项目 */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-700 mb-4">我负责的项目</h3>
          {projects.length === 0 ? (
            <Empty message="暂无负责的项目" />
          ) : (
            <div className="space-y-3">
              {projects.map((p) => (
                <div key={p.protocol_id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 truncate flex-1">{p.protocol_title}</span>
                    <span className="text-slate-500 ml-2">{p.completion_rate}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(p.completion_rate, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>完成 {p.completed}/{p.total}</span>
                    <span>进行中 {p.in_progress}</span>
                    <span>待处理 {p.pending}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 最近异常 */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileWarning className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-semibold text-slate-700">最近异常</h3>
          </div>
          {exceptions.length === 0 ? (
            <Empty message="暂无异常记录" />
          ) : (
            <div className="space-y-2">
              {exceptions.map((exc) => (
                <div
                  key={exc.id}
                  onClick={() => navigate(`/workorders/${exc.work_order_id}`)}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={exc.severity === 'high' || exc.severity === 'critical' ? 'error' : 'warning'}>
                        {exc.severity}
                      </Badge>
                      <span className="text-sm text-slate-700 truncate">{exc.exception_type}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 truncate">{exc.description}</p>
                  </div>
                  <span className="text-xs text-slate-400 ml-2 shrink-0">
                    {exc.created_at?.split('T')[0]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
