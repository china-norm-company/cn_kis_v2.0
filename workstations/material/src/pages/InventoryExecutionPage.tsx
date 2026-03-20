import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { InventoryCheck, InventoryItem, InventoryCheckRecord } from '@cn-kis/api-client'
import {
  ClipboardList,
  Plus,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Send,
} from 'lucide-react'

const STATUS_STYLES: Record<string, string> = {
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  pending_review: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
}

const STATUS_LABELS: Record<string, string> = {
  in_progress: '进行中',
  pending_review: '待审核',
  completed: '已完成',
  rejected: '已驳回',
}

type CountRow = {
  inventory_id: number
  material_name: string
  material_code: string
  batch_number: string
  system_quantity: number
  unit: string
  actual_quantity: string
  notes: string
}

function getDiffColor(actual: number, system: number): string {
  if (actual > system) return 'bg-blue-50 border-blue-200'
  if (actual < system) return 'bg-red-50 border-red-200'
  return 'bg-green-50 border-green-200'
}

function getDiffTextColor(actual: number, system: number): string {
  if (actual > system) return 'text-blue-700'
  if (actual < system) return 'text-red-700'
  return 'text-green-700'
}

export function InventoryExecutionPage() {
  const queryClient = useQueryClient()
  const [countRows, setCountRows] = useState<CountRow[]>([])
  const [rejectId, setRejectId] = useState<number | null>(null)
  const [historyPage, setHistoryPage] = useState(1)

  // Stats
  const { data: inProgressData } = useQuery({
    queryKey: ['material', 'inventory-check'],
    queryFn: () => materialApi.getInventoryCheck(),
  })
  const activeCheck = (inProgressData as any)?.data as InventoryCheck | undefined
  const hasActiveCheck = activeCheck && ['in_progress', 'counting'].includes(activeCheck.status)

  const { data: pendingReviewData } = useQuery({
    queryKey: ['material', 'inventory-checks', 'pending'],
    queryFn: () => materialApi.listInventoryChecks?.({ page: 1, page_size: 1 }) ?? Promise.resolve({ data: { total: 0 } }),
  })
  const pendingCount = (pendingReviewData as any)?.data?.total ?? 0

  const { data: completedData } = useQuery({
    queryKey: ['material', 'inventory-checks', 'completed'],
    queryFn: () => materialApi.listInventoryChecks?.({ page: 1, page_size: 1 }) ?? Promise.resolve({ data: { total: 0 } }),
  })
  const completedCount = (completedData as any)?.data?.total ?? 0

  // Inventory list for counting (when active check exists)
  const { data: inventoryData } = useQuery({
    queryKey: ['material', 'inventory', 'all'],
    queryFn: () => materialApi.listInventory({ page_size: 500 }),
    enabled: !!hasActiveCheck,
  })
  const inventoryList = (inventoryData as any)?.data as { items: InventoryItem[] } | undefined
  const inventoryItems = inventoryList?.items ?? []

  // Initialize count rows when we have active check and inventory items
  useEffect(() => {
    if (hasActiveCheck && inventoryItems.length > 0 && countRows.length === 0) {
      setCountRows(
        inventoryItems.map((item) => ({
          inventory_id: item.id,
          material_name: item.material_name,
          material_code: item.material_code,
          batch_number: item.batch_number,
          system_quantity: item.quantity,
          unit: item.unit,
          actual_quantity: String(item.quantity),
          notes: '',
        })),
      )
    }
  }, [hasActiveCheck, inventoryItems, countRows.length])

  const rows: CountRow[] = countRows.length > 0 ? countRows : []

  // History
  const { data: historyData } = useQuery({
    queryKey: ['material', 'inventory-checks', 'history', historyPage],
    queryFn: () =>
      materialApi.listInventoryChecks?.({ page: historyPage, page_size: 10 }) ??
      Promise.resolve({ data: { items: [], total: 0 } }),
  })
  const historyList = (historyData as any)?.data as { items: InventoryCheckRecord[]; total: number } | undefined
  const historyItems = historyList?.items ?? []
  const historyTotal = historyList?.total ?? 0
  const historyTotalPages = Math.ceil(historyTotal / 10)

  const discrepancyCount = rows.reduce((sum, r) => {
    const actual = parseInt(r.actual_quantity, 10) || 0
    return sum + (actual !== r.system_quantity ? 1 : 0)
  }, 0)

  const initiateMut = useMutation({
    mutationFn: () => materialApi.initiateInventoryCheck(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material', 'inventory-check'] })
      queryClient.invalidateQueries({ queryKey: ['material', 'inventory'] })
      setCountRows([])
    },
  })

  const submitMut = useMutation({
    mutationFn: () =>
      materialApi.submitInventoryCheck({
        items: rows.map((r) => ({
          inventory_id: r.inventory_id,
          actual_quantity: parseInt(r.actual_quantity, 10) || 0,
          notes: r.notes || undefined,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material'] })
      setCountRows([])
    },
    onError: () => {},
  })

  const approveMut = useMutation({
    mutationFn: () => materialApi.approveInventoryCheck(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['material'] }),
  })

  const updateRow = (inventoryId: number, field: 'actual_quantity' | 'notes', value: string) => {
    setCountRows((prev) => {
      const current = prev.length > 0 ? prev : rows.map((r) => ({ ...r }))
      return current.map((r) =>
        r.inventory_id === inventoryId ? { ...r, [field]: value } : r,
      )
    })
  }

  const statCards = [
    { label: '进行中盘点', value: hasActiveCheck ? 1 : 0, color: 'text-amber-700' },
    { label: '待审核', value: pendingCount, color: 'text-blue-700' },
    { label: '已完成', value: completedCount, color: 'text-green-700' },
    { label: '差异数量', value: discrepancyCount, color: 'text-red-600' },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">盘点执行</h2>
          <p className="text-sm text-slate-500 mt-1">物理盘点、数量核对与差异审核</p>
        </div>
        {!hasActiveCheck && (
          <button
            onClick={() => initiateMut.mutate()}
            disabled={initiateMut.isPending}
            className="flex min-h-11 items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {initiateMut.isPending ? '发起中...' : '发起盘点'}
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Active count section */}
      {hasActiveCheck && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 md:px-6 py-4 border-b border-slate-200 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3 md:gap-4">
              <h3 className="text-base font-semibold text-slate-800">当前盘点</h3>
              <span className="text-sm text-slate-500">ID: {activeCheck.id}</span>
              <span className="text-sm text-slate-500">
                开始: {activeCheck.check_date || '-'}
              </span>
              <span className="text-sm text-slate-500">盘点人: {activeCheck.checker || '-'}</span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                  STATUS_STYLES[activeCheck.status] || 'bg-slate-50 text-slate-600'
                }`}
              >
                {STATUS_LABELS[activeCheck.status] || activeCheck.status_display || activeCheck.status}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => submitMut.mutate()}
                disabled={submitMut.isPending || rows.length === 0}
                className="flex min-h-11 items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                <Send className="w-4 h-4" />
                {submitMut.isPending ? '提交中...' : '提交盘点'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">产品/耗材名称</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">系统数量</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">实际数量</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">差异</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">备注</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const actual = parseInt(row.actual_quantity, 10) || 0
                  const diff = actual - row.system_quantity
                  const rowBg = getDiffColor(actual, row.system_quantity)
                  const diffColor = getDiffTextColor(actual, row.system_quantity)
                  return (
                    <tr
                      key={row.inventory_id}
                      className={`border-b border-slate-100 ${rowBg} transition-colors`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {row.material_name}
                        <span className="block text-xs text-slate-500 font-mono">
                          {row.material_code} {row.batch_number && `· ${row.batch_number}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {row.system_quantity} {row.unit}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          value={row.actual_quantity}
                          onChange={(e) =>
                            updateRow(row.inventory_id, 'actual_quantity', e.target.value)
                          }
                          aria-label={`${row.material_name} 实际数量`}
                          className="w-20 min-h-10 px-2 py-1.5 border border-slate-200 rounded text-sm text-right focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <span className="ml-1 text-slate-500 text-xs">{row.unit}</span>
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${diffColor}`}>
                        {diff > 0 ? '+' : ''}{diff}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) => updateRow(row.inventory_id, 'notes', e.target.value)}
                          placeholder="备注"
                          className="w-full max-w-[200px] min-h-10 px-2 py-1.5 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending review actions */}
      {activeCheck && activeCheck.status === 'pending_review' && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => approveMut.mutate()}
            disabled={approveMut.isPending}
            className="flex min-h-11 items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            {approveMut.isPending ? '审核中...' : '审核通过'}
          </button>
          <button
            onClick={() => setRejectId(activeCheck.id)}
            className="flex min-h-11 items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
          >
            <XCircle className="w-4 h-4" />
            审核驳回
          </button>
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <RejectModal
          id={rejectId}
          onClose={() => setRejectId(null)}
          onSuccess={() => {
            setRejectId(null)
            queryClient.invalidateQueries({ queryKey: ['material'] })
          }}
        />
      )}

      {/* History section */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h3 className="px-6 py-4 border-b border-slate-200 text-base font-semibold text-slate-800 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-amber-600" />
          盘点历史
        </h3>
        {historyItems.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无盘点历史</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">日期</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">盘点人</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">结果</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">差异数量</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                </tr>
              </thead>
              <tbody>
                {historyItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{item.check_date}</td>
                    <td className="px-4 py-3 text-slate-600">{item.checker}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.matched_items}/{item.total_items} 一致
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          item.discrepancy_items > 0 ? 'text-red-600 font-medium' : 'text-slate-600'
                        }
                      >
                        {item.discrepancy_items}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                          STATUS_STYLES[item.status] || 'bg-slate-50 text-slate-600'
                        }`}
                      >
                        {STATUS_LABELS[item.status] || item.status_display || item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {historyTotalPages > 1 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-6 py-3 border-t border-slate-200">
                <span className="text-sm text-slate-500">共 {historyTotal} 条</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage === 1}
                    className="min-h-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                    title="上一页"
                    aria-label="上一页"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-slate-600 px-2">
                    {historyPage} / {historyTotalPages}
                  </span>
                  <button
                    onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                    disabled={historyPage === historyTotalPages}
                    className="min-h-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                    title="下一页"
                    aria-label="下一页"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function RejectModal({
  id,
  onClose,
  onSuccess,
}: {
  id: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const rejectMut = useMutation({
    mutationFn: () => materialApi.rejectInventoryCheck({ reason }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || err?.message || '驳回失败'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[440px] max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">审核驳回</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}
          <label className="block">
            <span className="text-sm font-medium text-slate-700">驳回原因 *</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="请输入驳回原因"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>
          <div className="pt-2 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={() => rejectMut.mutate()}
              disabled={!reason.trim() || rejectMut.isPending}
              className="flex-1 min-h-11 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {rejectMut.isPending ? '提交中...' : '确认驳回'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
