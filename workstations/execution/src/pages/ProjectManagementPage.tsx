/**
 * 项目管理
 *
 * 上传执行订单、查看与维护资源需求；与排程管理配合：上传后可在排程管理中生成待排程任务。
 */
import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { schedulingApi } from '@cn-kis/api-client'
import { Button, StatCard } from '@cn-kis/ui-kit'
import { DemandsPanel, type DemandItem } from '../components/DemandsPanel'
import { UploadExecutionOrderModal } from '../components/UploadExecutionOrderModal'
import { getResourceDemandSummaryRow } from '../utils/executionOrderPlanConfig'
import { FileCheck, List, Eye, FolderKanban } from 'lucide-react'

export default function ProjectManagementPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showExecutionOrderModal, setShowExecutionOrderModal] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!toastMsg) return
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 3000)
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [toastMsg])

  const { data: executionOrdersListRes } = useQuery({
    queryKey: ['scheduling', 'execution-orders'],
    queryFn: () => schedulingApi.getExecutionOrders(),
    staleTime: 30_000,
  })

  const { data: executionOrderPendingRes } = useQuery({
    queryKey: ['scheduling', 'execution-order-pending'],
    queryFn: () => schedulingApi.getExecutionOrderPending(),
    staleTime: 30_000,
  })

  const { data: timelinePublishedRes } = useQuery({
    queryKey: ['scheduling', 'timeline-published'],
    queryFn: () => schedulingApi.getTimelinePublished(),
    staleTime: 30_000,
  })

  const executionOrderItems = useMemo((): DemandItem[] => {
    const r = executionOrdersListRes as { data?: { data?: { items?: unknown[] }; items?: unknown[] } } | undefined
    if (!r || typeof r !== 'object') return []
    const inner = (r as { data?: unknown }).data
    const payload =
      inner != null && typeof inner === 'object' && (inner as { data?: unknown }).data !== undefined
        ? (inner as { data: { items?: unknown[] } }).data
        : inner
    const items = Array.isArray((payload as { items?: unknown[] })?.items)
      ? (payload as { items: unknown[] }).items
      : []
    return items.map((it: { id?: number; headers?: unknown; rows?: unknown }) => ({
      id: Number(it?.id ?? 0),
      headers: Array.isArray(it?.headers) ? (it.headers as unknown[]).map((h) => String(h ?? '')) : [],
      rows: Array.isArray(it?.rows) ? it.rows : [],
    }))
  }, [executionOrdersListRes])

  const executionOrderPendingItems = useMemo(() => {
    const r = executionOrderPendingRes as { data?: { items?: unknown[] }; items?: unknown[] } | undefined
    if (!r || typeof r !== 'object') return []
    const inner = (r as { data?: unknown }).data
    const payload =
      inner != null && typeof inner === 'object' && (inner as { data?: unknown }).data !== undefined
        ? (inner as { data: { items?: unknown[] } }).data
        : inner
    return Array.isArray((payload as { items?: unknown[] })?.items)
      ? (payload as { items: unknown[] }).items
      : []
  }, [executionOrderPendingRes])

  const timelinePublishedItems = useMemo(() => {
    const r = timelinePublishedRes as { data?: { items?: unknown[] }; items?: unknown[] } | undefined
    if (!r || typeof r !== 'object') return []
    const inner = (r as { data?: unknown }).data
    const payload =
      inner != null && typeof inner === 'object' && (inner as { data?: unknown }).data !== undefined
        ? (inner as { data: { items?: unknown[] } }).data
        : inner
    return Array.isArray((payload as { items?: unknown[] })?.items)
      ? (payload as { items: unknown[] }).items
      : []
  }, [timelinePublishedRes])

  const resourceDemandCount = executionOrderItems.length
  const pendingCount = executionOrderPendingItems.length
  const publishedCount = timelinePublishedItems.length
  const projectCount = useMemo(() => {
    const codes = executionOrderItems
      .map((item) => {
        const row = Array.isArray(item.rows) ? item.rows[0] : null
        return row != null ? getResourceDemandSummaryRow(item.headers, row).project_code : ''
      })
      .filter(Boolean)
    return new Set(codes).size
  }, [executionOrderItems])

  const saveExecutionOrderMutation = useMutation({
    mutationFn: (payload: { headers: string[]; rows: unknown[] }) =>
      schedulingApi.saveExecutionOrder(payload),
    onSuccess: (res, payload) => {
      setShowExecutionOrderModal(false)
      const id = (res as { data?: { id?: number } })?.data?.id ?? 0
      const headers = Array.isArray(payload?.headers) ? [...payload.headers] : []
      const rows = Array.isArray(payload?.rows)
        ? payload.rows.map((r) => (Array.isArray(r) ? [...r] : r))
        : []
      queryClient.setQueryData(['scheduling', 'execution-order'], {
        code: 200,
        msg: 'OK',
        data: { id, headers, rows },
      })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'execution-order'] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'execution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'execution-order-pending'] })
      setToastMsg('执行订单已解析并保存，已在排程计划中生成待排程任务')
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { msg?: string } }; message?: string })?.response?.data?.msg ??
        (err as Error)?.message ??
        '执行订单保存失败，请重试'
      setToastMsg(msg)
    },
  })

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 md:text-xl">
            项目管理
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            上传执行订单、维护资源需求，排程管理将据此生成待排程任务
          </p>
        </div>
        <Button
          className="min-h-11"
          variant="secondary"
          onClick={() => setShowExecutionOrderModal(true)}
        >
          <FileCheck className="mr-1 w-4 h-4" /> 上传执行订单
        </Button>
      </div>

      {/* KPI 卡片：与排程管理一致的布局 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 md:gap-4">
        <StatCard
          label="资源需求"
          value={resourceDemandCount}
          icon={<FileCheck className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          label="待排程"
          value={pendingCount}
          icon={<List className="w-5 h-5" />}
          color="amber"
        />
        <StatCard
          label="已排程"
          value={publishedCount}
          icon={<Eye className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          label="项目数"
          value={projectCount}
          icon={<FolderKanban className="w-5 h-5" />}
          color="indigo"
        />
      </div>

      <DemandsPanel
        items={executionOrderItems}
        onViewDetail={(itemIndex) => {
          const item = executionOrderItems[itemIndex]
          if (!item) return
          navigate('/project-management/resource-demand/detail', {
            state: { headers: item.headers, rows: item.rows, rowIndex: 0, id: item.id },
          })
        }}
      />

      {showExecutionOrderModal && (
        <UploadExecutionOrderModal
          onClose={() => setShowExecutionOrderModal(false)}
          confirmLoading={saveExecutionOrderMutation.isPending}
          onConfirm={(data) => saveExecutionOrderMutation.mutate(data)}
        />
      )}

      {toastMsg && (
        <div
          className="fixed bottom-6 right-6 z-50 flex gap-2 rounded-lg bg-green-600 py-3 pl-4 pr-10 text-sm text-white shadow-lg"
          data-testid="publish-toast"
        >
          <span>{toastMsg}</span>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="absolute right-2 top-2 rounded p-1 text-white/90 hover:bg-white/20"
            aria-label="关闭"
          >
            <span className="text-base leading-none">×</span>
          </button>
        </div>
      )}
    </div>
  )
}
