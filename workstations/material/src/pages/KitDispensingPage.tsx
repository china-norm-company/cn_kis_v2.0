import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { ProductKitItem, ProductDispensingItem, ProductItem, ProductBatchItem } from '@cn-kis/api-client'
import { Package, Plus, Search, ChevronLeft, ChevronRight, X, ClipboardList } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

const KIT_STATUS_STYLES: Record<string, string> = {
  available: 'bg-green-50 text-green-700 border-green-200',
  reserved: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  assigned: 'bg-blue-50 text-blue-700 border-blue-200',
  distributed: 'bg-purple-50 text-purple-700 border-purple-200',
  used: 'bg-slate-50 text-slate-500 border-slate-200',
  returned: 'bg-amber-50 text-amber-700 border-amber-200',
}

const KIT_STATUS_LABELS: Record<string, string> = {
  available: '可用',
  reserved: '预留',
  assigned: '已分配',
  distributed: '已分发',
  used: '已使用',
  returned: '已退回',
}

const DISPENSING_STATUS_STYLES: Record<string, string> = {
  planned: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  prepared: 'bg-blue-50 text-blue-700 border-blue-200',
  dispensed: 'bg-green-50 text-green-700 border-green-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
}

const DISPENSING_STATUS_LABELS: Record<string, string> = {
  planned: '计划中',
  prepared: '已备货',
  dispensed: '已分发',
  confirmed: '已确认',
  cancelled: '已取消',
}

