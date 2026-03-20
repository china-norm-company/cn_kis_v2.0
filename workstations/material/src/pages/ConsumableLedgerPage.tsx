import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { ConsumableItem, ConsumableStats, ConsumableBatchItem } from '@cn-kis/api-client'
import { Beaker, Plus, Search, ChevronLeft, ChevronRight, X, PackageMinus, PackagePlus, RotateCcw } from 'lucide-react'

function StatusBadge({ item }: { item: ConsumableItem }) {
  if (item.current_stock < item.safety_stock) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        库存不足
      </span>
    )
  }
  if (item.status === 'expiring') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
        近效期
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
      正常
    </span>
  )
}

export function ConsumableLedgerPage() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [issueTarget, setIssueTarget] = useState<ConsumableItem | null>(null)
  const [inboundTarget, setInboundTarget] = useState<ConsumableItem | null>(null)
  const [returnTarget, setReturnTarget] = useState<ConsumableItem | null>(null)
  const [detailItem, setDetailItem] = useState<ConsumableItem | null>(null)

  const { data: statsData } = useQuery({
    queryKey: ['material', 'consumable-stats'],
    queryFn: () => materialApi.getConsumableStats(),
  })
  const stats = (statsData as any)?.data as ConsumableStats | undefined

  const { data: listData, isLoading } = useQuery({
    queryKey: ['material', 'consumables', { keyword, categoryFilter, page }],
    queryFn: () => materialApi.listConsumables({
      keyword: keyword || undefined,
      category: categoryFilter || undefined,
      page,
      page_size: 20,
    }),
  })

  const list = (listData as any)?.data as { items: ConsumableItem[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  const statCards = [
    { label: '耗材种类', value: stats?.total_types ?? '--', color: 'text-blue-600' },
    { label: '库存总量', value: stats?.total_quantity ?? '--', color: 'text-green-600' },
    { label: '库存不足', value: stats?.low_stock_count ?? '--', color: 'text-red-600' },
    { label: '近效期', value: stats?.expiring_count ?? '--', color: 'text-amber-600' },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">耗材管理</h2>
          <p className="text-sm text-slate-500 mt-1">实验耗材的采购、领用、库存与效期管理</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex min-h-11 items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          <Plus className="w-4 h-4" />新增耗材
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="min-w-[220px] flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索耗材名称、编码..."
            value={keyword}
            title="搜索耗材名称编码"
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
            className="min-h-11 w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="耗材类别筛选"
          title="耗材类别筛选"
        >
          <option value="">全部类别</option>
          <option value="仪器耗材">仪器耗材</option>
          <option value="通用耗材">通用耗材</option>
          <option value="标准品">标准品</option>
        </select>
      </div>

      {/* Consumable Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Beaker className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无耗材数据</p>
            <button onClick={() => setShowCreate(true)} className="mt-2 min-h-10 text-amber-600 text-sm hover:underline" title="新增耗材">点击新增耗材</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">耗材编码</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">名称</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">规格</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">当前库存</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">安全库存</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">存储条件</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">效期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">类别</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setDetailItem(item)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{item.name}</div>
                    {item.unit && <div className="text-xs text-slate-400">单位: {item.unit}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.specification || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={item.current_stock < item.safety_stock ? 'text-red-600 font-medium' : 'text-slate-600'}>
                      {item.current_stock}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.safety_stock}</td>
                  <td className="px-4 py-3 text-slate-600">{item.storage_condition || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.expiry_date || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.category || '-'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge item={item} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setInboundTarget(item)}
                        className="inline-flex min-h-9 items-center gap-1 px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
                        title="耗材入库"
                      >
                        <PackagePlus className="w-3.5 h-3.5" />
                        入库
                      </button>
                      <button
                        onClick={() => setReturnTarget(item)}
                        className="inline-flex min-h-9 items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
                        title="耗材退库"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        退库
                      </button>
                      <button
                        onClick={() => setIssueTarget(item)}
                        className="inline-flex min-h-9 items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors"
                        title="耗材领用"
                      >
                        <PackageMinus className="w-3.5 h-3.5" />
                        领用
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
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="min-h-10 min-w-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="上一页"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-600 px-3">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="min-h-10 min-w-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="下一页"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Create Consumable Modal */}
      {showCreate && (
        <CreateConsumableModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            queryClient.invalidateQueries({ queryKey: ['material'] })
          }}
        />
      )}

      {/* Issue Consumable Modal */}
      {issueTarget && (
        <IssueConsumableModal
          item={issueTarget}
          onClose={() => setIssueTarget(null)}
          onSuccess={() => {
            setIssueTarget(null)
            queryClient.invalidateQueries({ queryKey: ['material'] })
          }}
        />
      )}

      {/* Inbound Consumable Modal */}
      {inboundTarget && (
        <InboundConsumableModal
          item={inboundTarget}
          onClose={() => setInboundTarget(null)}
          onSuccess={() => {
            setInboundTarget(null)
            queryClient.invalidateQueries({ queryKey: ['material'] })
          }}
        />
      )}

      {/* Return Consumable Modal */}
      {returnTarget && (
        <ReturnConsumableModal
          item={returnTarget}
          onClose={() => setReturnTarget(null)}
          onSuccess={() => {
            setReturnTarget(null)
            queryClient.invalidateQueries({ queryKey: ['material'] })
          }}
        />
      )}

      {/* Consumable Detail Drawer */}
      {detailItem && (
        <ConsumableDetailDrawer item={detailItem} onClose={() => setDetailItem(null)} />
      )}
    </div>
  )
}


