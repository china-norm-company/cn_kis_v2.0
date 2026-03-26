/**
 * 排程核心页：项目信息（只读，与项目管理详情页一致）+ 项目排期（访视点/流程/执行日期）+ 行政/评估/技术排程
 * 路由：/scheduling/schedule-core/:executionOrderId
 * 从排程计划 Tab 待排程列表点击「开始排程」进入；不依赖项目管理模块。
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Button, Modal } from '@cn-kis/ui-kit'
import { ArrowLeft, Send, Save, Users, ClipboardList, Wrench, FileText, Calendar, Plus, Trash2 } from 'lucide-react'
import { schedulingApi } from '@cn-kis/api-client'
import { useTheme } from '../contexts/ThemeContext'
import { ExecutionOrderDetailReadOnly } from '../components/ExecutionOrderDetailReadOnly'

/** 从 headers + rows 得到第一行键值对；支持 row 为数组或对象 */
function getFirstRowAsDict(headers: string[], rows: unknown[]): Record<string, string> {
  const row = rows?.[0]
  if (row == null) return {}
  const out: Record<string, string> = {}
  if (Array.isArray(row)) {
    headers.forEach((h, i) => {
      out[h] = String((row as unknown[])[i] ?? '')
    })
  } else if (typeof row === 'object') {
    const obj = row as Record<string, unknown>
    headers.forEach((h) => {
      const v = obj[h]
      out[h] = v != null ? String(v) : ''
    })
  }
  return out
}

/** 从 firstRow 中按多个可能的 key 取第一个非空值 */
function getByKeys(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]?.trim()
    if (v) return v
  }
  return ''
}

/** 与 T0 同日的访视点（仅用于项目排期访视点解析与日期计算），不含 T24h、T48h 等 */
const SAME_DAY_AS_T0 = new Set([
  'T0',
  /** T0 之后的独立时间点（保留引号，勿与 T0 等同） */
  'T0"',
  'Timm',
  'T5min',
  'T15min',
  'T30min',
  'T1h',
  'T2h',
  'T3h',
  'T4h',
  'T5h',
  'T6h',
  'T7h',
  'T8h',
  'T9h',
  'T10h',
  'T11h',
  'T12h',
  'T13h',
  'T14h',
  'T15h',
  'T16h',
])
const SAME_DAY_ORDER: string[] = [
  'T0',
  'T0"',
  'Timm',
  'T5min',
  'T15min',
  'T30min',
  'T1h',
  'T2h',
  'T3h',
  'T4h',
  'T5h',
  'T6h',
  'T7h',
  'T8h',
  'T9h',
  'T10h',
  'T11h',
  'T12h',
  'T13h',
  'T14h',
  'T15h',
  'T16h',
]

/**
 * 将项目信息里的访视时间点 token 归一化，便于与 SAME_DAY_AS_T0 匹配。
 * 仅做空白修剪与单位大小写（如 T1H→T1h、T30Min→T30min）。
 * 不去除引号：`T0"` 表示 T0 之后的独立时间点，与 `T0` 不同，须原样保留。
 */
function normalizeVisitTimePointToken(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  const lower = s.toLowerCase()
  if (lower === 't0') return 'T0'
  if (lower === 't0"') return 'T0"'
  if (lower === 'timm') return 'Timm'
  const hour = /^t(\d+)h$/i.exec(s)
  if (hour) return `T${hour[1]}h`
  const mins = /^t(\d+)min$/i.exec(s)
  if (mins) return `T${mins[1]}min`
  return s
}

/**
 * 解析项目信息「访视计划」中的「访视时间点」字段（仅用于项目排期）：按分号/逗号/空格分隔；
 * T0、T0"、Timm、T5min/T15min/T30min、T1h～T16h 合并为同一访视点；展示顺序见 SAME_DAY_ORDER（T0" 在 T0 之后、与 T0 区分）。
 */
function parseVisitTimePointsFromProjectInfo(raw: string): string[] {
  if (!raw?.trim()) return []
  const tokens = raw
    .split(/[;；,\s]+/)
    .map((s) => normalizeVisitTimePointToken(s.trim()))
    .filter(Boolean)
  if (tokens.length === 0) return []
  const result: string[] = []
  let i = 0
  while (i < tokens.length) {
    if (SAME_DAY_AS_T0.has(tokens[i])) {
      const collected = new Set<string>()
      let j = i
      while (j < tokens.length && SAME_DAY_AS_T0.has(tokens[j])) {
        collected.add(tokens[j])
        j++
      }
      const merged = SAME_DAY_ORDER.filter((t) => collected.has(t))
      result.push(merged.join('，'))
      i = j
    } else {
      result.push(tokens[i])
      i++
    }
  }
  return result
}

/** 访视点选项（与参考系统一致）；T0，Timm 为项目信息中合并项 */
const VISIT_POINT_OPTIONS = [
  'T-4w', 'T-3w', 'T-2w', 'T-1w', 'T0', 'T0，Timm', 'Timm', 'T5min', 'T15min', 'T30min', 'T1h', 'T2h', 'T3h', 'T4h', 'T6h', 'T8h', 'T10h', 'T12h', 'T14h', 'T16h', 'T20h', 'T24h', 'T48h', 'T72h', 'T1d', 'T2d', 'T3d', 'T4d', 'T5d', 'T1w', 'T2w', 'T3w', 'T4w', 'T5w', 'T6w', 'T8w', 'T12w',
]

/** 单个流程行 */
export interface ProcessRow {
  code: string
  process: string
  sample_size: string
  exec_dates: string[]
}

/** 单个访视点块 */
export interface VisitBlock {
  visit_point: string
  processes: ProcessRow[]
}

/** 组别配额行（组别配额模态框） */
export interface GroupQuotaRow {
  project_group: string
  group_name: string
  sample_size: number
}

