import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { ProductItem, ProductDetail, ProductStats } from '@cn-kis/api-client'
import { Package, Plus, Search, ChevronLeft, ChevronRight, X, Eye } from 'lucide-react'

export function ProductLedgerPage() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [expiryFilter, setExpiryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)

  const { data: statsData } = useQuery({
    queryKey: ['material', 'product-stats'],
    queryFn: () => materialApi.getProductStats(),
  })
  const stats = (statsData as any)?.data as ProductStats | undefined

  const { data: listData, isLoading } = useQuery({
    queryKey: ['material', 'products', { keyword, typeFilter, expiryFilter, page }],
    queryFn: () => materialApi.listProducts({
      keyword: keyword || undefined,
      product_type: typeFilter || undefined,
      expiry_status: expiryFilter || undefined,
      page,
      page_size: 20,
    }),
  })

  const list = (listData as any)?.data as { items: ProductItem[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  const statCards = [
    { label: '在管产品', value: stats?.total_products ?? '--', color: 'text-blue-600' },
    { label: '在库批次', value: stats?.active_batches ?? '--', color: 'text-green-600' },
    { label: '近效期', value: stats?.expiring_soon ?? '--', color: 'text-amber-600' },
    { label: '已过期', value: stats?.expired ?? '--', color: 'text-red-600' },
  ]

  function isExpired(item: ProductItem) {
    if (!item.expiry_date) return false
    return new Date(item.expiry_date) < new Date()
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">产品台账</h2>
          <p className="text-sm text-slate-500 mt-1">受试产品（化妆品）登记、批次追踪与留样管理</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex min-h-11 items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          <Plus className="w-4 h-4" />登记产品
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
            placeholder="搜索产品名称、批号、委托方..."
            value={keyword}
            title="搜索产品名称批号委托方"
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
            className="min-h-11 w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="产品类型筛选"
          title="产品类型筛选"
        >
          <option value="">全部类型</option>
          <option value="test_sample">测试样品</option>
          <option value="placebo">对照品</option>
          <option value="standard">标准品</option>
        </select>
        <select
          value={expiryFilter}
          onChange={(e) => { setExpiryFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="效期状态筛选"
          title="效期状态筛选"
        >
          <option value="">全部状态</option>
          <option value="active">有效</option>
          <option value="expired">已过期</option>
        </select>
      </div>

      {/* Product Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无产品数据</p>
            <button onClick={() => setShowCreate(true)} className="mt-2 min-h-10 text-amber-600 text-sm hover:underline" title="登记产品">点击登记产品</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">产品编码</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">名称</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">批号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">规格</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">存储条件</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">效期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">类型</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{item.name}</div>
                    {item.sponsor && (
                      <div className="text-xs text-slate-400">委托方: {item.sponsor}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.batch_number || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.specification || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.storage_condition || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.expiry_date || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                      {item.product_type_display}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isExpired(item) ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                        已过期
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                        有效
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setDetailId(item.id)}
                      className="min-h-9 min-w-9 p-1 text-slate-400 hover:text-amber-600 transition-colors"
                      title="查看详情"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
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

      {/* Create Product Modal */}
      {showCreate && (
        <CreateProductModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            queryClient.invalidateQueries({ queryKey: ['material'] })
          }}
        />
      )}

      {/* Product Detail Drawer */}
      {detailId && (
        <ProductDetailDrawer id={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  )
}


// ============================================================================
// Create Product Modal
// ============================================================================
function CreateProductModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '',
    code: '',
    batch_number: '',
    specification: '',
    storage_condition: '',
    expiry_date: '',
    product_type: '',
    sponsor: '',
    description: '',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => materialApi.createProduct({
      name: form.name,
      code: form.code,
      batch_number: form.batch_number || undefined,
      specification: form.specification || undefined,
      storage_condition: form.storage_condition || undefined,
      expiry_date: form.expiry_date || undefined,
      product_type: form.product_type || undefined,
      sponsor: form.sponsor || undefined,
      description: form.description || undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '创建失败'),
  })

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[520px] bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">登记产品</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">产品名称 *</span>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              title="产品名称"
              className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">产品编码 *</span>
            <input value={form.code} onChange={e => set('code', e.target.value)} placeholder="如 PRD-001"
              title="产品编码"
              className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">批号</span>
              <input value={form.batch_number} onChange={e => set('batch_number', e.target.value)}
                title="批号"
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">规格</span>
              <input value={form.specification} onChange={e => set('specification', e.target.value)}
                title="规格"
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">存储条件</span>
              <input value={form.storage_condition} onChange={e => set('storage_condition', e.target.value)} placeholder="如 2-8°C"
                title="存储条件"
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">有效期至</span>
              <input type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)}
                title="有效期至"
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">产品类型</span>
              <select value={form.product_type} onChange={e => set('product_type', e.target.value)}
                title="产品类型"
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none">
                <option value="">请选择类型</option>
                <option value="test_sample">测试样品</option>
                <option value="placebo">对照品</option>
                <option value="standard">标准品</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">委托方</span>
              <input value={form.sponsor} onChange={e => set('sponsor', e.target.value)}
                title="委托方"
                className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none" />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">描述</span>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
              title="产品描述"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none" />
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
// Product Detail Drawer
// ============================================================================
function ProductDetailDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const [tab, setTab] = useState<'info' | 'batches' | 'samples' | 'retention'>('info')

  const { data: detailData, isLoading } = useQuery({
    queryKey: ['material', 'product-detail', id],
    queryFn: () => materialApi.getProduct(id),
  })

  const detail = (detailData as any)?.data as ProductDetail | undefined

  const tabs = [
    { key: 'info', label: '基本信息' },
    { key: 'batches', label: '批次信息' },
    { key: 'samples', label: '样品统计' },
    { key: 'retention', label: '留样信息' },
  ] as const

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[560px] bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">{detail?.name ?? '产品详情'}</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {tabs.map(t => (
              <button key={t.key}
                onClick={() => setTab(t.key)}
                className={`shrink-0 min-h-11 px-3 py-1.5 text-sm rounded-md transition-colors ${tab === t.key ? 'bg-amber-50 text-amber-700 font-medium' : 'text-slate-500 hover:text-slate-700'}`}
              >{t.label}</button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="text-center text-slate-400 py-8">加载中...</div>
          ) : !detail ? (
            <div className="text-center text-slate-400 py-8">产品不存在</div>
          ) : tab === 'info' ? (
            <div className="space-y-4">
              <InfoRow label="产品编码" value={detail.code} />
              <InfoRow label="产品名称" value={detail.name} />
              <InfoRow label="批号" value={detail.batch_number || '-'} />
              <InfoRow label="规格" value={detail.specification || '-'} />
              <InfoRow label="存储条件" value={detail.storage_condition || '-'} />
              <InfoRow label="有效期" value={detail.expiry_date || '-'} />
              <InfoRow label="产品类型" value={detail.product_type_display} />
              <InfoRow label="委托方" value={detail.sponsor || '-'} />
              <InfoRow label="关联方案" value={detail.protocol_name || '-'} />
              <InfoRow label="描述" value={detail.description || '-'} />
              <InfoRow label="登记时间" value={detail.create_time} />
            </div>
          ) : tab === 'batches' ? (
            <div className="space-y-3">
              {(detail.batches ?? []).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无批次信息</p>
              ) : detail.batches.map((b, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">批号: {b.batch_number}</span>
                    <span className="text-slate-500">数量: {b.quantity}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    接收日期: {b.received_date} | 有效期: {b.expiry_date}
                  </div>
                </div>
              ))}
            </div>
          ) : tab === 'samples' ? (
            <div className="space-y-4">
              {detail.sample_summary ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-600">样品总数</p>
                      <p className="text-xl font-bold text-blue-700">{detail.sample_summary.total}</p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-xs text-green-600">在库</p>
                      <p className="text-xl font-bold text-green-700">{detail.sample_summary.in_stock}</p>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-lg">
                      <p className="text-xs text-amber-600">已分发</p>
                      <p className="text-xl font-bold text-amber-700">{detail.sample_summary.distributed}</p>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <p className="text-xs text-purple-600">已回收</p>
                      <p className="text-xl font-bold text-purple-700">{detail.sample_summary.returned}</p>
                    </div>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <p className="text-xs text-red-600">已销毁</p>
                    <p className="text-xl font-bold text-red-700">{detail.sample_summary.destroyed}</p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">暂无样品统计</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {detail.retention_info ? (
                <div className="space-y-4">
                  <InfoRow label="需要留样" value={detail.retention_info.required ? '是' : '否'} />
                  <InfoRow label="留样数量" value={String(detail.retention_info.quantity)} />
                  <InfoRow label="存储位置" value={detail.retention_info.location || '-'} />
                  <InfoRow label="释放日期" value={detail.retention_info.release_date || '-'} />
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">暂无留样信息</p>
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