// ============================================================================
// Create Consumable Modal
// ============================================================================
function CreateConsumableModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '',
    code: '',
    specification: '',
    unit: '',
    safety_stock: '',
    storage_condition: '',
    category: '',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => materialApi.createConsumable({
      name: form.name,
      code: form.code,
      specification: form.specification || undefined,
      unit: form.unit || undefined,
      safety_stock: form.safety_stock ? Number(form.safety_stock) : undefined,
      storage_condition: form.storage_condition || undefined,
      category: form.category || undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '创建失败'),
  })

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[480px] bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">新增耗材</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">名称 *</span>
            <input value={form.name} onChange={e => set('name', e.target.value)} title="耗材名称"
              className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">编码 *</span>
            <input value={form.code} onChange={e => set('code', e.target.value)} placeholder="如 CSM-001" title="耗材编码"
              className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">规格</span>
              <input value={form.specification} onChange={e => set('specification', e.target.value)} title="规格"
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">单位</span>
              <input value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="如 个/盒/瓶" title="单位"
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">安全库存</span>
              <input type="number" value={form.safety_stock} onChange={e => set('safety_stock', e.target.value)} placeholder="最低库存预警值" title="安全库存"
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">存储条件</span>
              <input value={form.storage_condition} onChange={e => set('storage_condition', e.target.value)} placeholder="如 常温/冷藏" title="存储条件"
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">类别</span>
            <select value={form.category} onChange={e => set('category', e.target.value)} title="耗材类别"
              className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none">
              <option value="">请选择类别</option>
              <option value="仪器耗材">仪器耗材</option>
              <option value="通用耗材">通用耗材</option>
              <option value="标准品">标准品</option>
            </select>
          </label>

          <div className="pt-4 flex gap-3">
            <button onClick={onClose} className="min-h-11 flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!form.name || !form.code || mutation.isPending}
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
// Issue Consumable Modal
// ============================================================================
function IssueConsumableModal({ item, onClose, onSuccess }: { item: ConsumableItem; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    quantity: '',
    operator_name: '',
    purpose: '',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => materialApi.issueConsumable(item.id, {
      quantity: Number(form.quantity),
      operator_name: form.operator_name || undefined,
      purpose: form.purpose || undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '领用失败'),
  })

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[440px] bg-white rounded-xl shadow-xl">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">领用登记</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="text-sm font-medium text-slate-800">{item.name}</div>
            <div className="text-xs text-slate-500 mt-1">编码: {item.code} | 当前库存: {item.current_stock} {item.unit}</div>
          </div>

          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">领用数量 *</span>
            <input type="number" value={form.quantity} onChange={e => set('quantity', e.target.value)} title="领用数量"
              min={1} max={item.current_stock} placeholder={`最大 ${item.current_stock}`}
              className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">领用人</span>
            <input value={form.operator_name} onChange={e => set('operator_name', e.target.value)} title="领用人"
              className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">用途</span>
            <textarea value={form.purpose} onChange={e => set('purpose', e.target.value)} rows={2} title="用途"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none" />
          </label>

          <div className="pt-4 flex gap-3">
            <button onClick={onClose} className="min-h-11 flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!form.quantity || Number(form.quantity) <= 0 || mutation.isPending}
              className="min-h-11 flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '提交中...' : '确认领用'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ============================================================================
// Inbound Consumable Modal
// ============================================================================
function InboundConsumableModal({ item, onClose, onSuccess }: { item: ConsumableItem; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    mode: 'existing' as 'existing' | 'new',
    quantity: '',
    batch_id: '',
    batch_number: '',
    expiry_date: '',
    inbound_price: '',
    remarks: '',
  })
  const [error, setError] = useState('')

  const { data: batchesData } = useQuery({
    queryKey: ['material', 'consumable-batches', item.id],
    queryFn: () => materialApi.listConsumableBatches({ consumable_id: item.id, page_size: 100 }),
  })
  const batches = ((batchesData as any)?.data?.items ?? []) as ConsumableBatchItem[]

  const inboundMutation = useMutation({
    mutationFn: () => materialApi.inboundConsumable({
      consumable_id: item.id,
      batch_id: form.batch_id ? Number(form.batch_id) : undefined,
      quantity: Number(form.quantity),
      remarks: form.remarks || undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '入库失败'),
  })

  const createBatchMutation = useMutation({
    mutationFn: () => materialApi.createConsumableBatch({
      consumable_id: item.id,
      batch_number: form.batch_number || undefined,
      expiry_date: form.expiry_date || undefined,
      inbound_date: new Date().toISOString().slice(0, 10),
      inbound_quantity: Number(form.quantity),
      inbound_price: form.inbound_price ? Number(form.inbound_price) : undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '入库失败'),
  })

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }))
  const setMode = (mode: 'existing' | 'new') => setForm((f) => ({ ...f, mode }))

  const handleSubmit = () => {
    if (form.mode === 'new' && form.batch_number) {
      createBatchMutation.mutate()
    } else {
      inboundMutation.mutate()
    }
  }

  const isPending = inboundMutation.isPending || createBatchMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[440px] bg-white rounded-xl shadow-xl">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">耗材入库</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="text-sm font-medium text-slate-800">{item.name}</div>
            <div className="text-xs text-slate-500 mt-1">编码: {item.code} | 当前库存: {item.current_stock} {item.unit}</div>
          </div>

          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <div className="flex gap-2">
            <button
              onClick={() => setMode('existing')}
              className={`min-h-11 flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${form.mode === 'existing' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              入库到现有批次
            </button>
            <button
              onClick={() => setMode('new')}
              className={`min-h-11 flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${form.mode === 'new' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              入库新建批次
            </button>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">入库数量 *</span>
            <input
              type="number"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              min={1}
              placeholder="数量"
              className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              title="入库数量"
            />
          </label>

          {form.mode === 'existing' && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">批次</span>
              <select
                value={form.batch_id}
                onChange={(e) => set('batch_id', e.target.value)}
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                title="选择批次"
              >
                <option value="">不指定批次</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.batch_number} (剩余: {b.remaining_quantity})</option>
                ))}
              </select>
            </label>
          )}

          {form.mode === 'new' && (
            <>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">批次号</span>
                <input
                  value={form.batch_number}
                  onChange={(e) => set('batch_number', e.target.value)}
                  placeholder="可选"
                  className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  title="批次号"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">效期</span>
                <input
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => set('expiry_date', e.target.value)}
                  className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  title="效期"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">入库单价</span>
                <input
                  type="number"
                  value={form.inbound_price}
                  onChange={(e) => set('inbound_price', e.target.value)}
                  placeholder="可选"
                  className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  title="入库单价"
                />
              </label>
            </>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">备注</span>
            <textarea
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
              rows={2}
              placeholder="可选"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none"
              title="备注"
            />
          </label>

          <div className="pt-4 flex gap-3">
            <button onClick={onClose} className="min-h-11 flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
            <button
              onClick={handleSubmit}
              disabled={!form.quantity || Number(form.quantity) <= 0 || isPending}
              className="min-h-11 flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? '提交中...' : '确认入库'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ============================================================================
// Return Consumable Modal
// ============================================================================
function ReturnConsumableModal({ item, onClose, onSuccess }: { item: ConsumableItem; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ quantity: '', remarks: '' })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => materialApi.returnConsumable({
      consumable_id: item.id,
      quantity: Number(form.quantity),
      remarks: form.remarks || undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '退库失败'),
  })

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[440px] bg-white rounded-xl shadow-xl">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">耗材退库</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="p-3 bg-slate-50 rounded-lg">
            <div className="text-sm font-medium text-slate-800">{item.name}</div>
            <div className="text-xs text-slate-500 mt-1">编码: {item.code} | 当前库存: {item.current_stock} {item.unit}</div>
          </div>

          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">退库数量 *</span>
            <input
              type="number"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              min={1}
              max={item.current_stock}
              placeholder={`最大 ${item.current_stock}`}
              className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              title="退库数量"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">备注</span>
            <textarea
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
              rows={3}
              placeholder="退库原因等"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none"
              title="退库备注"
            />
          </label>

          <div className="pt-4 flex gap-3">
            <button onClick={onClose} className="min-h-11 flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!form.quantity || Number(form.quantity) <= 0 || mutation.isPending}
              className="min-h-11 flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '提交中...' : '确认退库'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ============================================================================
