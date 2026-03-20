import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { SampleReceiptItem } from '@cn-kis/api-client'
import {
  Package,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Eye,
  ClipboardCheck,
} from 'lucide-react'

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  inspecting: 'bg-blue-50 text-blue-700 border-blue-200',
  accepted: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
  partial: 'bg-slate-50 text-slate-600 border-slate-200',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待验收',
  inspecting: '验收中',
  accepted: '已接收',
  rejected: '已拒收',
  partial: '部分接收',
}

const INSPECT_CHECKS = [
  { key: 'packaging_ok' as const, label: '包装完好' },
  { key: 'label_ok' as const, label: '标签正确' },
  { key: 'quantity_ok' as const, label: '数量正确' },
  { key: 'document_ok' as const, label: '文件齐全' },
  { key: 'temperature_ok' as const, label: '温度符合' },
  { key: 'appearance_ok' as const, label: '外观正常' },
] as const

export function SampleReceiptPage() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [inspectId, setInspectId] = useState<number | null>(null)

  // Stats: 4 parallel queries for counts
  const { data: pendingData } = useQuery({
    queryKey: ['material', 'receipts', { status: 'pending', page: 1, page_size: 1 }],
    queryFn: () => materialApi.listReceipts({ status: 'pending', page: 1, page_size: 1 }),
  })
  const { data: inspectingData } = useQuery({
    queryKey: ['material', 'receipts', { status: 'inspecting', page: 1, page_size: 1 }],
    queryFn: () => materialApi.listReceipts({ status: 'inspecting', page: 1, page_size: 1 }),
  })
  const { data: acceptedData } = useQuery({
    queryKey: ['material', 'receipts', { status: 'accepted', page: 1, page_size: 1 }],
    queryFn: () => materialApi.listReceipts({ status: 'accepted', page: 1, page_size: 1 }),
  })
  const { data: rejectedData } = useQuery({
    queryKey: ['material', 'receipts', { status: 'rejected', page: 1, page_size: 1 }],
    queryFn: () => materialApi.listReceipts({ status: 'rejected', page: 1, page_size: 1 }),
  })

  const pendingCount = (pendingData as any)?.data?.total ?? 0
  const inspectingCount = (inspectingData as any)?.data?.total ?? 0
  const acceptedCount = (acceptedData as any)?.data?.total ?? 0
  const rejectedCount = (rejectedData as any)?.data?.total ?? 0

  // Receipt list
  const { data: listData, isLoading } = useQuery({
    queryKey: ['material', 'receipts', { keyword, statusFilter, page }],
    queryFn: () =>
      materialApi.listReceipts({
        keyword: keyword || undefined,
        status: statusFilter || undefined,
        page,
        page_size: 20,
      }),
  })
  const list = (listData as any)?.data as { items: SampleReceiptItem[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  const statCards = [
    { label: '待验收', value: pendingCount, color: 'text-amber-700' },
    { label: '验收中', value: inspectingCount, color: 'text-blue-700' },
    { label: '已接收', value: acceptedCount, color: 'text-green-700' },
    { label: '已拒收', value: rejectedCount, color: 'text-red-600' },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">样品接收验收</h2>
          <p className="text-sm text-slate-500 mt-1">样品接收单的创建、验收与入库管理</p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索接收单号、产品、供应商、物流单号..."
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              setPage(1)
            }}
            className="w-full min-h-11 pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="状态筛选"
        >
          <option value="">全部状态</option>
          <option value="pending">待验收</option>
          <option value="inspecting">验收中</option>
          <option value="accepted">已接收</option>
          <option value="rejected">已拒收</option>
          <option value="partial">部分接收</option>
        </select>
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 flex min-h-11 items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建接收单
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无接收单数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">接收单号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">产品</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">供应商</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">预期数量</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">实收数量</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">到货温度</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.receipt_no}</td>
                  <td className="px-4 py-3 text-slate-800">{item.product_name}</td>
                  <td className="px-4 py-3 text-slate-600">{item.supplier || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.expected_quantity}</td>
                  <td className="px-4 py-3 text-slate-600">{item.received_quantity}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.arrival_temperature != null ? `${item.arrival_temperature}°C` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                        STATUS_STYLES[item.status] || 'bg-slate-50 text-slate-600'
                      }`}
                    >
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setDetailId(item.id)}
                        className="min-h-9 min-w-9 p-1.5 text-slate-500 hover:bg-slate-100 rounded transition-colors"
                        title="查看"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {(item.status === 'pending' || item.status === 'inspecting') && (
                        <button
                          onClick={() => setInspectId(item.id)}
                          className="min-h-9 min-w-9 p-1.5 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                          title="验收"
                        >
                          <ClipboardCheck className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-slate-500">共 {list?.total ?? 0} 条记录</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="min-h-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="上一页"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-600 px-3">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="min-h-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="下一页"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateReceiptModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            queryClient.invalidateQueries({ queryKey: ['material', 'receipts'] })
          }}
        />
      )}

      {/* Inspect Modal */}
      {inspectId && (
        <InspectModal
          id={inspectId}
          onClose={() => setInspectId(null)}
          onSuccess={() => {
            setInspectId(null)
            queryClient.invalidateQueries({ queryKey: ['material', 'receipts'] })
          }}
        />
      )}

      {/* Detail Drawer */}
      {detailId && <ReceiptDetailDrawer id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

// ============================================================================
// Create Receipt Modal
// ============================================================================
function CreateReceiptModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    product_id: '',
    supplier: '',
    courier: '',
    tracking_no: '',
    expected_quantity: '',
    batch_no: '',
    expiry_date: '',
  })
  const [error, setError] = useState('')

  const { data: productsData } = useQuery({
    queryKey: ['material', 'products-for-receipt'],
    queryFn: () => materialApi.listProducts({ page_size: 200 }),
  })
  const products = ((productsData as any)?.data?.items ?? []) as Array<{ id: number; name: string }>

  const mutation = useMutation({
    mutationFn: () =>
      materialApi.createReceipt({
        product_id: Number(form.product_id),
        supplier: form.supplier || undefined,
        courier: form.courier || undefined,
        tracking_no: form.tracking_no || undefined,
        expected_quantity: Number(form.expected_quantity),
        batch_no: form.batch_no || undefined,
        expiry_date: form.expiry_date || undefined,
      }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '创建失败'),
  })

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[480px] bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">新建接收单</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">产品选择 *</span>
            <select
              value={form.product_id}
              onChange={(e) => set('product_id', e.target.value)}
              className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">请选择产品</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">供应商</span>
            <input
              value={form.supplier}
              onChange={(e) => set('supplier', e.target.value)}
              placeholder="供应商名称"
              className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">物流公司</span>
              <input
                value={form.courier}
                onChange={(e) => set('courier', e.target.value)}
                placeholder="物流公司"
                className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">物流单号</span>
              <input
                value={form.tracking_no}
                onChange={(e) => set('tracking_no', e.target.value)}
                placeholder="物流单号"
                className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">预期数量 *</span>
            <input
              type="number"
              min={1}
              value={form.expected_quantity}
              onChange={(e) => set('expected_quantity', e.target.value)}
              placeholder="预期到货数量"
              className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">批号</span>
              <input
                value={form.batch_no}
                onChange={(e) => set('batch_no', e.target.value)}
                placeholder="批号"
                className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">有效期</span>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(e) => set('expiry_date', e.target.value)}
                className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={
                !form.product_id ||
                !form.expected_quantity ||
                Number(form.expected_quantity) < 1 ||
                mutation.isPending
              }
              className="flex-1 min-h-11 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '提交中...' : '提交'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Inspect Modal
// ============================================================================
function InspectModal({
  id,
  onClose,
  onSuccess,
}: {
  id: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [checks, setChecks] = useState<Record<string, boolean>>({
    packaging_ok: false,
    label_ok: false,
    quantity_ok: false,
    document_ok: false,
    temperature_ok: false,
    appearance_ok: false,
  })
  const [arrivalTemp, setArrivalTemp] = useState('')
  const [acceptedQty, setAcceptedQty] = useState('')
  const [rejectedQty, setRejectedQty] = useState('')
  const [notes, setNotes] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState('')

  const { data: receiptData } = useQuery({
    queryKey: ['material', 'receipt-detail', id],
    queryFn: () => materialApi.getReceipt(id),
  })
  const receipt = (receiptData as any)?.data as SampleReceiptItem | undefined

  const allPassed = Object.values(checks).every(Boolean)

  const mutation = useMutation({
    mutationFn: () =>
      materialApi.inspectReceipt(id, {
        packaging_ok: checks.packaging_ok,
        label_ok: checks.label_ok,
        quantity_ok: checks.quantity_ok,
        document_ok: checks.document_ok,
        temperature_ok: checks.temperature_ok,
        appearance_ok: checks.appearance_ok,
        arrival_temperature: arrivalTemp ? Number(arrivalTemp) : undefined,
        accepted_quantity: acceptedQty ? Number(acceptedQty) : 0,
        rejected_quantity: rejectedQty ? Number(rejectedQty) : 0,
        inspection_notes: notes || undefined,
        rejection_reason: rejectReason || undefined,
      }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '验收失败'),
  })

  const toggleCheck = (key: string) =>
    setChecks((c) => ({ ...c, [key]: !c[key] }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[520px] bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">验收检查</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          {receipt && (
            <div className="text-sm text-slate-600 mb-2">
              接收单: {receipt.receipt_no} — {receipt.product_name} (预期: {receipt.expected_quantity})
            </div>
          )}

          <div className="space-y-2">
            <span className="text-sm font-medium text-slate-700">检查项</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {INSPECT_CHECKS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checks[key] ?? false}
                    onChange={() => toggleCheck(key)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">到货温度 (°C)</span>
            <input
              type="number"
              step="0.1"
              value={arrivalTemp}
              onChange={(e) => setArrivalTemp(e.target.value)}
              placeholder="如 2.5"
              className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">合格数量</span>
              <input
                type="number"
                min={0}
                value={acceptedQty}
                onChange={(e) => setAcceptedQty(e.target.value)}
                placeholder="验收合格数量"
                className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">不合格数量</span>
              <input
                type="number"
                min={0}
                value={rejectedQty}
                onChange={(e) => setRejectedQty(e.target.value)}
                placeholder="拒收数量"
                className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">验收备注</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="验收过程备注"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </label>

          {(!allPassed || Number(rejectedQty) > 0) && (
            <label className="block">
              <span className="text-sm font-medium text-red-700">拒收原因</span>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                placeholder="请说明拒收或部分拒收原因"
                className="mt-1 w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:outline-none resize-none bg-red-50"
              />
            </label>
          )}

          <div className="pt-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex-1 min-h-11 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '提交中...' : '提交验收'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Receipt Detail Drawer
// ============================================================================
function ReceiptDetailDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: detailData, isLoading } = useQuery({
    queryKey: ['material', 'receipt-detail', id],
    queryFn: () => materialApi.getReceipt(id),
  })
  const detail = (detailData as any)?.data as SampleReceiptItem | undefined

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[560px] bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">接收单详情</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="text-center text-slate-400 py-8">加载中...</div>
          ) : !detail ? (
            <div className="text-center text-slate-400 py-8">接收单不存在</div>
          ) : (
            <div className="space-y-4">
              <InfoRow label="接收单号" value={detail.receipt_no} />
              <InfoRow label="产品" value={detail.product_name} />
              <InfoRow label="供应商" value={detail.supplier || '-'} />
              <InfoRow label="物流公司" value={detail.courier || '-'} />
              <InfoRow label="物流单号" value={detail.tracking_no || '-'} />
              <InfoRow label="预期数量" value={String(detail.expected_quantity)} />
              <InfoRow label="实收数量" value={String(detail.received_quantity)} />
              <InfoRow label="合格数量" value={String(detail.accepted_quantity)} />
              <InfoRow label="不合格数量" value={String(detail.rejected_quantity)} />
              <InfoRow
                label="到货温度"
                value={detail.arrival_temperature != null ? `${detail.arrival_temperature}°C` : '-'}
              />
              <InfoRow label="批号" value={detail.batch_no || '-'} />
              <InfoRow label="有效期" value={detail.expiry_date || '-'} />
              <InfoRow label="状态" value={STATUS_LABELS[detail.status] || detail.status} />
              <InfoRow label="创建时间" value={detail.create_time} />
              {(detail as any).inspection_notes && (
                <InfoRow label="验收备注" value={(detail as any).inspection_notes} />
              )}
              {(detail as any).rejection_reason && (
                <InfoRow label="拒收原因" value={(detail as any).rejection_reason} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Shared helper
// ============================================================================
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-sm text-slate-500 w-24 shrink-0">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  )
}
