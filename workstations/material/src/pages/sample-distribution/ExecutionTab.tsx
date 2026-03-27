/**
 * 工单执行 - 按工单筛选执行记录列表，新建/查看/编辑/删除（与 KIS 一致）
 */
import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { productDistributionApi, receptionApi, type QueueItem } from '@cn-kis/api-client'
import { Card, Button, Modal, Badge } from '@cn-kis/ui-kit'
import { Plus, Eye, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Download, ChevronDown, Clock, Play, CheckCircle2 } from 'lucide-react'
import { ExecutionRecordForm } from './ExecutionRecordForm'
import { EXECUTION_CYCLE_OPTIONS } from './constants'
import type {
  WorkOrderListItem,
  ExecutionRecordListItem,
  ExecutionRecordDetail,
  ExecutionRecordCreate,
  PendingExecutionRow,
} from './types'

const DEFAULT_PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

function formatExecutionDate(v: string | null | undefined): string {
  if (v == null || v === '') return '—'
  const s = String(v).trim()
  return s.length >= 10 ? s.slice(0, 10) : s
}

/** 受试者产品记录列表：操作时间（created_at） */
function formatOperationTime(v: string | null | undefined): string {
  if (v == null || v === '') return '—'
  const s = String(v).trim().replace('T', ' ')
  if (s.length >= 19) return s.slice(0, 19)
  if (s.length >= 16) return s.slice(0, 16)
  return s.length >= 10 ? s.slice(0, 10) : s
}

function productOpLabel(p: any) {
  const t = p?.product_operation_type
  if (t === 'distribution') return '发放'
  if (t === 'inspection') return '检查'
  if (t === 'recovery') return '回收'
  if (t === 'site_use') return '现场使用'
  if (p?.product_distribution === 1) return '发放'
  if (p?.product_inspection === 1) return '检查'
  if (p?.product_recovery === 1) return '回收'
  return '—'
}

function productDiaryLabel(p: any) {
  if (p?.diary_distribution === 1) return '发放'
  if (p?.diary_inspection === 1) return '检查'
  if (p?.diary_recovery === 1) return '回收'
  return '—'
}

function productWeightParts(p: any) {
  const op = productOpLabel(p)
  const diary = productDiaryLabel(p)
  const fmt = (n: number | null | undefined) => (n != null ? Number(n).toFixed(2) : null)
  const parts: string[] = []
  if (op === '发放' && p?.distribution_weight != null) parts.push(`发放:${fmt(p.distribution_weight)}`)
  if (op === '检查' && p?.inspection_weight != null) parts.push(`检查:${fmt(p.inspection_weight)}`)
  if (op === '回收' && p?.recovery_weight != null) parts.push(`回收:${fmt(p.recovery_weight)}`)
  if (diary === '发放' && p?.distribution_weight != null && !parts.some((s) => s.startsWith('发放:'))) parts.push(`发放:${fmt(p.distribution_weight)}`)
  if (diary === '检查' && p?.inspection_weight != null && !parts.some((s) => s.startsWith('检查:'))) parts.push(`检查:${fmt(p.inspection_weight)}`)
  if (diary === '回收' && p?.recovery_weight != null && !parts.some((s) => s.startsWith('回收:'))) parts.push(`回收:${fmt(p.recovery_weight)}`)
  return parts.join(' ') || '—'
}

const EXCEPTION_LABELS: Record<string, string> = {
  usage_error: '使用错误',
  diary_error: '日记错误',
  product_damage: '产品损坏',
  distribution_error: '发放错误',
  recovery_error: '回收错误',
  other: '其他',
}

const STAGE_LABELS: Record<string, string> = {
  washout: '洗脱期',
  t0: 'T0阶段',
  visit: '回访阶段',
}

function ProgressBadge({ progress }: { progress: string }) {
  if (!progress) return <span className="text-slate-400">—</span>
  const iconClass = 'h-2.5 w-2.5 mr-0.5 shrink-0'
  switch (progress) {
    case 'not_started':
      return (
        <Badge variant="default" className="text-xs font-normal text-slate-500 border border-slate-300">
          <Clock className={`${iconClass} text-slate-500`} />
          未开始
        </Badge>
      )
    case 'in_progress':
      return (
        <Badge className="text-xs font-normal !bg-blue-600 !text-white border-0">
          <Play className={`${iconClass} text-white`} />
          执行中
        </Badge>
      )
    case 'completed':
      return (
        <Badge className="text-xs font-normal !bg-green-600 !text-white border-0">
          <CheckCircle2 className={`${iconClass} text-white`} />
          已完成
        </Badge>
      )
    default:
      return <Badge variant="default" className="text-xs">{progress}</Badge>
  }
}

/** 和序·工单执行队列：已签到（含执行中未签出） */
const PENDING_QUEUE_STATUSES = new Set(['checked_in', 'in_progress'])

/** 入组情况筛选（与 SubjectProjectSC.enrollment_status 文案一致） */
const PENDING_ENROLLMENT_STATUSES = new Set(['初筛合格', '正式入组', '复筛不合格', '退出'])

const EXECUTION_QUEUE_STATUS_LABELS: Record<string, string> = {
  checked_in: '已签到',
  in_progress: '执行中',
  checked_out: '已签出',
  waiting: '等待中',
  no_show: '缺席',
}

function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseTodayQueueExportBody(raw: unknown): { items: QueueItem[]; date: string } {
  if (!raw || typeof raw !== 'object') return { items: [], date: '' }
  const o = raw as { data?: { items?: QueueItem[]; date?: string }; items?: QueueItem[]; date?: string }
  if (o.data && typeof o.data === 'object') {
    return {
      items: Array.isArray(o.data.items) ? o.data.items : [],
      date: typeof o.data.date === 'string' ? o.data.date : '',
    }
  }
  return {
    items: Array.isArray(o.items) ? o.items : [],
    date: typeof o.date === 'string' ? o.date : '',
  }
}

