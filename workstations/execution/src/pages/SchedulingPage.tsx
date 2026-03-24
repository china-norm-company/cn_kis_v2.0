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
import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { schedulingApi, visitApi } from '@cn-kis/api-client'
import type { SchedulePlan, ScheduleSlot, ScheduleMilestone } from '@cn-kis/api-client'
import { DataTable, Badge, Empty, StatCard, Modal, Button } from '@cn-kis/ui-kit'
import ResourceCalendar from '../components/ResourceCalendar'
import { CreateScheduleUploadModal } from '../components/CreateScheduleUploadModal'
import { LabScheduleUploadModal } from '../components/LabScheduleUploadModal'
import { LabScheduleProjectCalendar } from '../components/LabScheduleProjectCalendar'
import { TimelineTableView } from '../components/TimelineTableView'
import { TimelineGanttView } from '../components/TimelineGanttView'
import { mapParsedToTimelineRows } from '../utils/timelineTableMapping'
import { formatExecutionPeriodToMMMMDDYY } from '../utils/executionOrderPlanConfig'
import type { TimelineRow } from '../utils/timelineTableMapping'
import type { ParsedTable } from '../components/CreateScheduleUploadModal'
import { useTheme } from '../contexts/ThemeContext'
import {
  Calendar, List, BarChart3, AlertTriangle, Plus, Eye, RefreshCw,
  ChevronLeft, ChevronRight, Flag, Users, Upload, Trash2, Search, FileCheck,
} from 'lucide-react'
import type { LabScheduleRow } from '@cn-kis/api-client'

type ViewMode = 'list' | 'week' | 'month' | 'gantt' | 'resource'

const SLOT_STATUS_LABELS: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' }> = {
  planned: { label: '已排程', color: 'default' },
  confirmed: { label: '已确认', color: 'primary' },
  completed: { label: '已完成', color: 'success' },
  cancelled: { label: '已取消', color: 'default' },
  conflict: { label: '冲突', color: 'error' },
}