export function KitDispensingPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'kits' | 'dispensings'>('kits')
  const [productFilter, setProductFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [subjectKeyword, setSubjectKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [showCreateKit, setShowCreateKit] = useState(false)
  const [showCreateDispensing, setShowCreateDispensing] = useState(false)
  const [assignKitId, setAssignKitId] = useState<number | null>(null)
  const [distributeKitId, setDistributeKitId] = useState<number | null>(null)
  const [prepareDispId, setPrepareDispId] = useState<number | null>(null)
  const [executeDispId, setExecuteDispId] = useState<number | null>(null)
  const [confirmDispId, setConfirmDispId] = useState<number | null>(null)

  const tabs = [
    { key: 'kits' as const, label: '套件管理', icon: Package },
    { key: 'dispensings' as const, label: '分发记录', icon: ClipboardList },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">套件与分发</h2>
          <p className="text-sm text-slate-500 mt-1">产品套件（随机化）管理与分发记录</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setPage(1) }}
            className={`shrink-0 flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === t.key ? 'bg-amber-50 text-amber-700 border-b-2 border-amber-600 -mb-px' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'kits' && (
        <KitsTab
          productFilter={productFilter}
          statusFilter={statusFilter}
          subjectKeyword={subjectKeyword}
          page={page}
          setProductFilter={setProductFilter}
          setStatusFilter={setStatusFilter}
          setSubjectKeyword={setSubjectKeyword}
          setPage={setPage}
          onShowCreateKit={() => setShowCreateKit(true)}
          onAssignKit={setAssignKitId}
          onDistributeKit={setDistributeKitId}
          queryClient={queryClient}
        />
      )}

      {activeTab === 'dispensings' && (
        <DispensingsTab
          productFilter={productFilter}
          statusFilter={statusFilter}
          subjectKeyword={subjectKeyword}
          page={page}
          setProductFilter={setProductFilter}
          setStatusFilter={setStatusFilter}
          setSubjectKeyword={setSubjectKeyword}
          setPage={setPage}
          onShowCreateDispensing={() => setShowCreateDispensing(true)}
          onPrepare={setPrepareDispId}
          onExecute={setExecuteDispId}
          onConfirm={setConfirmDispId}
          queryClient={queryClient}
        />
      )}

      {/* Create Kit Modal */}
      {showCreateKit && (
        <CreateKitModal
          onClose={() => setShowCreateKit(false)}
          onSuccess={() => {
            setShowCreateKit(false)
            queryClient.invalidateQueries({ queryKey: ['material', 'kits'] })
          }}
        />
      )}

      {/* Assign Kit Modal */}
      {assignKitId && (
        <AssignKitModal
          kitId={assignKitId}
          onClose={() => setAssignKitId(null)}
          onSuccess={() => {
            setAssignKitId(null)
            queryClient.invalidateQueries({ queryKey: ['material', 'kits'] })
          }}
        />
      )}

      {/* Distribute Kit Modal */}
      {distributeKitId && (
        <DistributeKitModal
          kitId={distributeKitId}
          onClose={() => setDistributeKitId(null)}
          onSuccess={() => {
            setDistributeKitId(null)
            queryClient.invalidateQueries({ queryKey: ['material', 'kits'] })
          }}
        />
      )}

      {/* Create Dispensing Modal */}
      {showCreateDispensing && (
        <CreateDispensingModal
          onClose={() => setShowCreateDispensing(false)}
          onSuccess={() => {
            setShowCreateDispensing(false)
            queryClient.invalidateQueries({ queryKey: ['material', 'dispensings'] })
          }}
        />
      )}

      {/* Prepare Dispensing */}
      {prepareDispId && (
        <PrepareDispensingModal
          id={prepareDispId}
          onClose={() => setPrepareDispId(null)}
          onSuccess={() => {
            setPrepareDispId(null)
            queryClient.invalidateQueries({ queryKey: ['material', 'dispensings'] })
          }}
        />
      )}

      {/* Execute Dispensing */}
      {executeDispId && (
        <ExecuteDispensingModal
          id={executeDispId}
          onClose={() => setExecuteDispId(null)}
          onSuccess={() => {
            setExecuteDispId(null)
            queryClient.invalidateQueries({ queryKey: ['material', 'dispensings'] })
          }}
        />
      )}

      {/* Confirm Dispensing */}
      {confirmDispId && (
        <ConfirmDispensingModal
          id={confirmDispId}
          onClose={() => setConfirmDispId(null)}
          onSuccess={() => {
            setConfirmDispId(null)
            queryClient.invalidateQueries({ queryKey: ['material', 'dispensings'] })
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// Kits Tab
// ============================================================================
function KitsTab({
  productFilter,
  statusFilter,
  subjectKeyword,
  page,
  setProductFilter,
  setStatusFilter,
  setSubjectKeyword,
  setPage,
  onShowCreateKit,
  onAssignKit,
  onDistributeKit,
  queryClient,
}: {
  productFilter: string
  statusFilter: string
  subjectKeyword: string
  page: number
  setProductFilter: (v: string) => void
  setStatusFilter: (v: string) => void
  setSubjectKeyword: (v: string) => void
  setPage: (v: number | ((p: number) => number)) => void
  onShowCreateKit: () => void
  onAssignKit: (id: number) => void
  onDistributeKit: (id: number) => void
  queryClient: ReturnType<typeof import('@tanstack/react-query').useQueryClient>
}) {
  const { data: productsData } = useQuery({
    queryKey: ['material', 'products-for-kits'],
    queryFn: () => materialApi.listProducts({ page_size: 200 }),
  })
  const products = ((productsData as any)?.data?.items ?? []) as ProductItem[]

  const { data: listData, isLoading } = useQuery({
    queryKey: ['material', 'kits', { productFilter, statusFilter, subjectKeyword, page }],
    queryFn: () => materialApi.listKits({
      product_id: productFilter ? Number(productFilter) : undefined,
      status: statusFilter || undefined,
      page,
      page_size: 20,
    }),
  })
  const list = (listData as any)?.data as { items: ProductKitItem[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  return (
    <>
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索受试者编号..."
            value={subjectKeyword}
            onChange={(e) => { setSubjectKeyword(e.target.value); setPage(1) }}
            className="w-full min-h-11 pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            title="搜索受试者编号"
          />
        </div>
        <select
          value={productFilter}
          onChange={(e) => { setProductFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="产品筛选"
          title="产品筛选"
        >
          <option value="">全部产品</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="状态筛选"
          title="状态筛选"
        >
          <option value="">全部状态</option>
          <option value="available">可用</option>
          <option value="reserved">预留</option>
          <option value="assigned">已分配</option>
          <option value="distributed">已分发</option>
          <option value="used">已使用</option>
          <option value="returned">已退回</option>
        </select>
        <PermissionGuard permission="material.kit.create">
          <button
            onClick={onShowCreateKit}
            className="shrink-0 flex min-h-11 items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
            title="新建套件"
          >
            <Plus className="w-4 h-4" />新建套件
          </button>
        </PermissionGuard>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无套件数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">套件号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">随机号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">盲态编码</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">产品</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">受试者编号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">分配时间</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.kit_number}</td>
                  <td className="px-4 py-3 text-slate-600">{item.randomization_code || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.blinding_code || '-'}</td>
                  <td className="px-4 py-3 text-slate-800">{item.product_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${KIT_STATUS_STYLES[item.status] || 'bg-slate-50 text-slate-600'}`}>
                      {KIT_STATUS_LABELS[item.status] || item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.subject_code || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.assigned_at || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    {item.status === 'available' && (
                      <button
                        onClick={() => onAssignKit(item.id)}
                        className="inline-flex min-h-9 items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                      >
                        分配
                      </button>
                    )}
                    {item.status === 'assigned' && (
                      <button
                        onClick={() => onDistributeKit(item.id)}
                        className="inline-flex min-h-9 items-center gap-1 px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-md hover:bg-purple-100 transition-colors"
                      >
                        分发
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

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
            <span className="text-sm text-slate-600 px-3">{page} / {totalPages}</span>
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
    </>
  )
}

// ============================================================================
// Dispensings Tab
// ============================================================================
function DispensingsTab({
  productFilter,
  statusFilter,
  subjectKeyword,
  page,
  setProductFilter,
  setStatusFilter,
  setSubjectKeyword,
  setPage,
  onShowCreateDispensing,
  onPrepare,
  onExecute,
  onConfirm,
  queryClient,
}: {
  productFilter: string
  statusFilter: string
  subjectKeyword: string
  page: number
  setProductFilter: (v: string) => void
  setStatusFilter: (v: string) => void
  setSubjectKeyword: (v: string) => void
  setPage: (v: number | ((p: number) => number)) => void
  onShowCreateDispensing: () => void
  onPrepare: (id: number) => void
  onExecute: (id: number) => void
  onConfirm: (id: number) => void
  queryClient: ReturnType<typeof import('@tanstack/react-query').useQueryClient>
}) {
  const { data: listData, isLoading } = useQuery({
    queryKey: ['material', 'dispensings', { productFilter, statusFilter, subjectKeyword, page }],
    queryFn: () => materialApi.listDispensings({
      status: statusFilter || undefined,
      page,
      page_size: 20,
    }),
  })
  const list = (listData as any)?.data as { items: ProductDispensingItem[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  return (
    <>
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索受试者..."
            value={subjectKeyword}
            onChange={(e) => { setSubjectKeyword(e.target.value); setPage(1) }}
            className="w-full min-h-11 pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            title="搜索受试者"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="状态筛选"
          title="状态筛选"
        >
          <option value="">全部状态</option>
          <option value="planned">计划中</option>
          <option value="prepared">已备货</option>
          <option value="dispensed">已分发</option>
          <option value="confirmed">已确认</option>
          <option value="cancelled">已取消</option>
        </select>
        <PermissionGuard permission="material.dispense.create">
          <button
            onClick={onShowCreateDispensing}
            className="shrink-0 flex min-h-11 items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
            title="新建分发"
          >
            <Plus className="w-4 h-4" />新建分发
          </button>
        </PermissionGuard>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无分发记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">分发单号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">受试者</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">访视</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">产品</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">数量</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">备货时间</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">分发时间</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">确认时间</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.dispensing_no}</td>
                  <td className="px-4 py-3 text-slate-800">{item.subject_code}</td>
                  <td className="px-4 py-3 text-slate-600">{item.visit_code || '-'}</td>
                  <td className="px-4 py-3 text-slate-800">{item.product_name}</td>
                  <td className="px-4 py-3 text-slate-600">{item.quantity_dispensed}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${DISPENSING_STATUS_STYLES[item.status] || 'bg-slate-50 text-slate-600'}`}>
                      {DISPENSING_STATUS_LABELS[item.status] || item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.prepared_at || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.dispensed_at || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.confirmed_at || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    {item.status === 'planned' && (
                      <button
                        onClick={() => onPrepare(item.id)}
                        className="inline-flex min-h-9 items-center gap-1 px-2.5 py-1 text-xs font-medium text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md hover:bg-yellow-100 transition-colors"
                      >
                        备货
                      </button>
                    )}
                    {item.status === 'prepared' && (
                      <button
                        onClick={() => onExecute(item.id)}
                        className="inline-flex min-h-9 items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                      >
                        分发
                      </button>
                    )}
                    {item.status === 'dispensed' && (
                      <button
                        onClick={() => onConfirm(item.id)}
                        className="inline-flex min-h-9 items-center gap-1 px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
                      >
                        确认
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

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
            <span className="text-sm text-slate-600 px-3">{page} / {totalPages}</span>
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
    </>
  )
}

// ============================================================================
// Create Kit Modal
// ============================================================================
function CreateKitModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    product_id: '',
    batch_id: '',
    randomization_code: '',
    treatment_group: '',
    blinding_code: '',
    quantity: '',
  })
  const [error, setError] = useState('')

  const { data: productsData } = useQuery({
    queryKey: ['material', 'products-for-create-kit'],
    queryFn: () => materialApi.listProducts({ page_size: 200 }),
  })
  const products = ((productsData as any)?.data?.items ?? []) as ProductItem[]

  const { data: batchesData } = useQuery({
    queryKey: ['material', 'batches-for-kit', form.product_id],
    queryFn: () => materialApi.listBatches({ product_id: Number(form.product_id), page_size: 100 }),
    enabled: !!form.product_id,
  })
  const batches = ((batchesData as any)?.data?.items ?? []) as ProductBatchItem[]

  const mutation = useMutation({
    mutationFn: () => materialApi.createKit({
      product_id: Number(form.product_id),
      batch_id: form.batch_id ? Number(form.batch_id) : undefined,
      randomization_code: form.randomization_code || undefined,
      treatment_group: form.treatment_group || undefined,
      blinding_code: form.blinding_code || undefined,
      quantity: form.quantity ? Number(form.quantity) : undefined,
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
          <h3 className="text-lg font-semibold">新建套件</h3>
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
              className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              <option value="">请选择产品</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">批次</span>
            <select
              value={form.batch_id}
              onChange={(e) => set('batch_id', e.target.value)}
              className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              disabled={!form.product_id}
            >
              <option value="">请选择批次（可选）</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.batch_no}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">随机号</span>
            <input
              value={form.randomization_code}
              onChange={(e) => set('randomization_code', e.target.value)}
              placeholder="随机化编码"
              className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">治疗组</span>
            <input
              value={form.treatment_group}
              onChange={(e) => set('treatment_group', e.target.value)}
              placeholder="如 试验组/对照组"
              className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">盲态编码</span>
            <input
              value={form.blinding_code}
              onChange={(e) => set('blinding_code', e.target.value)}
              placeholder="盲态编码"
              className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">数量</span>
            <input
              type="number"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              placeholder="套件数量"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <div className="pt-4 flex gap-3">
            <button onClick={onClose} className="flex-1 min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!form.product_id || mutation.isPending}
              className="flex-1 min-h-11 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
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
// Assign Kit Modal
// ============================================================================
function AssignKitModal({ kitId, onClose, onSuccess }: { kitId: number; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ subject_id: '', subject_code: '' })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => materialApi.assignKit(kitId, {
      subject_id: Number(form.subject_id),
      subject_code: form.subject_code,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '分配失败'),
  })

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[440px] bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">分配套件</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">受试者ID *</span>
            <input
              type="number"
              value={form.subject_id}
              onChange={(e) => set('subject_id', e.target.value)}
              placeholder="受试者ID"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">受试者编号 *</span>
            <input
              value={form.subject_code}
              onChange={(e) => set('subject_code', e.target.value)}
              placeholder="如 S001"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <div className="pt-4 flex gap-3">
            <button onClick={onClose} className="flex-1 min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!form.subject_id || !form.subject_code || mutation.isPending}
              className="flex-1 min-h-11 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '分配中...' : '确认分配'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Distribute Kit Modal
// ============================================================================
function DistributeKitModal({ kitId, onClose, onSuccess }: { kitId: number; onClose: () => void; onSuccess: () => void }) {
  const [visit, setVisit] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => materialApi.distributeKit(kitId, {
      distribution_visit: visit || undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '分发失败'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[440px] bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">分发套件</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">分发访视</span>
            <input
              value={visit}
              onChange={(e) => setVisit(e.target.value)}
              placeholder="如 V1"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <div className="pt-4 flex gap-3">
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
// Create Dispensing Modal
// ============================================================================
function CreateDispensingModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    subject_id: '',
    subject_code: '',
    visit_code: '',
    visit_date: '',
    product_id: '',
    batch_id: '',
    kit_id: '',
    quantity: '',
    work_order_id: '',
  })
  const [error, setError] = useState('')

  const { data: productsData } = useQuery({
    queryKey: ['material', 'products-for-dispensing'],
    queryFn: () => materialApi.listProducts({ page_size: 200 }),
  })
  const products = ((productsData as any)?.data?.items ?? []) as ProductItem[]

  const mutation = useMutation({
    mutationFn: () => materialApi.createDispensing({
      subject_id: Number(form.subject_id),
      subject_code: form.subject_code,
      visit_code: form.visit_code || undefined,
      visit_date: form.visit_date || undefined,
      product_id: Number(form.product_id),
      batch_id: form.batch_id ? Number(form.batch_id) : undefined,
      kit_id: form.kit_id ? Number(form.kit_id) : undefined,
      quantity: Number(form.quantity),
      work_order_id: form.work_order_id ? Number(form.work_order_id) : undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '创建失败'),
  })

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[520px] bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">新建分发</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">受试者ID *</span>
              <input
                type="number"
                value={form.subject_id}
                onChange={(e) => set('subject_id', e.target.value)}
                placeholder="受试者ID"
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">受试者编号 *</span>
              <input
                value={form.subject_code}
                onChange={(e) => set('subject_code', e.target.value)}
                placeholder="如 S001"
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">访视编码</span>
              <input
                value={form.visit_code}
                onChange={(e) => set('visit_code', e.target.value)}
                placeholder="如 V1"
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">访视日期</span>
              <input
                type="date"
                value={form.visit_date}
                onChange={(e) => set('visit_date', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">产品 *</span>
            <select
              value={form.product_id}
              onChange={(e) => set('product_id', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              <option value="">请选择产品</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">批次ID</span>
              <input
                type="number"
                value={form.batch_id}
                onChange={(e) => set('batch_id', e.target.value)}
                placeholder="可选"
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">套件ID</span>
              <input
                type="number"
                value={form.kit_id}
                onChange={(e) => set('kit_id', e.target.value)}
                placeholder="可选"
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">分发数量 *</span>
            <input
              type="number"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              placeholder="数量"
              min={1}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">关联工单ID</span>
            <input
              type="number"
              value={form.work_order_id}
              onChange={(e) => set('work_order_id', e.target.value)}
              placeholder="可选，用于唯一性校验"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <div className="pt-4 flex gap-3">
            <button onClick={onClose} className="flex-1 min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!form.subject_id || !form.subject_code || !form.product_id || !form.quantity || mutation.isPending}
              className="flex-1 min-h-11 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
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
// Prepare / Execute / Confirm Dispensing Modals (simple action modals)
// ============================================================================
function PrepareDispensingModal({ id, onClose, onSuccess }: { id: number; onClose: () => void; onSuccess: () => void }) {
  const mutation = useMutation({
    mutationFn: () => materialApi.prepareDispensing(id),
    onSuccess: () => onSuccess(),
    onError: (err: any) => alert(err?.response?.data?.msg || '备货失败'),
  })
  return (
    <ActionConfirmModal
      title="备货"
      message="确认对此分发单执行备货？"
      onClose={onClose}
      onConfirm={() => mutation.mutate()}
      isPending={mutation.isPending}
    />
  )
}

function ExecuteDispensingModal({ id, onClose, onSuccess }: { id: number; onClose: () => void; onSuccess: () => void }) {
  const mutation = useMutation({
    mutationFn: () => materialApi.executeDispensing(id),
    onSuccess: () => onSuccess(),
    onError: (err: any) => alert(err?.response?.data?.msg || '分发失败'),
  })
  return (
    <ActionConfirmModal
      title="分发"
      message="确认对此分发单执行分发？"
      onClose={onClose}
      onConfirm={() => mutation.mutate()}
      isPending={mutation.isPending}
    />
  )
}

function ConfirmDispensingModal({ id, onClose, onSuccess }: { id: number; onClose: () => void; onSuccess: () => void }) {
  const mutation = useMutation({
    mutationFn: () => materialApi.confirmDispensing(id),
    onSuccess: () => onSuccess(),
    onError: (err: any) => alert(err?.response?.data?.msg || '确认失败'),
  })
  return (
    <ActionConfirmModal
      title="确认"
      message="确认此分发单已完成？"
      onClose={onClose}
      onConfirm={() => mutation.mutate()}
      isPending={mutation.isPending}
    />
  )
}

function ActionConfirmModal({
  title,
  message,
  onClose,
  onConfirm,
  isPending,
}: {
  title: string
  message: string
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[400px] bg-white rounded-xl shadow-xl p-4 md:p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 min-h-11 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? '处理中...' : '确认'}
          </button>
        </div>
      </div>
    </div>
  )
}
