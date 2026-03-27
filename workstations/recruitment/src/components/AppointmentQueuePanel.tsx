/**
 * 与「预约管理」页「预约列表」区块一致：月历 + 项目筛选 + 今日队列表格 + 分页（含跳转）。
 * 初筛页可传 visitPointFixed 限定访视点；不传则展示全部访视点。
 */
import { useMemo, useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { receptionApi } from '@cn-kis/api-client'
import type { ApiResponse, QueueList, TodayQueue } from '@cn-kis/api-client'
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map((part) => parseInt(part, 10))
  return { year, month, day }
}

function formatMonthKey(year: number, month: number) {
  return `${year}-${pad2(month)}`
}

function formatMonthLabel(monthKey: string) {
  const { year, month } = parseDateKey(`${monthKey}-01`)
  return `${year}年${pad2(month)}月`
}

function firstDayOfMonth(monthKey: string) {
  return `${monthKey}-01`
}

function shiftMonth(monthKey: string, offset: number) {
  const { year, month } = parseDateKey(`${monthKey}-01`)
  const next = new Date(year, month - 1 + offset, 1)
  return formatMonthKey(next.getFullYear(), next.getMonth() + 1)
}

function buildMonthCells(monthKey: string) {
  const { year, month } = parseDateKey(`${monthKey}-01`)
  const firstDay = new Date(year, month - 1, 1)
  const weekdayOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: Array<{ date: string; day: number } | null> = []

  for (let i = 0; i < weekdayOffset; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: `${monthKey}-${pad2(day)}`, day })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  return cells
}

