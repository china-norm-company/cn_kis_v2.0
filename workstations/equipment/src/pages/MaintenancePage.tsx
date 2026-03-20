import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { equipmentApi } from '@cn-kis/api-client'
import type { MaintenanceOrder, MaintenanceStats } from '@cn-kis/api-client'
import { Wrench, Plus, X, ChevronLeft, ChevronRight, Play, CheckCircle, XCircle, User } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-slate-50 text-slate-500 border-slate-200',
}
const TYPE_LABELS: Record<string, string> = {
  preventive: '预防性', corrective: '纠正性', emergency: '紧急', calibration: '校准',
}
const TYPE_COLORS: Record<string, string> = {
  preventive: 'text-blue-600', corrective: 'text-amber-600', emergency: 'text-red-600', calibration: 'text-cyan-600',
}

export function MaintenancePage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)

  const { data: statsData } = useQuery({
    queryKey: ['equipment', 'maintenance-stats'],
    queryFn: () => equipmentApi.getMaintenanceStats(),
  })

  const { data: listData, isLoading } = useQuery({
    queryKey: ['equipment', 'maintenance', { statusFilter, typeFilter, page }],
    queryFn: () => equipmentApi.listMaintenance({
      status: statusFilter || undefined,
      maintenance_type: typeFilter || undefined,
      page, page_size: 20,
    }),
  })

  const stats = (statsData as any)?.data as MaintenanceStats | undefined
  const list = (listData as any)?.data as { items: MaintenanceOrder[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  const statCards = [
    { label: '待处理', value: stats?.pending ?? '--', color: 'text-amber-600' },
    { label: '进行中', value: stats?.in_progress ?? '--', color: 'text-blue-600' },
    { label: '本月完成', value: stats?.completed_this_month ?? '--', color: 'text-green-600' },
    { label: '平均响应(h)', value: stats?.avg_response_hours ?? '--', color: 'text-slate-600' },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">维护工单</h2>
          <p className="text-sm text-slate-500 mt-1">设备维护、维修任务的创建、分配与跟踪</p>
        </div>
        <PermissionGuard permission="equipment.maintenance.create">
          <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 transition-colors">
            <Plus className="w-4 h-4" />创建工单
          </button>
        </PermissionGuard>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* 筛选 */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} aria-label="筛选工单状态" title="工单状态筛选" className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500">
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="in_progress">处理中</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }} aria-label="筛选维护类型" title="维护类型筛选" className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500">
          <option value="">全部类型</option>
          <option value="preventive">预防性维护</option>
          <option value="calibration">校准</option>
          <option value="corrective">纠正性维护</option>
          <option value="emergency">紧急维修</option>
        </select>
      </div>

      {/* 工单列表 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Wrench className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无维护工单</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map(m => (
              <div key={m.id} className="px-4 py-3 hover:bg-slate-50 cursor-pointer flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4" onClick={() => setDetailId(m.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs font-medium ${TYPE_COLORS[m.maintenance_type] || ''}`}>[{TYPE_LABELS[m.maintenance_type] || m.maintenance_type}]</span>
                    <span className="font-medium text-slate-800 truncate">{m.title || m.description.substring(0, 40)}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {m.equipment_name} ({m.equipment_code}) | {m.maintenance_date}
                  </div>
                </div>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[m.status] || ''}`}>
                  {m.status_display}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-slate-500">共 {list?.total ?? 0} 条记录</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} title="上一页" className="min-h-10 min-w-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm text-slate-600 px-3">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} title="下一页" className="min-h-10 min-w-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {showCreate && <CreateMaintenanceModal onClose={() => setShowCreate(false)} onSuccess={() => {
        setShowCreate(false)
        queryClient.invalidateQueries({ queryKey: ['equipment'] })
      }} />}

      {detailId && <MaintenanceDetailDrawer id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  )
}

function CreateMaintenanceModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    equipment_id: '', maintenance_type: 'corrective', title: '', description: '', maintenance_date: '',
  })
  const [error, setError] = useState('')

  const { data: eqData } = useQuery({
    queryKey: ['equipment', 'ledger', 'all'],
    queryFn: () => equipmentApi.listLedger({ page_size: 200 }),
  })
  const equipments = ((eqData as any)?.data?.items ?? []) as Array<{ id: number; name: string; code: string }>

  const mutation = useMutation({
    mutationFn: () => equipmentApi.createMaintenance({
      equipment_id: Number(form.equipment_id),
      maintenance_type: form.maintenance_type,
      title: form.title,
      description: form.description,
      maintenance_date: form.maintenance_date || undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '创建失败'),
  })

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[92vw] max-w-[500px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">创建维护工单</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">设备 *</span>
            <select title="选择设备" value={form.equipment_id} onChange={e => set('equipment_id', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
              <option value="">请选择设备</option>
              {equipments.map(e => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">维护类型 *</span>
              <select title="维护类型" value={form.maintenance_type} onChange={e => set('maintenance_type', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
                <option value="corrective">纠正性维护（报修）</option>
                <option value="preventive">预防性维护（计划）</option>
                <option value="emergency">紧急维修</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">计划日期</span>
              <input type="date" title="计划日期" value={form.maintenance_date} onChange={e => set('maintenance_date', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">标题 *</span>
            <input title="工单标题" value={form.title} onChange={e => set('title', e.target.value)} placeholder="简洁描述维护内容" className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">详细描述 *</span>
            <textarea title="详细描述" value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="故障现象/维护内容..." className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <div className="pt-2 flex gap-3">
            <button onClick={onClose} className="min-h-11 flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
            <button onClick={() => mutation.mutate()} disabled={!form.equipment_id || !form.title || !form.description || mutation.isPending}
              className="min-h-11 flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50 transition-colors">
              {mutation.isPending ? '创建中...' : '创建工单'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MaintenanceDetailDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const queryClient = useQueryClient()

  const { data: detailData, isLoading } = useQuery({
    queryKey: ['equipment', 'maintenance', id],
    queryFn: () => equipmentApi.getMaintenance(id),
  })

  const m = (detailData as any)?.data as MaintenanceOrder | undefined

  const startMut = useMutation({
    mutationFn: () => equipmentApi.startMaintenance(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipment'] }),
  })
  const completeMut = useMutation({
    mutationFn: () => equipmentApi.completeMaintenance(id, { result_notes: '维护完成' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipment'] }),
  })
  const cancelMut = useMutation({
    mutationFn: () => equipmentApi.cancelMaintenance(id, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipment'] }),
  })

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[480px] bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">维护工单详情</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : !m ? (
          <div className="p-8 text-center text-slate-400">工单不存在</div>
        ) : (
          <div className="p-6 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${TYPE_COLORS[m.maintenance_type] || ''}`}>[{TYPE_LABELS[m.maintenance_type] || m.maintenance_type}]</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[m.status] || ''}`}>{m.status_display}</span>
              </div>
              <h4 className="text-lg font-semibold text-slate-800">{m.title}</h4>
              <p className="text-sm text-slate-600">{m.description}</p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex gap-4"><span className="text-slate-500 w-20">设备</span><span className="text-slate-800">{m.equipment_name} ({m.equipment_code})</span></div>
              <div className="flex gap-4"><span className="text-slate-500 w-20">维护日期</span><span className="text-slate-800">{m.maintenance_date}</span></div>
              {m.performed_by && <div className="flex gap-4"><span className="text-slate-500 w-20">维护人</span><span className="text-slate-800">{m.performed_by}</span></div>}
              {m.cost != null && <div className="flex gap-4"><span className="text-slate-500 w-20">费用</span><span className="text-slate-800">¥{m.cost}</span></div>}
              {m.result_notes && <div className="flex gap-4"><span className="text-slate-500 w-20">结果</span><span className="text-slate-800">{m.result_notes}</span></div>}
              {m.requires_recalibration && <div className="flex gap-4"><span className="text-slate-500 w-20">重新校准</span><span className="text-amber-600 font-medium">需要</span></div>}
            </div>

            {/* 状态操作 */}
            <div className="flex gap-3 pt-4 border-t border-slate-200">
              {m.status === 'pending' && (
                <button onClick={() => startMut.mutate()} disabled={startMut.isPending}
                  className="flex min-h-11 items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                  <Play className="w-4 h-4" />开始维护
                </button>
              )}
              {m.status === 'in_progress' && (
                <button onClick={() => completeMut.mutate()} disabled={completeMut.isPending}
                  className="flex min-h-11 items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                  <CheckCircle className="w-4 h-4" />完成维护
                </button>
              )}
              {(m.status === 'pending' || m.status === 'in_progress') && (
                <button onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}
                  className="flex min-h-11 items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50">
                  <XCircle className="w-4 h-4" />取消
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
