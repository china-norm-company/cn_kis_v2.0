import { useMemo, useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { executionApi, subjectApi, receptionApi } from '@cn-kis/api-client'
import type { Subject, QueueItem, FlowcardProgress } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import {
  Plus,
  Upload,
  FileSpreadsheet,
  Search,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  ChevronDown,
  UserCheck,
  PlayCircle,
  LogOut,
  UserX,
} from 'lucide-react'
import { Button, Badge, Card, Empty, StatCard, Modal } from '@cn-kis/ui-kit'
import * as XLSX from 'xlsx'

const TASK_LABEL_MAP: Record<QueueItem['task_type'], string> = {
  pre_screening: '粗筛',
  screening: '筛选',
  visit: '访视',
  extra_visit: '加访',
  walk_in: '临时到访',
}
const TASK_BADGE_MAP: Record<QueueItem['task_type'], 'warning' | 'info' | 'success' | 'default'> = {
  pre_screening: 'warning',
  screening: 'info',
  visit: 'success',
  extra_visit: 'default',
  walk_in: 'default',
}

/** 入组情况下拉选项（今日队列） */
const ENROLLMENT_STATUS_OPTIONS = ['初筛合格', '正式入组', '不合格', '复筛不合格', '退出', '缺席'] as const

/** 入组情况卡片展示顺序（对应 StatCard） */
const ENROLLMENT_STATUS_CARDS = ['初筛合格', '正式入组', '不合格', '复筛不合格', '退出'] as const

/** 与后端今日队列排序一致：无有效 SC（空/占位）视为「无 SC」 */
function normalizeQueueSc(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s || s === '-' || s === '—' || s === '－') return ''
  return s
}

/** 今日队列表格：项目编号升序；同项目内有效 SC 号在前、无 SC 在后；再按 SC 号升序；最后按预约时间 */
function compareQueueByProjectAndSc(a: QueueItem, b: QueueItem): number {
  const pcA = (a.project_code || '').trim()
  const pcB = (b.project_code || '').trim()
  const pcCmp = pcA.localeCompare(pcB, 'zh-CN')
  if (pcCmp !== 0) return pcCmp
  const scA = normalizeQueueSc(a.sc_number)
  const scB = normalizeQueueSc(b.sc_number)
  const emptyA = !scA
  const emptyB = !scB
  if (emptyA !== emptyB) return emptyA ? 1 : -1
  const scCmp = scA.localeCompare(scB, 'zh-CN', { numeric: true })
  if (scCmp !== 0) return scCmp
  return (a.appointment_time || '').localeCompare(b.appointment_time || '')
}

