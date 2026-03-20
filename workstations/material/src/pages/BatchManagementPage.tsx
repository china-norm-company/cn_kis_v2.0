import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { ProductBatchItem } from '@cn-kis/api-client'
import { Package, Search, Plus, ChevronLeft, ChevronRight, X, Eye, PackageCheck, CheckCircle } from 'lucide-react'

const BATCH_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  received: 'bg-blue-50 text-blue-700 border-blue-200',
  quarantine: 'bg-amber-50 text-amber-700 border-amber-200',
  released: 'bg-green-50 text-green-700 border-green-200',
  expired: 'bg-red-50 text-red-600 border-red-200',
}

const BATCH_STATUS_LABELS: Record<string, string> = {
  pending: '待入库',
  received: '已入库',
  quarantine: '隔离',
  released: '已放行',
  expired: '已过期',
}

export function BatchManagementPage() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [receiveId, setReceiveId] = useState<number | null>(null)
  const [releaseId, setReleaseId] = useState<number | null>(null)

  // Stats
  const { data: totalData } = useQuery({
    queryKey: ['material', 'batches', 'stats-total'],
    queryFn: () => materialApi.listBatches({ page: 1, page_size: 1 }),
  })
  const { data: releasedData } = useQuery({
    queryKey: ['material', 'batches', 'stats-released'],
    queryFn: () => materialApi.listBatches({ status: 'released', page: 1, page_size: 1 }),
  })
  const { data: pendingData } = useQuery({
    queryKey: ['material', 'batches', 'stats-pending'],
    queryFn: () => materialApi.listBatches({ status: 'pending', page: 1, page_size: 1 }),
  })
  const { data: expiredData } = useQuery({
    queryKey: ['material', 'batches', 'stats-expired'],
    queryFn: () => materialApi.listBatches({ status: 'expired', page: 1, page_size: 1 }),
  })

  const totalBatches = (totalData as any)?.data?.total ?? 0
  const releasedCount = (releasedData as any)?.data?.total ?? 0
  const pendingCount = (pendingData as any)?.data?.total ?? 0
  const expiredCount = (expiredData as any)?.data?.total ?? 0

  // Batch list
  const { data: listData, isLoading } = useQuery({
    queryKey: ['material', 'batches', { keyword, productFilter, statusFilter, page }],
    queryFn: () =>
      materialApi.listBatches({
        product_id: productFilter ? Number(productFilter) : undefined,
        status: statusFilter || undefined,
        keyword: keyword || undefined,
        page,
        page_size: 20,
      }),
  })
  const list = (listData as any)?.data as { items: ProductBatchItem[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  // Products for filter
  const { data: productsData } = useQuery({
    queryKey: ['material', 'products-for-batch-filter'],
    queryFn: () => materialApi.listProducts({ page_size: 200 }),
  })
  const products = ((productsData as any)?.data?.items ?? []) as Array<{ id: number; name: string }>

  const statCards = [
    { label: '总批次数', value: totalBatches, color: 'text-slate-700' },
    { label: '已放行', value: releasedCount, color: 'text-green-700' },
    { label: '待入库', value: pendingCount, color: 'text-yellow-700' },
    { label: '已过期', value: expiredCount, color: 'text-red-600' },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">批次管理</h2>
          <p className="text-sm text-slate-500 mt-1">产品批次登记、入库、放行与追踪</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex min-h-11 items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          <Plus className="w-4 h-4" />新建批次
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="min-w-[220px] flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索批号、产品..."
            value={keyword}
            title="搜索批号或产品"
            onChange={(e) => {
              setKeyword(e.target.value)
              setPage(1)
            }}
            className="min-h-11 w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>
        <select
          value={productFilter}
          onChange={(e) => {
            setProductFilter(e.target.value)
            setPage(1)
          }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="产品筛选"
          title="产品筛选"
        >
          <option value="">全部产品</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="状态筛选"
          title="状态筛选"
        >
          <option value="">全部状态</option>
          <option value="pending">待入库</option>
          <option value="received">已入库</option>
          <option value="quarantine">隔离</option>
          <option value="released">已放行</option>
          <option value="expired">已过期</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无批次数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">批号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">产品</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">数量</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">生产日期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">有效期至</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">供应商</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">COA编号</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.batch_no}</td>
                  <td className="px-4 py-3 text-slate-800">{item.product_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                        BATCH_STATUS_STYLES[item.status] || 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {BATCH_STATUS_LABELS[item.status] || item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.quantity} {item.unit || ''}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.manufacture_date || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.expiry_date || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.supplier || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.coa_number || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {item.status === 'pending' && (
                        <button
                          onClick={() => setReceiveId(item.id)}
                          className="min-h-9 min-w-9 p-1.5 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                          title="入库"
                        >
                          <PackageCheck className="w-4 h-4" />
                        </button>
                      )}
                      {item.status === 'quarantine' && (
                        <button
                          onClick={() => setReleaseId(item.id)}
                          className="min-h-9 min-w-9 p-1.5 text-green-500 hover:bg-green-50 rounded transition-colors"
                          title="放行"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setDetailId(item.id)}
                        className="min-h-9 min-w-9 p-1.5 text-slate-400 hover:text-amber-600 transition-colors"
                        title="查看"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
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
              className="p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
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
              className="p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="下一页"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateBatchModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            queryClient.invalidateQueries({ queryKey: ['material', 'batches'] })
          }}
        />
      )}

      {/* Release Modal */}
      {releaseId && (
        <ReleaseBatchModal
          id={releaseId}
          onClose={() => setReleaseId(null)}
          onSuccess={() => {
            setReleaseId(null)
            queryClient.invalidateQueries({ queryKey: ['material', 'batches'] })
          }}
        />
      )}

      {/* Receive Modal */}
      {receiveId && (
        <ReceiveBatchModal
          id={receiveId}
          onClose={() => setReceiveId(null)}
          onSuccess={() => {
            setReceiveId(null)
            queryClient.invalidateQueries({ queryKey: ['material', 'batches'] })
          }}
        />
      )}

      {/* Detail Drawer */}
      {detailId && <BatchDetailDrawer id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

// ============================================================================
// Create Batch Modal
// ============================================================================
function CreateBatchModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    product_id: '',
    batch_no: '',
    manufacture_date: '',
    expiry_date: '',
    quantity: '',
    unit: '支',
    supplier: '',
    coa_number: '',
  })
  const [error, setError] = useState('')

  const { data: productsData } = useQuery({
    queryKey: ['material', 'products-for-create-batch'],
    queryFn: () => materialApi.listProducts({ page_size: 200 }),
  })
  const products = ((productsData as any)?.data?.items ?? []) as Array<{ id: number; name: string }>

  const mutation = useMutation({
    mutationFn: () =>
      materialApi.createBatch({
        product_id: Number(form.product_id),
        batch_no: form.batch_no,
        manufacture_date: form.manufacture_date || undefined,
        expiry_date: form.expiry_date || undefined,
        quantity: Number(form.quantity),
        unit: form.unit || undefined,
        supplier: form.supplier || undefined,
        coa_number: form.coa_number || undefined,
      }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '创建失败'),
  })

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[520px] bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">新建批次</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">产品 *</span>
            <select
              value={form.product_id}
              onChange={(e) => set('product_id', e.target.value)}
              className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              title="选择产品"
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
            <span className="text-sm font-medium text-slate-700">批号 *</span>
            <input
              value={form.batch_no}
              onChange={(e) => set('batch_no', e.target.value)}
              placeholder="如 BATCH-2024-001"
              className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              title="批号"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">生产日期</span>
              <input
                type="date"
                value={form.manufacture_date}
                onChange={(e) => set('manufacture_date', e.target.value)}
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                title="生产日期"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">有效期至</span>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(e) => set('expiry_date', e.target.value)}
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                title="有效期至"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">数量 *</span>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                placeholder="0"
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                title="数量"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">单位</span>
              <input
                value={form.unit}
                onChange={(e) => set('unit', e.target.value)}
                placeholder="支"
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                title="单位"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">供应商</span>
            <input
              value={form.supplier}
              onChange={(e) => set('supplier', e.target.value)}
              placeholder="供应商名称"
              className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              title="供应商"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">COA编号</span>
            <input
              value={form.coa_number}
              onChange={(e) => set('coa_number', e.target.value)}
              placeholder="COA证书编号"
              className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              title="COA编号"
            />
          </label>

          <div className="pt-4 flex gap-3">
            <button
              onClick={onClose}
              className="min-h-11 flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!form.product_id || !form.batch_no || !form.quantity || mutation.isPending}
              className="min-h-11 flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
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
// Release Batch Modal
// ============================================================================
function ReleaseBatchModal({ id, onClose, onSuccess }: { id: number; onClose: () => void; onSuccess: () => void }) {
  const [releaseNotes, setReleaseNotes] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => materialApi.releaseBatch(id, { release_notes: releaseNotes || undefined }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '放行失败'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[92vw] max-w-[440px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">批次放行</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">放行备注</span>
            <textarea
              value={releaseNotes}
              onChange={(e) => setReleaseNotes(e.target.value)}
              rows={3}
              placeholder="放行说明（可选）"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              title="放行备注"
            />
          </label>

          <div className="pt-2 flex gap-3">
            <button
              onClick={onClose}
              className="min-h-11 flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="min-h-11 flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '放行中...' : '确认放行'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Receive Batch Modal
// ============================================================================
function ReceiveBatchModal({ id, onClose, onSuccess }: { id: number; onClose: () => void; onSuccess: () => void }) {
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => materialApi.receiveBatch(id),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '入库失败'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[92vw] max-w-[400px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">批次入库</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}
          <p className="text-sm text-slate-600">确认将该批次执行入库操作？</p>
          <div className="pt-2 flex gap-3">
            <button
              onClick={onClose}
              className="min-h-11 flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="min-h-11 flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '入库中...' : '确认入库'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Batch Detail Drawer
// ============================================================================
function BatchDetailDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: detailData, isLoading } = useQuery({
    queryKey: ['material', 'batch-detail', id],
    queryFn: () => materialApi.getBatch(id),
  })
  const detail = (detailData as any)?.data as ProductBatchItem | undefined

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[480px] bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">批次详情</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {isLoading ? (
            <div className="text-center text-slate-400 py-8">加载中...</div>
          ) : !detail ? (
            <div className="text-center text-slate-400 py-8">批次不存在</div>
          ) : (
            <>
              <InfoRow label="批号" value={detail.batch_no} />
              <InfoRow label="产品" value={detail.product_name} />
              <InfoRow label="状态" value={BATCH_STATUS_LABELS[detail.status] || detail.status} />
              <InfoRow label="数量" value={`${detail.quantity} ${detail.unit || ''}`} />
              <InfoRow label="生产日期" value={detail.manufacture_date || '-'} />
              <InfoRow label="有效期至" value={detail.expiry_date || '-'} />
              <InfoRow label="供应商" value={detail.supplier || '-'} />
              <InfoRow label="COA编号" value={detail.coa_number || '-'} />
              <InfoRow label="放行时间" value={detail.released_at || '-'} />
              <InfoRow label="放行备注" value={detail.release_notes || '-'} />
              <InfoRow label="创建时间" value={detail.create_time} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-4">
      <span className="text-sm text-slate-500 w-24 shrink-0">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  )
}