/** 流程名称中带这些关键词的视为问卷类，用问卷组总量（项目最大样本量）分配 */
const QUESTIONNAIRE_PROCESS_KEYWORDS = ['问卷', '预检台', '前台', '知情', '平衡', '产品']
/** T0 访视块内带这些关键词的流程不叠加，仅按最大样本量分配；问卷本身在 T0 阶段要叠加 */
const T0_NO_STACK_KEYWORDS = ['预检台', '前台', '知情', '平衡', '产品']

function isQuestionnaireProcess(processName: string): boolean {
  const name = (processName ?? '').trim()
  return QUESTIONNAIRE_PROCESS_KEYWORDS.some((kw) => name.includes(kw))
}

/** 流程是否为 T0 块内不叠加的子样（预检台、前台、知情、平衡、产品等，不含纯问卷） */
function isT0NoStackProcess(processName: string): boolean {
  const name = (processName ?? '').trim()
  return T0_NO_STACK_KEYWORDS.some((kw) => name.includes(kw))
}

/** 判断访视点是否为 T0 阶段（合并了 T0/Timm/T1h～T16h 等）并返回该块内时间点个数 */
function getT0StageMultiplier(visitPoint: string): number {
  const v = (visitPoint ?? '').trim()
  if (!v) return 1
  const parts = v.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  const sameDayCount = parts.filter((p) => SAME_DAY_AS_T0.has(p)).length
  if (sameDayCount > 0) return Math.max(1, sameDayCount)
  return 1
}

/**
 * 根据最大样本量、拆分天数、是否分组及组别配额，计算并填充各访视点下各流程行的样本量。
 * 不修改流程名称、编号、执行日期等，仅更新 sample_size。
 */
function computeAndFillSampleSizes(
  blocks: VisitBlock[],
  maxSample: number,
  splitDays: number,
  isGrouped: boolean,
  groupQuota: GroupQuotaRow[]
): VisitBlock[] {
  if (maxSample <= 0 || splitDays <= 0) return blocks
  const testGroupRow = isGrouped ? groupQuota.find((r) => (r.group_name || '').trim() === '测试组') : null
  const testGroupSample = testGroupRow ? Math.max(0, Number(testGroupRow.sample_size) || 0) : maxSample
  const questionnaireTotal = maxSample
  const testTotal = isGrouped ? testGroupSample : maxSample

  return blocks.map((block) => {
    const t0Mult = getT0StageMultiplier(block.visit_point)
    const baseQuestionnaireNoStack = Math.ceil(questionnaireTotal / splitDays)
    const baseQuestionnaireStack = Math.ceil(questionnaireTotal / splitDays) * t0Mult
    const baseTest = Math.ceil(testTotal / splitDays) * t0Mult
    return {
      ...block,
      processes: block.processes.map((p) => {
        let total: number
        if (isQuestionnaireProcess(p.process)) {
          /** T0 块内预检台、前台、知情、平衡、产品等子样不叠加；问卷要叠加 */
          total = isT0NoStackProcess(p.process) ? baseQuestionnaireNoStack : baseQuestionnaireStack
        } else {
          total = baseTest
        }
        return { ...p, sample_size: String(total) }
      }),
    }
  })
}

function createEmptyProcess(splitDays: number): ProcessRow {
  return {
    code: '',
    process: '',
    sample_size: '',
    exec_dates: Array.from({ length: splitDays }, () => ''),
  }
}

