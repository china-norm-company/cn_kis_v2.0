import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import { Archive, Search, Plus, ChevronLeft, ChevronRight, X, Eye, PackageCheck } from 'lucide-react'

interface RetentionRecord {
  id: number
  retention_code: string
  product_name: string
  product_id: number
  batch_no: string
  quantity: number
  retention_date: string
  expected_release_date: string
  storage_location: string
  status: 'retained' | 'released' | 'expired'
  status_display: string
  notes?: string
  release_date?: string
  release_reason?: string
  released_by?: string
}

const STATUS_STYLES: Record<string, string> = {
  retained: 'bg-green-50 text-green-700 border-green-200',
  released: 'bg-blue-50 text-blue-700 border-blue-200',
  expired: 'bg-red-50 text-red-600 border-red-200',
}

const STATUS_LABELS: Record<string, string> = {
  retained: '在库留样',
  released: '已释放',
  expired: '已过期',
}

// Mock data until API is available
const MOCK_RETENTION: RetentionRecord[] = [
  {
    id: 1,
    retention_code: 'RET-2024-001',
    product_name: '试验药物A',
    product_id: 1,
    batch_no: 'BATCH-2024-001',
    quantity: 50,
    retention_date: '2024-01-15',
    expected_release_date: '2025-07-15',
    storage_location: '冷库-A区-01',
    status: 'retained',
    status_display: '在库留样',
    notes: '稳定性留样',
  },
  {
    id: 2,
    retention_code: 'RET-2024-002',
    product_name: '试验药物B',
    product_id: 2,
    batch_no: 'BATCH-2024-002',
    quantity: 30,
    retention_date: '2024-02-20',
    expected_release_date: '2025-02-20',
    storage_location: '冷库-B区-02',
    status: 'retained',
    status_display: '在库留样',
    notes: '',
  },
  {
    id: 3,
    retention_code: 'RET-2023-003',
    product_name: '试验药物A',
    product_id: 1,
    batch_no: 'BATCH-2023-003',
    quantity: 20,
    retention_date: '2023-06-10',
    expected_release_date: '2024-12-10',
    storage_location: '冷库-A区-03',
    status: 'released',
    status_display: '已释放',
    release_date: '2024-12-15',
    release_reason: '稳定性考察完成',
    released_by: '张三',
  },
  {
    id: 4,
    retention_code: 'RET-2023-004',
    product_name: '对照品C',
    product_id: 3,
    batch_no: 'BATCH-2023-004',
    quantity: 10,
    retention_date: '2023-03-01',
    expected_release_date: '2024-03-01',
    storage_location: '常温库-01',
    status: 'expired',
    status_display: '已过期',
    notes: '超期未释放',
  },
]

const PAGE_SIZE = 20

