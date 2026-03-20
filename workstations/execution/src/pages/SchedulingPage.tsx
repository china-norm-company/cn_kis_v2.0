/**
 * 排程管理
 *
 * 管理所有项目的访视排程与资源调配：
 * - 列表视图（默认）：DataTable 展示全部槽位
 * - 周视图：7 列表格按日期展示
 * - 月视图：日历网格
 * - 甘特图视图：横轴时间线
 * - 冲突面板：红色高亮冲突槽位
 * - 操作：创建排程计划、生成槽位、发布排程、里程碑管理
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { api, schedulingApi } from '@cn-kis/api-client'
import type { SchedulePlan, ScheduleSlot, ScheduleMilestone } from '@cn-kis/api-client'
import { DataTable, Badge, Empty, StatCard, Modal, Button, Tabs, DigitalWorkerActionCard } from '@cn-kis/ui-kit'
import ResourceCalendar from '../components/ResourceCalendar'
import {
  Calendar, List, BarChart3, AlertTriangle, Plus, Play, Eye, RefreshCw,
  ChevronLeft, ChevronRight, Flag, Users,
} from 'lucide-react'

type ViewMode = 'list' | 'week' | 'month' | 'gantt' | 'resource'

const SLOT_STATUS_LABELS: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' }> = {
  planned: { label: '已排程', color: 'default' },
  confirmed: { label: '已确认', color: 'primary' },
  completed: { label: '已完成', color: 'success' },
  cancelled: { label: '已取消', color: 'default' },
  conflict: { label: '冲突', color: 'error' },
}

const PLAN_STATUS_LABELS: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' }> = {
  draft: { label: '草稿', color: 'default' },
  generated: { label: '已生成', color: 'warning' },
  published: { label: '已发布', color: 'success' },
  cancelled: { label: '已取消', color: 'default' },
}

const VIEW_ICONS: Record<ViewMode, React.ReactNode> = {
  list: <List className="w-4 h-4" />,
  week: <Calendar className="w-4 h-4" />,
  month: <Calendar className="w-4 h-4" />,
  gantt: <BarChart3 className="w-4 h-4" />,
  resource: <Users className="w-4 h-4" />,
}

const VIEW_LABELS: Record<ViewMode, string> = {
  list: '列表',
  week: '周视图',
  month: '月视图',
  gantt: '甘特图',
  resource: '资源日历',
}

function getWeekDates(baseDate: Date): Date[] {
  const d = new Date(baseDate)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return date
  })
}

function getMonthDates(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const startDay = firstDay.getDay() || 7
  const start = new Date(year, month, 1 - (startDay - 1))
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function formatShortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日']

export default function SchedulingPage() {
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [currentMonth, setCurrentMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() })
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showConflicts, setShowConflicts] = useState(false)
  const [conflictsList, setConflictsList] = useState<any[]>([])
  const [activePlanTab, setActivePlanTab] = useState<'slots' | 'plans' | 'milestones'>('slots')
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Date ranges for queries
  const weekDates = useMemo(() => getWeekDates(currentWeek), [currentWeek])
  const monthDates = useMemo(() => getMonthDates(currentMonth.year, currentMonth.month), [currentMonth])

  const queryStartDate = viewMode === 'week'
    ? formatDate(weekDates[0])
    : viewMode === 'month'
      ? formatDate(monthDates[0])
      : undefined
  const queryEndDate = viewMode === 'week'
    ? formatDate(weekDates[6])
    : viewMode === 'month'
      ? formatDate(monthDates[41])
      : undefined

  // Queries
  const { data: plansRes, isLoading: plansLoading } = useQuery({
    queryKey: ['scheduling', 'plans'],
    queryFn: () => schedulingApi.listPlans({ page: 1, page_size: 100 }),
  })

  const { data: slotsRes, isLoading: slotsLoading } = useQuery({
    queryKey: ['scheduling', 'slots', queryStartDate, queryEndDate, selectedPlanId],
    queryFn: () => schedulingApi.listSlots({
      start_date: queryStartDate,
      end_date: queryEndDate,
      plan_id: selectedPlanId ?? undefined,
      page: 1,
      page_size: 500,
    }),
    refetchInterval: 30_000,
  })

  const plans = (plansRes?.data as any)?.items ?? [] as SchedulePlan[]
  const slots = (slotsRes?.data as any)?.items ?? [] as ScheduleSlot[]
  const slotsTotal = (slotsRes?.data as any)?.total ?? 0

  // Mutations
  const generateMutation = useMutation({
    mutationFn: (planId: number) => schedulingApi.generateSlots(planId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scheduling'] }),
  })

  const publishMutation = useMutation({
    mutationFn: (planId: number) => schedulingApi.publishPlan(planId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['scheduling'] })
      const count = (res?.data as any)?.calendar_synced_count
      if (count != null) {
        setToastMsg(`排程已发布，已同步 ${count} 个日历事件`)
        setTimeout(() => setToastMsg(null), 4000)
      }
    },
  })

  const detectConflictsMutation = useMutation({
    mutationFn: (planId: number) => schedulingApi.detectConflicts(planId),
    onSuccess: (res) => {
      setConflictsList(res.data ?? [])
      setShowConflicts(true)
    },
  })
  const applySuggestionMutation = useMutation({
    mutationFn: ({ planId, slots }: { planId: number; slots: Array<{ slot_id: number }> }) =>
      api.post(`/scheduling/plans/${planId}/apply-suggestion`, { slots }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling'] })
    },
  })

  // Stats
  const conflictCount = slots.filter((s: ScheduleSlot) => s.status === 'conflict').length
  const completedCount = slots.filter((s: ScheduleSlot) => s.status === 'completed').length
  const plannedCount = slots.filter((s: ScheduleSlot) => s.status === 'planned' || s.status === 'confirmed').length

  // Group slots by date for calendar views
  const slotsByDate = useMemo(() => {
    const map: Record<string, ScheduleSlot[]> = {}
    for (const s of slots) {
      const key = s.scheduled_date
      if (!map[key]) map[key] = []
      map[key].push(s)
    }
    return map
  }, [slots])

  // Navigation handlers
  const prevWeek = () => {
    const d = new Date(currentWeek)
    d.setDate(d.getDate() - 7)
    setCurrentWeek(d)
  }
  const nextWeek = () => {
    const d = new Date(currentWeek)
    d.setDate(d.getDate() + 7)
    setCurrentWeek(d)
  }
  const prevMonth = () => {
    setCurrentMonth(prev => prev.month === 0
      ? { year: prev.year - 1, month: 11 }
      : { year: prev.year, month: prev.month - 1 })
  }
  const nextMonth = () => {
    setCurrentMonth(prev => prev.month === 11
      ? { year: prev.year + 1, month: 0 }
      : { year: prev.year, month: prev.month + 1 })
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">排程管理</h2>
          <p className="text-sm text-slate-500 mt-1">所有项目的访视排程与资源调配</p>
        </div>
        <div className="flex gap-2">
          <PermissionGuard permission="scheduling.schedule.create">
            <Button className="min-h-11" variant="secondary" onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-1" /> 创建排程
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 md:gap-4">
        <StatCard label="排程计划" value={plans.length} icon={<Calendar className="w-5 h-5" />} color="blue" />
        <StatCard label="待执行槽位" value={plannedCount} icon={<List className="w-5 h-5" />} color="amber" />
        <StatCard label="已完成" value={completedCount} icon={<Eye className="w-5 h-5" />} color="green" />
        <StatCard label="冲突" value={conflictCount} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
      </div>

      {/* 数字员工动作卡片：排程优化建议 */}
      {conflictCount > 0 && (
        <DigitalWorkerActionCard
          roleCode="scheduling_optimizer"
          roleName="排程优化员"
          title={`检测到 ${conflictCount} 个排程冲突`}
          description="排程优化员分析了当前冲突，建议调整以下时间槽以消除冲突。确认后可一键应用。"
          items={
            slots
              .filter((s: ScheduleSlot) => s.status === 'conflict')
              .slice(0, 5)
              .map((s: ScheduleSlot) => ({
                key: String(s.id),
                label: `槽位 #${s.id}`,
                value: `${s.scheduled_date} ${s.start_time || ''} - ${s.end_time || ''} · ${s.conflict_reason || '冲突'}`,
              }))
          }
          onAccept={() => {
            const conflictSlots = slots.filter((s: ScheduleSlot) => s.status === 'conflict')
            const planId = selectedPlanId ?? conflictSlots[0]?.schedule_plan_id
            if (!planId || conflictSlots.length === 0) {
              window.alert('暂无可采纳的冲突槽位')
              return
            }
            applySuggestionMutation.mutate({
              planId,
              slots: conflictSlots.slice(0, 5).map((s) => ({ slot_id: s.id })),
            })
          }}
          loading={applySuggestionMutation.isPending}
          acceptLabel="采纳排程建议"
        />
      )}

      {/* Tab: Slots / Plans / Milestones */}
      <div className="flex gap-3 overflow-x-auto border-b border-slate-200 pb-1">
        {(['slots', 'plans', 'milestones'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActivePlanTab(tab)}
            className={`shrink-0 min-h-11 pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              activePlanTab === tab
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'slots' ? '时间槽' : tab === 'plans' ? '排程计划' : '里程碑'}
          </button>
        ))}
      </div>

      {activePlanTab === 'plans' && <PlansPanel plans={plans} onGenerate={id => generateMutation.mutate(id)} onPublish={id => publishMutation.mutate(id)} onDetectConflicts={id => detectConflictsMutation.mutate(id)} />}
      {activePlanTab === 'milestones' && <MilestonesPanel plans={plans} />}

      {activePlanTab === 'slots' && (
        <>
          {/* View Switcher + Filters */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(['list', 'week', 'month', 'gantt', 'resource'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  title={`切换到${VIEW_LABELS[mode]}`}
                  className={`shrink-0 min-h-11 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === mode
                      ? 'bg-primary-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {VIEW_ICONS[mode]} {VIEW_LABELS[mode]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <select
                className="shrink-0 min-h-11 text-sm border border-slate-200 rounded-lg px-3 py-2"
                value={selectedPlanId ?? ''}
                onChange={e => setSelectedPlanId(e.target.value ? Number(e.target.value) : null)}
                title="筛选排程计划"
              >
                <option value="">全部排程计划</option>
                {plans.map((p: SchedulePlan) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey: ['scheduling'] })}
                className="shrink-0 min-h-11 min-w-11 p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
                title="刷新"
              >
                <RefreshCw className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* View Content */}
          {slotsLoading ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">加载中...</div>
          ) : viewMode === 'list' ? (
            <ListView slots={slots} total={slotsTotal} />
          ) : viewMode === 'week' ? (
            <WeekView weekDates={weekDates} slotsByDate={slotsByDate} onPrev={prevWeek} onNext={nextWeek} />
          ) : viewMode === 'month' ? (
            <MonthView monthDates={monthDates} slotsByDate={slotsByDate} currentMonth={currentMonth} onPrev={prevMonth} onNext={nextMonth} />
          ) : viewMode === 'resource' ? (
            <ResourceCalendar planId={selectedPlanId ?? undefined} />
          ) : (
            <GanttView slots={slots} plans={plans} />
          )}
        </>
      )}

      {/* Conflict Modal */}
      {showConflicts && (
        <Modal title="冲突检测结果" onClose={() => setShowConflicts(false)}>
          {conflictsList.length === 0 ? (
            <Empty message="未检测到冲突" />
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {conflictsList.map((c, i) => (
                <div key={i} className={`p-3 rounded-lg border ${c.severity === 'high' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={c.severity === 'high' ? 'error' : 'warning'}>
                      {c.type === 'person_overlap' ? '人员冲突' : '设备校准过期'}
                    </Badge>
                    <span className="text-xs text-slate-500">Slot #{c.slot_id}</span>
                  </div>
                  <p className="text-sm text-slate-700">{c.message}</p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Create Plan Modal */}
      {showCreateModal && (
        <CreatePlanModal onClose={() => setShowCreateModal(false)} onCreated={() => {
          setShowCreateModal(false)
          queryClient.invalidateQueries({ queryKey: ['scheduling'] })
        }} />
      )}

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm z-50" data-testid="publish-toast">
          {toastMsg}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function ListView({ slots, total }: { slots: ScheduleSlot[]; total: number }) {
  const columns = [
    { key: 'id', header: 'ID', render: (s: ScheduleSlot) => <span className="text-xs text-slate-500">#{s.id}</span> },
    { key: 'visit_node_name', header: '访视节点' },
    { key: 'scheduled_date', header: '排程日期' },
    { key: 'start_time', header: '开始时间', render: (s: ScheduleSlot) => s.start_time || '-' },
    { key: 'end_time', header: '结束时间', render: (s: ScheduleSlot) => s.end_time || '-' },
    { key: 'assigned_to_id', header: '执行人', render: (s: ScheduleSlot) => s.assigned_to_id ? `#${s.assigned_to_id}` : <span className="text-slate-400">未分配</span> },
    {
      key: 'status', header: '状态', render: (s: ScheduleSlot) => {
        const info = SLOT_STATUS_LABELS[s.status] || { label: s.status, color: 'default' as const }
        return <Badge variant={info.color}>{info.label}</Badge>
      },
    },
    {
      key: 'conflict_reason', header: '冲突原因', render: (s: ScheduleSlot) =>
        s.conflict_reason ? <span className="text-xs text-red-600">{s.conflict_reason}</span> : '-',
    },
  ]

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      {slots.length === 0 ? (
        <div className="p-12"><Empty message="暂无时间槽数据" /></div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <DataTable columns={columns} data={slots} />
          </div>
        </div>
      )}
      {total > 0 && <div className="px-6 py-3 border-t border-slate-100 text-xs text-slate-500">共 {total} 条</div>}
    </div>
  )
}

function WeekView({
  weekDates, slotsByDate, onPrev, onNext,
}: {
  weekDates: Date[]; slotsByDate: Record<string, ScheduleSlot[]>; onPrev: () => void; onNext: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrev} className="min-h-11 min-w-11 p-1 rounded hover:bg-slate-100" title="上一周"><ChevronLeft className="w-5 h-5" /></button>
        <span className="text-sm font-medium text-slate-700">
          {formatShortDate(weekDates[0])} - {formatShortDate(weekDates[6])}
        </span>
        <button onClick={onNext} className="min-h-11 min-w-11 p-1 rounded hover:bg-slate-100" title="下一周"><ChevronRight className="w-5 h-5" /></button>
      </div>
      <div className="overflow-x-auto">
      <div className="grid min-w-[980px] grid-cols-7 gap-2">
        {weekDates.map((d, i) => {
          const key = formatDate(d)
          const daySlots = slotsByDate[key] || []
          const isToday = formatDate(new Date()) === key
          const hasConflict = daySlots.some(s => s.status === 'conflict')
          return (
            <div key={key} className={`min-h-[160px] rounded-lg border p-2 ${isToday ? 'border-primary-400 bg-primary-50/30' : 'border-slate-200'} ${hasConflict ? 'ring-2 ring-red-300' : ''}`}>
              <div className="text-xs font-medium text-slate-500 mb-2">
                周{WEEKDAY_NAMES[i]} {formatShortDate(d)}
              </div>
              <div className="space-y-1">
                {daySlots.map(s => {
                  const info = SLOT_STATUS_LABELS[s.status] || { label: s.status, color: 'default' as const }
                  return (
                    <div key={s.id} className={`text-xs p-1.5 rounded ${s.status === 'conflict' ? 'bg-red-100 text-red-700' : s.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-slate-50 text-slate-700'}`}>
                      <div className="font-medium truncate">{s.visit_node_name}</div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span>{s.start_time?.slice(0, 5) || ''}</span>
                        <Badge variant={info.color}>{info.label}</Badge>
                      </div>
                    </div>
                  )
                })}
                {daySlots.length === 0 && <div className="text-xs text-slate-300 text-center mt-4">-</div>}
              </div>
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}

function MonthView({
  monthDates, slotsByDate, currentMonth, onPrev, onNext,
}: {
  monthDates: Date[]; slotsByDate: Record<string, ScheduleSlot[]>
  currentMonth: { year: number; month: number }; onPrev: () => void; onNext: () => void
}) {
  const monthName = new Date(currentMonth.year, currentMonth.month).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onPrev} className="min-h-11 min-w-11 p-1 rounded hover:bg-slate-100" title="上一个月"><ChevronLeft className="w-5 h-5" /></button>
        <span className="text-sm font-medium text-slate-700">{monthName}</span>
        <button onClick={onNext} className="min-h-11 min-w-11 p-1 rounded hover:bg-slate-100" title="下一个月"><ChevronRight className="w-5 h-5" /></button>
      </div>
      <div className="overflow-x-auto">
      <div className="grid min-w-[980px] grid-cols-7 gap-1">
        {WEEKDAY_NAMES.map(n => (
          <div key={n} className="text-xs text-center font-medium text-slate-500 py-1">周{n}</div>
        ))}
        {monthDates.map(d => {
          const key = formatDate(d)
          const daySlots = slotsByDate[key] || []
          const isCurrentMonth = d.getMonth() === currentMonth.month
          const isToday = formatDate(new Date()) === key
          const hasConflict = daySlots.some(s => s.status === 'conflict')
          return (
            <div
              key={key}
              className={`min-h-[80px] rounded border p-1 text-xs ${
                isCurrentMonth ? 'bg-white' : 'bg-slate-50/50 text-slate-400'
              } ${isToday ? 'border-primary-400' : 'border-slate-100'} ${hasConflict ? 'ring-1 ring-red-300' : ''}`}
            >
              <div className={`font-medium mb-0.5 ${isToday ? 'text-primary-600' : ''}`}>{d.getDate()}</div>
              {daySlots.length > 0 && (
                <div className="space-y-0.5">
                  {daySlots.slice(0, 3).map(s => (
                    <div
                      key={s.id}
                      className={`truncate px-1 rounded ${s.status === 'conflict' ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'}`}
                    >
                      {s.visit_node_name}
                    </div>
                  ))}
                  {daySlots.length > 3 && <div className="text-slate-400 px-1">+{daySlots.length - 3}</div>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}

function GanttView({ slots, plans }: { slots: ScheduleSlot[]; plans: SchedulePlan[] }) {
  // Group slots by plan
  const planGroups = useMemo(() => {
    const groups: Record<number, { plan: SchedulePlan; slots: ScheduleSlot[] }> = {}
    for (const p of plans) groups[p.id] = { plan: p, slots: [] }
    for (const s of slots) {
      if (groups[s.schedule_plan_id]) groups[s.schedule_plan_id].slots.push(s)
    }
    return Object.values(groups).filter(g => g.slots.length > 0)
  }, [slots, plans])

  if (planGroups.length === 0) {
    return <div className="bg-white rounded-xl border border-slate-200 p-12"><Empty message="暂无排程数据" /></div>
  }

  // Find global date range
  const allDates = slots.map(s => s.scheduled_date).sort()
  const minDate = allDates[0]
  const maxDate = allDates[allDates.length - 1]
  const startD = new Date(minDate)
  const endD = new Date(maxDate)
  const totalDays = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / 86400000) + 1)

  // Generate date headers (show every ~7 days)
  const dateHeaders: string[] = []
  for (let i = 0; i < totalDays; i += Math.max(1, Math.floor(totalDays / 10))) {
    const d = new Date(startD)
    d.setDate(d.getDate() + i)
    dateHeaders.push(formatDate(d))
  }

  function dayOffset(dateStr: string): number {
    return Math.max(0, Math.ceil((new Date(dateStr).getTime() - startD.getTime()) / 86400000))
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Date axis */}
        <div className="flex border-b border-slate-200 pb-2 mb-3">
          <div className="w-48 shrink-0 text-xs font-medium text-slate-500">排程计划</div>
          <div className="flex-1 relative h-6">
            {dateHeaders.map(dh => {
              const left = (dayOffset(dh) / totalDays) * 100
              return (
                <span key={dh} className="absolute text-[10px] text-slate-400" style={{ left: `${left}%` }}>
                  {dh.slice(5)}
                </span>
              )
            })}
          </div>
        </div>

        {/* Plan rows */}
        {planGroups.map(({ plan, slots: pSlots }) => (
          <div key={plan.id} className="flex items-center mb-2">
            <div className="w-48 shrink-0 text-sm text-slate-700 truncate pr-2">{plan.name}</div>
            <div className="flex-1 relative h-8 bg-slate-50 rounded">
              {pSlots.map(s => {
                const left = (dayOffset(s.scheduled_date) / totalDays) * 100
                const width = Math.max(1.5, (1 / totalDays) * 100)
                const bg = s.status === 'conflict' ? 'bg-red-400' : s.status === 'completed' ? 'bg-green-400' : 'bg-blue-400'
                return (
                  <div
                    key={s.id}
                    className={`absolute top-1 h-6 rounded ${bg} opacity-80 hover:opacity-100 transition-opacity cursor-pointer`}
                    style={{ left: `${left}%`, width: `${width}%`, minWidth: '8px' }}
                    title={`${s.visit_node_name} (${s.scheduled_date}) - ${SLOT_STATUS_LABELS[s.status]?.label || s.status}`}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlansPanel({
  plans, onGenerate, onPublish, onDetectConflicts,
}: {
  plans: SchedulePlan[]
  onGenerate: (id: number) => void
  onPublish: (id: number) => void
  onDetectConflicts: (id: number) => void
}) {
  if (plans.length === 0) return <div className="bg-white rounded-xl border border-slate-200 p-12"><Empty message="暂无排程计划" /></div>

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="divide-y divide-slate-100">
        {plans.map((p: SchedulePlan) => {
          const info = PLAN_STATUS_LABELS[p.status] || { label: p.status, color: 'default' as const }
          return (
            <div key={p.id} className="flex flex-col gap-3 p-4 hover:bg-slate-50 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{p.name}</span>
                  <Badge variant={info.color}>{info.label}</Badge>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {p.start_date} ~ {p.end_date} | 访视计划 #{p.visit_plan_id}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <PermissionGuard permission="scheduling.schedule.manage">
                  {p.status === 'draft' && (
                    <Button className="min-h-9" size="xs" variant="secondary" onClick={() => onGenerate(p.id)}>
                      <Play className="w-3 h-3 mr-1" /> 生成槽位
                    </Button>
                  )}
                  {(p.status === 'draft' || p.status === 'generated') && (
                    <>
                      <Button className="min-h-9" size="xs" variant="secondary" onClick={() => onDetectConflicts(p.id)}>
                        <AlertTriangle className="w-3 h-3 mr-1" /> 检测冲突
                      </Button>
                      <Button className="min-h-9" size="xs" variant="primary" onClick={() => onPublish(p.id)}>
                        发布
                      </Button>
                    </>
                  )}
                </PermissionGuard>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MilestonesPanel({ plans }: { plans: SchedulePlan[] }) {
  const publishedPlans = plans.filter((p: SchedulePlan) => p.status === 'published' || p.status === 'generated')

  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(publishedPlans[0]?.id ?? null)

  const { data: milestonesRes } = useQuery({
    queryKey: ['scheduling', 'milestones', selectedPlanId],
    queryFn: () =>
      selectedPlanId
        ? schedulingApi.listMilestones(selectedPlanId)
        : Promise.resolve({ code: 200, msg: 'OK', data: { items: [] } }),
    enabled: !!selectedPlanId,
  })

  const milestones = ((milestonesRes?.data as any)?.items ?? []) as ScheduleMilestone[]

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
      <div className="flex items-center gap-4 mb-4 overflow-x-auto pb-1">
        <Flag className="w-5 h-5 text-slate-500" />
        <select
          className="shrink-0 min-h-11 text-sm border border-slate-200 rounded-lg px-3 py-2"
          value={selectedPlanId ?? ''}
          onChange={e => setSelectedPlanId(e.target.value ? Number(e.target.value) : null)}
          title="选择里程碑排程计划"
        >
          <option value="">选择排程计划</option>
          {publishedPlans.map((p: SchedulePlan) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      {milestones.length === 0 ? (
        <Empty message="暂无里程碑" />
      ) : (
        <div className="space-y-3">
          {milestones.map(m => (
            <div key={m.id} className="flex flex-col gap-2 p-3 rounded-lg bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-sm font-medium text-slate-700">{m.name}</span>
                <span className="text-xs text-slate-500 ml-2">{m.milestone_type}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">目标: {m.target_date}</span>
                {m.is_achieved ? (
                  <Badge variant="success">已达成 {m.actual_date}</Badge>
                ) : (
                  <Badge variant="warning">未达成</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CreatePlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [visitPlanId, setVisitPlanId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [name, setName] = useState('')

  const createMutation = useMutation({
    mutationFn: () => schedulingApi.createPlan({
      visit_plan_id: Number(visitPlanId),
      start_date: startDate,
      end_date: endDate,
      name: name || undefined,
    }),
    onSuccess: () => onCreated(),
  })

  return (
    <Modal title="创建排程计划" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">访视计划 ID</label>
          <input
            type="number"
            className="w-full min-h-11 border border-slate-200 rounded-lg px-3 py-2 text-sm"
            value={visitPlanId}
            onChange={e => setVisitPlanId(e.target.value)}
            placeholder="输入访视计划 ID"
            title="访视计划ID"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">开始日期</label>
            <input type="date" className="w-full min-h-11 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} title="开始日期" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">结束日期</label>
            <input type="date" className="w-full min-h-11 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={endDate} onChange={e => setEndDate(e.target.value)} title="结束日期" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">排程名称（可选）</label>
          <input type="text" className="w-full min-h-11 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} placeholder="自动生成" title="排程名称" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button className="min-h-11" variant="secondary" onClick={onClose}>取消</Button>
          <Button
            className="min-h-11"
            variant="primary"
            onClick={() => createMutation.mutate()}
            disabled={!visitPlanId || !startDate || !endDate || createMutation.isPending}
          >
            {createMutation.isPending ? '创建中...' : '创建'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