/** 将 Date 格式化为 YYYY-MM-DD（用于 date input） */
function formatDateForInput(date: Date): string {
  if (!date || Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 根据 T0 基准日期和访视点字符串计算该访视点的日期（与参考系统一致） */
function calculateVisitDate(t0DateStr: string, visitPointStr: string): string | null {
  if (!t0DateStr?.trim() || !visitPointStr?.trim()) return null
  const t0Date = new Date(t0DateStr)
  if (Number.isNaN(t0Date.getTime())) return null
  const v = visitPointStr.trim()
  if (v.includes('，')) {
    const parts = v.split('，').map((s) => s.trim()).filter(Boolean)
    if (parts.length > 0 && parts.every((p) => SAME_DAY_AS_T0.has(p))) return formatDateForInput(t0Date)
  }
  if (SAME_DAY_AS_T0.has(v)) return formatDateForInput(t0Date)
  const match = v.match(/^T(-?\d+)([WwdhHmin]+)$/i)
  if (!match) return null
  const num = parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  const result = new Date(t0Date)
  if (unit === 'w') {
    result.setDate(result.getDate() + num * 7)
  } else if (unit === 'd') {
    result.setDate(result.getDate() + num)
  } else if (unit === 'h') {
    if (num < 24) return formatDateForInput(t0Date)
    result.setDate(result.getDate() + Math.floor(num / 24))
  } else if (unit === 'min') {
    return formatDateForInput(t0Date)
  } else {
    return null
  }
  return formatDateForInput(result)
}

/** 从基准日期起连续 K 天的日期数组（YYYY-MM-DD） */
function getConsecutiveDates(baseYMD: string, k: number): string[] {
  const base = new Date(baseYMD)
  if (Number.isNaN(base.getTime())) return Array.from({ length: k }, () => '')
  return Array.from({ length: k }, (_, i) => {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    return formatDateForInput(d)
  })
}

/** 访视点相对 T0 的天数偏移（用于跨访视点联动计算）；同日记为 0，无法解析返回 null */
function getDaysFromT0(visitPointStr: string): number | null {
  if (!visitPointStr?.trim()) return null
  const v = visitPointStr.trim()
  if (v.includes('，')) {
    const parts = v.split('，').map((s) => s.trim()).filter(Boolean)
    if (parts.length > 0 && parts.every((p) => SAME_DAY_AS_T0.has(p))) return 0
  }
  if (SAME_DAY_AS_T0.has(v)) return 0
  const match = v.match(/^T(-?\d+)([WwdhHmin]+)$/i)
  if (!match) return null
  const num = parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  if (unit === 'w') return num * 7
  if (unit === 'd') return num
  if (unit === 'h') return num < 24 ? 0 : Math.floor(num / 24)
  if (unit === 'min') return 0
  return null
}

/** 在基准日期上加 offset 天，返回 YYYY-MM-DD */
function addDaysToDate(baseYMD: string, offsetDays: number): string {
  if (!baseYMD?.trim()) return ''
  const d = new Date(baseYMD)
  if (Number.isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + offsetDays)
  return formatDateForInput(d)
}

export default function ScheduleCorePage() {
  const { executionOrderId } = useParams<{ executionOrderId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const orderId = executionOrderId ? parseInt(executionOrderId, 10) : NaN

  const { data: orderRes, isLoading: orderLoading } = useQuery({
    queryKey: ['scheduling', 'execution-order', orderId],
    queryFn: () => schedulingApi.getExecutionOrderById(orderId),
    enabled: Number.isInteger(orderId),
  })

  const { data: scheduleRes, isLoading: scheduleLoading } = useQuery({
    queryKey: ['scheduling', 'schedule-core', orderId],
    queryFn: () => schedulingApi.getScheduleCore(orderId),
    enabled: Number.isInteger(orderId),
  })

  const updateMutation = useMutation({
    mutationFn: (payload: { supervisor?: string; research_group?: string; t0_date?: string | null; split_days?: number; payload?: Record<string, unknown> }) =>
      schedulingApi.updateScheduleCore(orderId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'schedule-core', orderId] })
    },
  })

  const publishTimelineMutation = useMutation({
    mutationFn: () => schedulingApi.publishScheduleTimeline(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'schedule-core', orderId] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'execution-order-pending'] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'timeline-published'] })
    },
  })

  const publishAdminMutation = useMutation({
    mutationFn: () => schedulingApi.publishScheduleAdmin(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'schedule-core', orderId] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'execution-order-pending'] })
    },
  })
  const publishEvalMutation = useMutation({
    mutationFn: () => schedulingApi.publishScheduleEval(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'schedule-core', orderId] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'execution-order-pending'] })
    },
  })
  const publishTechMutation = useMutation({
    mutationFn: () => schedulingApi.publishScheduleTech(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'schedule-core', orderId] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'execution-order-pending'] })
    },
  })

  // API 返回可能是 axios response：res.data = { code, msg, data: { id, headers, rows } }
  const orderPayload = (orderRes as { data?: { data?: { id?: number; headers?: string[]; rows?: unknown[] } } })?.data?.data
    ?? (orderRes as { data?: { id?: number; headers?: string[]; rows?: unknown[] } })?.data
  const schedulePayload = (scheduleRes as { data?: { data?: Record<string, unknown> } })?.data?.data
    ?? (scheduleRes as { data?: Record<string, unknown> })?.data

  const orderData = orderPayload
  const schedule = schedulePayload
  const headers = (orderData && 'headers' in orderData ? orderData.headers : []) as string[]
  const rows = (orderData && 'rows' in orderData ? orderData.rows : []) as unknown[]
  const firstRow = getFirstRowAsDict(headers, rows)
  const isTimelinePublished = schedule?.status === 'timeline_published' || schedule?.status === 'completed'

  const [activeTab, setActiveTab] = useState<'project' | 'schedule'>('project')

  const initialSplitDays = Math.max(1, Number(schedule?.split_days) || 1)
  const [formSplitDays, setFormSplitDays] = useState(initialSplitDays)
  const splitDays = formSplitDays
  const payloadData = (schedule?.payload && typeof schedule.payload === 'object' ? schedule.payload : {}) as {
    visit_blocks?: VisitBlock[]
    visit_count?: number
    is_grouped?: boolean
    group_quota?: GroupQuotaRow[]
  }

  /** 从项目信息（执行订单解析结果）取访视次数，用于自动带出项目排期的访视次数 */
  const visitCountFromProjectInfo = useMemo(() => {
    const raw = getByKeys(firstRow, '访视次数')
    const n = parseInt(raw, 10)
    return !Number.isNaN(n) && n >= 1 ? n : null
  }, [headers, rows])

  /** 从项目信息「访视计划」的「访视时间点」解析并合并 T0+Timm 后的访视点列表，按顺序填入各访视点行 */
  const visitPointsFromProjectInfo = useMemo(() => {
    const raw = getByKeys(firstRow, '访视时间点')
    return parseVisitTimePointsFromProjectInfo(raw)
  }, [headers, rows])

  const initialVisitCount = visitCountFromProjectInfo ?? Math.max(1, payloadData.visit_count ?? 1)
  const [visitBlocks, setVisitBlocks] = useState<VisitBlock[]>(() => {
    const blocks = payloadData.visit_blocks
    const n = initialVisitCount
    const fromPayload = Array.isArray(blocks) && blocks.length > 0
      ? blocks.map((b) => ({
          visit_point: b.visit_point ?? '',
          processes: (b.processes ?? []).map((p) => ({
            code: p.code ?? '',
            process: p.process ?? '',
            sample_size: p.sample_size ?? '',
            exec_dates: Array.isArray(p.exec_dates) ? [...p.exec_dates] : Array.from({ length: splitDays }, () => ''),
          })),
        }))
      : []
    if (fromPayload.length >= n) return fromPayload.slice(0, n)
    const pad = Array.from({ length: n - fromPayload.length }, () => ({
      visit_point: '',
      processes: [createEmptyProcess(splitDays)],
    }))
    return [...fromPayload, ...pad]
  })
  const [visitCount, setVisitCount] = useState<number>(initialVisitCount)
  const [t0Date, setT0Date] = useState<string>(() => (schedule?.t0_date ? String(schedule.t0_date) : ''))
  const [isGrouped, setIsGrouped] = useState<boolean>(payloadData.is_grouped ?? false)
  const [groupQuota, setGroupQuota] = useState<GroupQuotaRow[]>(() => {
    const q = payloadData.group_quota
    return Array.isArray(q) && q.length > 0 ? q.map((r) => ({ ...r })) : [{ project_group: '组1', group_name: '问卷组', sample_size: 0 }, { project_group: '组2', group_name: '测试组', sample_size: 0 }]
  })
  const [groupQuotaModalOpen, setGroupQuotaModalOpen] = useState(false)

  /** 项目最大样本量（用于样本量自动填充） */
  const maxSample = useMemo(() => {
    const sample = parseInt(getByKeys(firstRow, '样本量', '样本数量'), 10) || 0
    const backup = parseInt(getByKeys(firstRow, '备份样本量', '备份数量'), 10) || 0
    return sample + backup
  }, [firstRow])

  /** 用于触发样本量重算的“结构”键（不含 sample_size，避免循环更新） */
  const sampleFillStructureKey = useMemo(
    () => visitBlocks.map((b) => b.visit_point + '|' + b.processes.map((p) => p.process).join(',')).join(';;'),
    [visitBlocks]
  )
  const groupQuotaKey = JSON.stringify(groupQuota)
  useEffect(() => {
    if (maxSample <= 0) return
    setVisitBlocks((prev) => computeAndFillSampleSizes(prev, maxSample, formSplitDays, isGrouped, groupQuota))
  }, [maxSample, formSplitDays, isGrouped, groupQuotaKey, sampleFillStructureKey])

  /** 打开组别配额模态框时，将问卷组行的样本量同步为项目最大样本量 */
  useEffect(() => {
    if (groupQuotaModalOpen && maxSample > 0) {
      setGroupQuota((prev) =>
        prev.map((r) => ((r.group_name || '').trim() === '问卷组' ? { ...r, sample_size: maxSample } : r))
      )
    }
  }, [groupQuotaModalOpen, maxSample])

  useEffect(() => {
    if (schedule?.t0_date) setT0Date(String(schedule.t0_date))
  }, [schedule?.t0_date])

  /** 订单加载后，用项目信息的访视次数自动带出项目排期的访视次数与访视点行数（仅同步一次，避免覆盖用户后续修改） */
  const hasSyncedVisitCountFromOrder = useRef(false)
  useEffect(() => {
    hasSyncedVisitCountFromOrder.current = false
  }, [orderId])
  useEffect(() => {
    if (visitCountFromProjectInfo == null || hasSyncedVisitCountFromOrder.current) return
    hasSyncedVisitCountFromOrder.current = true
    setVisitCount(visitCountFromProjectInfo)
    setVisitBlocks((prev) => {
      let next: VisitBlock[]
      if (prev.length === visitCountFromProjectInfo) {
        next = [...prev]
      } else if (prev.length > visitCountFromProjectInfo) {
        next = prev.slice(0, visitCountFromProjectInfo)
      } else {
        const toAdd = visitCountFromProjectInfo - prev.length
        next = [
          ...prev,
          ...Array.from({ length: toAdd }, () => ({
            visit_point: '',
            processes: [createEmptyProcess(splitDays)],
          })),
        ]
      }
      return next.map((block, i) => ({
        ...block,
        visit_point: visitPointsFromProjectInfo[i] ?? block.visit_point,
      }))
    })
  }, [visitCountFromProjectInfo, visitPointsFromProjectInfo, splitDays])

  const ensureExecDatesLength = useCallback((blocks: VisitBlock[], k: number): VisitBlock[] => {
    return blocks.map((b) => ({
      ...b,
      processes: b.processes.map((p) => ({
        ...p,
        exec_dates: (() => {
          const arr = p.exec_dates ?? []
          if (arr.length === k) return arr
          if (arr.length > k) return arr.slice(0, k)
          return [...arr, ...Array.from({ length: k - arr.length }, () => '')]
        })(),
      })),
    }))
  }, [])

  /** 访视次数变更时，同步增删访视点行数 */
  const handleVisitCountChange = useCallback(
    (n: number) => {
      const count = Math.max(1, n)
      setVisitCount(count)
      setVisitBlocks((prev) => {
        if (count > prev.length) {
          const toAdd = count - prev.length
          return [
            ...prev,
            ...Array.from({ length: toAdd }, () => ({
              visit_point: '',
              processes: [createEmptyProcess(splitDays)],
            })),
          ]
        }
        if (count < prev.length) return prev.slice(0, count)
        return prev
      })
    },
    [splitDays]
  )

  const addVisitBlock = useCallback(() => {
    setVisitBlocks((prev) => [...prev, { visit_point: '', processes: [createEmptyProcess(splitDays)] }])
    setVisitCount((prev) => prev + 1)
  }, [splitDays])

  const removeVisitBlock = useCallback((index: number) => {
    setVisitBlocks((prev) => prev.filter((_, i) => i !== index))
    setVisitCount((prev) => Math.max(1, prev - 1))
  }, [])

  const setVisitBlock = useCallback((index: number, block: VisitBlock) => {
    setVisitBlocks((prev) => {
      const next = [...prev]
      next[index] = block
      return next
    })
  }, [])

  /** 根据当前 T0 日期和拆分天数，填充所有已选访视点的执行日期 */
  const fillAllVisitDatesFromT0 = useCallback(() => {
    if (!t0Date?.trim()) return
    setVisitBlocks((prev) =>
      prev.map((block) => {
        const base = calculateVisitDate(t0Date, block.visit_point)
        if (!base) return block
        const dates = getConsecutiveDates(base, splitDays)
        return {
          ...block,
          processes: block.processes.map((p) => ({
            ...p,
            exec_dates: [...dates],
          })),
        }
      })
    )
  }, [t0Date, splitDays])

  /** 选择访视点时：更新块并若已填 T0 则自动填充该块执行日期 */
  const handleVisitPointChange = useCallback(
    (blockIdx: number, newVisitPoint: string) => {
      setVisitBlocks((prev) => {
        const next = [...prev]
        const block = next[blockIdx]
        if (!block) return prev
        const updated = { ...block, visit_point: newVisitPoint }
        if (t0Date?.trim()) {
          const base = calculateVisitDate(t0Date, newVisitPoint)
          if (base) {
            const dates = getConsecutiveDates(base, splitDays)
            updated.processes = block.processes.map((p) => ({ ...p, exec_dates: [...dates] }))
          }
        }
        next[blockIdx] = updated
        return next
      })
    },
    [t0Date, splitDays]
  )

  const addProcess = useCallback((blockIndex: number) => {
    setVisitBlocks((prev) => {
      const next = [...prev]
      const block = next[blockIndex]
      if (!block) return prev
      const firstProcess = block.processes[0]
      const execDates =
        firstProcess?.exec_dates?.length === splitDays
          ? [...firstProcess.exec_dates]
          : Array.from({ length: splitDays }, () => '')
      const newProcess: ProcessRow = {
        code: '',
        process: '',
        sample_size: '',
        exec_dates: execDates,
      }
      next[blockIndex] = {
        ...block,
        processes: [...block.processes, newProcess],
      }
      return next
    })
  }, [splitDays])

  const removeProcess = useCallback((blockIndex: number, processIndex: number) => {
    setVisitBlocks((prev) => {
      const next = [...prev]
      const block = next[blockIndex]
      if (!block || block.processes.length <= 1) return prev
      next[blockIndex] = {
        ...block,
        processes: block.processes.filter((_, i) => i !== processIndex),
      }
      return next
    })
  }, [])

  const setProcessRow = useCallback((blockIndex: number, processIndex: number, row: ProcessRow) => {
    setVisitBlocks((prev) => {
      const next = [...prev]
      const block = next[blockIndex]
      if (!block) return prev
      const procs = [...block.processes]
      procs[processIndex] = row
      next[blockIndex] = { ...block, processes: procs }
      return next
    })
  }, [])

  /** 某访视点内某一列执行日期变更时：本块内同步该列，并按相对天数联动更新其他访视点同列 */
  const handleExecDateChange = useCallback(
    (blockIdx: number, dateColumnIndex: number, newValue: string) => {
      setVisitBlocks((prev) => {
        const next = prev.map((b) => ({ ...b, processes: b.processes.map((p) => ({ ...p })) }))
        const block = next[blockIdx]
        if (!block) return prev
        next[blockIdx] = {
          ...block,
          processes: block.processes.map((p) => {
            const arr = [...(p.exec_dates ?? [])]
            while (arr.length <= dateColumnIndex) arr.push('')
            arr[dateColumnIndex] = newValue
            return { ...p, exec_dates: arr }
          }),
        }
        const refVisitPoint = next[blockIdx].visit_point
        const daysRef = getDaysFromT0(refVisitPoint)
        if (daysRef === null) return next
        for (let i = 0; i < next.length; i++) {
          if (i === blockIdx) continue
          const other = next[i]
          const daysOther = getDaysFromT0(other.visit_point)
          if (daysOther === null) continue
          const offsetDays = daysOther - daysRef
          const computedDate = addDaysToDate(newValue, offsetDays)
          if (!computedDate) continue
          next[i] = {
            ...other,
            processes: other.processes.map((p) => {
              const arr = [...(p.exec_dates ?? [])]
              while (arr.length <= dateColumnIndex) arr.push('')
              arr[dateColumnIndex] = computedDate
              return { ...p, exec_dates: arr }
            }),
          }
        }
        return next
      })
    },
    []
  )

  const handleCancelSchedule = useCallback(() => {
    setFormSplitDays(initialSplitDays)
    setT0Date(schedule?.t0_date ? String(schedule.t0_date) : '')
    const count = Math.max(1, payloadData.visit_count ?? 1)
    const blocks = payloadData.visit_blocks
    const fromPayload = Array.isArray(blocks) && blocks.length > 0
      ? blocks.map((b) => ({
          visit_point: b.visit_point ?? '',
          processes: (b.processes ?? []).map((p) => ({
            code: p.code ?? '',
            process: p.process ?? '',
            sample_size: p.sample_size ?? '',
            exec_dates: Array.isArray(p.exec_dates) ? [...p.exec_dates] : Array.from({ length: initialSplitDays }, () => ''),
          })),
        }))
      : []
    if (fromPayload.length >= count) {
      setVisitBlocks(fromPayload.slice(0, count))
    } else {
      const pad = Array.from({ length: count - fromPayload.length }, () => ({
        visit_point: '',
        processes: [createEmptyProcess(initialSplitDays)],
      }))
      setVisitBlocks([...fromPayload, ...pad])
    }
    setVisitCount(count)
    setIsGrouped(payloadData.is_grouped ?? false)
    setGroupQuota(
      Array.isArray(payloadData.group_quota) && payloadData.group_quota.length > 0
        ? payloadData.group_quota.map((r) => ({ ...r }))
        : [{ project_group: '组1', group_name: '问卷组', sample_size: 0 }, { project_group: '组2', group_name: '测试组', sample_size: 0 }]
    )
  }, [payloadData, initialSplitDays, schedule?.t0_date])

  const buildSavePayload = useCallback(() => {
    const supervisor = (document.getElementById('schedule-supervisor') as HTMLInputElement)?.value ?? ''
    const researchGroup = (document.getElementById('schedule-research-group') as HTMLInputElement)?.value ?? ''
    const t0DateVal = t0Date?.trim() || null
    const k = formSplitDays
    const normalizedBlocks = ensureExecDatesLength(visitBlocks, k)
    return {
      supervisor,
      research_group: researchGroup,
      t0_date: t0DateVal || undefined,
      split_days: k,
      payload: {
        ...(typeof schedule?.payload === 'object' && schedule?.payload ? schedule.payload : {}),
        visit_blocks: normalizedBlocks,
        visit_count: visitCount,
        is_grouped: isGrouped,
        group_quota: groupQuota,
      },
    }
  }, [visitBlocks, visitCount, formSplitDays, t0Date, isGrouped, groupQuota, ensureExecDatesLength, schedule?.payload])

  const handleSaveSchedule = useCallback(() => {
    updateMutation.mutate(buildSavePayload())
  }, [buildSavePayload, updateMutation])

  /** 保存并发布时间线（保存表单后自动调用发布，并同步到时间槽） */
  const handleSaveAndPublish = useCallback(() => {
    const payload = buildSavePayload()
    updateMutation
      .mutateAsync(payload)
      .then(() => publishTimelineMutation.mutate())
      .catch(() => {})
  }, [buildSavePayload, updateMutation, publishTimelineMutation])

  if (!Number.isInteger(orderId)) {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500">无效的执行订单 ID</p>
      </div>
    )
  }

  if (orderLoading || scheduleLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse text-slate-500">加载中…</div>
      </div>
    )
  }

  if (!orderData || !schedule) {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500">未找到执行订单或排程数据</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回排程计划
        </Button>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-200 truncate">
          {getByKeys(firstRow, '项目编号', '项目名称') || `执行订单 #${orderId}`}
        </h1>
      </div>

      {/* Tab：项目信息 | 项目排期 */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-[#3b434e] pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('project')}
          className={clsx(
            'shrink-0 min-h-10 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors flex items-center gap-1.5',
            activeTab === 'project'
              ? 'bg-primary-600 text-white dark:bg-primary-500 dark:text-white'
              : 'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
          )}
        >
          <FileText className="w-4 h-4" /> 项目信息
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('schedule')}
          className={clsx(
            'shrink-0 min-h-10 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors flex items-center gap-1.5',
            activeTab === 'schedule'
              ? 'bg-primary-600 text-white dark:bg-primary-500 dark:text-white'
              : 'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
          )}
        >
          <Calendar className="w-4 h-4" /> 项目排期
        </button>
      </div>

      {activeTab === 'project' && (
        <div className="mt-4">
          <ExecutionOrderDetailReadOnly headers={headers} row={firstRow} isDark={isDark} />
        </div>
      )}

      {activeTab === 'schedule' && (
      <>
      {schedule.status === 'draft' && (
      <section
        className={clsx(
          'rounded-xl border p-4 mt-4',
          isDark ? 'border-[#3b434e] bg-slate-800/50' : 'border-slate-200 bg-white'
        )}
      >
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">项目排期</h2>

        {/* 项目编号、最大样本量、研究员、督导、研究组、项目拆分天数、访视次数、T0基准日期、是否分组 — 同一行横向铺满 */}
        <div className="mb-4">
          <div className="grid grid-cols-9 gap-3 items-end">
            <div className="min-w-0">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">项目编号</label>
              <input
                type="text"
                readOnly
                className={clsx(
                  'w-full min-h-10 rounded-lg border px-3 text-sm',
                  isDark ? 'border-[#3b434e] bg-slate-700/50 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-700'
                )}
                value={getByKeys(firstRow, '项目编号', '订单编号')}
                placeholder="—"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">最大样本量</label>
              <input
                type="text"
                readOnly
                className={clsx(
                  'w-full min-h-10 rounded-lg border px-3 text-sm',
                  isDark ? 'border-[#3b434e] bg-slate-700/50 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-700'
                )}
                value={(() => {
                  const sample = parseInt(getByKeys(firstRow, '样本量', '样本数量'), 10) || 0
                  const backup = parseInt(getByKeys(firstRow, '备份样本量', '备份数量'), 10) || 0
                  const sum = sample + backup
                  return sum > 0 ? String(sum) : ''
                })()}
                placeholder="—"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">研究员</label>
              <input
                type="text"
                readOnly
                className={clsx(
                  'w-full min-h-10 rounded-lg border px-3 text-sm',
                  isDark ? 'border-[#3b434e] bg-slate-700/50 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-700'
                )}
                value={getByKeys(firstRow, '研究员')}
                placeholder="—"
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">督导</label>
              <input
                id="schedule-supervisor"
                type="text"
                className={clsx(
                  'w-full min-h-10 rounded-lg border px-3 text-sm',
                  isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                )}
                placeholder="请输入督导"
                defaultValue={String((schedule.supervisor || getByKeys(firstRow, '督导')) ?? '')}
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">研究组</label>
              <input
                id="schedule-research-group"
                type="text"
                className={clsx(
                  'w-full min-h-10 rounded-lg border px-3 text-sm',
                  isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                )}
                placeholder="请输入研究组"
                defaultValue={String((getByKeys(firstRow, '组别') || schedule.research_group) ?? '')}
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">项目拆分天数</label>
              <input
                id="schedule-split-days"
                type="number"
                min={1}
                className={clsx(
                  'w-full min-h-10 rounded-lg border px-3 text-sm',
                  isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                )}
                value={formSplitDays}
                onChange={(e) => setFormSplitDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">访视次数</label>
              <input
                type="number"
                min={1}
                className={clsx(
                  'w-full min-h-10 rounded-lg border px-3 text-sm',
                  isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                )}
                value={visitCount}
                onChange={(e) => handleVisitCountChange(parseInt(e.target.value, 10) || 1)}
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">T0基准日期</label>
              <input
                id="schedule-t0-date"
                type="date"
                className={clsx(
                  'w-full min-h-10 rounded-lg border px-3 text-sm',
                  isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                )}
                value={t0Date}
                onChange={(e) => {
                  const v = e.target.value
                  setT0Date(v)
                  if (v?.trim()) {
                    setVisitBlocks((prev) =>
                      prev.map((block) => {
                        const base = calculateVisitDate(v, block.visit_point)
                        if (!base) return block
                        const dates = getConsecutiveDates(base, splitDays)
                        return {
                          ...block,
                          processes: block.processes.map((p) => ({ ...p, exec_dates: [...dates] })),
                        }
                      })
                    )
                  }
                }}
                onBlur={fillAllVisitDatesFromT0}
              />
            </div>
            <div className="min-w-0">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">是否分组</label>
              <div className="flex items-center gap-2">
                <select
                  className={clsx(
                    'flex-1 min-h-10 rounded-lg border px-3 text-sm',
                    isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                  )}
                  value={isGrouped ? 'yes' : 'no'}
                  onChange={(e) => setIsGrouped(e.target.value === 'yes')}
                >
                  <option value="no">否</option>
                  <option value="yes">是</option>
                </select>
                {isGrouped && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setGroupQuotaModalOpen(true)}>
                    组别配额
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 访视点、流程与执行日期 */}
        <div className="space-y-6 mb-6">
          {visitBlocks.map((block, blockIdx) => (
            <div
              key={blockIdx}
              className={clsx(
                'rounded-lg border p-4',
                isDark ? 'border-[#3b434e] bg-slate-800/30' : 'border-slate-200 bg-slate-50/50'
              )}
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <label className="text-xs text-slate-500 dark:text-slate-400 shrink-0">访视点</label>
                <select
                  className={clsx(
                    'min-h-9 rounded-lg border px-2 text-sm min-w-[120px]',
                    isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                  )}
                  value={block.visit_point}
                  onChange={(e) => handleVisitPointChange(blockIdx, e.target.value)}
                >
                  <option value="">请选择或输入访视点</option>
                  {block.visit_point && !VISIT_POINT_OPTIONS.includes(block.visit_point) && (
                    <option value={block.visit_point}>{block.visit_point}</option>
                  )}
                  {VISIT_POINT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => removeVisitBlock(blockIdx)}
                    className="shrink-0"
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> 删除本访视点
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => addProcess(blockIdx)}
                    className="shrink-0"
                  >
                    <Plus className="w-3 h-3 mr-1" /> 添加流程
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm border-collapse">
                  <thead>
                    <tr className={clsx('border-b', isDark ? 'border-[#3b434e] bg-slate-700/50' : 'border-slate-200 bg-slate-100')}>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">编号</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">流程</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">样本量</th>
                      {Array.from({ length: splitDays }, (_, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200">
                          执行日期{i + 1}
                        </th>
                      ))}
                      <th
                        className={clsx('pl-3 pr-0 py-2 text-right align-middle sticky right-0 min-w-[7rem] w-[7rem]', isDark ? 'bg-slate-700/50 shadow-[-4px_0_8px_rgba(0,0,0,0.06)]' : 'bg-slate-100 shadow-[-4px_0_8px_rgba(0,0,0,0.04)]')}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {block.processes.map((proc, procIdx) => (
                      <tr key={procIdx} className={clsx('border-b', isDark ? 'border-slate-700' : 'border-slate-100')}>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            className={clsx(
                              'w-full min-h-8 rounded border px-2 text-sm',
                              isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                            )}
                            value={proc.code}
                            onChange={(e) =>
                              setProcessRow(blockIdx, procIdx, { ...proc, code: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            className={clsx(
                              'w-full min-h-8 rounded border px-2 text-sm',
                              isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                            )}
                            value={proc.process}
                            onChange={(e) =>
                              setProcessRow(blockIdx, procIdx, { ...proc, process: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            className={clsx(
                              'w-full min-h-8 rounded border px-2 text-sm',
                              isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                            )}
                            value={proc.sample_size}
                            onChange={(e) =>
                              setProcessRow(blockIdx, procIdx, { ...proc, sample_size: e.target.value })
                            }
                          />
                        </td>
                        {Array.from({ length: splitDays }, (_, i) => (
                          <td key={i} className="px-3 py-2">
                            <input
                              type="date"
                              className={clsx(
                                'w-full min-h-8 rounded border px-2 text-sm',
                                isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                              )}
                              value={proc.exec_dates[i] ?? ''}
                              onChange={(e) =>
                                handleExecDateChange(blockIdx, i, e.target.value)
                              }
                            />
                          </td>
                        ))}
                        <td
                          className={clsx(
                            'pl-3 pr-0 py-2 whitespace-nowrap text-right align-middle sticky right-0 min-w-[7rem] w-[7rem]',
                            isDark ? 'bg-slate-800/30 shadow-[-4px_0_8px_rgba(0,0,0,0.08)]' : 'bg-slate-50/50 shadow-[-4px_0_8px_rgba(0,0,0,0.04)]'
                          )}
                        >
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="whitespace-nowrap shrink-0 min-w-[4.5rem]"
                            onClick={() => removeProcess(blockIdx, procIdx)}
                            disabled={block.processes.length <= 1}
                          >
                            删除本行
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap mb-4">
          <Button type="button" variant="secondary" onClick={addVisitBlock}>
            <Plus className="w-4 h-4 mr-1" /> 添加一行访视点
          </Button>
          <Button type="button" variant="secondary" onClick={handleCancelSchedule}>
            取消
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSaveAndPublish}
            disabled={updateMutation.isPending || publishTimelineMutation.isPending}
          >
            {updateMutation.isPending || publishTimelineMutation.isPending ? '保存中…' : '保存'}
          </Button>
        </div>
      </section>
      )}

      {isTimelinePublished && (
        <section className={clsx('rounded-xl border p-4 mt-4', isDark ? 'border-[#3b434e] bg-slate-800/50' : 'border-slate-200 bg-white')}>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">项目排期</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">时间线已发布。请完成行政、评估、技术排程并分别发布。</p>
        </section>
      )}

      {/* 行政 / 评估 / 技术 排程（时间线发布后才显示） */}
      {isTimelinePublished && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <section
            className={clsx(
              'rounded-xl border p-4',
              isDark ? 'border-[#3b434e] bg-slate-800/50' : 'border-slate-200 bg-white'
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <ClipboardList className="w-4 h-4" /> 行政排程
              </h2>
              {schedule.admin_published ? (
                <span className="text-xs text-green-600 dark:text-green-400">已发布</span>
              ) : (
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => publishAdminMutation.mutate()}
                  disabled={publishAdminMutation.isPending}
                >
                  <Send className="w-3 h-3 mr-1" /> 发布
                </Button>
              )}
            </div>
            {!schedule.admin_published && (
              <p className="text-xs text-slate-500 dark:text-slate-400">请填写人员与房间后发布。表格编辑功能将在后续迭代中提供。</p>
            )}
          </section>

          <section
            className={clsx(
              'rounded-xl border p-4',
              isDark ? 'border-[#3b434e] bg-slate-800/50' : 'border-slate-200 bg-white'
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Users className="w-4 h-4" /> 评估排程
              </h2>
              {schedule.eval_published ? (
                <span className="text-xs text-green-600 dark:text-green-400">已发布</span>
              ) : (
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => publishEvalMutation.mutate()}
                  disabled={publishEvalMutation.isPending}
                >
                  <Send className="w-3 h-3 mr-1" /> 发布
                </Button>
              )}
            </div>
            {!schedule.eval_published && (
              <p className="text-xs text-slate-500 dark:text-slate-400">请填写人员与房间后发布。表格编辑功能将在后续迭代中提供。</p>
            )}
          </section>

          <section
            className={clsx(
              'rounded-xl border p-4',
              isDark ? 'border-[#3b434e] bg-slate-800/50' : 'border-slate-200 bg-white'
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Wrench className="w-4 h-4" /> 技术排程
              </h2>
              {schedule.tech_published ? (
                <span className="text-xs text-green-600 dark:text-green-400">已发布</span>
              ) : (
                <Button
                  size="xs"
                  variant="primary"
                  onClick={() => publishTechMutation.mutate()}
                  disabled={publishTechMutation.isPending}
                >
                  <Send className="w-3 h-3 mr-1" /> 发布
                </Button>
              )}
            </div>
            {!schedule.tech_published && (
              <p className="text-xs text-slate-500 dark:text-slate-400">请填写人员与房间后发布。表格编辑功能将在后续迭代中提供。</p>
            )}
          </section>
        </div>
      )}

      {schedule.status === 'completed' && (
        <p className="text-sm text-green-600 dark:text-green-400">
          排程已全部完成，该任务已从待排程列表中移除。
        </p>
      )}
      </>
      )}

      {/* 组别配额模态框 */}
      <Modal
        open={groupQuotaModalOpen}
        onClose={() => setGroupQuotaModalOpen(false)}
        title="组别配额配置"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGroupQuotaModalOpen(false)}>
              关闭
            </Button>
            <Button variant="primary" onClick={() => setGroupQuotaModalOpen(false)}>
              保存
            </Button>
          </div>
        }
      >
        <div className={clsx('p-4', isDark && 'text-slate-200')}>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            组别名称填「问卷组」的样本量参与问卷类流程（流程名称含问卷/前台/知情/平衡/产品）；填「测试组」的样本量参与其余流程。项目组别仅作展示。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className={clsx('border-b', isDark ? 'border-slate-600' : 'border-slate-200')}>
                  <th className="px-3 py-2 text-left font-medium">项目组别</th>
                  <th className="px-3 py-2 text-left font-medium">组别名称</th>
                  <th className="px-3 py-2 text-left font-medium">样本量</th>
                  <th className="px-3 py-2 w-24">操作</th>
                </tr>
              </thead>
              <tbody>
                {groupQuota.map((row, idx) => (
                  <tr key={idx} className={clsx('border-b', isDark ? 'border-slate-700' : 'border-slate-100')}>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        className={clsx(
                          'w-full min-h-8 rounded border px-2 text-sm',
                          isDark ? 'border-slate-600 bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                        )}
                        value={row.project_group}
                        onChange={(e) =>
                          setGroupQuota((prev) => {
                            const next = [...prev]
                            next[idx] = { ...next[idx], project_group: e.target.value }
                            return next
                          })
                        }
                        placeholder="如 组1"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className={clsx(
                          'w-full min-h-8 rounded border px-2 text-sm',
                          isDark ? 'border-slate-600 bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                        )}
                        value={row.group_name}
                        onChange={(e) => {
                          const val = e.target.value
                          setGroupQuota((prev) => {
                            const next = [...prev]
                            next[idx] = { ...next[idx], group_name: val, sample_size: val === '问卷组' ? maxSample : next[idx].sample_size }
                            return next
                          })
                        }}
                      >
                        <option value="问卷组">问卷组</option>
                        <option value="测试组">测试组</option>
                        <option value="">其他</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {(row.group_name || '').trim() === '问卷组' ? (
                        <input
                          type="text"
                          readOnly
                          className={clsx(
                            'w-full min-h-8 rounded border px-2 text-sm',
                            isDark ? 'border-slate-600 bg-slate-700/50 text-slate-300' : 'border-slate-200 bg-slate-100 text-slate-700'
                          )}
                          value={maxSample}
                        />
                      ) : (
                        <input
                          type="number"
                          min={0}
                          className={clsx(
                            'w-full min-h-8 rounded border px-2 text-sm',
                            isDark ? 'border-slate-600 bg-slate-700 text-slate-200' : 'border-slate-200 bg-white text-slate-800'
                          )}
                          value={row.sample_size}
                          onChange={(e) =>
                            setGroupQuota((prev) => {
                              const next = [...prev]
                              next[idx] = { ...next[idx], sample_size: parseInt(e.target.value, 10) || 0 }
                              return next
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        onClick={() => setGroupQuota((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={groupQuota.length <= 1}
                      >
                        删除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() =>
              setGroupQuota((prev) => [
                ...prev,
                { project_group: `组${prev.length + 1}`, group_name: '测试组', sample_size: 0 },
              ])
            }
          >
            <Plus className="w-3 h-3 mr-1" /> 添加一行
          </Button>
        </div>
      </Modal>
    </div>
  )
}