function formatDetailTime(value?: string | null) {
  if (!value) return '—'
  const raw = String(value).trim()
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) return raw.slice(0, 5)
  const dt = new Date(raw)
  if (!Number.isNaN(dt.getTime())) return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`
  return raw
}

function formatGenderCell(value: unknown): string {
  if (value === undefined || value === null) return '—'
  const s = String(value).trim()
  if (!s) return '—'
  const lower = s.toLowerCase()
  if (lower === 'male' || lower === 'm') return '男'
  if (lower === 'female' || lower === 'f') return '女'
  if (lower === 'other') return '其他'
  return s
}

const QUEUE_PAGE_SIZE = 10
const PROJECT_FILTER_FETCH_PAGE_SIZE = 200

/** 与队列 status 字段一致，用于历史筛选 */
const QUEUE_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'waiting', label: '待签到' },
  { value: 'checked_in', label: '已签到' },
  { value: 'in_progress', label: '执行中' },
  { value: 'checked_out', label: '已签出' },
  { value: 'no_show', label: '缺席' },
]

/** 与 SubjectProjectSC.enrollment_status 一致；__none__ 表示无入组文案 */
const ENROLLMENT_QUEUE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部入组' },
  { value: '__none__', label: '无入组' },
  ...(['初筛合格', '正式入组', '不合格', '复筛不合格', '退出', '缺席'] as const).map((s) => ({
    value: s,
    label: s,
  })),
]

export type AppointmentQueuePanelProps = {
  /** 固定按访视点筛选（如 V1），与预约管理表格「访视点」列一致 */
  visitPointFixed?: string
  /** 卡片主标题 */
  listTitle?: string
  /** 副标题说明 */
  subtitle?: string
  /** 是否隐藏日历区（含标题/今天/刷新） */
  hideCalendar?: boolean
  /** 外部控制项目筛选（用于与上层汇总表联动） */
  projectFilter?: string
  /** 项目筛选变化回调（用于与上层状态同步） */
  onProjectFilterChange?: (projectCode: string) => void
  /** 历史明细模式：支持全部日期 + 日期范围 + 项目编号筛选 */
  historicalMode?: boolean
  /** 历史模式外部筛选条件（用于与汇总页同步） */
  historicalFilters?: {
    dateFrom?: string
    dateTo?: string
    projectCode?: string
    status?: string
    enrollmentStatus?: string
  }
  /** 历史模式筛选变化回调（用于与汇总页同步） */
  onHistoricalFiltersChange?: (filters: {
    dateFrom: string
    dateTo: string
    projectCode: string
    status: string
    enrollmentStatus: string
  }) => void
}

export function AppointmentQueuePanel({
  visitPointFixed,
  listTitle = '预约列表',
  subtitle,
  hideCalendar = false,
  projectFilter,
  onProjectFilterChange,
  historicalMode = false,
  historicalFilters,
  onHistoricalFiltersChange,
}: AppointmentQueuePanelProps) {
  const queryClient = useQueryClient()
  const todayStr = new Date().toISOString().slice(0, 10)
  const [queueDate, setQueueDate] = useState(todayStr)
  const [queueListPage, setQueueListPage] = useState(1)
  const [queueProjectFilter, setQueueProjectFilter] = useState('')
  const [queueStatusFilter, setQueueStatusFilter] = useState('')
  const [queueEnrollmentFilter, setQueueEnrollmentFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [visibleMonth, setVisibleMonth] = useState(todayStr.slice(0, 7))
  const [jumpInput, setJumpInput] = useState('')

  const vp = (visitPointFixed || '').trim()

  const queueProjectOptionsQuery = useQuery<string[]>({
    queryKey: ['reception', 'queue-list-project-options', dateFrom, dateTo, vp, historicalMode],
    queryFn: async () => {
      const res = await receptionApi.queueListProjectOptions({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        ...(vp ? { visit_point: vp } : {}),
      })
      return res?.data?.project_codes ?? []
    },
    enabled: historicalMode,
  })

  const todayQueueQuery = useQuery<ApiResponse<TodayQueue | QueueList>>({
    queryKey: [
      'reception',
      historicalMode ? 'queue-list' : 'today-queue',
      historicalMode ? dateFrom : queueDate,
      historicalMode ? dateTo : '',
      queueListPage,
      queueProjectFilter.trim(),
      queueStatusFilter,
      queueEnrollmentFilter,
      vp,
    ],
    queryFn: () => {
      if (historicalMode) {
        const pc = queueProjectFilter.trim()
        return receptionApi.queueList({
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page: queueListPage,
          page_size: QUEUE_PAGE_SIZE,
          ...(pc ? { project_code: pc, project_code_exact: true } : {}),
          ...(queueStatusFilter ? { status: queueStatusFilter } : {}),
          ...(queueEnrollmentFilter ? { enrollment_status: queueEnrollmentFilter } : {}),
          ...(vp ? { visit_point: vp } : {}),
        })
      }
      return receptionApi.todayQueue({
        target_date: queueDate,
        page: queueListPage,
        page_size: QUEUE_PAGE_SIZE,
        source: 'execution',
        ...(queueProjectFilter.trim() ? { project_code: queueProjectFilter.trim() } : {}),
        ...(vp ? { visit_point: vp } : {}),
      })
    },
  })

  const appointmentCalendarQuery = useQuery({
    queryKey: ['reception', 'appointment-calendar', visibleMonth],
    queryFn: () => receptionApi.appointmentCalendar(visibleMonth),
    enabled: !hideCalendar && !historicalMode,
  })

  const queueProjectCodesQuery = useQuery({
    queryKey: ['reception', 'today-queue-project-codes', queueDate, vp],
    queryFn: async () => {
      if (historicalMode) return []
      const byCode = new Map<string, string>()
      let page = 1
      let totalPages = 1

      while (page <= totalPages) {
        const res = await receptionApi.todayQueue({
          target_date: queueDate,
          page,
          page_size: PROJECT_FILTER_FETCH_PAGE_SIZE,
          source: 'execution',
          ...(vp ? { visit_point: vp } : {}),
        })
        const data = res?.data
        const items = data?.items ?? []
        const total = data?.total ?? 0

        items.forEach((item) => {
          const code = (item.project_code || '').trim()
          if (code && !byCode.has(code)) byCode.set(code, code)
        })

        totalPages = Math.max(1, Math.ceil(total / PROJECT_FILTER_FETCH_PAGE_SIZE))
        page += 1
      }

      return Array.from(byCode.entries()).sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
    },
  })

  const projectCodeFilterOptions = useMemo(() => {
    return queueProjectCodesQuery.data ?? []
  }, [queueProjectCodesQuery.data])

  const monthCells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth])
  const appointmentCountMap = useMemo(() => {
    const items = appointmentCalendarQuery.data?.data?.items ?? []
    return new Map(items.map((item) => [item.date, item.total]))
  }, [appointmentCalendarQuery.data])

  const total = todayQueueQuery.data?.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / QUEUE_PAGE_SIZE))

  useEffect(() => {
    setJumpInput(String(queueListPage))
  }, [queueListPage])

  useEffect(() => {
    const external = (projectFilter || '').trim()
    if (external === queueProjectFilter.trim()) return
    setQueueProjectFilter(external)
    setQueueListPage(1)
  }, [projectFilter, queueProjectFilter])

  useEffect(() => {
    if (!historicalMode || !historicalFilters) return
    const nextFrom = (historicalFilters.dateFrom || '').trim()
    const nextTo = (historicalFilters.dateTo || '').trim()
    const nextProject = (historicalFilters.projectCode || '').trim()
    const nextStatus = (historicalFilters.status || '').trim()
    const nextEnroll = (historicalFilters.enrollmentStatus || '').trim()
    if (nextFrom !== dateFrom) setDateFrom(nextFrom)
    if (nextTo !== dateTo) setDateTo(nextTo)
    if (nextProject !== queueProjectFilter.trim()) {
      setQueueProjectFilter(nextProject)
      setQueueListPage(1)
    }
    if (nextStatus !== queueStatusFilter) {
      setQueueStatusFilter(nextStatus)
      setQueueListPage(1)
    }
    if (nextEnroll !== queueEnrollmentFilter) {
      setQueueEnrollmentFilter(nextEnroll)
      setQueueListPage(1)
    }
  }, [historicalMode, historicalFilters, dateFrom, dateTo, queueProjectFilter, queueStatusFilter, queueEnrollmentFilter])

  const handleSelectQueueDate = (dateKey: string) => {
    setQueueDate(dateKey)
    setQueueListPage(1)
    setVisibleMonth(dateKey.slice(0, 7))
  }

  const handleChangeMonth = (offset: number) => {
    const nextMonth = shiftMonth(visibleMonth, offset)
    setVisibleMonth(nextMonth)
    setQueueDate(firstDayOfMonth(nextMonth))
    setQueueListPage(1)
  }

  const submitJump = (e?: React.FormEvent) => {
    e?.preventDefault()
    const p = parseInt(String(jumpInput).trim(), 10)
    if (!Number.isFinite(p)) return
    const next = Math.min(totalPages, Math.max(1, p))
    setQueueListPage(next)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {!hideCalendar && !historicalMode ? (
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-800">{listTitle}</h3>
              {subtitle ? <p className="text-xs text-slate-500 mt-1">{subtitle}</p> : null}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleSelectQueueDate(todayStr)}
                className="text-sm text-slate-600 hover:text-slate-800"
              >
                今天
              </button>
              <button
                type="button"
                onClick={() => {
                  void Promise.all([
                    todayQueueQuery.refetch(),
                    appointmentCalendarQuery.refetch(),
                    queryClient.invalidateQueries({ queryKey: ['reception', 'today-queue'] }),
                  ])
                }}
                className="text-sm text-emerald-600 hover:underline"
              >
                刷新
              </button>
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => handleChangeMonth(-1)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                aria-label="上个月"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-base font-semibold text-slate-800">{formatMonthLabel(visibleMonth)}</div>
              <button
                type="button"
                onClick={() => handleChangeMonth(1)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                aria-label="下个月"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="px-1 py-0.5 text-center text-[11px] font-medium text-slate-500">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {monthCells.map((cell, idx) => {
                if (!cell) {
                  return <div key={`empty-${idx}`} className="min-h-14 rounded-lg bg-transparent" />
                }

                const isSelected = cell.date === queueDate
                const isToday = cell.date === todayStr
                const dayTotal = appointmentCountMap.get(cell.date) ?? 0

                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => handleSelectQueueDate(cell.date)}
                    className={`min-h-14 rounded-lg border px-2 py-1.5 text-left transition ${
                      isSelected
                        ? 'border-blue-300 bg-blue-100 text-blue-900'
                        : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-sm font-semibold leading-none ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                        {cell.day}
                      </span>
                      <div className="flex items-center gap-1">
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none ${
                            dayTotal > 0
                              ? isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-blue-500 text-white'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {dayTotal}项
                        </span>
                        {isToday && (
                          <span className={`text-[10px] leading-none ${isSelected ? 'text-blue-700' : 'text-emerald-600'}`}>
                            今
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
      <div className="px-4 py-3 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="text-sm text-slate-600 shrink-0">
          {historicalMode ? (
            <>
              日期范围：{dateFrom || '全部'}
              {' ~ '}
              {dateTo || '全部'}
            </>
          ) : (
            <>当前日期：{queueDate}</>
          )}
          {vp ? (
            <span className="ml-2 text-slate-500">
              （访视点：<span className="font-medium text-slate-700">{vp}</span>）
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 sm:min-w-0 sm:flex-1 sm:justify-end">
          {historicalMode ? (
            <>
              <label className="text-xs font-medium text-slate-600 sm:shrink-0">起始</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  const next = e.target.value
                  setDateFrom(next)
                  setQueueListPage(1)
                  onHistoricalFiltersChange?.({
                    dateFrom: next,
                    dateTo,
                    projectCode: queueProjectFilter,
                    status: queueStatusFilter,
                    enrollmentStatus: queueEnrollmentFilter,
                  })
                }}
                className="px-2.5 py-2 border border-slate-200 rounded-lg text-sm"
              />
              <label className="text-xs font-medium text-slate-600 sm:shrink-0">截止</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  const next = e.target.value
                  setDateTo(next)
                  setQueueListPage(1)
                  onHistoricalFiltersChange?.({
                    dateFrom,
                    dateTo: next,
                    projectCode: queueProjectFilter,
                    status: queueStatusFilter,
                    enrollmentStatus: queueEnrollmentFilter,
                  })
                }}
                className="px-2.5 py-2 border border-slate-200 rounded-lg text-sm"
              />
              <label htmlFor="queue-status-filter-panel" className="text-xs font-medium text-slate-600 sm:shrink-0">
                状态
              </label>
              <select
                id="queue-status-filter-panel"
                value={queueStatusFilter}
                onChange={(e) => {
                  const next = e.target.value
                  setQueueStatusFilter(next)
                  setQueueListPage(1)
                  onHistoricalFiltersChange?.({
                    dateFrom,
                    dateTo,
                    projectCode: queueProjectFilter,
                    status: next,
                    enrollmentStatus: queueEnrollmentFilter,
                  })
                }}
                className="px-2.5 py-2 border border-slate-200 rounded-lg text-sm bg-white min-w-[7rem]"
              >
                {QUEUE_STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <label htmlFor="queue-enrollment-filter-panel" className="text-xs font-medium text-slate-600 sm:shrink-0">
                入组情况
              </label>
              <select
                id="queue-enrollment-filter-panel"
                value={queueEnrollmentFilter}
                onChange={(e) => {
                  const next = e.target.value
                  setQueueEnrollmentFilter(next)
                  setQueueListPage(1)
                  onHistoricalFiltersChange?.({
                    dateFrom,
                    dateTo,
                    projectCode: queueProjectFilter,
                    status: queueStatusFilter,
                    enrollmentStatus: next,
                  })
                }}
                className="px-2.5 py-2 border border-slate-200 rounded-lg text-sm bg-white min-w-[7rem]"
              >
                {ENROLLMENT_QUEUE_FILTER_OPTIONS.map((o) => (
                  <option key={o.value || 'all-enroll'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <label htmlFor="queue-project-filter-panel" className="text-xs font-medium text-slate-600 sm:shrink-0">
            项目编号
          </label>
          {historicalMode ? (
            <select
              id="queue-project-filter-panel"
              value={queueProjectFilter}
              onChange={(e) => {
                const next = e.target.value
                setQueueProjectFilter(next)
                setQueueListPage(1)
                onProjectFilterChange?.(next)
                onHistoricalFiltersChange?.({
                  dateFrom,
                  dateTo,
                  projectCode: next,
                  status: queueStatusFilter,
                  enrollmentStatus: queueEnrollmentFilter,
                })
              }}
              title="当前日期范围下队列中出现的项目编号"
              className="w-full sm:max-w-xs px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white min-w-0"
            >
              <option value="">全部项目</option>
              {queueProjectFilter.trim() &&
              !(queueProjectOptionsQuery.data ?? []).includes(queueProjectFilter.trim()) ? (
                <option value={queueProjectFilter.trim()}>{queueProjectFilter.trim()}（当前筛选）</option>
              ) : null}
              {(queueProjectOptionsQuery.data ?? []).map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          ) : (
            <select
              id="queue-project-filter-panel"
              value={queueProjectFilter}
              onChange={(e) => {
                const next = e.target.value
                setQueueProjectFilter(next)
                setQueueListPage(1)
                onProjectFilterChange?.(next)
              }}
              title="筛选项目编号，与预约管理一致"
              className="w-full sm:max-w-xs px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white min-w-0"
            >
              <option value="">全部项目</option>
              {projectCodeFilterOptions.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {todayQueueQuery.data?.data?.items?.length ? (
        <>
          <div className="overflow-x-auto max-h-[min(70vh,36rem)] min-h-[20rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {historicalMode ? (
                    <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">预约日期</th>
                  ) : null}
                  <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">项目编号</th>
                  <th
                    className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap"
                    title="接待台工单执行今日队列签到后按项目生成（如 V1 首次分配 SC）"
                  >
                    SC号
                  </th>
                  <th
                    className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap"
                    title="接待台工单执行侧维护，与入组情况关联"
                  >
                    RD号
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">受试者姓名</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">拼音首字母</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">姓名</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">年龄</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">性别</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">手机号</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">联络员</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 min-w-[6rem]">备注</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">访视点</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">时间信息</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">状态</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 whitespace-nowrap">入组情况</th>
                </tr>
              </thead>
              <tbody>
                {todayQueueQuery.data.data.items.map((item, idx) => (
                  <tr
                    key={item.appointment_id ?? `subj-${item.subject_id}-${item.checkin_id ?? idx}`}
                    className="border-t border-slate-100"
                  >
                    {historicalMode ? (
                      <td className="px-3 py-2 whitespace-nowrap">{item.appointment_date || '—'}</td>
                    ) : null}
                    <td className="px-3 py-2 whitespace-nowrap">{item.project_code?.trim() ? item.project_code : '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{item.sc_number?.trim() ? item.sc_number : '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{item.rd_number?.trim() ? item.rd_number : '—'}</td>
                    <td className="px-3 py-2">{item.subject_name || '—'}</td>
                    <td className="px-3 py-2">{item.name_pinyin_initials?.trim() ? item.name_pinyin_initials : '—'}</td>
                    <td className="px-3 py-2">{item.subject_name || '—'}</td>
                    <td className="px-3 py-2">{item.age != null ? item.age : '—'}</td>
                    <td className="px-3 py-2">{formatGenderCell(item.gender)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{item.phone?.trim() ? item.phone : '—'}</td>
                    <td className="px-3 py-2 max-w-[8rem] break-words">{item.liaison?.trim() ? item.liaison : '—'}</td>
                    <td className="px-3 py-2 max-w-[10rem] text-xs text-slate-600 break-words">
                      {item.notes?.trim() ? item.notes : '—'}
                    </td>
                    <td className="px-3 py-2">{item.visit_point || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="space-y-1 text-xs text-slate-600 min-w-28">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400">预约</span>
                          <span>{formatDetailTime(item.appointment_time)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400">签入</span>
                          <span>{formatDetailTime(item.checkin_time)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400">签出</span>
                          <span>{formatDetailTime(item.checkout_time)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {item.status === 'waiting'
                        ? '待签到'
                        : item.status === 'checked_in'
                          ? '已签到'
                          : item.status === 'in_progress'
                            ? '执行中'
                            : item.status === 'checked_out'
                              ? '已签出'
                              : item.status === 'no_show'
                                ? '缺席'
                                : item.status}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {item.enrollment_status?.trim() ? item.enrollment_status : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2 px-4 py-2.5 border-t border-slate-200 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <span>
              共 {total} 条，每页 {QUEUE_PAGE_SIZE} 条
              {totalPages > 1 ? `，第 ${queueListPage}/${totalPages} 页` : ''}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {totalPages > 1 ? (
                <>
                  <button
                    type="button"
                    disabled={queueListPage <= 1}
                    onClick={() => setQueueListPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    disabled={queueListPage >= totalPages}
                    onClick={() => setQueueListPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50"
                  >
                    下一页
                  </button>
                  <form className="flex items-center gap-1.5" onSubmit={submitJump}>
                    <span className="text-slate-500">跳转至</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={jumpInput}
                      onChange={(e) => setJumpInput(e.target.value)}
                      className="w-16 px-2 py-1 border border-slate-200 rounded text-sm"
                      aria-label="页码"
                    />
                    <span className="text-slate-400">页</span>
                    <button
                      type="submit"
                      className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-700"
                    >
                      确定
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <div className="p-6 text-center text-slate-500">
          <CalendarCheck className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>
            {historicalMode ? (
              <>
                所选条件下（{dateFrom || '全部'} ~ {dateTo || '全部'}）暂无
                {vp ? `访视点「${vp}」` : ''}预约队列
              </>
            ) : (
              <>
                {queueDate} 暂无
                {vp ? `访视点为「${vp}」的` : ''}
                预约队列
                {queueProjectFilter.trim() ? '（当前项目筛选下）' : ''}
              </>
            )}
            ，新建或导入后将在此显示
          </p>
        </div>
      )}
    </div>
  )
}