const PLAN_STATUS_LABELS: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' }> = {
  draft: { label: '待排程', color: 'default' },
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
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [currentMonth, setCurrentMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() })
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showConflicts, setShowConflicts] = useState(false)
  const [conflictsList, setConflictsList] = useState<any[]>([])
  const [activePlanTab, setActivePlanTab] = useState<'slots' | 'plans' | 'milestones' | 'lab'>('plans')
  const [showLabUploadModal, setShowLabUploadModal] = useState(false)
  const [labSchedulePage, setLabSchedulePage] = useState(1)
  const [labScheduleFilterPerson, setLabScheduleFilterPerson] = useState('')
  const [labScheduleFilterEquipment, setLabScheduleFilterEquipment] = useState('')
  const [labScheduleFilterDate, setLabScheduleFilterDate] = useState('')
  const [labScheduleAppliedPerson, setLabScheduleAppliedPerson] = useState('')
  const [labScheduleAppliedEquipment, setLabScheduleAppliedEquipment] = useState('')
  const [labScheduleAppliedDate, setLabScheduleAppliedDate] = useState('')
  /** 实验室排期：数据列表 | 项目日历（日历不受上方人员/设备/日期筛选影响） */
  const [labSubView, setLabSubView] = useState<'table' | 'calendar'>('table')
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const location = useLocation()

  useEffect(() => {
    if (!toastMsg) return
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 3000)
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [toastMsg])
  useEffect(() => {
    const tab = (location.state as { tab?: string })?.tab
    if (tab === 'plans') setActivePlanTab('plans')
  }, [location.state])
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

  // Queries（排程计划列表不缓存，每次进入页面/切 Tab 都重新请求，避免清空 DB 后仍显示旧数据）
  const { data: plansRes, isLoading: plansLoading } = useQuery({
    queryKey: ['scheduling', 'plans'],
    queryFn: () => schedulingApi.listPlans({ page: 1, page_size: 100 }),
    staleTime: 0,
    refetchOnMount: 'always',
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

  const { data: timelineUploadRes } = useQuery({
    queryKey: ['scheduling', 'timeline-upload'],
    queryFn: () => schedulingApi.getTimelineUpload(),
    staleTime: 60_000,
  })
  const timelineRows: TimelineRow[] = (((timelineUploadRes as any)?.data?.items) ?? []) as TimelineRow[]

  const { data: timelinePublishedRes } = useQuery({
    queryKey: ['scheduling', 'timeline-published'],
    queryFn: () => schedulingApi.getTimelinePublished(),
    staleTime: 30_000,
  })
  const timelinePublishedItems: SchedulePlanListItem[] = (((timelinePublishedRes as any)?.data?.items) ?? []) as SchedulePlanListItem[]

  const { data: executionOrderPendingRes } = useQuery({
    queryKey: ['scheduling', 'execution-order-pending'],
    queryFn: () => schedulingApi.getExecutionOrderPending(),
    staleTime: 30_000,
  })
  const executionOrderPendingItems: SchedulePlanListItem[] = (((executionOrderPendingRes as any)?.data?.items) ?? []) as SchedulePlanListItem[]

  const LAB_SCHEDULE_PAGE_SIZE = 20
  const { data: labScheduleRes, isLoading: labScheduleLoading } = useQuery({
    queryKey: ['scheduling', 'lab-schedule', labSchedulePage, labScheduleAppliedPerson, labScheduleAppliedEquipment, labScheduleAppliedDate],
    queryFn: () =>
      schedulingApi.getLabScheduleList({
        page: labSchedulePage,
        page_size: LAB_SCHEDULE_PAGE_SIZE,
        person_role: labScheduleAppliedPerson.trim() || undefined,
        equipment: labScheduleAppliedEquipment.trim() || undefined,
        date_filter: labScheduleAppliedDate.trim() || undefined,
      }),
    enabled: activePlanTab === 'lab',
    staleTime: 30_000,
  })
  const labScheduleItems: LabScheduleRow[] = ((labScheduleRes as any)?.data?.items) ?? []
  const labScheduleTotal = (labScheduleRes as any)?.data?.total ?? 0
  const labScheduleSourceName: string = (labScheduleRes as any)?.data?.source_file_name ?? ''
  const labSchedulePersonOptions: string[] = (labScheduleRes as any)?.data?.filter_options?.person_roles ?? []
  const labScheduleEquipmentOptions: string[] = (labScheduleRes as any)?.data?.filter_options?.equipments ?? []
  const labScheduleTotalPages = Math.max(1, Math.ceil(labScheduleTotal / LAB_SCHEDULE_PAGE_SIZE))
  const labSchedulePageSafe = Math.min(Math.max(1, labSchedulePage), labScheduleTotalPages)
  const labSchedulePaginated = labScheduleItems

  /** 全量条数（无筛选），用于项目日历是否有数据、与列表筛选无关 */
  const { data: labScheduleCountRes } = useQuery({
    queryKey: ['scheduling', 'lab-schedule', 'count'],
    queryFn: () => schedulingApi.getLabScheduleList({ page: 1, page_size: 1 }),
    enabled: activePlanTab === 'lab',
    staleTime: 30_000,
  })
  const labTotalUnfiltered = ((labScheduleCountRes as { data?: { total?: number } })?.data?.total) ?? 0

  const saveTimelineMutation = useMutation({
    mutationFn: (rows: TimelineRow[]) => schedulingApi.saveTimelineUpload(rows),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'timeline-upload'] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'timeline-published'] })
      setShowCreateModal(false)
      setActivePlanTab('slots')
      setToastMsg('时间线数据已保存，已生成排程计划，刷新后仍会保留')
    },
    onError: () => {
      setToastMsg('保存失败，请重试')
    },
  })

  const uploadLabScheduleMutation = useMutation({
    mutationFn: (payload: { items: LabScheduleRow[]; fileName: string }) =>
      schedulingApi.uploadLabSchedule(payload.items, payload.fileName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'lab-schedule'] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'lab-schedule-month'] })
      setShowLabUploadModal(false)
      setActivePlanTab('lab')
      setToastMsg('实验室排期已上传')
    },
    onError: () => setToastMsg('上传失败，请重试'),
  })
  const clearLabScheduleMutation = useMutation({
    mutationFn: () => schedulingApi.clearLabSchedule(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'lab-schedule'] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'lab-schedule-month'] })
      setToastMsg('已清空实验室排期数据')
    },
    onError: () => setToastMsg('清空失败，请重试'),
  })

  const plans = (((plansRes?.data as any)?.items ?? []) as SchedulePlanListItem[])
  // 按项目编号去重，同一项目编号仅保留最新一条（以 create_time 为准）；合并后按 create_time 倒序
  const displayPlans = useMemo(() => {
    const merged = [...plans, ...timelinePublishedItems, ...executionOrderPendingItems]
    const byCode = new Map<string, SchedulePlanListItem>()
    for (const p of merged) {
      const code = (p.protocol_code ?? (p as { project_code?: string }).project_code ?? '').toString().trim()
      if (!code) {
        byCode.set(`__empty_${byCode.size}`, p)
        continue
      }
      const existing = byCode.get(code)
      const curTime = (p.create_time ?? '').toString()
      const existTime = (existing?.create_time ?? '').toString()
      if (!existing || curTime >= existTime) {
        byCode.set(code, p)
      }
    }
    const result = Array.from(byCode.values())
    result.sort((a, b) => {
      const ta = (a.create_time ?? '').toString()
      const tb = (b.create_time ?? '').toString()
      return tb.localeCompare(ta) // 最新在前
    })
    return result
  }, [plans, timelinePublishedItems, executionOrderPendingItems])

  const [schedulePlanProjectCodeFilter, setSchedulePlanProjectCodeFilter] = useState('')
  const filteredDisplayPlans = useMemo(() => {
    const q = schedulePlanProjectCodeFilter.trim().toLowerCase()
    if (!q) return displayPlans
    return displayPlans.filter((p) => {
      const code = (p.protocol_code ?? (p as { project_code?: string }).project_code ?? '')
        .toString()
        .trim()
        .toLowerCase()
      return code.includes(q)
    })
  }, [displayPlans, schedulePlanProjectCodeFilter])

  const slots = (slotsRes?.data as any)?.items ?? [] as ScheduleSlot[]
  const slotsTotal = (slotsRes?.data as any)?.total ?? 0

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

  // 已发布时间线 → 甘特图行（优先用接口返回的 segments 多段展示，否则用 start_date/end_date 单段）
  const ganttRowsFromPublished = useMemo((): TimelineRow[] => {
    return timelinePublishedItems.map((item) => {
      const id = String(item.id ?? '')
      const start = (item as { start_date?: string }).start_date ?? ''
      const end = (item as { end_date?: string }).end_date ?? start
      const name = (item.protocol_title ?? (item as { name?: string }).name ?? item.protocol_code ?? '').trim() || '项目'
      const rawSegments = (item as { segments?: Array<{ visit_point?: string; startDate?: string; endDate?: string; dates?: string[] }> }).segments
      const segments: TimelineRow['segments'] = Array.isArray(rawSegments) && rawSegments.length > 0
        ? rawSegments.map((seg, idx) => {
            const visitLabel = (seg.visit_point ?? '').trim()
            return {
              label: visitLabel || `访视${idx + 1}`,
              dayCount: Array.isArray(seg.dates) ? seg.dates.length : (seg.startDate && seg.endDate ? 1 : 0),
              formattedDates: seg.startDate && seg.endDate ? `${seg.startDate} ~ ${seg.endDate}` : '',
              单天样本量: 0,
              startDate: seg.startDate ?? '',
              endDate: seg.endDate ?? '',
            }
          })
        : start && end
          ? [{ label: name, dayCount: 1, formattedDates: `${start} ~ ${end}`, 单天样本量: 0, startDate: start.slice(0, 10), endDate: end.slice(0, 10) }]
          : []
      return {
        id,
        询期编号: (item as { protocol_code?: string }).protocol_code ?? '',
        申办方: (item as { client?: string }).client ?? '',
        项目状态: '',
        项目名称: name,
        项目编号: (item as { protocol_code?: string }).protocol_code ?? '',
        项目编号2: '',
        研究: '',
        组别: (item as { research_group?: string }).research_group ?? '',
        样本量: Number((item as { sample_size?: number }).sample_size) || 0,
        测量要求: '',
        回访时间点: (item as { visit_points_display?: string }).visit_points_display ?? '',
        项目开始时间: start,
        项目结束时间: end,
        交付情况: '',
        备注: '',
        segments,
      }
    })
  }, [timelinePublishedItems])

  // 已发布时间线 → 按日期分组的“虚拟”槽位（供周/月视图：项目编号 + 对应日期的访视时间点）
  const publishedSlotsByDate = useMemo(() => {
    const map: Record<string, ScheduleSlot[]> = {}
    const code = (item: { protocol_code?: string }) => (item.protocol_code ?? '').toString().trim() || '—'
    for (const item of timelinePublishedItems) {
      const projectCode = code(item)
      const rawSegments = (item as { segments?: Array<{ visit_point?: string; startDate?: string; endDate?: string; dates?: string[] }> }).segments
      if (Array.isArray(rawSegments) && rawSegments.length > 0) {
        for (const seg of rawSegments) {
          const visitPoint = (seg.visit_point ?? '').trim() || '访视'
          const dates = Array.isArray(seg.dates) && seg.dates.length > 0
            ? seg.dates.map(d => String(d).slice(0, 10))
            : seg.startDate ? [String(seg.startDate).slice(0, 10)] : []
          for (const dateKey of dates) {
            if (!dateKey) continue
            const slot: ScheduleSlot = {
              id: typeof item.id === 'number' ? item.id : 0,
              schedule_plan_id: 0,
              visit_node_id: 0,
              visit_node_name: `${projectCode} ${visitPoint}`.trim(),
              scheduled_date: dateKey,
              start_time: '',
              end_time: '',
              status: 'planned',
              assigned_to_id: null,
              feishu_calendar_event_id: '',
              conflict_reason: '',
            }
            if (!map[dateKey]) map[dateKey] = []
            map[dateKey].push(slot)
          }
        }
      } else {
        const slotDates = (item as { slot_dates?: string[] }).slot_dates
        const dates = Array.isArray(slotDates) && slotDates.length > 0
          ? slotDates.map(d => String(d).slice(0, 10))
          : [(item as { start_date?: string }).start_date].filter(Boolean).map(s => String(s).slice(0, 10))
        for (const dateKey of dates) {
          if (!dateKey) continue
          const slot: ScheduleSlot = {
            id: typeof item.id === 'number' ? item.id : 0,
            schedule_plan_id: 0,
            visit_node_id: 0,
            visit_node_name: projectCode,
            scheduled_date: dateKey,
            start_time: '',
            end_time: '',
            status: 'planned',
            assigned_to_id: null,
            feishu_calendar_event_id: '',
            conflict_reason: '',
          }
          if (!map[dateKey]) map[dateKey] = []
          map[dateKey].push(slot)
        }
      }
    }
    return map
  }, [timelinePublishedItems])

  const slotsByDateForView = useMemo(() => {
    if (timelinePublishedItems.length > 0) return publishedSlotsByDate
    return slotsByDate
  }, [timelinePublishedItems.length, publishedSlotsByDate, slotsByDate])

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
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" variant="secondary" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-1" /> 创建排程
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 md:gap-4">
        <StatCard label="排程计划" value={displayPlans.length} icon={<Calendar className="w-5 h-5" />} color="blue" />
        <StatCard label="待执行槽位" value={plannedCount} icon={<List className="w-5 h-5" />} color="amber" />
        <StatCard label="已完成" value={completedCount} icon={<Eye className="w-5 h-5" />} color="green" />
        <StatCard label="冲突" value={conflictCount} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
      </div>

      {/* Tab: 排程计划 / 时间槽 / 里程碑 / 实验室排期 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['plans', 'slots', 'milestones', 'lab'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActivePlanTab(tab)}
            className={clsx(
              'shrink-0 min-h-11 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activePlanTab === tab
                ? 'bg-primary-600 text-white shadow-sm dark:bg-primary-500 dark:text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-[#3b434e] dark:text-slate-200 dark:hover:bg-slate-700'
            )}
          >
            {tab === 'slots' ? '时间槽' : tab === 'plans' ? '排程计划' : tab === 'milestones' ? '里程碑' : '实验室排期'}
          </button>
        ))}
      </div>

      {activePlanTab === 'plans' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="schedule-plan-project-code-filter" className="text-sm font-medium text-slate-600 dark:text-slate-400 shrink-0">
              项目编号
            </label>
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id="schedule-plan-project-code-filter"
                type="search"
                value={schedulePlanProjectCodeFilter}
                onChange={(e) => setSchedulePlanProjectCodeFilter(e.target.value)}
                placeholder="模糊筛选项目编号（待排程与已排程合并列表）"
                className="w-full min-h-10 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-[#3b434e] dark:bg-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                autoComplete="off"
              />
            </div>
          </div>
          <PlansPanel
            plans={filteredDisplayPlans}
            projectCodeFilterKey={schedulePlanProjectCodeFilter}
            emptyMessage={
              displayPlans.length > 0 &&
              filteredDisplayPlans.length === 0 &&
              schedulePlanProjectCodeFilter.trim()
                ? '无匹配项目编号，请调整筛选条件'
                : undefined
            }
            onStartSchedule={(orderId) => navigate(`/scheduling/schedule-core/${orderId}`)}
            onOfflinePlanClick={(planId) => navigate(`/scheduling/schedule-offline/${planId}`)}
          />
        </>
      )}
      {activePlanTab === 'milestones' && <MilestonesPanel plans={plans} />}

      {activePlanTab === 'lab' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="flex gap-2 overflow-x-auto min-h-11 items-center">
              {(['table', 'calendar'] as const).map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setLabSubView(sub)}
                  className={clsx(
                    'shrink-0 min-h-11 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    labSubView === sub
                      ? 'bg-primary-600 text-white shadow-sm dark:bg-primary-500 dark:text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-[#3b434e] dark:text-slate-200 dark:hover:bg-slate-700'
                  )}
                >
                  {sub === 'table' ? '数据列表' : '项目日历'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2 shrink-0">
              <Button className="min-h-11" variant="primary" onClick={() => setShowLabUploadModal(true)}>
                <Upload className="w-4 h-4 mr-1" /> 上传排程
              </Button>
              <Button
                className="min-h-11"
                variant="secondary"
                onClick={() => {
                  if (labScheduleTotal > 0 && window.confirm('确定清空全部实验室排期数据？')) {
                    clearLabScheduleMutation.mutate()
                  }
                }}
                disabled={labScheduleTotal === 0 || clearLabScheduleMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-1" /> 清空数据
              </Button>
            </div>
          </div>
          {labScheduleSourceName && labSubView === 'table' && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              数据来源：{labScheduleSourceName}（共 {labScheduleTotal} 条）
            </p>
          )}
          {labSubView === 'calendar' ? (
            <LabScheduleProjectCalendar hasAnyLabData={labTotalUnfiltered > 0} />
          ) : null}
          {labSubView === 'table' ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] overflow-hidden">
            {/* 筛选与查询/重置：始终显示 */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-[#3b434e] bg-slate-50 dark:bg-slate-700/30">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">筛选：</span>
              <input
                type="text"
                className="min-h-10 w-32 px-3 py-1.5 text-sm border border-slate-200 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 rounded-lg placeholder:text-slate-400"
                value={labScheduleFilterPerson}
                onChange={(e) => setLabScheduleFilterPerson(e.target.value)}
                placeholder="人员/岗位"
                title="输入后点击查询"
                list="lab-filter-person-list"
              />
              <input
                type="text"
                className="min-h-10 w-32 px-3 py-1.5 text-sm border border-slate-200 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 rounded-lg placeholder:text-slate-400"
                value={labScheduleFilterEquipment}
                onChange={(e) => setLabScheduleFilterEquipment(e.target.value)}
                placeholder="设备"
                title="输入后点击查询"
                list="lab-filter-equipment-list"
              />
              <input
                type="date"
                className="min-h-10 w-36 px-3 py-1.5 text-sm border border-slate-200 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 rounded-lg"
                value={labScheduleFilterDate}
                onChange={(e) => setLabScheduleFilterDate(e.target.value)}
                title="选择日期"
              />
              <button
                type="button"
                className="min-h-10 px-4 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                onClick={() => {
                  setLabScheduleAppliedPerson(labScheduleFilterPerson)
                  setLabScheduleAppliedEquipment(labScheduleFilterEquipment)
                  setLabScheduleAppliedDate(labScheduleFilterDate)
                  setLabSchedulePage(1)
                }}
              >
                查询
              </button>
              <button
                type="button"
                className="min-h-10 px-3 py-1.5 text-sm border border-slate-200 dark:border-[#3b434e] rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => {
                  setLabScheduleFilterPerson('')
                  setLabScheduleFilterEquipment('')
                  setLabScheduleFilterDate('')
                  setLabScheduleAppliedPerson('')
                  setLabScheduleAppliedEquipment('')
                  setLabScheduleAppliedDate('')
                  setLabSchedulePage(1)
                }}
              >
                重置
              </button>
              <span className="text-sm text-slate-500 dark:text-slate-400 ml-auto">
                共 {labScheduleTotal} 条
              </span>
            </div>
            <datalist id="lab-filter-person-list">
              {labSchedulePersonOptions.map((opt) => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
            <datalist id="lab-filter-equipment-list">
              {labScheduleEquipmentOptions.map((opt) => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
            {labScheduleLoading ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                加载中...
              </div>
            ) : labScheduleTotal === 0 ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                暂无数据，请点击「上传排程」导入实验室项目运营安排
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] text-sm border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-[#3b434e]">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">组别</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">设备</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">日期</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">项目编号</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">样本量</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">人员/岗位</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">房间</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">组别</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labSchedulePaginated.map((row, idx) => (
                        <tr key={(labSchedulePageSafe - 1) * LAB_SCHEDULE_PAGE_SIZE + idx} className="border-b border-slate-100 dark:border-slate-700">
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.group ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.equipment ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.date ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">{row.protocol_code ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.sample_size ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.person_role ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.room ?? '—'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{row.day_group ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* 分页 */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-[#3b434e] bg-slate-50 dark:bg-slate-700/30">
                  <span className="text-sm text-slate-600 dark:text-slate-300">
                    第 {labSchedulePageSafe} / {labScheduleTotalPages} 页，本页 {labSchedulePaginated.length} 条
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="min-h-10 min-w-10 p-2 rounded-lg border border-slate-200 dark:border-[#3b434e] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:pointer-events-none"
                      disabled={labSchedulePageSafe <= 1}
                      onClick={() => setLabSchedulePage((p) => Math.max(1, p - 1))}
                      title="上一页"
                    >
                      <ChevronLeft className="w-4 h-4 mx-auto" />
                    </button>
                    <button
                      type="button"
                      className="min-h-10 min-w-10 p-2 rounded-lg border border-slate-200 dark:border-[#3b434e] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:pointer-events-none"
                      disabled={labSchedulePageSafe >= labScheduleTotalPages}
                      onClick={() => setLabSchedulePage((p) => Math.min(labScheduleTotalPages, p + 1))}
                      title="下一页"
                    >
                      <ChevronRight className="w-4 h-4 mx-auto" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          ) : null}
        </div>
      )}

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
                className="shrink-0 min-h-11 text-sm border border-slate-200 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2"
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
                className="shrink-0 min-h-11 min-w-11 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-[#3b434e] dark:hover:bg-slate-700"
                title="刷新"
              >
                <RefreshCw className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* View Content：时间槽列表优先展示已发布排程（7 列），可点击进入详情；无则展示上传时间线或槽位列表 */}
          {slotsLoading && timelineRows.length === 0 && timelinePublishedItems.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-12 text-center text-slate-400 dark:text-slate-500">加载中...</div>
          ) : viewMode === 'list' ? (
            timelinePublishedItems.length > 0 ? (
              <TimeSlotListView
                items={timelinePublishedItems}
                onRowClick={(item) => {
                  const idStr = String(item.id ?? '')
                  const planId = idStr.startsWith('tp-') ? idStr.replace(/^tp-/, '') : idStr
                  const sourceType = (item as { source_type?: string }).source_type ?? 'online'
                  if (planId) {
                    if (sourceType === 'offline') {
                      navigate(`/scheduling/schedule-offline/${planId}`)
                    } else {
                      navigate(`/scheduling/timeslot/${planId}`)
                    }
                  }
                }}
              />
            ) : timelineRows.length > 0 ? (
              <TimelineTableView
                rows={timelineRows}
                showVisitPoints={false}
                onRowClick={(row) => navigate(`/scheduling/timeline/${encodeURIComponent(row.id)}`, { state: { row } })}
              />
            ) : (
              <ListView slots={slots} total={slotsTotal} />
            )
          ) : viewMode === 'week' ? (
            <WeekView weekDates={weekDates} slotsByDate={slotsByDateForView} onPrev={prevWeek} onNext={nextWeek} />
          ) : viewMode === 'month' ? (
            <MonthView monthDates={monthDates} slotsByDate={slotsByDateForView} currentMonth={currentMonth} onPrev={prevMonth} onNext={nextMonth} />
          ) : viewMode === 'resource' ? (
            <ResourceCalendar planId={selectedPlanId ?? undefined} />
          ) : viewMode === 'gantt' ? (
            timelinePublishedItems.length > 0 ? (
              <TimelineGanttView rows={ganttRowsFromPublished} />
            ) : timelineRows.length > 0 ? (
              <TimelineGanttView rows={timelineRows} />
            ) : (
              <GanttView slots={slots} plans={plans} />
            )
          ) : null}
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
        <CreateScheduleUploadModal
          onClose={() => setShowCreateModal(false)}
          confirmLoading={saveTimelineMutation.isPending}
          onParsed={(data: ParsedTable) => {
            const rows = mapParsedToTimelineRows(data)
            if (rows.length > 0) saveTimelineMutation.mutate(rows)
          }}
        />
      )}

      {showLabUploadModal && (
        <LabScheduleUploadModal
          onClose={() => setShowLabUploadModal(false)}
          confirmLoading={uploadLabScheduleMutation.isPending}
          onConfirm={(items, fileName) =>
            uploadLabScheduleMutation.mutate({ items, fileName })
          }
        />
      )}
      {/* Toast：约 3 秒后自动关闭，可点击关闭 */}
      {toastMsg && (
        <div
          className="fixed bottom-6 right-6 bg-green-600 text-white pl-4 pr-10 py-3 rounded-lg shadow-lg text-sm z-50 flex items-center gap-2"
          data-testid="publish-toast"
        >
          <span>{toastMsg}</span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="absolute top-2 right-2 p-1 rounded hover:bg-white/20 text-white/90"
            aria-label="关闭"
          >
            <span className="text-base leading-none">×</span>
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

/** 时间槽列表：已发布排程，含数据来源列 */
function TimeSlotListView({
  items,
  onRowClick,
}: {
  items: SchedulePlanListItem[]
  onRowClick: (item: SchedulePlanListItem) => void
}) {
  const dataSourceLabel = (p: SchedulePlanListItem) => {
    const src = (p as { source_type?: string; 数据来源?: string }).source_type ?? (p as { source_type?: string; 数据来源?: string }).数据来源 ?? 'online'
    return src === 'offline' ? '线下' : '线上'
  }
  const columns = [
    { key: 'protocol_code', header: '项目编号', align: 'center' as const, render: (p: SchedulePlanListItem) => <span className="text-sm text-slate-700 dark:text-slate-300">{p.protocol_code ?? '-'}</span> },
    { key: 'protocol_title', header: '项目名称', align: 'center' as const, render: (p: SchedulePlanListItem) => <span className="text-sm text-slate-800 dark:text-slate-200 truncate max-w-[160px] block mx-auto" title={p.protocol_title ?? p.name}>{p.protocol_title ?? p.name ?? '-'}</span> },
    { key: 'research_group', header: '组别', align: 'center' as const, render: (p: SchedulePlanListItem) => <span className="text-sm text-slate-600 dark:text-slate-300">{p.research_group ?? '-'}</span> },
    { key: 'sample_size', header: '样本量', align: 'center' as const, render: (p: SchedulePlanListItem) => <span className="text-sm text-slate-600 dark:text-slate-300">{p.sample_size ?? '-'}</span> },
    { key: 'supervisor', header: '督导', align: 'center' as const, render: (p: SchedulePlanListItem) => <span className="text-sm text-slate-600 dark:text-slate-300">{p.supervisor ?? '-'}</span> },
    { key: 'visit_points_display', header: '访视时间点', align: 'center' as const, render: (p: SchedulePlanListItem) => {
      const raw = (p.visit_points_display ?? '').trim()
      const segments = raw ? raw.split(/\s*[;；,\s，、]\s*/).map(s => s.trim()).filter(Boolean) : []
      const stripColons = (s: string) => s.replace(/[：:]/g, '')
      const visitPointLabel = (seg: string) => {
        const firstPart = seg.split(/[：:]/)[0].trim()
        const withoutDate = firstPart.replace(/\d{4}[年/-]\d{1,2}[月/-]\d{1,2}[日]?|\d{4}\/\d{1,2}\/\d{1,2}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}/g, '').trim()
        return stripColons(withoutDate || firstPart).trim()
      }
      const isNotVisitLabel = (s: string) => /^\d+$/.test(s) || /^\d{1,2}\/\d{1,2}$/.test(s) || /^\d{1,2}$/.test(s) || !/[\u4e00-\u9fa5a-zA-Z]/.test(s)
      const points = segments.map(visitPointLabel).filter((s) => s && !isNotVisitLabel(s))
      if (points.length === 0) return <span className="text-slate-400">—</span>
      return (
        <div className="flex flex-wrap gap-1.5 justify-center max-w-[280px] mx-auto" title={raw}>
          {points.map((point, i) => (
            <span
              key={`${i}-${point}`}
              className="visit-point-pill shrink-0 inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 dark:bg-[#FFF2CC] dark:border dark:border-slate-400/50"
            >
              {stripColons(point)}
            </span>
          ))}
        </div>
      )
    } },
    { key: 'execution_period', header: '实际执行周期', align: 'center' as const, render: (p: SchedulePlanListItem) => (p.execution_period ? <span className="text-sm text-slate-600 dark:text-slate-300">{formatExecutionPeriodToMMMMDDYY(p.execution_period)}</span> : <span className="text-slate-400">-</span>) },
    { key: '数据来源', header: '数据来源', align: 'center' as const, render: (p: SchedulePlanListItem) => <Badge variant={dataSourceLabel(p) === '线下' ? 'warning' : 'success'}>{dataSourceLabel(p)}</Badge> },
  ]
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e]">
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <DataTable columns={columns} data={items} onRowClick={onRowClick} />
        </div>
      </div>
      {items.length > 0 && (
        <div className="px-6 py-3 border-t border-slate-100 dark:border-t-[#3b434e] text-xs text-slate-500 dark:text-slate-400">
          共 {items.length} 条，点击行进入详情
        </div>
      )}
    </div>
  )
}

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
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e]">
      {slots.length === 0 ? (
        <div className="p-12"><Empty message="暂无时间槽数据" /></div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <DataTable columns={columns} data={slots} />
          </div>
        </div>
      )}
      {total > 0 && <div className="px-6 py-3 border-t border-slate-100 dark:border-t-[#3b434e] text-xs text-slate-500 dark:text-slate-400">共 {total} 条</div>}
    </div>
  )
}

