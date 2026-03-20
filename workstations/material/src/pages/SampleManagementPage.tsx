import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { SampleItem, SampleStats, SampleDetail, TraceResult } from '@cn-kis/api-client'
import { FlaskConical, Search, ChevronLeft, ChevronRight, X, Send, RotateCcw, Trash2, GitBranch } from 'lucide-react'

const STATUS_STYLES: Record<string, string> = {
  in_stock: 'bg-green-50 text-green-700 border-green-200',
  distributed: 'bg-blue-50 text-blue-700 border-blue-200',
  returned: 'bg-amber-50 text-amber-700 border-amber-200',
  consumed: 'bg-slate-50 text-slate-500 border-slate-200',
  destroyed: 'bg-red-50 text-red-600 border-red-200',
}

const STATUS_LABELS: Record<string, string> = {
  in_stock: '在库',
  distributed: '已分发',
  returned: '已回收',
  consumed: '已消耗',
  destroyed: '已销毁',
}

export function SampleManagementPage() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [distributeId, setDistributeId] = useState<number | null>(null)
  const [returnId, setReturnId] = useState<number | null>(null)
  const [showTrace, setShowTrace] = useState(false)
  const [traceQuery, setTraceQuery] = useState('')

  // Stats
  const { data: statsData } = useQuery({
    queryKey: ['material', 'sample-stats'],
    queryFn: () => materialApi.getSampleStats(),
  })
  const stats = (statsData as any)?.data as SampleStats | undefined

  // Sample list
  const { data: listData, isLoading } = useQuery({
    queryKey: ['material', 'samples', { keyword, statusFilter, productFilter, page }],
    queryFn: () => materialApi.listSamples({
      keyword: keyword || undefined,
      status: statusFilter || undefined,
      product_id: productFilter ? Number(productFilter) : undefined,
      page,
      page_size: 20,
    }),
  })
  const list = (listData as any)?.data as { items: SampleItem[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  // Products for filter
  const { data: productsData } = useQuery({
    queryKey: ['material', 'products-for-filter'],
    queryFn: () => materialApi.listProducts({ page_size: 200 }),
  })
  const products = ((productsData as any)?.data?.items ?? []) as Array<{ id: number; name: string }>

  // Destroy mutation
  const destroyMut = useMutation({
    mutationFn: (id: number) => materialApi.destroySample(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['material'] }),
  })

  // Trace query
  const { data: traceData, refetch: refetchTrace, isFetching: isTracing } = useQuery({
    queryKey: ['material', 'trace', traceQuery],
    queryFn: () => materialApi.traceSample({ code: traceQuery }),
    enabled: false,
  })
  const traceResult = (traceData as any)?.data as TraceResult | undefined

  const statCards = [
    { label: '总数', value: stats?.total ?? '--', color: 'text-slate-700' },
    { label: '在库', value: stats?.in_stock ?? '--', color: 'text-green-700' },
    { label: '已分发', value: stats?.distributed ?? '--', color: 'text-blue-700' },
    { label: '已回收', value: stats?.returned ?? '--', color: 'text-amber-700' },
    { label: '已消耗', value: stats?.consumed ?? '--', color: 'text-slate-500' },
    { label: '已销毁', value: stats?.destroyed ?? '--', color: 'text-red-600' },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">样品管理</h2>
          <p className="text-sm text-slate-500 mt-1">受试样品的接收、分发、检测、回收与销毁全流程</p>
        </div>
        <button
          onClick={() => setShowTrace(!showTrace)}
          className="flex min-h-11 items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          <GitBranch className="w-4 h-4" />追溯查询
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 md:gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Trace section */}
      {showTrace && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 md:p-6 space-y-4">
          <h3 className="text-sm font-semibold text-amber-800">样品追溯查询</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              placeholder="输入样品编码或受试者编号"
              value={traceQuery}
              onChange={(e) => setTraceQuery(e.target.value)}
              className="flex-1 min-h-11 px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
            />
            <button
              onClick={() => refetchTrace()}
              disabled={!traceQuery || isTracing}
              className="min-h-11 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {isTracing ? '查询中...' : '查询'}
            </button>
          </div>

          {traceResult && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-700">
                样品: {traceResult.sample.unique_code} — {traceResult.sample.product_name}
              </div>
              <div className="relative pl-6 space-y-4">
                {traceResult.timeline.map((step, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-amber-500 border-2 border-white" />
                    {idx < traceResult.timeline.length - 1 && (
                      <div className="absolute -left-[14px] top-4 w-0.5 h-full bg-amber-200" />
                    )}
                    <div className="bg-white rounded-lg p-3 border border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-800">{step.action}</span>
                        <span className="text-xs text-slate-400">{step.date}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        操作人: {step.operator} {step.detail && `| ${step.detail}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {traceResult.related_samples.length > 0 && (
                <div className="text-xs text-slate-500">
                  关联样品: {traceResult.related_samples.map(s => s.unique_code).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索样品编码、产品名称..."
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
            className="w-full min-h-11 pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="样品状态筛选"
        >
          <option value="">全部状态</option>
          <option value="in_stock">在库</option>
          <option value="distributed">已分发</option>
          <option value="returned">已回收</option>
          <option value="consumed">已消耗</option>
          <option value="destroyed">已销毁</option>
        </select>
        <select
          value={productFilter}
          onChange={(e) => { setProductFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="产品筛选"
        >
          <option value="">全部产品</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Sample table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无样品数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">样品编码</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">所属产品</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">当前持有人</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">关联项目</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">存储位置</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">留样</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setDetailId(item.id)}
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.unique_code}</td>
                  <td className="px-4 py-3 text-slate-800">{item.product_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[item.status] || 'bg-slate-50 text-slate-600'}`}>
                      {STATUS_LABELS[item.status] || item.status_display}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.current_holder || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.protocol_name || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.storage_location || '-'}</td>
                  <td className="px-4 py-3">
                    {item.retention && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
                        留
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {item.status === 'in_stock' && (
                        <button
                          onClick={() => setDistributeId(item.id)}
                          className="min-h-9 min-w-9 p-1.5 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                          title="分发"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      )}
                      {item.status === 'distributed' && (
                        <button
                          onClick={() => setReturnId(item.id)}
                          className="min-h-9 min-w-9 p-1.5 text-amber-500 hover:bg-amber-50 rounded transition-colors"
                          title="回收"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      {item.status !== 'destroyed' && (
                        <button
                          onClick={() => {
                            if (confirm('确认销毁此样品？此操作不可撤回。')) {
                              destroyMut.mutate(item.id)
                            }
                          }}
                          className="min-h-9 min-w-9 p-1.5 text-red-400 hover:bg-red-50 rounded transition-colors"
                          title="销毁"
                        >
                          <Trash2 className="w-4 h-4" />
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
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="min-h-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="上一页"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-600 px-3">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="min-h-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="下一页"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Sample detail drawer */}
      {detailId && (
        <SampleDetailDrawer id={detailId} onClose={() => setDetailId(null)} />
      )}

      {/* Distribute modal */}
      {distributeId && (
        <DistributeModal
          id={distributeId}
          onClose={() => setDistributeId(null)}
          onSuccess={() => {
            setDistributeId(null)
            queryClient.invalidateQueries({ queryKey: ['material'] })
          }}
        />
      )}

      {/* Return modal */}
      {returnId && (
        <ReturnModal
          id={returnId}
          onClose={() => setReturnId(null)}
          onSuccess={() => {
            setReturnId(null)
            queryClient.invalidateQueries({ queryKey: ['material'] })
          }}
        />
      )}
    </div>
  )
}


// ============================================================================
// Sample Detail Drawer
// ============================================================================
function SampleDetailDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const [tab, setTab] = useState<'info' | 'transactions'>('info')

  const { data: detailData, isLoading } = useQuery({
    queryKey: ['material', 'sample-detail', id],
    queryFn: () => materialApi.getSample(id),
  })
  const detail = (detailData as any)?.data as SampleDetail | undefined

  const tabs = [
    { key: 'info' as const, label: '基本信息' },
    { key: 'transactions' as const, label: '流转记录' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[560px] bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">样品详情</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`shrink-0 min-h-10 px-3 py-1.5 text-sm rounded-md transition-colors ${tab === t.key ? 'bg-amber-50 text-amber-700 font-medium' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="text-center text-slate-400 py-8">加载中...</div>
          ) : !detail ? (
            <div className="text-center text-slate-400 py-8">样品不存在</div>
          ) : tab === 'info' ? (
            <div className="space-y-4">
              <InfoRow label="样品编码" value={detail.unique_code} />
              <InfoRow label="产品名称" value={detail.product_name} />
              <InfoRow label="产品编码" value={detail.product_code} />
              <InfoRow label="状态" value={STATUS_LABELS[detail.status] || detail.status_display} />
              <InfoRow label="当前持有人" value={detail.current_holder || '-'} />
              <InfoRow label="关联项目" value={detail.protocol_name || '-'} />
              <InfoRow label="存储位置" value={detail.storage_location || '-'} />
              <InfoRow label="留样" value={detail.retention ? '是' : '否'} />
              <InfoRow label="创建时间" value={detail.create_time} />
            </div>
          ) : (
            <div className="space-y-3">
              {(detail.transactions ?? []).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无流转记录</p>
              ) : (
                <div className="relative pl-6 space-y-4">
                  {detail.transactions.map((tx, idx) => (
                    <div key={tx.id} className="relative">
                      <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-amber-500 border-2 border-white" />
                      {idx < detail.transactions.length - 1 && (
                        <div className="absolute -left-[14px] top-4 w-0.5 h-full bg-amber-200" />
                      )}
                      <div className="bg-slate-50 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-800">{tx.transaction_type_display}</span>
                          <span className="text-xs text-slate-400">{tx.create_time}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          操作人: {tx.operator_name}
                          {tx.subject_name && ` | 受试者: ${tx.subject_name}`}
                          {tx.remarks && ` | ${tx.remarks}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


// ============================================================================
// Distribute Modal
// ============================================================================
function DistributeModal({ id, onClose, onSuccess }: { id: number; onClose: () => void; onSuccess: () => void }) {
  const [holder, setHolder] = useState('')
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => materialApi.distributeSample(id, {
      holder: holder || undefined,
      remarks: remarks || undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '分发失败'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[92vw] max-w-[440px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">分发样品</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">接收人</span>
            <input
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              placeholder="输入接收人姓名"
              className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">备注</span>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="可选备注信息"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <div className="pt-2 flex gap-3">
            <button onClick={onClose} className="flex-1 min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex-1 min-h-11 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '分发中...' : '确认分发'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ============================================================================
// Return Modal
// ============================================================================
function ReturnModal({ id, onClose, onSuccess }: { id: number; onClose: () => void; onSuccess: () => void }) {
  const [remarks, setRemarks] = useState('')
  const [weight, setWeight] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => materialApi.returnSample(id, {
      remarks: remarks || undefined,
      weight: weight ? Number(weight) : undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '回收失败'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[92vw] max-w-[440px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">回收样品</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">备注</span>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="回收备注信息"
              className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">回收重量(g)</span>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="单位: 克"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <div className="pt-2 flex gap-3">
            <button onClick={onClose} className="flex-1 min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex-1 min-h-11 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '回收中...' : '确认回收'}
            </button>
          </div>
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