const VISIT_POINT_OPTIONS = ['初筛', '复筛', '基线', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17', 'V18', 'V19', 'V20', '其他']
const PURPOSE_OPTIONS = ['初筛', '复筛', '常规访视', '其他']
const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

// ─────────────────────────────────────────────────────────────────────────────
// 查看预约情况（独立组件，避免与日历等兄弟节点同树时选中日期后整块不渲染）
// ─────────────────────────────────────────────────────────────────────────────
interface ViewAppointmentSummaryProps {
  selectedDates: string[]
  summaryOpen: boolean
  onSummaryOpenChange: (open: boolean) => void
  slots: Array<{ time: string; count: number }>
  projectCode: string
  /** 正在请求该日预约汇总时为 true */
  loading?: boolean
  /** 请求失败时为 true */
  error?: boolean
}

function ViewAppointmentSummary({ selectedDates, summaryOpen, onSummaryOpenChange, slots, projectCode, loading, error }: ViewAppointmentSummaryProps) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden mt-3" data-section="view-appointment-summary">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700 border-0 text-left"
        onClick={() => onSummaryOpenChange(!summaryOpen)}
      >
        <span>
          查看预约情况
          {selectedDates.length === 0
            ? <span className="text-slate-400 font-normal ml-1">（请先勾选至少 1 个日期）</span>
            : selectedDates.length === 1
              ? <span className="text-slate-500 font-normal ml-1">（{selectedDates[0]} · {projectCode || '该项目'}）</span>
              : <span className="text-slate-400 font-normal ml-1">（请选择单日期查看）</span>
          }
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${summaryOpen ? 'rotate-180' : ''}`} />
      </button>
      {summaryOpen ? (
        <div className="px-4 py-3 border-t border-slate-100 bg-white">
          {selectedDates.length !== 1
            ? <p className="text-xs text-slate-400">请选择单日期查看。</p>
            : error
              ? <p className="text-xs text-amber-600">加载失败，请重试</p>
              : loading
                ? <p className="text-xs text-slate-400">加载中…</p>
                : slots.length === 0
                  ? <p className="text-xs text-slate-400">该日暂无预约记录</p>
                  : (
                <div className="flex flex-col gap-1.5">
                  {slots.map((s) => {
                    const pct = Math.min(100, (s.count / 6) * 100)
                    const barColor = s.count >= 5 ? 'bg-red-400' : s.count >= 3 ? 'bg-amber-400' : 'bg-blue-300'
                    return (
                      <div key={s.time} className="flex items-center gap-2 text-xs">
                        <span className="w-12 text-slate-500 font-medium">{s.time}</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-10 text-right text-slate-500">{s.count} 人</span>
                      </div>
                    )
                  })}
                </div>
              )
          }
        </div>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 签出确认抽屉（回访预约 / 测试完成）
// ─────────────────────────────────────────────────────────────────────────────
interface DateRow {
  date: string        // YYYY-MM-DD
  visitPoint: string
  appointmentTime: string
}

interface CheckoutDrawerProps {
  item: QueueItem
  onClose: () => void
  onSaved: () => void
}

function CheckoutDrawer({ item, onClose, onSaved }: CheckoutDrawerProps) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'revisit' | 'complete'>('revisit')

  // 日历
  const today = new Date()
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth()) // 0-indexed

  // 已选日期（YYYY-MM-DD 字符串集合）
  const [selectedDates, setSelectedDates] = useState<string[]>([])

  // 每日期填写行
  const [dateRows, setDateRows] = useState<DateRow[]>([])

  // 查看预约情况折叠
  const [summaryOpen, setSummaryOpen] = useState(false)

  // 预填时间（从后端取）
  const [prefillTime, setPrefillTime] = useState('')

  // 保存中
  const [saving, setSaving] = useState(false)

  // 仅当勾选恰好 1 个日期时请求该日该项目的队列，在前端按 appointment_time 聚合成时段供「查看预约情况」展示（避免 execution daily-summary 的 405 等问题）
  const dateToShow = selectedDates.length === 1 ? selectedDates[0] : null

  const { data: queueData, isFetching: summaryFetching, isError: summaryError } = useQuery({
    queryKey: ['reception', 'today-queue', dateToShow, (item.project_code ?? '').trim()],
    queryFn: () => receptionApi.todayQueue({
      target_date: dateToShow!,
      project_code: (item.project_code ?? '').trim(),
      page: 1,
      page_size: 999,
    }),
    enabled: !!dateToShow,
    refetchOnMount: 'always',
  })

  // 日期数量变化时重置折叠
  useEffect(() => {
    setSummaryOpen(false)
  }, [selectedDates.length])

  // 获取预填时间
  useEffect(() => {
    if (!item.subject_id) return
    executionApi.getLatestAppointmentTime(item.subject_id, {
      project_code: item.project_code || undefined,
    }).then((res) => {
      if (res.data?.appointment_time) setPrefillTime(res.data.appointment_time)
    }).catch(() => {/* ignore */})
  }, [item.subject_id, item.project_code])

  // 同步 dateRows 到 selectedDates 变化
  useEffect(() => {
    setDateRows((prev) => {
      const existing = new Map(prev.map((r) => [r.date, r]))
      return selectedDates.map((d, idx) => existing.get(d) ?? {
        date: d,
        visitPoint: '',
        appointmentTime: idx === 0 ? prefillTime : '',
      })
    })
  }, [selectedDates, prefillTime])

  // 日历辅助
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const fmtDate = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`
  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate())

  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay() // 0=日
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月']

  const toggleDate = useCallback((dateStr: string) => {
    setSelectedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr].sort()
    )
  }, [])

  const updateRow = (date: string, field: 'visitPoint' | 'appointmentTime', val: string) => {
    setDateRows((prev) => prev.map((r) => r.date === date ? { ...r, [field]: val } : r))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // 签出
      await receptionApi.quickCheckout(item.checkin_id!)

      if (mode === 'revisit' && selectedDates.length > 0) {
        await executionApi.batchCreateAppointments(item.subject_id, {
          items: dateRows.map((r) => ({
            appointment_date: r.date,
            appointment_time: r.appointmentTime || undefined,
            visit_point: r.visitPoint || undefined,
          })),
          project_code: item.project_code || '',
          project_name: item.project_name || '',
          name_pinyin_initials: item.name_pinyin_initials || '',
          liaison: item.liaison || '',
          gender: item.gender || '',
          age: item.age ?? undefined,
          enrollment_id: item.enrollment_id ?? undefined,
        })
      }

      queryClient.invalidateQueries({ queryKey: ['reception'] })
      onSaved()
    } catch (e) {
      window.alert('保存失败：' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // 从 today-queue 返回的 items 按 appointment_time 聚合成 { time, count }[]，供「查看预约情况」条形图展示
  const slots: Array<{ time: string; count: number }> = (() => {
    const items = Array.isArray(queueData?.data?.items) ? queueData!.data!.items : []
    const counts: Record<string, number> = {}
    items.forEach((row: { appointment_time?: string }) => {
      const raw = (row.appointment_time ?? '').trim()
      if (!raw) return
      const normalized = raw.length === 5 && raw.includes(':')
        ? raw
        : raw.length >= 4
          ? `${raw.slice(0, 2).padStart(2, '0')}:${raw.slice(2, 4)}`
          : raw
      counts[normalized] = (counts[normalized] ?? 0) + 1
    })
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, count]) => ({ time, count }))
  })()

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-[500px] max-w-full h-full bg-white flex flex-col shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div className="font-semibold text-slate-800 text-base">
              签出确认 · {item.subject_name}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {item.project_code} · SC {item.sc_number || '—'}
            </div>
          </div>
          <button className="text-slate-400 hover:text-slate-600 text-xl leading-none mt-0.5" onClick={onClose}>✕</button>
        </div>

        {/* 主体 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* 选项卡 */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">请选择签出方式</p>
            <div className="flex gap-3">
              {(['revisit', 'complete'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setMode(opt)}
                  className={`flex-1 flex items-center gap-2 px-4 py-3 rounded-lg border-2 text-left transition-colors ${mode === opt ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-200 hover:bg-slate-50'}`}
                >
                  <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${mode === opt ? 'border-blue-500' : 'border-slate-300'}`}>
                    {mode === opt && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{opt === 'revisit' ? '回访预约' : '测试完成'}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {opt === 'revisit' ? '预约下次/多次访视日期' : '所有访视已结束或中途退出，仅签出，不创建预约'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 回访预约：整块用一个根节点，避免兄弟条件渲染导致「查看预约情况」被复用或挤掉 */}
          {mode === 'revisit' && (
            <div key="revisit-section" className="flex flex-col gap-4">
              {/* 日历 */}
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">选择回访日期（可多选）</p>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
                    <button className="text-slate-500 hover:text-slate-800 px-2 py-0.5 rounded border border-slate-200 hover:bg-white text-sm"
                      onClick={() => { let m = calMonth - 1, y = calYear; if (m < 0) { m = 11; y-- } setCalMonth(m); setCalYear(y) }}>‹</button>
                    <span className="text-sm font-semibold text-slate-700">{calYear}年 {monthNames[calMonth]}</span>
                    <button className="text-slate-500 hover:text-slate-800 px-2 py-0.5 rounded border border-slate-200 hover:bg-white text-sm"
                      onClick={() => { let m = calMonth + 1, y = calYear; if (m > 11) { m = 0; y++ } setCalMonth(m); setCalYear(y) }}>›</button>
                  </div>
                  <div className="grid grid-cols-7 px-3 pt-2">
                    {['日','一','二','三','四','五','六'].map((d) => (
                      <div key={d} className="text-center text-xs text-slate-400 py-1 font-medium">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 px-3 pb-3 gap-y-1">
                    {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e${i}`} />)}
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const d = i + 1
                      const dateStr = fmtDate(calYear, calMonth, d)
                      const isPast = dateStr < todayStr
                      const isSelected = selectedDates.includes(dateStr)
                      const isToday = dateStr === todayStr
                      return (
                        <button
                          key={d}
                          disabled={isPast}
                          onClick={() => toggleDate(dateStr)}
                          className={`text-center text-sm py-1.5 rounded-md transition-colors relative
                            ${isPast ? 'text-slate-300 cursor-not-allowed' : 'cursor-pointer'}
                            ${isSelected ? 'bg-blue-500 text-white font-bold' : isToday ? 'text-blue-600 font-bold hover:bg-blue-50' : 'hover:bg-slate-100 text-slate-700'}
                          `}
                        >
                          {d}
                          {isToday && !isSelected && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {selectedDates.length > 0
                  ? <p className="text-xs text-blue-600 font-medium mt-1">已选 {selectedDates.length} 个日期：{selectedDates.join('、')}</p>
                  : <p className="text-xs text-slate-400 mt-1">点击日期选择回访日期（可多选）</p>
                }
              </div>

              {/* 查看预约情况：独立组件，顺序固定为日历之下 */}
              <ViewAppointmentSummary
                selectedDates={selectedDates}
                summaryOpen={summaryOpen}
                onSummaryOpenChange={setSummaryOpen}
                slots={slots}
                projectCode={item.project_code || ''}
                loading={summaryFetching}
                error={summaryError}
              />

              {/* 已选日期的访视点与时间 */}
              {dateRows.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">填写每个日期的访视点与时间</p>
                  <div className="flex flex-col gap-2">
                    {dateRows.map((row, idx) => (
                      <div key={row.date} className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg bg-white">
                        <span className="text-xs font-semibold text-slate-600 w-24 flex-shrink-0">{row.date}</span>
                        <div className="flex flex-col gap-1 flex-1">
                          <label className="text-xs text-slate-400">访视点</label>
                          <input
                            type="text"
                            value={row.visitPoint}
                            onChange={(e) => updateRow(row.date, 'visitPoint', e.target.value)}
                            placeholder="如 V2、复筛…"
                            className="border border-slate-200 rounded px-2 py-1 text-sm text-slate-800 focus:outline-none focus:border-blue-400 w-full"
                          />
                        </div>
                        <div className="flex flex-col gap-1 flex-1">
                          <label className="text-xs text-slate-400">{idx === 0 ? '预约时间（已预填）' : '预约时间'}</label>
                          <input
                            type="text"
                            value={row.appointmentTime}
                            onChange={(e) => updateRow(row.date, 'appointmentTime', e.target.value)}
                            placeholder="09:30"
                            className="border border-slate-200 rounded px-2 py-1 text-sm text-slate-800 focus:outline-none focus:border-blue-400 w-full"
                          />
                        </div>
                        <button className="text-slate-300 hover:text-red-400 flex-shrink-0 p-1 rounded hover:bg-red-50"
                          onClick={() => setSelectedDates((prev) => prev.filter((d) => d !== row.date))}>✕</button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">时间格式：HH:MM（如 09:30）；访视点如 V2、复筛等</p>
                </div>
              )}
            </div>
          )}

          {/* 测试完成说明 */}
          {mode === 'complete' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              点击「保存」后将<strong>仅执行签出，不创建任何回访预约</strong>。<br />
              该受试者在本项目中的所有访视已结束或中途退出。
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
          <Button variant="outline" size="sm" className="min-h-9" onClick={onClose} disabled={saving}>取消</Button>
          <Button size="sm" className="min-h-9" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 今日队列 · 编辑预约抽屉
// ─────────────────────────────────────────────────────────────────────────────
interface QueueEditDrawerProps {
  item: QueueItem
  queueDate: string
  onClose: () => void
  onSaved: () => void
}

function QueueEditDrawer({ item, queueDate, onClose, onSaved }: QueueEditDrawerProps) {
  const queryClient = useQueryClient()
  const [appointmentDate, setAppointmentDate] = useState(queueDate)
  const [appointmentTime, setAppointmentTime] = useState(item.appointment_time || '')
  const [visitPoint, setVisitPoint] = useState(item.visit_point || '')
  const [subjectName, setSubjectName] = useState(item.subject_name || '')
  const [namePinyinInitials, setNamePinyinInitials] = useState(item.name_pinyin_initials || '')
  const [gender, setGender] = useState(item.gender || '')
  const [age, setAge] = useState(String(item.age ?? ''))
  const [projectCode, setProjectCode] = useState(item.project_code || '')
  const [projectName, setProjectName] = useState(item.project_name || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setAppointmentDate(queueDate)
    setAppointmentTime(item.appointment_time || '')
    setVisitPoint(item.visit_point || '')
    setSubjectName(item.subject_name || '')
    setNamePinyinInitials(item.name_pinyin_initials || '')
    setGender(item.gender || '')
    setAge(String(item.age ?? ''))
    setProjectCode(item.project_code || '')
    setProjectName(item.project_name || '')
  }, [item, queueDate])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (item.appointment_id) {
        await executionApi.updateAppointment(item.appointment_id, {
          appointment_date: appointmentDate,
          appointment_time: appointmentTime || undefined,
          visit_point: visitPoint || undefined,
          project_code: projectCode || undefined,
          project_name: projectName || undefined,
          name_pinyin_initials: namePinyinInitials || undefined,
        })
      } else {
        await executionApi.createAppointment(item.subject_id, {
          appointment_date: appointmentDate,
          appointment_time: appointmentTime || undefined,
          visit_point: visitPoint || '',
          project_code: projectCode || '',
          project_name: projectName || '',
          name_pinyin_initials: namePinyinInitials || '',
        })
      }
      queryClient.invalidateQueries({ queryKey: ['reception'] })
      onSaved()
    } catch (e) {
      window.alert('保存失败：' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-[500px] max-w-full h-full bg-white flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div className="font-semibold text-slate-800 text-base">
              {item.appointment_id ? '编辑预约' : '补登预约'} · {item.subject_name}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {item.project_code} · SC {item.sc_number || '—'}
            </div>
          </div>
          <button className="text-slate-400 hover:text-slate-600 text-xl leading-none mt-0.5" onClick={onClose}>✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">预约日期</label>
            <input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">预约时间</label>
            <input type="text" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} placeholder="09:30" className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">访视点</label>
            <select value={visitPoint} onChange={(e) => setVisitPoint(e.target.value)} className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="">请选择</option>
              {VISIT_POINT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">受试者姓名</label>
            <input type="text" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm" readOnly />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">拼音首字母</label>
            <input type="text" value={namePinyinInitials} onChange={(e) => setNamePinyinInitials(e.target.value)} placeholder="如 ZS" className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">性别</label>
            <input type="text" value={formatGenderCell(gender)} readOnly className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">年龄</label>
            <input type="text" value={age} readOnly className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">项目编号</label>
            <input type="text" value={projectCode} onChange={(e) => setProjectCode(e.target.value)} className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">项目名称</label>
            <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-100">
          <Button variant="outline" size="sm" className="min-h-9" onClick={onClose} disabled={saving}>取消</Button>
          <Button size="sm" className="min-h-9" onClick={handleSave} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </div>
      </div>
    </div>
  )
}

function notify(msg: string) {
  window.alert(msg)
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

/** 浏览器本地日历日 YYYY-MM-DD（勿用 toISOString：东八区凌晨会得到前一日 UTC 日期） */
function localTodayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
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

/** Excel 导出：ISO 时间转为本地 YYYY-MM-DD HH:mm:ss；已是 HH:mm 则原样 */
function formatExportDateTime(value?: string | null): string {
  if (value === undefined || value === null) return ''
  const s = String(value).trim()
  if (!s) return ''
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.length <= 5 ? s : s.slice(0, 8)
  const dt = new Date(s)
  if (Number.isNaN(dt.getTime())) return s
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`
}

/**
 * 性别展示：受试者主档存的是 SubjectGender 英文码（male/female/other），接口会原样返回，故需转成中文；
 * 若为导入或手填的中文（男/女等）或其它非枚举值，则原样显示。
 */
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

export default function AppointmentsPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [quickName, setQuickName] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [quickGender, setQuickGender] = useState('')
  const [quickAge, setQuickAge] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newNamePinyinInitials, setNewNamePinyinInitials] = useState('')
  const [newPurpose, setNewPurpose] = useState('初筛')
  const [newVisitPoint, setNewVisitPoint] = useState('')
  const [newProjectCode, setNewProjectCode] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<Record<string, unknown>[]>([])
  const [importMeta, setImportMeta] = useState<{ projectCode: string; projectName: string; appointmentDate: string; visitPoint: string } | null>(null)
  const [importDragOver, setImportDragOver] = useState(false)

  const todayStr = localTodayYmd()
  const [queueDate, setQueueDate] = useState(todayStr)
  const [queueListPage, setQueueListPage] = useState(1)
  const queueListPageSize = 10
  const [queueProjectFilter, setQueueProjectFilter] = useState('')
  const [visibleMonth, setVisibleMonth] = useState(todayStr.slice(0, 7))
  const [queuePage, setQueuePage] = useState(1)
  const queuePageSize = 10
  const [projectFilter, setProjectFilter] = useState('')
  const [queueSearch, setQueueSearch] = useState('')
  const [showFlowcardProgress, setShowFlowcardProgress] = useState(false)
  const [flowcardProgress, setFlowcardProgress] = useState<FlowcardProgress | null>(null)
  /** 今日队列 RD 号输入中未提交的本地值，key: subject_id-project_code */
  const [pendingQueueRd, setPendingQueueRd] = useState<Record<string, string>>({})
  const subjectsQuery = useQuery({
    queryKey: ['subjects', 'appointments'],
    queryFn: async () => {
      const res = await subjectApi.list({ status: 'active', page_size: 150 })
      if (!res?.data) throw new Error('获取受试者列表失败')
      return res
    },
    enabled: showCreate,
    staleTime: 2 * 60 * 1000,
  })
  const todayQueueQuery = useQuery({
    queryKey: ['reception', 'today-queue', queueDate, queueListPage, queueProjectFilter.trim()],
    queryFn: () =>
      receptionApi.todayQueue({
        target_date: queueDate,
        page: queueListPage,
        page_size: queueListPageSize,
        source: 'execution',
        ...(queueProjectFilter.trim() ? { project_code: queueProjectFilter.trim() } : {}),
      }),
  })
  const appointmentCalendarQuery = useQuery({
    queryKey: ['reception', 'appointment-calendar', visibleMonth],
    queryFn: () => receptionApi.appointmentCalendar(visibleMonth),
  })
  const { data: statsRes } = useQuery({
    queryKey: ['reception', 'today-stats', queueDate],
    queryFn: () => receptionApi.todayStats(queueDate),
    refetchInterval: 30000,
  })
  const { data: queueQueueRes, isLoading: queueQueueLoading, refetch: refetchQueueQueue } = useQuery({
    queryKey: ['reception', 'today-queue', queueDate, queuePage, projectFilter],
    queryFn: () =>
      receptionApi.todayQueue({
        target_date: queueDate,
        page: queuePage,
        page_size: queuePageSize,
        project_code: projectFilter || undefined,
        source: 'execution',
      }),
    refetchInterval: 30000,
  })
  /** 独立查询获取当日全部项目列表，供项目筛选下拉始终展示所有项目（不受当前筛选影响） */
  const { data: projectListRes } = useQuery({
    queryKey: ['reception', 'today-queue', 'project-list', queueDate],
    queryFn: () =>
      receptionApi.todayQueue({
        target_date: queueDate,
        page: 1,
        page_size: 500,
        source: 'execution',
      }),
    staleTime: 60 * 1000,
  })
  /** 搜索时拉取更多数据（500 条）以支持跨页模糊搜索 SC/RD/姓名/手机号 */
  const { data: searchQueueRes, isFetching: searchQueueFetching } = useQuery({
    queryKey: ['reception', 'today-queue', 'search', queueDate, projectFilter, queueSearch],
    queryFn: () =>
      receptionApi.todayQueue({
        target_date: queueDate,
        page: 1,
        page_size: 500,
        project_code: projectFilter || undefined,
        source: 'execution',
      }),
    enabled: queueSearch.trim().length > 0,
    staleTime: 30 * 1000,
  })
  const { data: alertRes } = useQuery({
    queryKey: ['reception', 'pending-alerts', queueDate],
    queryFn: () => receptionApi.pendingAlerts(queueDate),
    refetchInterval: 30000,
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      let subjectId = selectedSubject
      if (!subjectId && (quickPhone.trim() || quickName.trim())) {
        const phone = quickPhone.trim()
        const name = quickName.trim()
        let existing = allSubjects.find((s) => s.phone === phone || (phone && s.phone?.includes(phone)))
        if (!existing && phone) {
          const listRes = await subjectApi.list({ search: phone, page_size: 50 })
          existing = (listRes as { data?: { items?: Subject[] } })?.data?.items?.find((s) => s.phone === phone)
        }
        if (!existing && name) {
          const listRes = await subjectApi.list({ search: name, page_size: 50 })
          existing = (listRes as { data?: { items?: Subject[] } })?.data?.items?.find((s) => s.name === name)
        }
        if (existing) {
          subjectId = existing.id
        } else {
          if (!name && !phone) throw new Error('请选择受试者或录入姓名、手机号')
          const ageNum = quickAge.trim() ? parseInt(quickAge.trim(), 10) : undefined
          const created = await subjectApi.create({
            name: name || '待补充',
            phone: phone || '',
            gender: quickGender || undefined,
            age: Number.isFinite(ageNum) ? ageNum : undefined,
          })
          subjectId = created.data?.id
        }
      }
      if (!subjectId) throw new Error('请选择受试者或录入姓名、手机号快速新建')
      if (!newProjectCode.trim()) throw new Error('请填写项目编号')
      if (!newVisitPoint) throw new Error('请选择访视点')
      return executionApi.createAppointment(subjectId, {
        appointment_date: newDate,
        appointment_time: newTime || undefined,
        purpose: newPurpose,
        visit_point: newVisitPoint,
        project_code: newProjectCode.trim(),
        project_name: newProjectName || undefined,
        name_pinyin_initials: newNamePinyinInitials.trim() || undefined,
      })
    },
    onSuccess: () => {
      notify('预约创建成功')
      setShowCreate(false)
      setSelectedSubject(null)
      setQuickName('')
      setQuickPhone('')
      setQuickGender('')
      setQuickAge('')
      setNewDate('')
      setNewTime('')
      setNewPurpose('初筛')
      setNewVisitPoint('')
      setNewProjectCode('')
      setNewProjectName('')
      setNewNamePinyinInitials('')
      queryClient.invalidateQueries({ queryKey: ['subjects', 'appointments'] })
      queryClient.invalidateQueries({ queryKey: ['reception', 'today-queue'] })
      queryClient.invalidateQueries({ queryKey: ['reception', 'appointment-calendar'] })
    },
    onError: (err) => notify((err as Error).message || '创建失败'),
  })

  const updateProjectScMutation = useMutation({
    mutationFn: (params: { subject_id: number; project_code: string; enrollment_status?: string; rd_number?: string }) =>
      receptionApi.updateProjectSc(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reception', 'today-queue'] })
      queryClient.invalidateQueries({ queryKey: ['reception', 'today-stats'] })
    },
    onError: (err) => notify((err as Error).message || '保存失败'),
  })

  const parseImportDate = (val: unknown): string => {
    if (val === undefined || val === null) return ''
    if (typeof val === 'string') {
      const raw = val.trim()
      const ymd = /^(\d{4})年(\d{1,2})月(\d{1,2})日?$/.exec(raw)
      if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`
      const slashYmd = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(raw)
      if (slashYmd) return `${slashYmd[1]}-${slashYmd[2].padStart(2, '0')}-${slashYmd[3].padStart(2, '0')}`
      const s = raw.split('T')[0].slice(0, 10)
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
    }
    if (typeof val === 'number') {
      const d = new Date((val - 25569) * 86400 * 1000)
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
      return ''
    }
    if (typeof val === 'object' && val !== null && 'date' in (val as object))
      return parseImportDate((val as { date: unknown }).date)
    const s = String(val).trim().split('T')[0].slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
  }

  const parseImportTime = (val: unknown): string => {
    if (val === undefined || val === null || val === '') return ''
    if (typeof val === 'number') {
      const h = Math.floor(val * 24)
      const m = Math.round((val * 24 - h) * 60)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
    return String(val).trim()
  }

  /** 预览表中日期/时间列显示为解析后的值，便于确认 Excel 序列号已正确转换 */
  const formatPreviewCell = (key: string, value: unknown): string => {
    if (value === undefined || value === null) return ''
    const timeKeys = ['时间段', '预约时间', '时间', 'time', 'appointment_time']
    const dateKeys = ['出生年月', '预约日期', '日期', 'date', '测试日期', 'appointment_date']
    if (timeKeys.includes(key)) return parseImportTime(value) || String(value)
    if (dateKeys.includes(key)) return parseImportDate(value) || String(value)
    return String(value)
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (importPreview.length === 0) throw new Error('请先上传并解析文件')
      const meta = importMeta
      const items = importPreview.map((row) => {
        const phone = String(
          row['手机号'] ?? row['phone'] ?? row['联系电话'] ?? row['电话'] ?? row['联系方式'] ?? row['手机号码'] ?? ''
        ).trim()
        const no = String(
          row['受试者编号'] ?? row['subject_no'] ?? row['编号'] ?? ''
        ).trim()
        const subjectName = String(
          row['姓名'] ?? row['受试者姓名'] ?? row['name'] ?? ''
        ).trim()
        const gender = String(
          row['性别'] ?? row['gender'] ?? ''
        ).trim()
        const ageVal = row['年龄'] ?? row['age'] ?? row['年龄段'] ?? ''
        const ageNum = typeof ageVal === 'number' ? ageVal : parseInt(String(ageVal).trim(), 10)
        const dateVal = row['预约日期'] ?? row['appointment_date'] ?? row['日期'] ?? row['date'] ?? row['测试日期'] ?? row['出生年月'] ?? ''
        const dateStr = parseImportDate(dateVal) || meta?.appointmentDate || new Date().toISOString().slice(0, 10)
        const timeVal = row['预约时间'] ?? row['appointment_time'] ?? row['时间'] ?? row['time'] ?? row['时间段'] ?? ''
        const timeStr = parseImportTime(timeVal)
        const purpose = String(row['访视目的'] ?? '常规到访').trim() || '常规到访'
        const visitPoint = String(row['访视点'] ?? row['visit_point'] ?? row['访视次数'] ?? '').trim() || (meta?.visitPoint ?? '')
        const projectCode = String(row['项目编号'] ?? row['project_code'] ?? row['方案编号'] ?? row['研究机构方案编号'] ?? '').trim() || (meta?.projectCode ?? '')
        const projectName = String(row['项目名称'] ?? row['project_name'] ?? row['研究名称'] ?? '').trim() || (meta?.projectName ?? '')
        const namePinyinInitials = String(
          row['首字母'] ?? row['拼音首字母'] ?? row['name_pinyin_initials'] ?? ''
        ).trim().toUpperCase().slice(0, 50) || undefined
        const liaison = String(row['联络员'] ?? row['liaison'] ?? '').trim().slice(0, 100) || undefined
        const scNumber = String(row['SC号'] ?? row['sc_number'] ?? row['sc号'] ?? '').trim() || undefined
        const rdNumber = String(row['RD号'] ?? row['rd_number'] ?? row['rd号'] ?? '').trim() || undefined
        return {
          subject_phone: phone || undefined,
          subject_no: no || undefined,
          subject_name: subjectName || undefined,
          name_pinyin_initials: namePinyinInitials,
          liaison,
          gender: gender || undefined,
          age: Number.isFinite(ageNum) ? ageNum : undefined,
          appointment_date: dateStr,
          appointment_time: timeStr || undefined,
          purpose,
          visit_point: visitPoint || undefined,
          project_code: projectCode || undefined,
          project_name: projectName || undefined,
          sc_number: scNumber,
          rd_number: rdNumber,
        }
      })
      return executionApi.importAppointments(items)
    },
    onSuccess: (res) => {
      const data = res?.data as { created?: number; errors?: Array<{ row: number; msg: string }> } | undefined
      const created = data?.created ?? 0
      const errors = data?.errors ?? []
      if (errors.length > 0) {
        const detail = errors.slice(0, 3).map((e) => `第${e.row}行：${e.msg}`).join('；')
        notify(`导入完成：成功 ${created} 条，失败 ${errors.length} 条。失败原因示例：${detail}`)
        if (created === 0 && errors.length > 0) {
          notify(`全部失败常见原因：\n1. 表头需包含「手机号」列且每行填写完整手机号（不能是脱敏号）\n2. 预约日期建议使用 YYYY-MM-DD 或 YYYY/M/D\n\n首条错误：${errors[0]?.msg ?? ''}`)
        }
      } else {
        notify(`成功导入 ${created} 条预约`)
      }
      if (created > 0 || errors.length === 0) {
        setShowImport(false)
        setImportFile(null)
        setImportPreview([])
        setImportMeta(null)
      }
      queryClient.invalidateQueries({ queryKey: ['reception', 'today-queue'] })
      queryClient.invalidateQueries({ queryKey: ['reception', 'appointment-calendar'] })
    },
    onError: (err) => notify((err as Error).message || '导入失败'),
  })

  const queueRaw = queueQueueRes?.data?.items ?? []
  const queueTotal = queueQueueRes?.data?.total ?? 0
  const queuePageTotal = Math.max(1, Math.ceil(queueTotal / queuePageSize))
  /** 仅来自左侧「查询日期」当日队列中的项目；不使用演示数据兜底，避免先显示假项目再闪成全部真实项目 */
  const projectListItems = (projectListRes?.data?.items ?? []) as QueueItem[]
  const projectOptions = useMemo(() => {
    const byCode = new Map<string, string>()
    projectListItems.forEach((item: QueueItem) => {
      const code = (item.project_code || '').trim()
      const name = (item.project_name || code || '').trim()
      if (code) byCode.set(code, name || code)
    })
    return Array.from(byCode.entries()).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [projectListItems])

  useEffect(() => {
    if (!projectFilter.trim()) return
    const codes = new Set(projectOptions.map((o) => o.code))
    if (!codes.has(projectFilter.trim())) {
      setProjectFilter('')
      setQueuePage(1)
    }
  }, [projectOptions, projectFilter, queueDate])
  const stats = statsRes?.data
  const ENROLLMENT_STATUS_KEYS = ['初筛合格', '正式入组', '不合格', '复筛不合格', '退出', '缺席'] as const
  const displayStats = useMemo(() => {
    if (!projectFilter) return stats
    const signedIn = queueRaw.filter((i: QueueItem) => i.checkin_id).length
    const inProgress = queueRaw.filter((i: QueueItem) => i.status === 'in_progress' || i.status === 'checked_in').length
    const counts: Record<string, number> = {}
    ENROLLMENT_STATUS_KEYS.forEach((k) => { counts[k] = 0 })
    queueRaw.forEach((i: QueueItem) => {
      const s = (i.enrollment_status || '').trim()
      if (s && counts[s] !== undefined) counts[s] += 1
    })
    return {
      total_appointments: queueTotal,
      checked_in: queueRaw.filter((i: QueueItem) => i.status === 'checked_in').length,
      in_progress: inProgress,
      checked_out: queueRaw.filter((i: QueueItem) => i.status === 'checked_out').length,
      no_show: queueRaw.filter((i: QueueItem) => i.status === 'no_show').length,
      total_signed_in: signedIn,
      signed_in_count: signedIn,
      enrollment_status_counts: counts,
    }
  }, [projectFilter, queueRaw, queueTotal, stats])
  const matchQueueSearch = (item: QueueItem, q: string): boolean => {
    if (!q || !q.trim()) return true
    const s = q.trim().toLowerCase()
    const sc = (item.sc_number ?? '').toLowerCase()
    const rd = (item.rd_number ?? '').toLowerCase()
    const name = (item.subject_name ?? '').toLowerCase()
    const phone = (item.phone ?? '').replace(/\s/g, '')
    const phoneS = s.replace(/\s/g, '')
    return sc.includes(s) || rd.includes(s) || name.includes(s) || phone.includes(phoneS)
  }
  const searchQueueRaw = (searchQueueRes?.data?.items ?? []) as QueueItem[]
  const queue = useMemo(() => {
    const base = queueSearch.trim() ? searchQueueRaw : queueRaw
    const filtered = queueSearch.trim() ? base.filter((i: QueueItem) => matchQueueSearch(i, queueSearch)) : base
    return [...filtered].sort(compareQueueByProjectAndSc)
  }, [queueSearch, queueRaw, searchQueueRaw])
  const isSearchMode = queueSearch.trim().length > 0
  const displayQueueTotal = isSearchMode ? queue.length : queueTotal
  const displayQueuePageTotal = Math.max(1, Math.ceil(displayQueueTotal / queuePageSize))
  const displayQueue = isSearchMode ? queue.slice((queuePage - 1) * queuePageSize, queuePage * queuePageSize) : queue
  const alerts = alertRes?.data?.items ?? []
  const displayDateText = useMemo(
    () =>
      new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).format(new Date(queueDate)),
    [queueDate],
  )
  const hasProjectFilter = !!projectFilter

  const checkinMutation = useMutation({
    mutationFn: (params: { subject_id: number; project_code?: string }) =>
      receptionApi.quickCheckin({ subject_id: params.subject_id, project_code: params.project_code }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reception'] })
      void queryClient.invalidateQueries({ queryKey: ['reception', 'today-queue'] })
      void queryClient.invalidateQueries({ queryKey: ['reception', 'today-stats'] })
    },
  })
  const handleConfirmCheckin = () => {
    if (!checkinConfirmTarget) return
    checkinMutation.mutate(
      { subject_id: checkinConfirmTarget.subject_id, project_code: checkinConfirmTarget.project_code },
      {
        onSuccess: () => setCheckinConfirmTarget(null),
        onError: (e) => window.alert('签到失败：' + (e as Error).message),
      },
    )
  }
  // 签出确认抽屉
  const [checkoutTarget, setCheckoutTarget] = useState<QueueItem | null>(null)
  // 今日队列编辑抽屉
  const [editQueueTarget, setEditQueueTarget] = useState<QueueItem | null>(null)
  /** 签到前核对受试者信息 */
  const [checkinConfirmTarget, setCheckinConfirmTarget] = useState<QueueItem | null>(null)

  const checkoutMutation = useMutation({
    mutationFn: (checkinId: number) => receptionApi.quickCheckout(checkinId),
    onSuccess: (res) => {
      const warnings = res.data?.warnings || []
      if (warnings.length > 0) window.alert(`签出提醒：\n${warnings.join('\n')}`)
      queryClient.invalidateQueries({ queryKey: ['reception'] })
    },
  })
  const missCallMutation = useMutation({
    mutationFn: (checkinId: number) => receptionApi.missCall(checkinId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reception'] }),
  })
  const projectCodeForCall = projectFilter || undefined
  const handleCallNext = async () => {
    const res = await receptionApi.callNext('default', projectCodeForCall)
    if (res.data?.called && res.data.subject) {
      const sub = res.data.subject
      window.alert(sub.sc_number ? `已叫号：${sub.name}（${sub.sc_number}）` : `已叫号：${sub.name}`)
      queryClient.invalidateQueries({ queryKey: ['reception'] })
      return
    }
    window.alert(res.data?.message || '当前无可叫号受试者')
  }
  const handleMissCall = (checkinId: number) => {
    missCallMutation.mutate(checkinId, {
      onSuccess: (res) => {
        if (res.data?.ok) window.alert(res.data.message || '已过号，该受试者已按该项目顺延 3 位重新排队')
        else window.alert(res.data?.message || '过号失败')
      },
      onError: (e) => window.alert('过号失败：' + (e as Error).message),
    })
  }
  const handleExportQueue = async () => {
    try {
      const res = await receptionApi.todayQueueExport({
        target_date: queueDate,
        project_code: projectFilter || undefined,
        source: 'execution',
      })
      const items = res.data?.items ?? []
      /** 性别：与今日队列表格一致，按 formatGenderCell 将 male/female、M/F 等转为 男/女/其他 */
      const headers = ['项目名称', '项目编号', 'SC号', '入组情况', 'RD号', '受试者姓名', '拼音首字母', '性别', '年龄', '手机号', '预约时间', '签到时间', '签出时间', '状态']
      const rows = items.map((i: QueueItem) => [
        i.project_name ?? '',
        i.project_code ?? '',
        i.sc_number ?? '',
        i.enrollment_status ?? '',
        i.rd_number ?? '',
        i.subject_name ?? '',
        i.name_pinyin_initials ?? '',
        formatGenderCell(i.gender),
        i.age ?? '',
        i.phone ?? '',
        formatExportDateTime(i.appointment_time ?? null),
        formatExportDateTime(i.checkin_time ?? null),
        formatExportDateTime(i.checkout_time ?? null),
        i.status === 'checked_in' ? '已签到' : i.status === 'checked_out' ? '已签出' : i.status === 'no_show' ? '缺席' : i.status === 'in_progress' ? '执行中' : '待签到',
      ])
      const aoa = [headers, ...rows]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = headers.map(() => ({ wch: 16 }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '今日队列')
      XLSX.writeFile(wb, `今日队列_${queueDate}.xlsx`)
      window.alert('导出成功')
    } catch (e) {
      window.alert('导出失败：' + (e as Error).message)
    }
  }
  const handleFlowcard = async (checkinId: number) => {
    const res = await receptionApi.printFlowcard(checkinId)
    const progress = await receptionApi.flowcardProgress(checkinId)
    setFlowcardProgress(progress.data || null)
    setShowFlowcardProgress(true)
    window.alert(res.data?.message || '流程卡已生成')
  }

  const allSubjects: Subject[] = subjectsQuery.data?.data?.items ?? []
  const monthCells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth])
  const appointmentCountMap = useMemo(() => {
    const items = appointmentCalendarQuery.data?.data?.items ?? []
    return new Map(items.map((item) => [item.date, item.total]))
  }, [appointmentCalendarQuery.data])
  const subjects = searchInput
    ? allSubjects.filter(
        (s) =>
          s.name?.includes(searchInput) ||
          s.subject_no?.includes(searchInput) ||
          s.phone?.includes(searchInput),
      )
    : allSubjects

  const handleSelectQueueDate = (dateKey: string) => {
    setQueueDate(dateKey)
    setQueueListPage(1)
    setQueuePage(1)
    setVisibleMonth(dateKey.slice(0, 7))
  }

  const handleChangeMonth = (offset: number) => {
    const nextMonth = shiftMonth(visibleMonth, offset)
    setVisibleMonth(nextMonth)
    setQueueDate(firstDayOfMonth(nextMonth))
    setQueueListPage(1)
  }

  const HEADER_MARKERS = ['序号', '时间段', '受访者姓名', '联系方式', '手机号码', '测试日期', '研究机构方案编号', '研究名称', '访视点']

  const findHeaderRow = (raw: string[][]): number => {
    for (let i = 0; i < Math.min(raw.length, 20); i++) {
      const row = raw[i] || []
      const line = row.map((c) => String(c ?? '').trim()).join(' ')
      const matchCount = HEADER_MARKERS.filter((m) => line.includes(m)).length
      if (matchCount >= 2) return i
    }
    return 0
  }

  const parseTitleMeta = (raw: string[][], headerRowIndex: number) => {
    let projectCode = ''
    let projectName = ''
    let appointmentDate = ''
    let visitPoint = ''
    for (let i = 0; i < headerRowIndex; i++) {
      const row = raw[i] || []
      const cell0 = String(row[0] ?? '').trim()
      const cell1 = String(row[1] ?? '').trim()
      const cell2 = String(row[2] ?? '').trim()
      if (cell0.includes('研究机构方案编号') || cell1.includes('研究机构方案编号')) projectCode = (cell0.includes('研究机构方案编号') ? cell1 || cell2 : cell2 || cell1) || projectCode
      if (cell0.includes('研究名称') || cell1.includes('研究名称')) projectName = (cell0.includes('研究名称') ? cell1 || cell2 : cell2 || cell1) || projectName
      if (cell0.includes('测试日期') || cell1.includes('测试日期')) appointmentDate = parseImportDate(cell0.includes('测试日期') ? cell1 || cell2 : cell2 || cell1) || appointmentDate
      if (cell0.includes('访视点') || cell1.includes('访视点')) visitPoint = (cell0.includes('访视点') ? cell1 || cell2 : cell2 || cell1) || visitPoint
    }
    return { projectCode, projectName, appointmentDate, visitPoint }
  }

  const looksLikeSubheader = (row: string[]): boolean => {
    const t = row.map((c) => String(c ?? '').trim()).join(' ')
    return /手机号码|微信号|年龄段/.test(t) && !/\d{11}/.test(t)
  }

  const processImportFile = (file: File) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.name) || ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'].includes(file.type)
    if (!ok) {
      notify('请上传 Excel (.xlsx/.xls) 或 CSV 文件')
      return
    }
    setImportFile(file)
    setImportMeta(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const first = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(first, { header: 1, defval: '' }) as string[][]
        if (!raw.length) {
          setImportPreview([])
          return
        }
        const headerRowIndex = findHeaderRow(raw)
        const headerCells = (raw[headerRowIndex] || []).map((c) => String(c ?? '').trim())
        let dataStart = headerRowIndex + 1
        if (raw[dataStart] && looksLikeSubheader(raw[dataStart])) {
          const sub = (raw[dataStart] || []).map((c) => String(c ?? '').trim())
          sub.forEach((s, j) => {
            if (s && (s === '手机号码' || s === '微信号' || s === '年龄段')) headerCells[j] = headerCells[j] || s
          })
          dataStart += 1
        }
        const headers = headerCells.map((c, j) => c || `列${j}`)
        const rows: Record<string, unknown>[] = []
        for (let i = dataStart; i < raw.length; i++) {
          const row = raw[i] || []
          const obj: Record<string, unknown> = {}
          headers.forEach((h, j) => {
            const v = row[j]
            if (v !== undefined && v !== null && String(v).trim() !== '') obj[h] = v
          })
          if (Object.keys(obj).length > 0) rows.push(obj)
        }
        const meta = parseTitleMeta(raw, headerRowIndex)
        if (meta.projectCode || meta.projectName || meta.appointmentDate || meta.visitPoint) {
          setImportMeta(meta)
        } else {
          setImportMeta(null)
        }
        setImportPreview(rows.slice(0, 500))
      } catch (err) {
        notify('文件解析失败，请确保为 Excel 或 CSV 格式')
        setImportPreview([])
        setImportMeta(null)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processImportFile(file)
    e.target.value = ''
  }

  const handleImportDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setImportDragOver(true)
  }
  const handleImportDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setImportDragOver(false)
  }
  const handleImportDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setImportDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    processImportFile(file)
  }

  return (
    <div className="space-y-6">
      {/* 签出确认抽屉 */}
      {checkoutTarget && (
        <CheckoutDrawer
          item={checkoutTarget}
          onClose={() => setCheckoutTarget(null)}
          onSaved={() => setCheckoutTarget(null)}
        />
      )}
      {/* 今日队列编辑抽屉 */}
      {editQueueTarget && (
        <QueueEditDrawer
          item={editQueueTarget}
          queueDate={queueDate}
          onClose={() => setEditQueueTarget(null)}
          onSaved={() => setEditQueueTarget(null)}
        />
      )}
      <Modal
        open={!!checkinConfirmTarget}
        onClose={() => !checkinMutation.isPending && setCheckinConfirmTarget(null)}
        title="确认签到"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={checkinMutation.isPending} onClick={() => setCheckinConfirmTarget(null)}>
              取消
            </Button>
            <Button size="sm" disabled={checkinMutation.isPending} onClick={handleConfirmCheckin}>
              {checkinMutation.isPending ? '提交中…' : '确认签到'}
            </Button>
          </div>
        }
      >
        {checkinConfirmTarget ? (
          <div className="space-y-4 text-sm text-slate-700">
            <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              请核对以下信息与现场受试者是否一致。若<strong className="font-semibold">有误</strong>请点击「取消」，核实后再操作；若<strong className="font-semibold">无误</strong>请点击「确认签到」。
            </p>
            <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-2">
              <dt className="text-slate-500">姓名</dt>
              <dd className="font-medium text-slate-900">{checkinConfirmTarget.subject_name || '—'}</dd>
              <dt className="text-slate-500">手机号</dt>
              <dd className="font-medium text-slate-900">{checkinConfirmTarget.phone?.trim() || '—'}</dd>
              <dt className="text-slate-500">项目编号</dt>
              <dd className="font-medium text-slate-900">{(checkinConfirmTarget.project_code || '').trim() || '—'}</dd>
              <dt className="text-slate-500">访视点</dt>
              <dd className="font-medium text-slate-900">{(checkinConfirmTarget.visit_point || '').trim() || '—'}</dd>
            </dl>
          </div>
        ) : null}
      </Modal>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">工单执行</h2>
          <p className="text-sm text-slate-500 mt-1">新建预约、导入预约表</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" /> 新建预约
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Upload className="w-4 h-4" /> 导入预约表
          </button>
        </div>
      </div>

      {/* 新建预约弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[92vw] max-w-2xl my-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">新建预约</h3>
            <p className="text-sm text-slate-500 mb-3">可搜索选择已有受试者，或直接录入信息快速新建</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">受试者（搜索选择）</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="搜索姓名/编号/手机号"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div className="mt-2 max-h-32 overflow-y-auto border rounded-lg">
                  {subjectsQuery.isLoading ? (
                    <div className="px-3 py-4 text-center text-slate-500 text-sm">加载受试者列表…</div>
                  ) : subjects.length === 0 ? (
                    <div className="px-3 py-4 text-center text-slate-500 text-sm">暂无受试者，请使用下方快速录入</div>
                  ) : (
                    subjects.slice(0, 20).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSubject(s.id)}
                        className={`w-full text-left px-3 py-2 text-sm ${selectedSubject === s.id ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        {s.name} {s.subject_no} {s.phone}
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="border-t border-slate-200 pt-4">
                <p className="text-sm text-slate-600 mb-2">或快速录入（未选中受试者可在此填写，将匹配/新建）</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">受试者姓名</label>
                    <input
                      type="text"
                      value={quickName}
                      onChange={(e) => setQuickName(e.target.value)}
                      placeholder="姓名"
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">手机号</label>
                    <input
                      type="tel"
                      value={quickPhone}
                      onChange={(e) => setQuickPhone(e.target.value)}
                      placeholder="11位手机号"
                      maxLength={11}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">性别</label>
                    <select
                      value={quickGender}
                      onChange={(e) => setQuickGender((e.target.value as '' | 'M' | 'F') || '')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    >
                      <option value="">请选择</option>
                      <option value="M">男</option>
                      <option value="F">女</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">年龄（可选）</label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      placeholder="岁"
                      value={quickAge}
                      onChange={(e) => setQuickAge(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">预约日期</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">预约时间（可选）</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">访视目的</label>
                  <select
                    value={newPurpose}
                    onChange={(e) => setNewPurpose(e.target.value)}
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    {PURPOSE_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">访视点（必选）</label>
                  <select
                    value={newVisitPoint}
                    onChange={(e) => setNewVisitPoint(e.target.value)}
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="">请选择</option>
                    {VISIT_POINT_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">项目编号（必填）</label>
                  <input
                    type="text"
                    value={newProjectCode}
                    onChange={(e) => setNewProjectCode(e.target.value)}
                    placeholder="如 M25076081"
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">项目名称（可选）</label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="如 4周底妆产品"
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">拼音首字母（可选）</label>
                  <input
                    type="text"
                    value={newNamePinyinInitials}
                    onChange={(e) => setNewNamePinyinInitials(e.target.value.toUpperCase().slice(0, 50))}
                    placeholder="如 张三→ZS"
                    maxLength={50}
                    className="w-full min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={() => { setShowCreate(false); setQuickName(''); setQuickPhone(''); setQuickGender(''); setQuickAge(''); }}
                className="min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm"
              >
                取消
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={(!selectedSubject && !quickName && !quickPhone) || !newDate || !newProjectCode.trim() || !newVisitPoint || createMutation.isPending}
                className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {createMutation.isPending ? '创建中...' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导入预约弹窗 */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[92vw] max-w-2xl">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" /> 导入预约表
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              支持 Excel (.xlsx/.xls) 或 CSV。表头需包含：<strong>手机号</strong>、<strong>预约日期</strong>（支持 <strong>YYYY-MM-DD</strong>、<strong>YYYY/M/D</strong>，也兼容<strong>测试日期</strong>/<strong>出生年月</strong>等日期列）；<strong>受试者编号</strong>可不包含在表头中（仅手机号即可匹配或新建受试者）。可选列：<strong>预约时间</strong>/<strong>时间段</strong>、<strong>访视目的</strong>、<strong>访视点</strong>、<strong>项目编号</strong>/<strong>项目名称</strong>、<strong>拼音首字母</strong>（列名为「首字母」）、<strong>SC号</strong>、<strong>RD号</strong>。若提供<strong>姓名</strong>/<strong>受试者姓名</strong>、<strong>性别</strong>、<strong>年龄</strong>会一并带入。导入时<strong>SC号/RD号</strong>非空则直接使用，不依赖签到或入组选择生成。
            </p>
            <p className="text-xs text-amber-700 mb-4">
              手机号请填写<strong>完整号码</strong>，带星号脱敏的号码无法匹配或补建受试者。
            </p>
            <p className="text-sm text-blue-600 mb-4">
              <a
                href="https://china-norm.feishu.cn/wiki/U2MIwuRLliLjwNkEybrcdtmMnPf?from=from_copylink"
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                下载导入示例模板
              </a>
            </p>
            <div className="space-y-4">
              <div
                onDragOver={handleImportDragOver}
                onDragLeave={handleImportDragLeave}
                onDrop={handleImportDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                  importDragOver
                    ? 'border-emerald-400 bg-emerald-50/80'
                    : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-100/50'
                }`}
              >
                <label className="cursor-pointer block">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <span className="inline-flex items-center gap-2 text-slate-600">
                    <Upload className="w-5 h-5" />
                    <span className="font-medium">
                      {importDragOver ? '松开即可导入' : '点击选择文件或拖拽文件到此处'}
                    </span>
                  </span>
                </label>
                <p className="text-xs text-slate-500 mt-2">支持 .xlsx、.xls、.csv</p>
                {importFile && (
                  <p className="text-sm text-emerald-700 mt-2 font-medium">{importFile.name}</p>
                )}
              </div>
              {importPreview.length > 0 && (
                <div className="border rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        {Object.keys(importPreview[0]).map((k) => (
                          <th key={k} className="px-3 py-2 text-left font-medium text-slate-600">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          {Object.entries(row).map(([k, v]) => (
                            <td key={k} className="px-3 py-2 text-slate-700">{formatPreviewCell(k, v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 bg-slate-50 text-xs text-slate-500">
                    共 {importPreview.length} 条（仅预览前 10 条）
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowImport(false)
                  setImportFile(null)
                  setImportPreview([])
                }}
                className="min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm"
              >
                取消
              </button>
              <button
                onClick={() => importMutation.mutate()}
                disabled={importPreview.length === 0 || importMutation.isPending}
                className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {importMutation.isPending ? '导入中...' : '开始导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 今日队列：查询、统计、叫号、待处理提醒、队列表格 */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 space-y-3" data-section="query-filter">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">查询日期</span>
            <input
              type="date"
              value={queueDate}
              onChange={(e) => handleSelectQueueDate(e.target.value)}
              title="查询日期"
              aria-label="查询日期"
              className="min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            />
            {queueDate !== todayStr && (
              <button type="button" onClick={() => handleSelectQueueDate(todayStr)} className="text-sm text-blue-600 hover:underline">
                回到今日
              </button>
            )}
          </div>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-slate-700">项目筛选</span>
            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value)
                setQueuePage(1)
              }}
              title="项目筛选"
              aria-label="项目筛选"
              className="min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white w-40"
            >
              <option value="">全部项目</option>
              {projectOptions.map(({ code }) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={queueSearch}
                onChange={(e) => {
                  setQueueSearch(e.target.value)
                  setQueuePage(1)
                }}
                placeholder="搜索 SC号/RD号/姓名/手机号"
                title="与项目筛选为且关系：先按项目筛选，再在结果中搜索"
                className="min-h-10 w-72 min-w-[200px] pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          {hasProjectFilter ? `当前筛选：${projectFilter}，统计与队列已联动` : `默认展示 ${displayDateText} 当日全部预约数据`}
          {queueSearch.trim() && '；项目筛选与搜索为且关系'}
        </p>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:gap-3">
          <StatCard
            label="预约总数"
            value={displayStats?.total_appointments ?? 0}
            icon={<CalendarCheck className="h-4 w-4" />}
            color="blue"
          />
          <StatCard
            label="已签到"
            value={displayStats?.signed_in_count ?? displayStats?.total_signed_in ?? displayStats?.checked_in ?? 0}
            icon={<UserCheck className="h-4 w-4" />}
            color="green"
          />
          <StatCard
            label="执行中"
            value={displayStats?.in_progress ?? 0}
            icon={<PlayCircle className="h-4 w-4" />}
            color="amber"
          />
          <StatCard
            label="已签出"
            value={displayStats?.checked_out ?? 0}
            icon={<LogOut className="h-4 w-4" />}
            color="teal"
          />
          <StatCard
            label="缺席"
            value={displayStats?.enrollment_status_counts?.['缺席'] ?? 0}
            icon={<UserX className="h-4 w-4" />}
            color="red"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 lg:gap-3">
          {(['初筛合格', '正式入组', '不合格', '复筛不合格', '退出'] as const).map((status) => (
            <StatCard
              key={status}
              label={status}
              value={displayStats?.enrollment_status_counts?.[status] ?? 0}
              color={
                status === '正式入组'
                  ? 'green'
                  : status === '不合格' || status === '复筛不合格'
                    ? 'red'
                    : status === '退出'
                      ? 'indigo'
                      : 'blue'
              }
            />
          ))}
        </div>
      </div>
      <Card
        variant="bordered"
        title={queueDate === todayStr ? '今日队列' : `${displayDateText} 预约队列`}
        extra={
          <Button className="min-h-9" size="sm" variant="outline" onClick={handleExportQueue} disabled={queueTotal === 0}>
            <Download className="w-4 h-4 mr-1" /> 导出
          </Button>
        }
      >
        {(queueQueueLoading || (isSearchMode && searchQueueFetching)) ? (
          <p className="text-sm text-slate-400">加载中...</p>
        ) : displayQueue.length === 0 ? (
          <Empty title={isSearchMode ? '未找到匹配的 SC号/RD号/姓名或手机号' : (queueDate === todayStr ? '今日暂无预约' : '当日暂无预约')} />
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 font-medium text-slate-600">项目编号</th>
                    <th className="text-left py-2 font-medium text-slate-600">SC号</th>
                    <th className="text-left py-2 font-medium text-slate-600">受试者姓名</th>
                    <th className="text-left py-2 font-medium text-slate-600">拼音首字母</th>
                    <th className="text-left py-2 font-medium text-slate-600">性别</th>
                    <th className="text-left py-2 font-medium text-slate-600">年龄</th>
                    <th className="text-left py-2 font-medium text-slate-600">手机号</th>
                    <th className="text-left py-2 font-medium text-slate-600 hidden">受试者编号</th>
                    <th className="text-left py-2 font-medium text-slate-600">访视点</th>
                    <th className="text-left py-2 font-medium text-slate-600">预约时间</th>
                    <th className="text-left py-2 font-medium text-slate-600">签到/签出</th>
                    <th className="text-left py-2 font-medium text-slate-600">状态</th>
                    <th className="text-left py-2 font-medium text-slate-600 w-20 hidden">过号</th>
                    <th className="text-left py-2 font-medium text-slate-600">入组情况</th>
                    <th className="text-left py-2 font-medium text-slate-600">RD号</th>
                    <th className="text-left py-2 font-medium text-slate-600 min-w-[160px]">操作</th>
                    <th className="text-left py-2 font-medium text-slate-600">编辑</th>
                  </tr>
                </thead>
                <tbody>
                  {displayQueue.map((item: QueueItem) => {
                    const queueRowKey = `${item.subject_id}-${(item.project_code || '').trim()}`
                    const isEnrolled = (item.enrollment_status || '').trim() === '正式入组'
                    const rdDisplay = pendingQueueRd[queueRowKey] ?? item.rd_number ?? (isEnrolled ? 'RD' : '')
                    /** 未签到时仅「缺席」可选；初筛合格/正式入组等需先签到（与后端一致） */
                    const hasExecutionCheckin = !!item.checkin_id
                    return (
                    <tr
                      key={`${item.subject_id}-${item.appointment_time}-${item.appointment_id}`}
                      className={`border-b border-slate-100 ${item.status === 'in_progress' ? 'bg-amber-50/80' : ''}`}
                      data-stat="queue-item"
                      data-status={item.status}
                    >
                      <td className="py-2 text-slate-700">{item.project_code || '-'}</td>
                      <td className="py-2 text-slate-700">{item.sc_number ?? '-'}</td>
                      <td className="py-2 text-slate-700">{item.subject_name || '-'}</td>
                      <td className="py-2 text-slate-600">{item.name_pinyin_initials ?? '-'}</td>
                      <td className="py-2 text-slate-600">{formatGenderCell(item.gender)}</td>
                      <td className="py-2 text-slate-600">{item.age ?? '-'}</td>
                      <td className="py-2 text-slate-600">{item.phone ?? '-'}</td>
                      <td className="py-2 text-slate-700 hidden">{item.subject_no || '-'}</td>
                      <td className="py-2 text-slate-600">{item.visit_point || '-'}</td>
                      <td className="py-2 text-slate-600">{item.appointment_time || '-'}</td>
                      <td className="py-2 text-slate-600">
                        {item.checkin_time ? new Date(item.checkin_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        {' / '}
                        {item.checkout_time ? new Date(item.checkout_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="py-2">
                        {item.status === 'checked_in' ? '已签到' : item.status === 'checked_out' ? '已签出' : item.status === 'no_show' ? '缺席' : item.status === 'in_progress' ? '执行中' : '待签到'}
                      </td>
                      <td className="py-2 hidden">
                        {item.status === 'in_progress' && item.checkin_id ? (
                          <Button className="min-h-8" size="sm" variant="primary" disabled={missCallMutation.isPending} data-action="miss-call" title="已叫号未到窗口时点击" onClick={() => handleMissCall(item.checkin_id!)}>
                            过号
                          </Button>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2">
                        <select
                          className="w-full min-w-[100px] px-2 py-1 text-sm border border-slate-200 rounded"
                          value={(item.enrollment_status || '').trim() || ''}
                          onChange={(e) => {
                            const v = e.target.value
                            updateProjectScMutation.mutate({
                              subject_id: item.subject_id,
                              project_code: (item.project_code || '').trim(),
                              enrollment_status: v || undefined,
                              rd_number: v === '正式入组' && !(item.rd_number || '').trim() ? 'RD' : (item.rd_number || '').trim() || undefined,
                            })
                          }}
                        >
                          <option value="">请选择</option>
                          {ENROLLMENT_STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt} disabled={!hasExecutionCheckin && opt !== '缺席'}>{opt}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2">
                        {isEnrolled ? (
                          <input
                            type="text"
                            className="w-24 px-2 py-1 text-sm border border-slate-200 rounded"
                            value={rdDisplay}
                            onChange={(e) => setPendingQueueRd((prev) => ({ ...prev, [queueRowKey]: e.target.value }))}
                            onBlur={() => {
                              const val = (pendingQueueRd[queueRowKey] ?? item.rd_number ?? 'RD').trim()
                              updateProjectScMutation.mutate({
                                subject_id: item.subject_id,
                                project_code: (item.project_code || '').trim(),
                                rd_number: val || 'RD',
                              })
                              setPendingQueueRd((prev) => {
                                const next = { ...prev }
                                delete next[queueRowKey]
                                return next
                              })
                            }}
                            placeholder="RD 后填数字"
                          />
                        ) : (
                          <span className="text-slate-400">{item.rd_number || '—'}</span>
                        )}
                      </td>
                      <td className="py-2">
                        {item.status === 'waiting' && (
                          <PermissionGuard permission="subject.subject.update">
                            <Button
                              className="min-h-8"
                              size="sm"
                              data-action="checkin"
                              onClick={() => setCheckinConfirmTarget(item)}
                            >
                              签到
                            </Button>
                          </PermissionGuard>
                        )}
                        {(item.status === 'checked_in' || item.status === 'in_progress') && item.checkin_id && (
                          <PermissionGuard permission="subject.subject.update">
                            <>
                              {item.task_type === 'pre_screening' && (
                                <Button className="min-h-8 mr-1" size="sm" variant="outline" onClick={() => window.open(`/recruitment/#/prescreening?subject_id=${item.subject_id}`, '_blank')}>
                                  发起粗筛
                                </Button>
                              )}
                              {/* 打印流程卡：暂不展示，恢复时取消下面注释
                              {(item.task_type === 'visit' || item.task_type === 'screening' || item.task_type === 'extra_visit') && (
                                <Button className="min-h-8 mr-1" size="sm" variant="outline" onClick={() => handleFlowcard(item.checkin_id!)}>打印流程卡</Button>
                              )}
                              */}
                              <Button className="min-h-8" size="sm" variant="outline" data-action="checkout" onClick={() => setCheckoutTarget(item)}>签出</Button>
                            </>
                          </PermissionGuard>
                        )}
                      </td>
                      <td className="py-2">
                        <PermissionGuard permission="subject.subject.update">
                          <Button
                            className="min-h-8"
                            size="sm"
                            variant="outline"
                            disabled={item.checkin_id != null}
                            title={item.checkin_id != null ? '已签到后不可再编辑预约，如需调整请联系管理员' : undefined}
                            onClick={() => setEditQueueTarget(item)}
                          >
                            编辑
                          </Button>
                        </PermissionGuard>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 pt-1">说明：未签到时可选择「缺席」；初筛合格、正式入组等其余项需先签到。选择「正式入组」后，系统将按项目自动生成 RD 号（如 RD001、RD002…）；也可手动输入 RD+数字。</p>
            {displayQueuePageTotal > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-slate-500">共 {displayQueueTotal} 条，每页 {queuePageSize} 条{isSearchMode ? '（搜索模式）' : ''}</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" className="min-h-8" disabled={queuePage <= 1} onClick={() => setQueuePage((p) => Math.max(1, p - 1))}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="px-2 text-sm text-slate-600">{queuePage} / {displayQueuePageTotal}</span>
                  <Button size="sm" variant="outline" className="min-h-8" disabled={queuePage >= displayQueuePageTotal} onClick={() => setQueuePage((p) => Math.min(displayQueuePageTotal, p + 1))}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
      <Card variant="bordered" title="叫号" data-section="call-next" className="border-teal-200 bg-teal-50/50">
        <p className="text-sm text-slate-700 mb-3">叫号：按当前筛选项目内的 SC 号顺序（SC001 → SC002 → …）</p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={projectFilter}
            onChange={(e) => {
              setProjectFilter(e.target.value)
              setQueuePage(1)
            }}
            title="叫号项目"
            aria-label="叫号项目"
            className="min-h-10 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white w-40"
          >
            <option value="">全部项目</option>
            {projectOptions.map(({ code }) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
          <Button className="min-h-11" size="sm" variant="primary" onClick={handleCallNext}>
            按所选项目叫号
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          过号规则：已叫号但未到窗口的，点「过号」后按所属项目顺延 3 位重新排队。操作位置：上方「今日队列」表格该行「操作」列点击「过号」。
        </p>
      </Card>
      <Card variant="bordered" title="待处理提醒">
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-400">暂无待处理提醒</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert, idx) => (
              <div key={`${alert.subject_no}-${idx}`} className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 text-sm text-amber-800">
                {alert.message}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 预约列表：默认显示当天，可切换月份并点击任意日期查看 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-800">预约列表</h3>
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
                const total = appointmentCountMap.get(cell.date) ?? 0

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
                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none ${
                        total > 0
                          ? isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-500 text-white'
                          : 'bg-slate-200 text-slate-500'
                        }`}>
                          {total}项
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
        <div className="px-4 py-3 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="text-sm text-slate-600 shrink-0">
            当前日期：{queueDate}
          </div>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2 sm:min-w-0 sm:flex-1 sm:max-w-md sm:justify-end">
            <label htmlFor="queue-project-filter" className="text-xs font-medium text-slate-600 sm:shrink-0">
              项目编号
            </label>
            <div className="relative w-full sm:max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                id="queue-project-filter"
                type="text"
                value={queueProjectFilter}
                onChange={(e) => {
                  setQueueProjectFilter(e.target.value)
                  setQueueListPage(1)
                }}
                placeholder="筛选，留空为全部"
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                autoComplete="off"
              />
            </div>
          </div>
        </div>
        {todayQueueQuery.data?.data?.items?.length ? (
          <>
            <div className="overflow-x-auto max-h-[min(70vh,36rem)] min-h-[20rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
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
                    <tr key={item.appointment_id ?? `subj-${item.subject_id}-${item.checkin_id ?? idx}`} className="border-t border-slate-100">
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
                      <td className="px-3 py-2 max-w-[10rem] text-xs text-slate-600 break-words">{item.notes?.trim() ? item.notes : '—'}</td>
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
                      <td className="px-3 py-2">{item.status === 'waiting' ? '待签到' : item.status === 'checked_in' ? '已签到' : item.status === 'in_progress' ? '执行中' : item.status === 'checked_out' ? '已签出' : item.status === 'no_show' ? '缺席' : item.status}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{item.enrollment_status?.trim() ? item.enrollment_status : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(() => {
              const total = todayQueueQuery.data?.data?.total ?? 0
              const totalPages = Math.max(1, Math.ceil(total / queueListPageSize))
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-200 text-sm text-slate-600">
                  <span>
                    共 {total} 条，每页 {queueListPageSize} 条
                    {totalPages > 1 ? `，第 ${queueListPage}/${totalPages} 页` : ''}
                  </span>
                  {totalPages > 1 ? (
                    <div className="flex gap-2">
                      <button type="button" disabled={queueListPage <= 1} onClick={() => setQueueListPage((p) => Math.max(1, p - 1))} className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50">上一页</button>
                      <button type="button" disabled={queueListPage >= totalPages} onClick={() => setQueueListPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50">下一页</button>
                    </div>
                  ) : null}
                </div>
              )
            })()}
          </>
        ) : (
          <div className="p-6 text-center text-slate-500">
            <CalendarCheck className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>{queueDate} 暂无预约，新建或导入后将在此显示</p>
          </div>
        )}
      </div>

      {/* 流程卡进度弹窗 */}
      {showFlowcardProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowFlowcardProgress(false)}>
          <div className="bg-white rounded-xl shadow-xl p-4 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-800">流程卡进度</h3>
              <button type="button" onClick={() => setShowFlowcardProgress(false)} className="text-slate-500 hover:text-slate-700">关闭</button>
            </div>
            {!flowcardProgress ? (
              <p className="text-sm text-slate-500">暂无进度数据</p>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-slate-700">总步骤 {flowcardProgress.total_steps}，已完成 {flowcardProgress.done_steps}，进度 {flowcardProgress.progress_percent}%</div>
                <div className="space-y-2 max-h-[320px] overflow-auto">
                  {flowcardProgress.steps.map((step) => (
                    <div key={step.sequence} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                      <div className="font-medium text-slate-800">{step.sequence}. {step.title}</div>
                      <div className="text-xs text-slate-500">{step.workorder_no} · {step.scheduled_date || '未排期'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