function WeekView({
  weekDates, slotsByDate, onPrev, onNext,
}: {
  weekDates: Date[]; slotsByDate: Record<string, ScheduleSlot[]>; onPrev: () => void; onNext: () => void
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-4">
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
            <div key={key} className={`min-h-[160px] rounded-lg border p-2 dark:border-[#3b434e] ${isToday ? 'border-primary-400 bg-primary-50/30 dark:bg-primary-900/20' : 'border-slate-200'} ${hasConflict ? 'ring-2 ring-red-300' : ''}`}>
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
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-4">
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
              className={`min-h-[80px] rounded border p-1 text-xs dark:border-[#3b434e] ${
                isCurrentMonth ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50 text-slate-400'
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
    return <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-12"><Empty message="暂无排程数据" /></div>
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
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-4 overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Date axis */}
        <div className="flex border-b border-slate-200 dark:border-b-[#3b434e] pb-2 mb-3">
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

/** 排程计划列表项（与资源待审核字段一致，来源于资源审核通过后的排程计划） */
type SchedulePlanListItem = SchedulePlan & {
  protocol_code?: string
  protocol_title?: string
  client?: string
  sample_size?: number
  visit_node_count?: number
  window_summary?: string
  execution_period?: string
  schedule_progress_display?: string
  source?: string
  /** 数据来源：online=线上，offline=线下 */
  source_type?: string
  数据来源?: string
  /** 时间槽列表用：组别、督导、访视时间点 */
  research_group?: string
  supervisor?: string
  visit_points_display?: string
  /** 已发布且来自排程核心时，对应的执行订单 id，用于「进入排程」 */
  execution_order_id?: number | null
}

const PLANS_PAGE_SIZE = 8

function PlansPanel({
  plans,
  projectCodeFilterKey = '',
  emptyMessage,
  onStartSchedule,
  onOfflinePlanClick,
}: {
  plans: SchedulePlanListItem[]
  /** 项目编号筛选变化时重置分页 */
  projectCodeFilterKey?: string
  /** 列表为空时的提示（如无匹配筛选） */
  emptyMessage?: string
  onStartSchedule?: (orderId: number) => void
  onOfflinePlanClick?: (planId: number) => void
}) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [projectCodeFilterKey])

  const total = plans.length
  const totalPages = Math.max(1, Math.ceil(total / PLANS_PAGE_SIZE))
  const start = (page - 1) * PLANS_PAGE_SIZE
  const pagePlans = plans.slice(start, start + PLANS_PAGE_SIZE)
  const hasPrev = page > 1
  const hasNext = page < totalPages
  const handlePageJump = (value: string) => {
    const n = parseInt(value, 10)
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) setPage(n)
  }

  if (plans.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-12">
        <Empty message={emptyMessage ?? '暂无排程计划'} />
      </div>
    )
  }

  const dataSourceLabel = (p: SchedulePlanListItem) => {
    const src = p.source_type ?? p.数据来源 ?? (p.source === 'execution_order' ? 'online' : 'online')
    return src === 'offline' ? '线下' : '线上'
  }
  /* 列：项目编号、项目名称、客户、样本量、访视点、窗口期、执行周期、数据来源、排程进度、操作 */
  const columns = [
    { key: 'protocol_code', header: '项目编号', align: 'center' as const, render: (p: SchedulePlanListItem) => <span className="text-sm text-slate-700 dark:text-slate-300">{p.protocol_code ?? '-'}</span> },
    { key: 'protocol_title', header: '项目名称', align: 'center' as const, render: (p: SchedulePlanListItem) => <span className="text-sm text-slate-800 dark:text-slate-200 truncate max-w-[160px] block mx-auto" title={p.protocol_title ?? p.name}>{p.protocol_title ?? p.name ?? '-'}</span> },
    { key: 'client', header: '客户', align: 'center' as const, render: (p: SchedulePlanListItem) => <span className="text-sm text-slate-600 dark:text-slate-300">{p.client ?? '-'}</span> },
    { key: 'sample_size', header: '样本量', align: 'center' as const, render: (p: SchedulePlanListItem) => <span className="text-sm text-slate-600 dark:text-slate-300">{p.sample_size ?? '-'}</span> },
    { key: 'visit_node_count', header: '访视点', align: 'center' as const, render: (p: SchedulePlanListItem) => <span className="text-sm text-slate-600 dark:text-slate-300">{p.visit_node_count ?? '-'}</span> },
    { key: 'visit_node_count2', header: '访视数', align: 'center' as const, render: (p: SchedulePlanListItem) => <span className="text-sm text-slate-600 dark:text-slate-300">{p.visit_node_count ?? '-'}</span> },
    { key: 'window_summary', header: '窗口期', align: 'center' as const, render: (p: SchedulePlanListItem) => <span className="text-xs text-slate-500 dark:text-slate-400 max-w-[120px] truncate block mx-auto" title={p.window_summary}>{p.window_summary ?? '-'}</span> },
    { key: 'execution_period', header: '执行周期', align: 'center' as const, render: (p: SchedulePlanListItem) => (p.execution_period ? <Badge variant="info" size="sm">{formatExecutionPeriodToMMMMDDYY(p.execution_period)}</Badge> : <Badge variant="default" size="sm">-</Badge>) },
    { key: '数据来源', header: '数据来源', align: 'center' as const, render: (p: SchedulePlanListItem) => <Badge variant={dataSourceLabel(p) === '线下' ? 'warning' : 'success'}>{dataSourceLabel(p)}</Badge> },
    {
      key: 'schedule_progress',
      header: '排程进度',
      align: 'center' as const,
      render: (p: SchedulePlanListItem) => {
        const label = p.schedule_progress_display ?? (p.status === 'draft' ? '待排程' : p.status === 'generated' ? '已排程' : p.status === 'published' ? '已发布' : p.status)
        const isPending = label === '待排程'
        const isPublished = label === '已发布'
        if (isPublished) return <Badge variant="success" size="sm">{label}</Badge>
        if (isPending) return <Badge variant="warning" size="sm">{label}</Badge>
        return <Badge variant="default" size="sm">{label}</Badge>
      },
    },
    {
      key: 'actions',
      header: '操作',
      align: 'center' as const,
      render: (p: SchedulePlanListItem) => {
        const idStr = String(p.id ?? '')
        const isExecutionOrder = idStr.startsWith('eo-')
        const orderId = isExecutionOrder ? parseInt(idStr.replace(/^eo-/, ''), 10) : 0
        if (isExecutionOrder && !Number.isNaN(orderId) && onStartSchedule) {
          return (
            <Button size="xs" variant="primary" onClick={() => onStartSchedule(orderId)}>
              开始排程
            </Button>
          )
        }
        // 已发布：线下→流程安排（时间线排程页），线上且有关联订单→进入排程（人员排程）
        const isPublished = idStr.startsWith('tp-')
        const planId = isPublished ? parseInt(idStr.replace(/^tp-/, ''), 10) : 0
        const srcType = (p as { source_type?: string }).source_type ?? 'online'
        if (isPublished && srcType === 'offline' && !Number.isNaN(planId) && onOfflinePlanClick) {
          return (
            <Button size="xs" variant="secondary" onClick={() => onOfflinePlanClick(planId)}>
              流程安排
            </Button>
          )
        }
        const execOrderId = p.execution_order_id != null ? p.execution_order_id : null
        if (isPublished && execOrderId != null && !Number.isNaN(Number(execOrderId)) && onStartSchedule) {
          return (
            <Button size="xs" variant="secondary" onClick={() => onStartSchedule(Number(execOrderId))}>
              进入排程
            </Button>
          )
        }
        return <span className="text-slate-400 text-sm">—</span>
      },
    },
  ]

  return (
    <div className={clsx('bg-white dark:bg-slate-800 rounded-xl', !isDark && 'border border-slate-200')}>
      <div className="overflow-x-auto" role="grid" aria-label="排程计划列表">
        <div className="min-w-[1200px]">
          <DataTable
            columns={columns}
            data={pagePlans}
            rowKey="id"
          />
        </div>
      </div>
      <div className={clsx('flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-xs text-slate-500 dark:text-slate-400', !isDark && 'border-t border-slate-100')}>
        <span>共 {total} 条</span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() => hasPrev && setPage(p => p - 1)}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            <ChevronLeft className="w-4 h-4" /> 上一页
          </button>
          <span className="text-slate-500 dark:text-slate-400">
            第 {page} / {totalPages} 页
          </span>
          <span className="flex items-center gap-1">
            <input
              key={page}
              type="number"
              min={1}
              max={totalPages}
              defaultValue={page}
              onKeyDown={(e) => e.key === 'Enter' && handlePageJump((e.target as HTMLInputElement).value)}
              className="w-12 rounded border border-slate-200 bg-white px-1.5 py-1 text-center text-slate-700 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:focus:ring-1 dark:focus:ring-slate-400"
              aria-label="跳转到页码"
            />
            <button
              type="button"
              onClick={(e) => {
                const input = (e.currentTarget.previousElementSibling as HTMLInputElement | null)
                if (input) handlePageJump(input.value)
              }}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              跳转
            </button>
          </span>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => hasNext && setPage(p => p + 1)}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            下一页 <ChevronRight className="w-4 h-4" />
          </button>
        </div>
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
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-4 md:p-6">
      <div className="flex items-center gap-4 mb-4 overflow-x-auto pb-1">
        <Flag className="w-5 h-5 text-slate-500 dark:text-slate-400" />
        <select
          className="shrink-0 min-h-11 text-sm border border-slate-200 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-2"
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

type ResourceApprovalRow = {
  demand_id: number
  visit_plan_id: number
  visit_plan_name: string
  status: string
  protocol_id: number
  protocol_code: string
  protocol_title: string
  client: string
  sample_size: number
  visit_node_count: number
  window_summary: string
  execution_period: string
  schedule_progress: string
}

const RESOURCE_APPROVAL_PAGE_SIZE = 8

function ResourceApprovalListPanel({
  onRowClick,
  onRefresh,
}: {
  onRowClick: (row: ResourceApprovalRow) => void
  onRefresh: () => void
}) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [page, setPage] = useState(1)
  const { data: listRes, isLoading, isError, error } = useQuery({
    queryKey: ['visit', 'resource-approval-list', page],
    queryFn: () => visitApi.listResourceApprovalList({ page, page_size: RESOURCE_APPROVAL_PAGE_SIZE }),
  })

  const items = ((listRes?.data as any)?.items ?? []) as ResourceApprovalRow[]
  const total = (listRes?.data as any)?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / RESOURCE_APPROVAL_PAGE_SIZE))
  const hasPrev = page > 1
  const hasNext = page < totalPages
  const handlePageJump = (value: string) => {
    const n = parseInt(value, 10)
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) setPage(n)
  }

  const columns = [
    { key: 'protocol_code', header: '项目编号', align: 'center' as const, render: (r: ResourceApprovalRow) => <span className="text-sm text-slate-700">{r.protocol_code || '-'}</span> },
    { key: 'protocol_title', header: '项目名称', align: 'center' as const, render: (r: ResourceApprovalRow) => <span className="text-sm text-slate-800 truncate max-w-[160px] block mx-auto" title={r.protocol_title}>{r.protocol_title || '-'}</span> },
    { key: 'client', header: '客户', align: 'center' as const, render: (r: ResourceApprovalRow) => <span className="text-sm text-slate-600">{r.client || '-'}</span> },
    { key: 'sample_size', header: '样本量', align: 'center' as const, render: (r: ResourceApprovalRow) => <span className="text-sm text-slate-600">{r.sample_size ?? '-'}</span> },
    { key: 'visit_node_count', header: '访视点', align: 'center' as const, render: (r: ResourceApprovalRow) => <span className="text-sm text-slate-600">{r.visit_node_count}</span> },
    { key: 'visit_node_count2', header: '访视数', align: 'center' as const, render: (r: ResourceApprovalRow) => <span className="text-sm text-slate-600">{r.visit_node_count}</span> },
    { key: 'window_summary', header: '窗口期', align: 'center' as const, render: (r: ResourceApprovalRow) => <span className="text-xs text-slate-500 max-w-[120px] truncate block mx-auto" title={r.window_summary}>{r.window_summary || '-'}</span> },
    { key: 'execution_period', header: '执行周期', align: 'center' as const, render: (r: ResourceApprovalRow) => (r.execution_period ? <Badge variant="info" size="sm">{r.execution_period}</Badge> : <Badge variant="default" size="sm">-</Badge>) },
    { key: 'schedule_progress', header: '审核进度', align: 'center' as const, render: (r: ResourceApprovalRow) => (r.status === 'approved' || r.status === 'rejected' ? <Badge variant="success" size="sm">已审核</Badge> : <Badge variant="warning" size="sm">待审核</Badge>) },
    {
      key: 'actions',
      header: '操作',
      align: 'center' as const,
      render: (r: ResourceApprovalRow) => (
        <Button className="min-h-9 mx-auto" size="xs" variant="primary" onClick={(e) => { e.stopPropagation(); onRowClick(r) }}>
          <FileCheck className="w-3 h-3 mr-1" /> 资源审核
        </Button>
      ),
    },
  ]

  if (isLoading) {
    return <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-12 text-center text-slate-400 dark:text-slate-500">加载中...</div>
  }

  if (isError) {
    const errMsg = error instanceof Error ? error.message : '加载失败'
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-12">
        <div className="text-center text-amber-700 text-sm">
          <p className="font-medium">列表加载失败</p>
          <p className="mt-2">{errMsg}</p>
          <p className="mt-3 text-slate-500">请确认已登录执行台，且账号具备「查看资源需求」权限（如排程专员、项目经理）。</p>
        </div>
        <div className="flex justify-center mt-4">
          <Button variant="secondary" onClick={onRefresh}>重试</Button>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-12">
        <Empty message="暂无资源待审核项" />
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-3">若已运行 seed_resource_approval_demo（7 条 mock）仍无数据，请确认已登录且账号有「查看资源需求」权限。</p>
      </div>
    )
  }

  return (
    <div className={clsx('bg-white dark:bg-slate-800 rounded-xl', !isDark && 'border border-slate-200')}>
      <div className={clsx('flex justify-end p-2', !isDark && 'border-b border-slate-100')}>
        <Button className="min-h-9" size="xs" variant="primary" onClick={onRefresh}>刷新</Button>
      </div>
      <div
        className="overflow-x-auto cursor-pointer"
        role="grid"
        aria-label="资源待审核列表"
      >
        <div className="min-w-[1100px]">
          <DataTable
            columns={columns}
            data={items}
            onRowClick={(r: ResourceApprovalRow) => onRowClick(r)}
          />
        </div>
      </div>
      <div className={clsx('flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-xs text-slate-500 dark:text-slate-400', !isDark && 'border-t border-slate-100')}>
        <span>共 {total} 条</span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() => hasPrev && setPage(p => p - 1)}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            <ChevronLeft className="w-4 h-4" /> 上一页
          </button>
          <span className="text-slate-500 dark:text-slate-400">
            第 {page} / {totalPages} 页
          </span>
          <span className="flex items-center gap-1">
            <input
              key={page}
              type="number"
              min={1}
              max={totalPages}
              defaultValue={page}
              onKeyDown={(e) => e.key === 'Enter' && handlePageJump((e.target as HTMLInputElement).value)}
              className="w-12 rounded border border-slate-200 bg-white px-1.5 py-1 text-center text-slate-700 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:focus:ring-1 dark:focus:ring-slate-400"
              aria-label="跳转到页码"
            />
            <button
              type="button"
              onClick={(e) => {
                const input = (e.currentTarget.previousElementSibling as HTMLInputElement | null)
                if (input) handlePageJump(input.value)
              }}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              跳转
            </button>
          </span>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => hasNext && setPage(p => p + 1)}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            下一页 <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
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
