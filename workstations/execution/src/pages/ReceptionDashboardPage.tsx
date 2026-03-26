import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { receptionApi } from '@cn-kis/api-client'
import type { QueueItem } from '@cn-kis/api-client'
import { StatCard, Empty } from '@cn-kis/ui-kit'
import {
  CalendarCheck, UserCheck, PlayCircle, LogOut, UserX,
  AlertTriangle, Clock, Maximize, Volume2,
} from 'lucide-react'
import ReceptionSubjectRow from '../components/ReceptionSubjectRow'
import ReceptionQuickActions from '../components/ReceptionQuickActions'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

function formatToday(): string {
  const d = new Date()
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`
}

export default function ReceptionDashboardPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const todayLabel = formatToday()
  const [isFullscreen, setIsFullscreen] = useState(false)

  /* ---- Data queries ---- */

  const { data: statsRes } = useQuery({
    queryKey: ['reception', 'today-stats'],
    queryFn: () => receptionApi.todayStats(),
    refetchInterval: 30_000,
  })

  const { data: queueRes, isLoading: queueLoading } = useQuery({
    queryKey: ['reception', 'today-queue'],
    queryFn: () => receptionApi.todayQueue(),
    refetchInterval: 30_000,
  })

  const { data: alertsRes } = useQuery({
    queryKey: ['reception', 'pending-alerts'],
    queryFn: () => receptionApi.pendingAlerts(),
    refetchInterval: 60_000,
  })

  const stats = statsRes?.data
  const queue: QueueItem[] = queueRes?.data?.items ?? []
  const alerts = alertsRes?.data?.items ?? []

  const sortedQueue = [...queue].sort(
    (a, b) => new Date(a.appointment_time).getTime() - new Date(b.appointment_time).getTime(),
  )

  /* ---- Mutations ---- */

  const checkinMutation = useMutation({
    mutationFn: (params: { subject_id: number; project_code?: string }) =>
      receptionApi.quickCheckin({ subject_id: params.subject_id, project_code: params.project_code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reception'] }),
  })

  const checkoutMutation = useMutation({
    mutationFn: (checkinId: number) => receptionApi.quickCheckout(checkinId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reception'] }),
  })

  const callNextMutation = useMutation({
    mutationFn: () => receptionApi.callNext(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reception'] }),
  })

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true))
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false))
    }
  }

  return (
    <div className="space-y-5 md:space-y-6" data-section="reception-dashboard">
      {/* 顶部：面包屑 + 日期 */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm text-slate-400">维周·执行台 &gt; 前台接待</p>
          <h2 className="text-lg font-semibold text-slate-800 mt-1 md:text-xl">前台接待</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3" data-field="today-date">
          <span className="text-lg font-bold text-slate-800 md:text-2xl">{todayLabel}</span>
          <button onClick={() => callNextMutation.mutate()} className="flex min-h-11 items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium" disabled={callNextMutation.isPending}>
            <Volume2 className="w-4 h-4" /> {callNextMutation.isPending ? '叫号中...' : '叫下一位'}
          </button>
          <button onClick={toggleFullscreen} className="min-h-11 min-w-11 p-2 hover:bg-slate-100 rounded-lg" title="全屏模式">
            <Maximize className="w-5 h-5 text-slate-500" />
          </button>
          <button onClick={() => navigate('/reception/display')} className="min-h-11 px-3 py-2 text-sm text-slate-600 border rounded-lg hover:bg-slate-50">
            大屏投影
          </button>
        </div>
      </div>

      {/* 统计条 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:gap-3" data-section="stats">
        <StatCard
          label="预约总数"
          value={stats?.total_appointments ?? 0}
          icon={<CalendarCheck className="h-4 w-4" />}
          color="blue"
        />
        <StatCard
          label="已签到"
          value={stats?.checked_in ?? 0}
          icon={<UserCheck className="h-4 w-4" />}
          color="green"
        />
        <StatCard
          label="执行中"
          value={stats?.in_progress ?? 0}
          icon={<PlayCircle className="h-4 w-4" />}
          color="amber"
        />
        <StatCard
          label="已签出"
          value={stats?.checked_out ?? 0}
          icon={<LogOut className="h-4 w-4" />}
          color="teal"
        />
        <StatCard
          label="缺席"
          value={stats?.no_show ?? 0}
          icon={<UserX className="h-4 w-4" />}
          color="red"
        />
      </div>

      {/* 受试者队列 */}
      <div data-section="queue">
        <h3 className="text-base font-semibold text-slate-700 mb-3">今日受试者队列</h3>
        {queueLoading ? (
          <p className="text-sm text-slate-400 py-6 text-center">加载中...</p>
        ) : sortedQueue.length === 0 ? (
          <Empty title="今日暂无预约" />
        ) : (
          <div className="space-y-2">
            {sortedQueue.map((item) => (
              <ReceptionSubjectRow
                key={`${item.subject_id}-${item.appointment_time}`}
                item={item}
                onCheckin={(sid, projectCode) => checkinMutation.mutate({ subject_id: sid, project_code: projectCode })}
                onCheckout={(cid) => checkoutMutation.mutate(cid)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 快捷操作区 */}
      <div data-section="quick-actions-wrapper">
        <h3 className="text-base font-semibold text-slate-700 mb-3">快捷操作</h3>
        <ReceptionQuickActions />
      </div>

      {/* 待处理提醒 */}
      {alerts.length > 0 && (
        <div className="space-y-2" data-section="pending-alerts">
          <h3 className="text-base font-semibold text-slate-700 mb-3">待处理提醒</h3>
          {alerts.map((alert, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium ${
                alert.type === 'no_show'
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : 'bg-amber-50 border border-amber-200 text-amber-700'
              }`}
              data-stat="alert-item"
            >
              {alert.type === 'no_show' ? (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              ) : (
                <Clock className="w-4 h-4 shrink-0" />
              )}
              <span className="flex-1">
                <span className="font-semibold">{alert.subject_no}</span>{' '}
                {alert.subject_name} — {alert.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