export function ExecutionTab() {
  const queryClient = useQueryClient()
  const [workOrderId, setWorkOrderId] = useState<string>('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [mode, setMode] = useState<'list' | 'new' | 'edit' | 'view'>('list')
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [viewingRecord, setViewingRecord] = useState<ExecutionRecordDetail | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [exportingWorkOrderId, setExportingWorkOrderId] = useState<string | null>(null)
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const [exportingPendingSheet, setExportingPendingSheet] = useState(false)
  const [pendingExportDropdownOpen, setPendingExportDropdownOpen] = useState(false)
  const [noExecuteBusyKey, setNoExecuteBusyKey] = useState<string | null>(null)
  const [executionView, setExecutionView] = useState<'pending' | 'operations' | 'records'>('pending')
  const [queueDate, setQueueDate] = useState(() => localDateString())
  const [pendingKeyword, setPendingKeyword] = useState('')
  const [pendingPage, setPendingPage] = useState(1)
  const [pendingPageSize, setPendingPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [prefillFromPending, setPrefillFromPending] = useState<PendingExecutionRow | null>(null)

  const { data: workOrdersData } = useQuery({
    queryKey: ['product-distribution', 'workorders-all'],
    queryFn: () => productDistributionApi.getAllWorkOrders(),
  })
  const workOrders: WorkOrderListItem[] = (workOrdersData as any)?.list ?? []

  const { data: listData, isLoading, error } = useQuery({
    queryKey: ['product-distribution', 'execution-orders', { work_order_id: workOrderId || undefined, keyword, page, pageSize }],
    queryFn: () =>
      productDistributionApi.getExecutionOrders({
        work_order_id: workOrderId ? Number(workOrderId) : undefined,
        keyword: keyword.trim() || undefined,
        page,
        pageSize,
      }),
    enabled: mode === 'list' && (executionView === 'records' || executionView === 'operations'),
  })

  const {
    data: queueExportParsed,
    isLoading: queueExportLoading,
    error: queueExportError,
  } = useQuery({
    queryKey: ['reception', 'today-queue-export', 'execution', queueDate],
    queryFn: async () => {
      const body = await receptionApi.todayQueueExport({
        target_date: queueDate,
        source: 'execution',
      })
      return parseTodayQueueExportBody(body)
    },
    enabled: mode === 'list' && executionView === 'pending',
  })

  const { data: pendingSkipsPayload } = useQuery({
    queryKey: ['product-distribution', 'execution-pending-skips', queueDate],
    queryFn: () => productDistributionApi.getExecutionPendingSkips(queueDate),
    enabled: mode === 'list' && executionView === 'pending',
  })

  const listPayload = listData as { list?: ExecutionRecordListItem[]; total?: number } | undefined
  const records: ExecutionRecordListItem[] = listPayload?.list ?? []
  const total = listPayload?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const selectedWorkOrder = useMemo(() => workOrders.find((w) => String(w.id) === workOrderId) ?? null, [workOrders, workOrderId])
  const workOrderById = useMemo(() => {
    const m = new Map<string, WorkOrderListItem>()
    workOrders.forEach((wo) => m.set(String(wo.id), wo))
    return m
  }, [workOrders])
  const { data: operationsDetailData, isLoading: operationsLoading, error: operationsError } = useQuery({
    queryKey: ['product-distribution', 'execution-ops-details', records.map((r) => r.id).join(',')],
    queryFn: async () => {
      const details = await Promise.all(records.map((r) => productDistributionApi.getExecutionOrder(Number(r.id))))
      return details as ExecutionRecordDetail[]
    },
    enabled: mode === 'list' && executionView === 'operations' && records.length > 0,
  })
  const operationRows = useMemo(() => {
    const details = (operationsDetailData as ExecutionRecordDetail[] | undefined) ?? []
    return details.flatMap((rec) => {
      const wo = workOrderById.get(String(rec.work_order_id))
      const recAny = rec as any
      return (rec.products ?? []).map((p, i) => ({
        key: `${rec.id}-${i}`,
        workOrderNo: wo?.work_order_no ?? '—',
        projectNo: rec.related_project_no || wo?.project_no || '—',
        projectName: wo?.project_name ?? rec.project_name ?? '—',
        subjectSc: rec.screening_no?.trim() || '—',
        subjectInitials: rec.subject_initials || '—',
        subjectRd: (rec.subject_rd || '').trim() || '—',
        stage: STAGE_LABELS[p.stage] ?? p.stage ?? '—',
        cycle: p.execution_cycle ?? '—',
        product: `${p.product_code ?? ''} ${p.product_name ?? ''}`.trim() || '—',
        bottleSequence: p.bottle_sequence ?? '—',
        operation: productOpLabel(p),
        weight: productWeightParts(p),
        diary: productDiaryLabel(p),
        operationTime: formatOperationTime((p as any).operation_time ?? recAny.updated_at ?? recAny.created_at ?? null),
      }))
    })
  }, [operationsDetailData, workOrderById])

  const workOrderByProjectNo = useMemo(() => {
    const m = new Map<string, WorkOrderListItem>()
    workOrders.forEach((wo) => {
      const k = String(wo.project_no ?? '').trim().toLowerCase()
      if (k) m.set(k, wo)
    })
    return m
  }, [workOrders])

  const queueItems: QueueItem[] = queueExportParsed?.items ?? []

  const pendingRows = useMemo(() => {
    const rows: PendingExecutionRow[] = []
    for (const q of queueItems) {
      if (!PENDING_QUEUE_STATUSES.has(q.status)) continue
      const es = (q.enrollment_status ?? '').trim()
      if (!PENDING_ENROLLMENT_STATUSES.has(es)) continue
      const pc = String(q.project_code ?? '').trim().toLowerCase()
      const wo = pc ? workOrderByProjectNo.get(pc) : undefined
      if (!wo) continue
      rows.push({
        key: `${wo.id}-${q.subject_id}-${q.checkin_id ?? 'x'}-${q.appointment_id ?? 'x'}`,
        workOrder: wo,
        subjectSc: (q.sc_number ?? '').trim() || '—',
        subjectInitials: (q.name_pinyin_initials ?? '').trim() || '—',
        subjectRd: (q.rd_number ?? '').trim() || '—',
        enrollmentStatus: es,
        queueStatus: q.status,
        subjectId: q.subject_id,
        checkinId: q.checkin_id ?? null,
      })
    }
    return rows
  }, [queueItems, workOrderByProjectNo])

  const pendingSkipItems = (pendingSkipsPayload as { items?: Array<{ work_order_id: number; subject_id: number; checkin_id: number | null; queue_date: string }> } | undefined)?.items ?? []

  const pendingRowsVisible = useMemo(() => {
    return pendingRows.filter((r) => {
      return !pendingSkipItems.some((it) => {
        if (String(it.queue_date) !== queueDate) return false
        if (Number(it.work_order_id) !== Number(r.workOrder.id)) return false
        if (it.checkin_id != null && r.checkinId != null) {
          return Number(it.checkin_id) === Number(r.checkinId)
        }
        return Number(it.subject_id) === Number(r.subjectId)
      })
    })
  }, [pendingRows, pendingSkipItems, queueDate])

  const filteredPendingRows = useMemo(() => {
    let rows = pendingRowsVisible
    if (workOrderId) rows = rows.filter((r) => String(r.workOrder.id) === workOrderId)
    const kw = pendingKeyword.trim().toLowerCase()
    if (!kw) return rows
    return rows.filter((r) => {
      const wo = r.workOrder
      const blob = [
        wo.work_order_no,
        wo.project_no,
        wo.project_name,
        wo.researcher,
        wo.supervisor,
        r.subjectSc,
        r.subjectInitials,
        r.subjectRd,
        r.enrollmentStatus,
      ]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' ')
      return blob.includes(kw)
    })
  }, [pendingRowsVisible, workOrderId, pendingKeyword])

  const pendingTotal = filteredPendingRows.length
  const pendingTotalPages = Math.max(1, Math.ceil(pendingTotal / pendingPageSize))
  const paginatedPendingRows = useMemo(() => {
    const start = (pendingPage - 1) * pendingPageSize
    return filteredPendingRows.slice(start, start + pendingPageSize)
  }, [filteredPendingRows, pendingPage, pendingPageSize])

  const { data: workOrderDetail } = useQuery({
    queryKey: ['product-distribution', 'workorder', workOrderId],
    queryFn: () => productDistributionApi.getWorkOrder(Number(workOrderId)),
    enabled: !!workOrderId && (mode === 'new' || mode === 'edit'),
  })

  const { data: editInitial, isLoading: editDetailLoading } = useQuery({
    queryKey: ['product-distribution', 'execution-order', editingRecordId],
    queryFn: () => productDistributionApi.getExecutionOrder(Number(editingRecordId!)),
    enabled: !!editingRecordId && mode === 'edit',
  })

  const { data: viewDetail, isLoading: viewDetailLoading } = useQuery({
    queryKey: ['product-distribution', 'execution-order-view', viewingRecord?.id],
    queryFn: () => productDistributionApi.getExecutionOrder(Number(viewingRecord!.id)),
    enabled: !!viewingRecord?.id && mode === 'view',
  })

  useEffect(() => setPage(1), [workOrderId, keyword, executionView])
  useEffect(() => setPendingPage(1), [queueDate, pendingKeyword, workOrderId, executionView])
  useEffect(() => {
    setPendingExportDropdownOpen(false)
    setExportDropdownOpen(false)
  }, [executionView])

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['product-distribution', 'execution-orders'] })
    queryClient.invalidateQueries({ queryKey: ['product-distribution', 'execution-pending-skips'] })
    queryClient.invalidateQueries({ queryKey: ['reception', 'today-queue-export'] })
    // 执行记录影响发放/回收数据，领用台账的 total_distributed/total_recovered 需同步更新
    queryClient.invalidateQueries({ queryKey: ['product-distribution', 'orders-ledger'] })
  }

  const handleSaveNew = async (payload: ExecutionRecordCreate) => {
    setSubmitError(null)
    try {
      await productDistributionApi.createExecutionOrder(payload as any)
      setPrefillFromPending(null)
      refresh()
      setMode('list')
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '请检查网络或后端')
    }
  }

  const handleSaveEdit = async (payload: ExecutionRecordCreate) => {
    if (!editingRecordId) return
    const idToInvalidate = editingRecordId
    setSubmitError(null)
    try {
      await productDistributionApi.updateExecutionOrder(Number(editingRecordId), {
        related_project_no: payload.related_project_no,
        subject_rd: payload.subject_rd,
        subject_initials: payload.subject_initials,
        screening_no: payload.screening_no,
        execution_date: payload.execution_date,
        exception_type: payload.exception_type,
        exception_description: payload.exception_description,
        remark: payload.remark,
        operator_name: payload.operator_name ?? undefined,
        products: payload.products,
      } as any)
      queryClient.invalidateQueries({ queryKey: ['product-distribution', 'execution-order', idToInvalidate] })
      queryClient.invalidateQueries({ queryKey: ['product-distribution', 'execution-order-view', idToInvalidate] })
      setEditingRecordId(null)
      refresh()
      setMode('list')
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '请检查网络或后端')
    }
  }

  const openView = (rec: ExecutionRecordListItem) => {
    setViewingRecord({ ...rec, products: [] } as ExecutionRecordDetail)
    setMode('view')
  }

  const openEdit = (rec: ExecutionRecordListItem) => {
    setEditingRecordId(rec.id)
    setWorkOrderId(rec.work_order_id)
    setSubmitError(null)
    setMode('edit')
  }

  const openRegisterFromPending = (row: PendingExecutionRow) => {
    setSubmitError(null)
    setPrefillFromPending(row)
    setWorkOrderId(String(row.workOrder.id))
    setMode('new')
  }

  const handleExportPendingList = async () => {
    setPendingExportDropdownOpen(false)
    if (filteredPendingRows.length === 0) {
      setToastMessage({ type: 'error', text: '当前没有可导出的待执行数据' })
      return
    }
    setExportingPendingSheet(true)
    try {
      const headers = [
        '工单编号',
        '项目编号',
        '项目名称',
        '启动日期',
        '结束日期',
        '访视',
        '研究员',
        '督导',
        '受试者SC号',
        '姓名首字母',
        '受试者RD号',
        '入组情况',
        '队列状态',
        '队列日期',
      ]
      const rows = filteredPendingRows.map((row) => {
        const wo = row.workOrder
        return [
          wo.work_order_no,
          wo.project_no,
          wo.project_name,
          wo.project_start_date ?? '',
          wo.project_end_date ?? '',
          wo.visit_count ?? '',
          wo.researcher ?? '',
          wo.supervisor ?? '',
          row.subjectSc,
          row.subjectInitials,
          row.subjectRd,
          row.enrollmentStatus,
          EXECUTION_QUEUE_STATUS_LABELS[row.queueStatus] ?? row.queueStatus,
          queueDate,
        ]
      })
      await productDistributionApi.exportExcel({
        sheet_name: '待执行工单',
        filename: `待执行工单_${queueDate}.xlsx`,
        headers,
        rows,
      })
    } catch (e) {
      setToastMessage({ type: 'error', text: e instanceof Error ? e.message : '导出失败，请稍后重试' })
    } finally {
      setExportingPendingSheet(false)
    }
  }

  const handleNoExecute = async (row: PendingExecutionRow) => {
    const sc = row.subjectSc.trim()
    if (!sc || sc === '—') {
      setToastMessage({ type: 'error', text: '缺少受试者SC号，无法标记无需执行' })
      return
    }
    if (!confirm('确认无需执行？该记录将进入受试者产品记录，并记录操作时间。')) return
    setNoExecuteBusyKey(row.key)
    try {
      const payload: Record<string, unknown> = {
        work_order_id: Number(row.workOrder.id),
        related_project_no: row.workOrder.project_no,
        subject_rd: row.subjectRd === '—' ? '' : row.subjectRd,
        subject_initials: row.subjectInitials === '—' ? '' : row.subjectInitials,
        screening_no: sc,
        execution_date: queueDate,
        skip_execution: true,
        pending_queue_date: queueDate,
        pending_subject_id: row.subjectId,
        products: [],
      }
      if (row.checkinId != null) payload.pending_checkin_id = row.checkinId
      await productDistributionApi.createExecutionOrder(payload)
      queryClient.invalidateQueries({ queryKey: ['product-distribution', 'execution-pending-skips'] })
      refresh()
      setToastMessage({ type: 'success', text: '已标记为无需执行' })
    } catch (e) {
      setToastMessage({ type: 'error', text: e instanceof Error ? e.message : '操作失败' })
    } finally {
      setNoExecuteBusyKey(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该执行记录？')) return
    try {
      await productDistributionApi.deleteExecutionOrder(Number(id))
      queryClient.invalidateQueries({ queryKey: ['product-distribution', 'execution-order', id] })
      queryClient.invalidateQueries({ queryKey: ['product-distribution', 'execution-order-view', id] })
      refresh()
      setViewingRecord(null)
      setMode('list')
    } catch (e) {
      setToastMessage({ type: 'error', text: e instanceof Error ? e.message : '删除失败' })
    }
  }

  const handleExportByProject = async (wo: WorkOrderListItem) => {
    setExportDropdownOpen(false)
    setExportingWorkOrderId(String(wo.id))
    try {
      const allRecords: ExecutionRecordListItem[] = []
      let page = 1
      const pageSize = 100
      while (true) {
        const res = await productDistributionApi.getExecutionOrders({
          work_order_id: Number(wo.id),
          page,
          pageSize,
        })
        const list = (res as any)?.list ?? []
        allRecords.push(...list)
        const total = (res as any)?.total ?? 0
        if (list.length < pageSize || allRecords.length >= total) break
        page += 1
      }
      const details: ExecutionRecordDetail[] = []
      for (const rec of allRecords) {
        const d = await productDistributionApi.getExecutionOrder(Number(rec.id))
        if (d) details.push(d as ExecutionRecordDetail)
      }
      const opTypeLabel = (t: string | number | null | undefined): string => {
        if (t === 'distribution' || t === 0) return '发放'
        if (t === 'inspection' || t === 1) return '检查'
        if (t === 'recovery' || t === 2) return '回收'
        return ''
      }
      const OPS = ['发放', '检查', '回收'] as const
      const opToKey = (op: string) => (OPS as readonly string[]).indexOf(op)
      const formatWeight = (w: number | string): string => {
        const n = typeof w === 'number' ? w : Number(w)
        if (Number.isNaN(n)) return ''
        return Number.isInteger(n) ? String(n) : (n as number).toFixed(2)
      }
      const cycleProducts = new Map<string, string[]>()
      for (const cycle of EXECUTION_CYCLE_OPTIONS) {
        const names = new Set<string>()
        for (const rec of details) {
          for (const p of rec.products ?? []) {
            const c = (p.execution_cycle ?? '').trim()
            if (c === cycle && (p.product_name ?? '').trim()) names.add((p.product_name ?? '').trim())
          }
        }
        if (names.size > 0) cycleProducts.set(cycle, [...names].sort())
      }
      const colIndex: { cycle: string; product: string; opIndex: number }[] = []
      for (const cycle of EXECUTION_CYCLE_OPTIONS) {
        for (const product of cycleProducts.get(cycle) ?? []) {
          for (let opIndex = 0; opIndex < 3; opIndex++) colIndex.push({ cycle, product, opIndex })
        }
      }
      const headerRow0: (string | number)[] = ['受试者SC号', '受试者入组编号', '测试组别', '产品组别']
      const headerRow1: (string | number)[] = ['', '', '', '']
      const headerRow2: (string | number)[] = ['', '', '', '']
      const headerRow3: (string | number)[] = ['', '', '', '']
      for (const cycle of EXECUTION_CYCLE_OPTIONS) {
        const products = cycleProducts.get(cycle) ?? []
        for (const product of products) {
          headerRow0.push(cycle, cycle, cycle)
          headerRow1.push(product, product, product)
          headerRow2.push('重量', '重量', '重量')
          headerRow3.push('发放', '检查', '回收')
        }
      }
      const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [
        { s: { r: 0, c: 0 }, e: { r: 3, c: 0 } },
        { s: { r: 0, c: 1 }, e: { r: 3, c: 1 } },
        { s: { r: 0, c: 2 }, e: { r: 3, c: 2 } },
        { s: { r: 0, c: 3 }, e: { r: 3, c: 3 } },
      ]
      const sortedDetails = [...details].sort((a, b) =>
        (a.subject_rd ?? '').localeCompare(b.subject_rd ?? '', undefined, { numeric: true })
      )
      const pItem = (x: ExecutionRecordDetail['products'][0]) => x as {
        product_operation_type?: string | number | null
        diary_distribution?: number
        diary_inspection?: number
        diary_recovery?: number
      }
      const dataRows: (string | number)[][] = []
      for (const rec of sortedDetails) {
        const byKey = new Map<string, Map<number, number>>()
        for (const p of rec.products ?? []) {
          const cycle = (p.execution_cycle ?? '').trim()
          const product = (p.product_name ?? '').trim()
          if (!cycle || !product) continue
          const key = `${cycle}\t${product}`
          if (!byKey.has(key)) byKey.set(key, new Map())
          const weightMap = byKey.get(key)!
          const op = opTypeLabel(pItem(p).product_operation_type)
          const opIdx = opToKey(op)
          if (opIdx >= 0) {
            if (op === '发放' && p.distribution_weight != null) weightMap.set(0, p.distribution_weight)
            if (op === '检查' && p.inspection_weight != null) weightMap.set(1, p.inspection_weight)
            if (op === '回收' && p.recovery_weight != null) weightMap.set(2, p.recovery_weight)
          }
          if (pItem(p).diary_distribution === 1 && p.distribution_weight != null) weightMap.set(0, p.distribution_weight)
          if (pItem(p).diary_inspection === 1 && p.inspection_weight != null) weightMap.set(1, p.inspection_weight)
          if (pItem(p).diary_recovery === 1 && p.recovery_weight != null) weightMap.set(2, p.recovery_weight)
        }
        const row: (string | number)[] = [rec.screening_no ?? '', rec.subject_rd ?? '', '', '']
        for (const { cycle, product, opIndex } of colIndex) {
          const key = `${cycle}\t${product}`
          const w = byKey.get(key)?.get(opIndex)
          row.push(w != null && Number(w) >= 0 ? formatWeight(w) : '')
        }
        dataRows.push(row)
      }
      const aoa: (string | number)[][] = [headerRow0, headerRow1, headerRow2, headerRow3, ...dataRows]
      const XLSX = await import('xlsx-js-style')
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!merges'] = merges as any
      const numCols = Math.max(4, headerRow0.length)
      const thinBorder = { style: 'thin' as const, color: { rgb: 'FF000000' } }
      const border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }
      const cellDisplayWidth = (v: string | number): number => {
        const s = String(v)
        let w = 0
        for (let i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255 ? 2 : 1
        return Math.min(50, Math.max(2, w))
      }
      if (numCols > 0) {
        const colWidths: { wch: number }[] = []
        for (let c = 0; c < numCols; c++) {
          if (c < 4) {
            colWidths.push({ wch: 14 })
          } else {
            let maxW = 2
            for (let r = 0; r < aoa.length; r++) {
              const val = aoa[r]?.[c]
              if (val !== undefined && val !== null) {
                const w = cellDisplayWidth(val)
                if (w > maxW) maxW = w
              }
            }
            colWidths.push({ wch: Math.min(50, maxW + 1) })
          }
        }
        ws['!cols'] = colWidths
      }
      const cellStyle = {
        font: { name: '宋体', sz: 10.5 },
        alignment: { horizontal: 'center' as const, vertical: 'center' as const },
        border,
      }
      const headerFill = { fill: { fgColor: { rgb: 'DAE3F3' }, patternType: 'solid' as const } }
      const range = XLSX.utils.decode_range((ws['!ref'] ?? 'A1') as string)
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c })
          const cell = ws[addr]
          if (cell) {
            const baseStyle = { ...(cell as { s?: object }).s, ...cellStyle }
            ;(cell as { s?: object }).s = r < 4 && c < 4 ? { ...baseStyle, ...headerFill } : baseStyle
          }
        }
      }
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '产品使用跟踪')
      const safeFileName = (s: string) => String(s).replace(/[/\\:*?"<>|]/g, '_').trim() || '未命名'
      const fileName = `执行记录_${wo.project_no ?? ''}_${safeFileName(wo.project_name ?? '')}.xlsx`
      XLSX.writeFile(wb, fileName)
    } catch (e) {
      setToastMessage({ type: 'error', text: e instanceof Error ? e.message : '导出失败，请稍后重试' })
    } finally {
      setExportingWorkOrderId(null)
    }
  }

  const detailForView = (mode === 'view' && viewDetail) ? (viewDetail as ExecutionRecordDetail) : null
  const opLabel = (p: any) => {
    const t = p.product_operation_type
    if (t === 'distribution') return '发放'
    if (t === 'inspection') return '检查'
    if (t === 'recovery') return '回收'
    if (t === 'site_use') return '现场使用'
    if (p.product_distribution === 1) return '发放'
    if (p.product_inspection === 1) return '检查'
    if (p.product_recovery === 1) return '回收'
    return '—'
  }
  /** 与 KIS 一致：产品操作 + 日记对应的称重展示 */
  const viewWeightParts = (p: any) => {
    const op = opLabel(p)
    const hasDiary = p.diary_distribution === 1 || p.diary_inspection === 1 || p.diary_recovery === 1
    const diary = hasDiary
      ? p.diary_distribution === 1
        ? '发放'
        : p.diary_inspection === 1
          ? '检查'
          : '回收'
      : null
    const fmt = (n: number | null | undefined) => (n != null ? Number(n).toFixed(2) : null)
    const parts: string[] = []
    if (op === '发放' && p.distribution_weight != null) parts.push(`发放:${fmt(p.distribution_weight)}`)
    if (op === '检查' && p.inspection_weight != null) parts.push(`检查:${fmt(p.inspection_weight)}`)
    if (op === '回收' && p.recovery_weight != null) parts.push(`回收:${fmt(p.recovery_weight)}`)
    if (diary === '发放' && p.distribution_weight != null && !parts.some((s) => s.startsWith('发放:'))) parts.push(`发放:${fmt(p.distribution_weight)}`)
    if (diary === '检查' && p.inspection_weight != null && !parts.some((s) => s.startsWith('检查:'))) parts.push(`检查:${fmt(p.inspection_weight)}`)
    if (diary === '回收' && p.recovery_weight != null && !parts.some((s) => s.startsWith('回收:'))) parts.push(`回收:${fmt(p.recovery_weight)}`)
    return parts.join(' ') || '—'
  }
  const viewDiaryLabel = (p: any) => {
    if (p.diary_distribution === 1) return '发放'
    if (p.diary_inspection === 1) return '检查'
    if (p.diary_recovery === 1) return '回收'
    return '—'
  }

  if (mode === 'new') {
    const prefillInitial: ExecutionRecordDetail | undefined = prefillFromPending
      ? {
          id: '',
          work_order_id: String(prefillFromPending.workOrder.id),
          related_project_no: prefillFromPending.workOrder.project_no,
          subject_rd: prefillFromPending.subjectRd === '—' ? '' : prefillFromPending.subjectRd,
          subject_initials: prefillFromPending.subjectInitials === '—' ? '' : prefillFromPending.subjectInitials,
          screening_no: prefillFromPending.subjectSc === '—' ? '' : prefillFromPending.subjectSc,
          execution_date: localDateString(),
          operator_name: null,
          exception_type: null,
          remark: null,
          products: [],
          project_name: prefillFromPending.workOrder.project_name,
        }
      : undefined
    const leaveNew = () => {
      setPrefillFromPending(null)
      setMode('list')
    }
    return (
      <div className="space-y-4">
        {toastMessage && (
          <div className={`rounded-lg px-3 py-2 text-sm ${toastMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
            {toastMessage.text}
            <button type="button" className="ml-2 underline" onClick={() => setToastMessage(null)}>关闭</button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">关联项目：</label>
            <select
              className="h-9 min-w-[360px] rounded-lg border border-slate-200 px-3 text-sm"
              value={workOrderId || '__'}
              onChange={(e) => setWorkOrderId(e.target.value === '__' ? '' : e.target.value)}
            >
              <option value="__">请选择项目</option>
              {workOrders.map((wo) => (
                <option key={wo.id} value={wo.id}>{wo.project_no} - {wo.project_name}</option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={leaveNew}>返回列表</Button>
        </div>
        <ExecutionRecordForm
          workOrderId={workOrderId || undefined}
          relatedProjectNo={selectedWorkOrder?.project_no}
          projectName={selectedWorkOrder?.project_name}
          usageMethod={(workOrderDetail as any)?.usage_method}
          usageFrequency={(workOrderDetail as any)?.usage_frequency}
          precautions={(workOrderDetail as any)?.precautions}
          initialExecution={prefillInitial}
          onSave={handleSaveNew}
          onCancel={leaveNew}
          submitError={submitError}
        />
      </div>
    )
  }

  if (mode === 'edit' && editingRecordId) {
    if (editDetailLoading) {
      return <div className="py-12 text-center text-sm text-slate-500">加载执行记录详情中...</div>
    }
    const editSubjectRd = (editInitial as ExecutionRecordDetail)?.subject_rd ?? '—'
    const editSubjectInitials = (editInitial as ExecutionRecordDetail)?.subject_initials ?? '—'
    return (
      <div className="space-y-4 min-h-0 overflow-visible">
        {toastMessage && (
          <div className={`rounded-lg px-3 py-2 text-sm ${toastMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
            {toastMessage.text}
            <button type="button" className="ml-2 underline" onClick={() => setToastMessage(null)}>关闭</button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-800">
            编辑执行记录：{editSubjectRd} / {editSubjectInitials}
          </p>
          <Button variant="outline" size="sm" onClick={() => { setMode('list'); setEditingRecordId(null) }}>返回列表</Button>
        </div>
        <div className="min-h-0 overflow-visible">
        <ExecutionRecordForm
          workOrderId={workOrderId || undefined}
          relatedProjectNo={selectedWorkOrder?.project_no ?? (editInitial as ExecutionRecordDetail)?.related_project_no}
          projectName={selectedWorkOrder?.project_name ?? (editInitial as ExecutionRecordDetail)?.project_name ?? undefined}
          usageMethod={(workOrderDetail as any)?.usage_method}
          usageFrequency={(workOrderDetail as any)?.usage_frequency}
          precautions={(workOrderDetail as any)?.precautions}
          initialExecution={editInitial as ExecutionRecordDetail}
          onSave={handleSaveEdit}
          onCancel={() => { setMode('list'); setEditingRecordId(null) }}
          submitError={submitError}
        />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {toastMessage && (
        <div className={`rounded-lg px-3 py-2 text-sm ${toastMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {toastMessage.text}
          <button type="button" className="ml-2 underline" onClick={() => setToastMessage(null)}>关闭</button>
        </div>
      )}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            executionView === 'pending'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setExecutionView('pending')}
        >
          待执行工单
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            executionView === 'operations'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setExecutionView('operations')}
        >
          产品操作记录
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            executionView === 'records'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-600 hover:text-slate-800'
          }`}
          onClick={() => setExecutionView('records')}
        >
          受试者产品记录
        </button>
      </div>

      {executionView === 'pending' ? (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-slate-600 whitespace-nowrap">队列日期</label>
                <input
                  type="date"
                  className="h-9 rounded-lg border border-slate-200 px-3 text-sm"
                  value={queueDate}
                  onChange={(e) => setQueueDate(e.target.value || localDateString())}
                />
                <select
                  className="h-9 min-w-[200px] rounded-lg border border-slate-200 px-3 text-sm"
                  value={workOrderId}
                  onChange={(e) => setWorkOrderId(e.target.value)}
                >
                  <option value="">全部项目</option>
                  {workOrders.map((wo) => (
                    <option key={wo.id} value={wo.id}>{wo.project_no} - {wo.project_name}</option>
                  ))}
                </select>
                <div className="relative flex-1 min-w-[200px] sm:min-w-[240px] sm:max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="搜索工单、受试者、入组情况..."
                    value={pendingKeyword}
                    onChange={(e) => setPendingKeyword(e.target.value)}
                    className="h-9 w-full pl-8 rounded-lg border border-slate-200 text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!exportingPendingSheet || filteredPendingRows.length === 0}
                    onClick={() => setPendingExportDropdownOpen((v) => !v)}
                  >
                    <span className="inline-flex items-center whitespace-nowrap gap-1.5">
                      <Download className="h-3.5 w-3.5 shrink-0" />
                      导出待执行列表
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    </span>
                  </Button>
                  {pendingExportDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setPendingExportDropdownOpen(false)} aria-hidden />
                      <div className="absolute right-0 top-full mt-1 z-20 min-w-[240px] rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                          disabled={!!exportingPendingSheet}
                          onClick={() => void handleExportPendingList()}
                        >
                          导出当前筛选结果（全部行）
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setSubmitError(null)
                    setPrefillFromPending(null)
                    setMode('new')
                    setWorkOrderId('')
                  }}
                >
                  <span className="inline-flex items-center whitespace-nowrap gap-1.5">
                    <Plus className="h-3.5 w-3.5 shrink-0" />新建执行记录
                  </span>
                </Button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              数据由工单管理与和序「工单执行」当日队列按项目编号匹配；仅含已签到/执行中且入组情况为初筛合格、正式入组、复筛不合格、退出。
            </p>
          </div>

          <Card variant="elevated" className="overflow-hidden">
            {queueExportError && (
              <p className="px-2 py-1.5 text-red-600 text-sm">加载队列失败：{(queueExportError as Error).message}</p>
            )}
            {queueExportLoading && <p className="px-2 py-1.5 text-slate-500 text-sm">加载中…</p>}
            {!queueExportLoading && !queueExportError && paginatedPendingRows.length === 0 && (
              <p className="px-2 py-1.5 text-slate-500 text-sm">暂无待执行工单（请确认当日队列存在匹配工单的受试者）</p>
            )}
            {!queueExportLoading && !queueExportError && paginatedPendingRows.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="text-left px-2 py-1.5 font-medium">工单编号</th>
                        <th className="text-left px-2 py-1.5 font-medium">项目编号</th>
                        <th className="text-left px-2 py-1.5 font-medium">项目名称</th>
                        <th className="text-left px-2 py-1.5 font-medium">启动日期</th>
                        <th className="text-left px-2 py-1.5 font-medium">结束日期</th>
                        <th className="text-left px-2 py-1.5 font-medium text-center">访视</th>
                        <th className="text-left px-2 py-1.5 font-medium">研究员</th>
                        <th className="text-left px-2 py-1.5 font-medium">督导</th>
                        <th className="text-left px-2 py-1.5 font-medium">受试者SC号</th>
                        <th className="text-left px-2 py-1.5 font-medium">姓名首字母</th>
                        <th className="text-left px-2 py-1.5 font-medium">受试者RD号</th>
                        <th className="text-left px-2 py-1.5 font-medium">入组情况</th>
                        <th className="text-left px-2 py-1.5 font-medium">队列状态</th>
                        <th className="text-right px-2 py-1.5 min-w-[140px] font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedPendingRows.map((row) => {
                        const wo = row.workOrder
                        return (
                          <tr key={row.key} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-2 py-1.5 font-medium">{wo.work_order_no}</td>
                            <td className="px-2 py-1.5">{wo.project_no}</td>
                            <td className="px-2 py-1.5 min-w-[120px] max-w-[160px] truncate" title={wo.project_name}>{wo.project_name}</td>
                            <td className="px-2 py-1.5">{wo.project_start_date ?? '—'}</td>
                            <td className="px-2 py-1.5">{wo.project_end_date ?? '—'}</td>
                            <td className="px-2 py-1.5 text-center">{wo.visit_count != null ? wo.visit_count : '—'}</td>
                            <td className="px-2 py-1.5">{wo.researcher ?? '—'}</td>
                            <td className="px-2 py-1.5">{wo.supervisor ?? '—'}</td>
                            <td className="px-2 py-1.5 font-medium">{row.subjectSc}</td>
                            <td className="px-2 py-1.5">{row.subjectInitials}</td>
                            <td className="px-2 py-1.5">{row.subjectRd}</td>
                            <td className="px-2 py-1.5">{row.enrollmentStatus}</td>
                            <td className="px-2 py-1.5">{EXECUTION_QUEUE_STATUS_LABELS[row.queueStatus] ?? row.queueStatus}</td>
                            <td className="px-2 py-1.5 text-right">
                              <div className="flex flex-wrap justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openRegisterFromPending(row)}>
                                  执行
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-slate-600"
                                  disabled={noExecuteBusyKey === row.key}
                                  onClick={() => void handleNoExecute(row)}
                                >
                                  无需执行
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {pendingTotal > 0 && (
                  <div className="flex items-center justify-between px-2 py-1.5 border-t border-slate-200">
                    <span className="text-sm text-slate-500">共 {pendingTotal} 条，第 {pendingPage} / {pendingTotalPages} 页</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={pendingPageSize}
                        onChange={(e) => {
                          setPendingPageSize(Number(e.target.value))
                          setPendingPage(1)
                        }}
                        className="h-9 w-[100px] rounded-lg border border-slate-200 px-2 text-sm"
                      >
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <option key={n} value={n}>{n} 条/页</option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                        disabled={pendingPage === 1}
                        className="border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400 justify-center disabled:border-slate-200 disabled:text-slate-400"
                      >
                        <span className="inline-flex items-center whitespace-nowrap gap-1.5"><ChevronLeft className="h-4 w-4 shrink-0" />上一页</span>
                      </Button>
                      <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 text-sm text-slate-700 border border-slate-300 rounded">{pendingPage}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPendingPage((p) => Math.min(pendingTotalPages, p + 1))}
                        disabled={pendingPage === pendingTotalPages}
                        className="border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400 justify-center disabled:border-slate-200 disabled:text-slate-400"
                      >
                        <span className="inline-flex items-center whitespace-nowrap gap-1.5">下一页<ChevronRight className="h-4 w-4 shrink-0" /></span>
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      ) : executionView === 'operations' ? (
        <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 min-w-[200px] rounded-lg border border-slate-200 px-3 text-sm"
            value={workOrderId}
            onChange={(e) => setWorkOrderId(e.target.value)}
          >
            <option value="">全部项目</option>
            {workOrders.map((wo) => (
              <option key={wo.id} value={wo.id}>{wo.project_no} - {wo.project_name}</option>
            ))}
          </select>
          <div className="relative flex-1 sm:min-w-[300px] sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索受试者、项目..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-9 w-full pl-8 rounded-lg border border-slate-200 text-sm"
            />
          </div>
        </div>
      </div>

      <Card variant="elevated" className="overflow-hidden">
        {error && <p className="px-2 py-1.5 text-red-600 text-sm">加载失败：{(error as Error).message}</p>}
        {operationsError && <p className="px-2 py-1.5 text-red-600 text-sm">加载产品操作记录失败：{(operationsError as Error).message}</p>}
        {(isLoading || operationsLoading) && <p className="px-2 py-1.5 text-slate-500 text-sm">加载中…</p>}
        {!isLoading && !operationsLoading && !error && !operationsError && operationRows.length === 0 && (
          <p className="px-2 py-1.5 text-slate-500 text-sm">暂无产品操作记录</p>
        )}
        {!isLoading && !operationsLoading && !error && !operationsError && operationRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-2 py-1.5 font-medium">工单编号</th>
                  <th className="text-left px-2 py-1.5 font-medium">项目编号</th>
                  <th className="text-left px-2 py-1.5 font-medium">项目名称</th>
                  <th className="text-left px-2 py-1.5 font-medium">受试者SC号</th>
                  <th className="text-left px-2 py-1.5 font-medium">姓名首字母</th>
                  <th className="text-left px-2 py-1.5 font-medium">受试者RD号</th>
                  <th className="text-left px-2 py-1.5 font-medium">阶段</th>
                  <th className="text-left px-2 py-1.5 font-medium">周期</th>
                  <th className="text-left px-2 py-1.5 font-medium">产品编号/名称</th>
                  <th className="text-left px-2 py-1.5 font-medium">瓶序</th>
                  <th className="text-left px-2 py-1.5 font-medium">产品操作</th>
                  <th className="text-left px-2 py-1.5 font-medium">称重(g)</th>
                  <th className="text-left px-2 py-1.5 font-medium">日记</th>
                  <th className="text-left px-2 py-1.5 font-medium whitespace-nowrap">操作时间</th>
                </tr>
              </thead>
              <tbody>
                {operationRows.map((r) => (
                  <tr key={r.key} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-2 py-1.5 font-medium">{r.workOrderNo}</td>
                    <td className="px-2 py-1.5">{r.projectNo}</td>
                    <td className="px-2 py-1.5 min-w-[120px] max-w-[160px] truncate" title={r.projectName}>{r.projectName}</td>
                    <td className="px-2 py-1.5">{r.subjectSc}</td>
                    <td className="px-2 py-1.5">{r.subjectInitials}</td>
                    <td className="px-2 py-1.5">{r.subjectRd}</td>
                    <td className="px-2 py-1.5">{r.stage}</td>
                    <td className="px-2 py-1.5">{r.cycle}</td>
                    <td className="px-2 py-1.5 min-w-[180px]">{r.product}</td>
                    <td className="px-2 py-1.5">{r.bottleSequence}</td>
                    <td className="px-2 py-1.5">{r.operation}</td>
                    <td className="px-2 py-1.5">{r.weight}</td>
                    <td className="px-2 py-1.5">{r.diary}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{r.operationTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
        </>
      ) : (
        <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 min-w-[200px] rounded-lg border border-slate-200 px-3 text-sm"
            value={workOrderId}
            onChange={(e) => setWorkOrderId(e.target.value)}
          >
            <option value="">全部项目</option>
            {workOrders.map((wo) => (
              <option key={wo.id} value={wo.id}>{wo.project_no} - {wo.project_name}</option>
            ))}
          </select>
          <div className="relative flex-1 sm:min-w-[300px] sm:max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索受试者、项目..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-9 w-full pl-8 rounded-lg border border-slate-200 text-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              disabled={!!exportingWorkOrderId || workOrders.length === 0}
              onClick={() => setExportDropdownOpen((v) => !v)}
            >
              <span className="inline-flex items-center whitespace-nowrap gap-1.5">
                <Download className="h-3.5 w-3.5 shrink-0" />
                导出执行记录
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </span>
            </Button>
            {exportDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportDropdownOpen(false)} aria-hidden />
                <div className="absolute right-0 top-full mt-1 z-20 min-w-[280px] max-h-[320px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                  {workOrders.map((wo) => (
                    <button
                      key={wo.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 truncate disabled:opacity-50"
                      disabled={!!exportingWorkOrderId}
                      onClick={() => handleExportByProject(wo)}
                    >
                      {wo.project_no} - {wo.project_name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => {
              setSubmitError(null)
              setPrefillFromPending(null)
              setMode('new')
              setWorkOrderId('')
            }}
          >
            <span className="inline-flex items-center whitespace-nowrap gap-1.5">
              <Plus className="h-3.5 w-3.5 shrink-0" />新建执行记录
            </span>
          </Button>
        </div>
      </div>

      <Card variant="elevated" className="overflow-hidden">
        {error && <p className="px-2 py-1.5 text-red-600 text-sm">加载失败：{(error as Error).message}</p>}
        {isLoading && <p className="px-2 py-1.5 text-slate-500 text-sm">加载中…</p>}
        {!isLoading && !error && records.length === 0 && (
          <p className="px-2 py-1.5 text-slate-500 text-sm">暂无执行记录</p>
        )}
        {!isLoading && !error && records.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-2 py-1.5 font-medium">工单编号</th>
                    <th className="text-left px-2 py-1.5 font-medium">项目编号</th>
                    <th className="text-left px-2 py-1.5 font-medium">项目名称</th>
                    <th className="text-left px-2 py-1.5 font-medium">启动日期</th>
                    <th className="text-left px-2 py-1.5 font-medium">结束日期</th>
                    <th className="text-left px-2 py-1.5 font-medium text-center">访视</th>
                    <th className="text-left px-2 py-1.5 font-medium">研究员</th>
                    <th className="text-left px-2 py-1.5 font-medium">督导</th>
                    <th className="text-left px-2 py-1.5 font-medium">进展</th>
                    <th className="text-left px-2 py-1.5 font-medium whitespace-nowrap">操作时间</th>
                    <th className="text-left px-2 py-1.5 font-medium">受试者SC号</th>
                    <th className="text-left px-2 py-1.5 font-medium">姓名首字母</th>
                    <th className="text-left px-2 py-1.5 font-medium">受试者RD号</th>
                    <th className="text-right px-2 py-1.5 w-[60px] font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec) => {
                    const wo = workOrderById.get(String(rec.work_order_id))
                    return (
                      <tr key={rec.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-2 py-1.5 font-medium">{wo?.work_order_no ?? '—'}</td>
                        <td className="px-2 py-1.5">{rec.related_project_no}</td>
                        <td className="px-2 py-1.5 min-w-[120px] max-w-[160px] truncate" title={wo?.project_name}>{wo?.project_name ?? '—'}</td>
                        <td className="px-2 py-1.5">{wo?.project_start_date ?? '—'}</td>
                        <td className="px-2 py-1.5">{wo?.project_end_date ?? '—'}</td>
                        <td className="px-2 py-1.5 text-center">{wo?.visit_count != null ? wo.visit_count : '—'}</td>
                        <td className="px-2 py-1.5">{wo?.researcher ?? '—'}</td>
                        <td className="px-2 py-1.5">{wo?.supervisor ?? '—'}</td>
                        <td className="px-2 py-1.5">
                          {rec.skip_execution ? (
                            <Badge variant="secondary" className="text-xs font-normal">无需执行</Badge>
                          ) : (
                            <ProgressBadge progress={wo?.execution_progress ?? ''} />
                          )}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{formatOperationTime(rec.created_at)}</td>
                        <td className="px-2 py-1.5 font-medium">{rec.screening_no?.trim() || '—'}</td>
                        <td className="px-2 py-1.5">{rec.subject_initials}</td>
                        <td className="px-2 py-1.5">{(rec.subject_rd || '').trim() || '—'}</td>
                        <td className="px-2 py-1.5 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(rec)}>
                              <span className="inline-flex items-center whitespace-nowrap gap-1.5"><Pencil className="h-3 w-3 shrink-0" />编辑</span>
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openView(rec)}>
                              <span className="inline-flex items-center whitespace-nowrap gap-1.5"><Eye className="h-3 w-3 shrink-0" />查看</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {total > 0 && (
              <div className="flex items-center justify-between px-2 py-1.5 border-t border-slate-200">
                <span className="text-sm text-slate-500">共 {total} 条，第 {page} / {totalPages} 页</span>
                <div className="flex items-center gap-2">
                  <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }} className="h-9 w-[100px] rounded-lg border border-slate-200 px-2 text-sm">
                    {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} 条/页</option>)}
                  </select>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400 justify-center disabled:border-slate-200 disabled:text-slate-400">
                    <span className="inline-flex items-center whitespace-nowrap gap-1.5"><ChevronLeft className="h-4 w-4 shrink-0" />上一页</span>
                  </Button>
                  <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 text-sm text-slate-700 border border-slate-300 rounded">{page}</span>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400 justify-center disabled:border-slate-200 disabled:text-slate-400">
                    <span className="inline-flex items-center whitespace-nowrap gap-1.5">下一页<ChevronRight className="h-4 w-4 shrink-0" /></span>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
        </>
      )}

      {/* 查看详情 - 布局与 KIS 一致 */}
      <Modal
        open={mode === 'view' && (!!viewingRecord || viewDetailLoading)}
        onClose={() => { if (!viewDetailLoading) { setMode('list'); setViewingRecord(null) } }}
        title="执行记录详情"
        titleClassName="text-xl font-semibold"
        size="xl"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => { setMode('list'); setViewingRecord(null) }}>关闭</Button>
          </div>
        }
      >
        {viewDetailLoading && !detailForView && <div className="py-8 text-center text-sm text-slate-500">加载中...</div>}
        {detailForView && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              {detailForView.screening_no?.trim() || '—'} / {(detailForView.subject_rd || '').trim() || '—'} / {detailForView.subject_initials}
            </p>
            <Card variant="elevated" className="p-4 border border-slate-200">
              <h3 className="text-base font-semibold text-slate-800 mb-3">基本信息</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-500">项目编号</span>
                  <span className="font-medium">{detailForView.related_project_no}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-500">操作日期</span>
                  <span>{formatExecutionDate(detailForView.execution_date)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-500">操作人</span>
                  <span>{(detailForView as any).operator_name ?? '—'}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-500">受试者SC号</span>
                  <span className="font-medium">{detailForView.screening_no?.trim() || '—'}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-500">姓名首字母</span>
                  <span>{detailForView.subject_initials}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-500">受试者RD号</span>
                  <span>{(detailForView.subject_rd || '').trim() || '—'}</span>
                </div>
              </div>
            </Card>
            {detailForView.products && detailForView.products.length > 0 && (
              <Card variant="elevated" className="p-4 border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 mb-3">产品操作记录</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 h-8 text-xs">
                        <th className="text-left p-2">阶段</th>
                        <th className="text-left p-2">周期</th>
                        <th className="text-left p-2">产品编号/名称</th>
                        <th className="text-left p-2">瓶序</th>
                        <th className="text-left p-2">产品操作</th>
                        <th className="text-left p-2">称重(g)</th>
                        <th className="text-left p-2">日记</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailForView.products.map((p: any, i: number) => (
                        <tr key={i} className="border-b border-slate-100 text-sm">
                          <td className="p-2">{STAGE_LABELS[p.stage] ?? p.stage}</td>
                          <td className="p-2">{p.execution_cycle ?? '—'}</td>
                          <td className="p-2">{p.product_code} {p.product_name}</td>
                          <td className="p-2">{p.bottle_sequence ?? '—'}</td>
                          <td className="p-2">{opLabel(p)}</td>
                          <td className="p-2">{viewWeightParts(p)}</td>
                          <td className="p-2">{viewDiaryLabel(p)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            {((detailForView as any).exception_type || (detailForView as any).exception_description) && (
              <Card variant="elevated" className="p-4 border border-amber-200 bg-amber-50/50">
                <h3 className="text-base font-semibold text-slate-800 mb-3">异常信息</h3>
                <div className="space-y-3">
                  {(detailForView as any).exception_type && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-slate-500">异常类型</span>
                      <span className="font-medium text-sm">
                        {EXCEPTION_LABELS[(detailForView as any).exception_type] ?? (detailForView as any).exception_type}
                      </span>
                    </div>
                  )}
                  {(detailForView as any).exception_description && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-slate-500">异常描述</span>
                      <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-800">
                        {(detailForView as any).exception_description}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
            {detailForView.remark && (
              <Card variant="elevated" className="p-4 border border-slate-200">
                <h3 className="text-base font-semibold text-slate-800 mb-3">备注</h3>
                <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-800">
                  {detailForView.remark}
                </div>
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