// Consumable Detail Drawer
// ============================================================================
function ConsumableDetailDrawer({ item, onClose }: { item: ConsumableItem; onClose: () => void }) {
  const [tab, setTab] = useState<'info' | 'batches'>('info')

  const { data: batchesData, isLoading: batchesLoading } = useQuery({
    queryKey: ['material', 'consumable-batches', item.id],
    queryFn: () => materialApi.listConsumableBatches({ consumable_id: item.id, page_size: 100 }),
    enabled: tab === 'batches',
  })
  const batches = ((batchesData as any)?.data?.items ?? []) as ConsumableBatchItem[]

  const tabs = [
    { key: 'info' as const, label: '基本信息' },
    { key: 'batches' as const, label: '批次' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[560px] bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">耗材详情</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`shrink-0 min-h-11 px-3 py-1.5 text-sm rounded-md transition-colors ${tab === t.key ? 'bg-amber-50 text-amber-700 font-medium' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {tab === 'info' ? (
            <div className="space-y-4">
              <InfoRow label="耗材编码" value={item.code} />
              <InfoRow label="名称" value={item.name} />
              <InfoRow label="规格" value={item.specification || '-'} />
              <InfoRow label="单位" value={item.unit || '-'} />
              <InfoRow label="当前库存" value={String(item.current_stock)} />
              <InfoRow label="安全库存" value={String(item.safety_stock)} />
              <InfoRow label="存储条件" value={item.storage_condition || '-'} />
              <InfoRow label="效期" value={item.expiry_date || '-'} />
              <InfoRow label="类别" value={item.category || '-'} />
            </div>
          ) : (
            <div className="space-y-3">
              {batchesLoading ? (
                <div className="text-center text-slate-400 py-8">加载中...</div>
              ) : batches.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无批次数据</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 font-medium text-slate-600">批次号</th>
                      <th className="text-left py-2 font-medium text-slate-600">入库日期</th>
                      <th className="text-left py-2 font-medium text-slate-600">入库数量</th>
                      <th className="text-left py-2 font-medium text-slate-600">剩余数量</th>
                      <th className="text-left py-2 font-medium text-slate-600">效期</th>
                      <th className="text-left py-2 font-medium text-slate-600">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => (
                      <tr key={b.id} className="border-b border-slate-100">
                        <td className="py-2 font-mono text-xs">{b.batch_number}</td>
                        <td className="py-2 text-slate-600">{b.inbound_date}</td>
                        <td className="py-2 text-slate-600">{b.inbound_quantity}</td>
                        <td className="py-2 text-slate-600">{b.remaining_quantity}</td>
                        <td className="py-2 text-slate-600">{b.expiry_date || '-'}</td>
                        <td className="py-2 text-slate-600">{b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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