export function RetentionManagementPage() {
  const [keyword, setKeyword] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [releaseId, setReleaseId] = useState<number | null>(null)
  const [records, setRecords] = useState<RetentionRecord[]>(MOCK_RETENTION)

  // Products for filter and create modal
  const { data: productsData } = useQuery({
    queryKey: ['material', 'products-for-retention'],
    queryFn: () => materialApi.listProducts({ page_size: 200 }),
  })
  const products = ((productsData as any)?.data?.items ?? []) as Array<{ id: number; name: string }>

  // Stats from local data
  const stats = useMemo(() => {
    const total = records.length
    const retained = records.filter((r) => r.status === 'retained').length
    const released = records.filter((r) => r.status === 'released').length
    const today = new Date().toISOString().slice(0, 10)
    const in30Days = new Date()
    in30Days.setDate(in30Days.getDate() + 30)
    const cutoff = in30Days.toISOString().slice(0, 10)
    const expiringSoon = records.filter(
      (r) =>
        r.status === 'retained' &&
        r.expected_release_date &&
        r.expected_release_date <= cutoff
    ).length
    return { total, retained, released, expiringSoon }
  }, [records])

  // Filtered list
  const filtered = useMemo(() => {
    let list = records
    if (keyword) {
      const k = keyword.toLowerCase()
      list = list.filter(
        (r) =>
          r.retention_code.toLowerCase().includes(k) ||
          r.product_name.toLowerCase().includes(k) ||
          r.batch_no.toLowerCase().includes(k) ||
          (r.storage_location && r.storage_location.toLowerCase().includes(k))
      )
    }
    if (productFilter) {
      const pid = Number(productFilter)
      list = list.filter((r) => r.product_id === pid)
    }
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter)
    }
    return list
  }, [records, keyword, productFilter, statusFilter])

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const handleCreateSuccess = (newRecord: RetentionRecord) => {
    setRecords((prev) => [newRecord, ...prev])
    setShowCreate(false)
  }

  const handleReleaseSuccess = (id: number, data: { release_date: string; release_reason: string; released_by: string }) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: 'released' as const,
              status_display: '已释放',
              release_date: data.release_date,
              release_reason: data.release_reason,
              released_by: data.released_by,
            }
          : r
      )
    )
    setReleaseId(null)
  }

  const statCards = [
    { label: '留样总数', value: stats.total, color: 'text-slate-700' },
    { label: '在库留样', value: stats.retained, color: 'text-green-700' },
    { label: '已释放', value: stats.released, color: 'text-blue-700' },
    { label: '到期预警', value: stats.expiringSoon, color: 'text-red-600' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">留样管理</h2>
          <p className="text-sm text-slate-500 mt-1">样品留样的登记、存储、释放与到期管理</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          <Plus className="w-4 h-4" />新建留样
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索留样编号、产品、批号、存储位置..."
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              setPage(1)
            }}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>
        <select
          value={productFilter}
          onChange={(e) => {
            setProductFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="产品筛选"
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
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="状态筛选"
        >
          <option value="">全部状态</option>
          <option value="retained">在库留样</option>
          <option value="released">已释放</option>
          <option value="expired">已过期</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {paginated.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Archive className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无留样数据</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">留样编号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">产品</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">批号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">留样数量</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">留样日期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">预计释放日期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">存储位置</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setDetailId(item.id)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.retention_code}</td>
                  <td className="px-4 py-3 text-slate-800">{item.product_name}</td>
                  <td className="px-4 py-3 text-slate-600">{item.batch_no}</td>
                  <td className="px-4 py-3 text-slate-600">{item.quantity}</td>
                  <td className="px-4 py-3 text-slate-600">{item.retention_date}</td>
                  <td className="px-4 py-3 text-slate-600">{item.expected_release_date}</td>
                  <td className="px-4 py-3 text-slate-600">{item.storage_location || '-'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                        STATUS_STYLES[item.status] || 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {STATUS_LABELS[item.status] || item.status_display}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {item.status === 'retained' && (
                        <button
                          onClick={() => setReleaseId(item.id)}
                          className="p-1.5 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                          title="释放"
                        >
                          <PackageCheck className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setDetailId(item.id)}
                        className="p-1.5 text-slate-400 hover:text-amber-600 transition-colors"
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
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">共 {filtered.length} 条记录</span>
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
        <CreateRetentionModal
          products={products}
          onClose={() => setShowCreate(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {/* Release Modal */}
      {releaseId && (
        <ReleaseRetentionModal
          id={releaseId}
          record={records.find((r) => r.id === releaseId)}
          onClose={() => setReleaseId(null)}
          onSuccess={handleReleaseSuccess}
        />
      )}

      {/* Detail Drawer */}
      {detailId && (
        <RetentionDetailDrawer
          record={records.find((r) => r.id === detailId)}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}

// ============================================================================
// Create Retention Modal
// ============================================================================
function CreateRetentionModal({
  products,
  onClose,
  onSuccess,
}: {
  products: Array<{ id: number; name: string }>
  onClose: () => void
  onSuccess: (record: RetentionRecord) => void
}) {
  const [form, setForm] = useState({
    product_id: '',
    batch_no: '',
    quantity: '',
    retention_date: '',
    expected_release_date: '',
    storage_location: '',
    notes: '',
  })
  const [error, setError] = useState('')

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }))

  const handleSubmit = () => {
    if (!form.product_id || !form.batch_no || !form.quantity || !form.retention_date || !form.expected_release_date) {
      setError('请填写必填项：产品、批号、留样数量、留样日期、预计释放日期')
      return
    }
    const product = products.find((p) => String(p.id) === form.product_id)
    const newRecord: RetentionRecord = {
      id: Date.now(),
      retention_code: `RET-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`,
      product_name: product?.name ?? '',
      product_id: Number(form.product_id),
      batch_no: form.batch_no,
      quantity: Number(form.quantity),
      retention_date: form.retention_date,
      expected_release_date: form.expected_release_date,
      storage_location: form.storage_location,
      status: 'retained',
      status_display: '在库留样',
      notes: form.notes || undefined,
    }
    onSuccess(newRecord)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[520px] bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">新建留样</h3>
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
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
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
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">留样数量 *</span>
            <input
              type="number"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              placeholder="0"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">留样日期 *</span>
              <input
                type="date"
                value={form.retention_date}
                onChange={(e) => set('retention_date', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">预计释放日期 *</span>
              <input
                type="date"
                value={form.expected_release_date}
                onChange={(e) => set('expected_release_date', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">存储位置</span>
            <input
              value={form.storage_location}
              onChange={(e) => set('storage_location', e.target.value)}
              placeholder="如 冷库-A区-01"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">备注</span>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder="可选备注"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <div className="pt-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                !form.product_id ||
                !form.batch_no ||
                !form.quantity ||
                !form.retention_date ||
                !form.expected_release_date
              }
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              提交
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Release Retention Modal
// ============================================================================
function ReleaseRetentionModal({
  id,
  record,
  onClose,
  onSuccess,
}: {
  id: number
  record: RetentionRecord | undefined
  onClose: () => void
  onSuccess: (id: number, data: { release_date: string; release_reason: string; released_by: string }) => void
}) {
  const [release_date, setReleaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [release_reason, setReleaseReason] = useState('')
  const [released_by, setReleasedBy] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = () => {
    if (!release_date || !release_reason || !released_by) {
      setError('请填写释放日期、释放原因、释放人')
      return
    }
    onSuccess(id, { release_date, release_reason, released_by })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[440px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">释放留样</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {record && (
            <p className="text-sm text-slate-600">
              留样编号：<span className="font-mono">{record.retention_code}</span> · {record.product_name}
            </p>
          )}
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">释放日期 *</span>
            <input
              type="date"
              value={release_date}
              onChange={(e) => setReleaseDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">释放原因 *</span>
            <input
              value={release_reason}
              onChange={(e) => setReleaseReason(e.target.value)}
              placeholder="如：稳定性考察完成"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">释放人 *</span>
            <input
              value={released_by}
              onChange={(e) => setReleasedBy(e.target.value)}
              placeholder="操作人姓名"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <div className="pt-2 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!release_date || !release_reason || !released_by}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              确认释放
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Retention Detail Drawer
// ============================================================================
function RetentionDetailDrawer({
  record,
  onClose,
}: {
  record: RetentionRecord | undefined
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[480px] bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">留样详情</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {!record ? (
            <div className="text-center text-slate-400 py-8">记录不存在</div>
          ) : (
            <>
              <InfoRow label="留样编号" value={record.retention_code} />
              <InfoRow label="产品" value={record.product_name} />
              <InfoRow label="批号" value={record.batch_no} />
              <InfoRow label="留样数量" value={String(record.quantity)} />
              <InfoRow label="留样日期" value={record.retention_date} />
              <InfoRow label="预计释放日期" value={record.expected_release_date} />
              <InfoRow label="存储位置" value={record.storage_location || '-'} />
              <InfoRow label="状态" value={STATUS_LABELS[record.status] || record.status_display} />
              <InfoRow label="备注" value={record.notes || '-'} />
              {record.status === 'released' && (
                <>
                  <InfoRow label="释放日期" value={record.release_date || '-'} />
                  <InfoRow label="释放原因" value={record.release_reason || '-'} />
                  <InfoRow label="释放人" value={record.released_by || '-'} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-sm text-slate-500 w-24 shrink-0">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  )
}
