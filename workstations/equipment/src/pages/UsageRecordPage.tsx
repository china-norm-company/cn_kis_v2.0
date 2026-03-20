import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { equipmentApi } from '@cn-kis/api-client'
import type { UsageRecord, UsageStats } from '@cn-kis/api-client'
import { ClipboardList, Plus, X, ChevronLeft, ChevronRight, Square } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = { workorder: '工单', manual: '手动', training: '培训' }

export function UsageRecordPage() {
  const queryClient = useQueryClient()
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showRegister, setShowRegister] = useState(false)

  const { data: statsData } = useQuery({
    queryKey: ['equipment', 'usage-stats'],
    queryFn: () => equipmentApi.getUsageStats(),
  })

  const { data: listData, isLoading } = useQuery({
    queryKey: ['equipment', 'usage', { typeFilter, page }],
    queryFn: () => equipmentApi.listUsage({
      usage_type: typeFilter || undefined,
      page, page_size: 20,
    }),
  })

  const stats = (statsData as any)?.data as UsageStats | undefined
  const list = (listData as any)?.data as { items: UsageRecord[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  const endMut = useMutation({
    mutationFn: (id: number) => equipmentApi.endUsage(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['equipment'] }),
  })

  const statCards = [
    { label: '今日使用', value: stats?.today_count ?? '--', color: 'text-blue-700' },
    { label: '正在使用', value: stats?.active_now ?? '--', color: 'text-green-700' },
    { label: '30天总时长', value: stats ? `${Math.round(stats.total_duration_minutes / 60)}h` : '--', color: 'text-slate-700' },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">使用记录</h2>
          <p className="text-sm text-slate-500 mt-1">设备使用登记、使用率统计与追溯</p>
        </div>
        <button onClick={() => setShowRegister(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 transition-colors">
          <Plus className="w-4 h-4" />登记使用
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* 使用率排行 */}
      {stats?.by_equipment && stats.by_equipment.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">30天设备使用排行</h3>
          <div className="space-y-2">
            {stats.by_equipment.slice(0, 5).map((e, i) => (
              <div key={e.equipment_id} className="flex items-center gap-3 text-sm">
                <span className="text-slate-400 w-5 text-right">{i + 1}</span>
                <span className="flex-1 text-slate-800">{e.equipment_name}</span>
                <span className="text-slate-500 font-mono">{e.count} 次</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 筛选 */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }} aria-label="筛选使用类型" title="使用类型筛选" className="min-h-11 shrink-0 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500">
          <option value="">全部类型</option>
          <option value="workorder">工单关联</option>
          <option value="manual">手动登记</option>
          <option value="training">培训使用</option>
        </select>
      </div>

      {/* 使用记录表格 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无使用记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">设备</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">操作人</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">日期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">时长</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">类型</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(u => (
                <tr key={u.id} className={`border-b border-slate-100 hover:bg-slate-50 ${u.is_active ? 'bg-green-50/50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{u.equipment_name}</div>
                    <div className="text-xs text-slate-400 font-mono">{u.equipment_code}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.operator_name || `#${u.operator_id}`}</td>
                  <td className="px-4 py-3 text-slate-600">{u.usage_date}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {u.is_active ? <span className="text-green-600 font-medium">使用中</span> :
                      u.duration_minutes ? `${u.duration_minutes} 分钟` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-500">{TYPE_LABELS[u.usage_type] || u.usage_type}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.is_active && (
                      <button onClick={() => endMut.mutate(u.id)} disabled={endMut.isPending}
                        className="inline-flex min-h-9 items-center gap-1 px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 disabled:opacity-50">
                        <Square className="w-3 h-3" />结束
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

      {showRegister && <RegisterUsageModal onClose={() => setShowRegister(false)} onSuccess={() => {
        setShowRegister(false)
        queryClient.invalidateQueries({ queryKey: ['equipment'] })
      }} />}
    </div>
  )
}

function RegisterUsageModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [equipmentId, setEquipmentId] = useState('')
  const [usageType, setUsageType] = useState('manual')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const { data: eqData } = useQuery({
    queryKey: ['equipment', 'ledger', 'active'],
    queryFn: () => equipmentApi.listLedger({ status: 'active', page_size: 200 }),
  })
  const equipments = ((eqData as any)?.data?.items ?? []) as Array<{ id: number; name: string; code: string }>

  const mutation = useMutation({
    mutationFn: () => equipmentApi.registerUsage({
      equipment_id: Number(equipmentId),
      usage_type: usageType,
      notes,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '登记失败'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[92vw] max-w-[420px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">登记设备使用</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">设备 *</span>
            <select value={equipmentId} onChange={e => setEquipmentId(e.target.value)} title="选择设备" className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
              <option value="">请选择设备</option>
              {equipments.map(e => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">使用类型</span>
            <select value={usageType} onChange={e => setUsageType(e.target.value)} title="使用类型" className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
              <option value="manual">手动登记</option>
              <option value="training">培训使用</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">备注</span>
            <input value={notes} onChange={e => setNotes(e.target.value)} title="备注" className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <div className="pt-2 flex gap-3">
            <button onClick={onClose} className="min-h-11 flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
            <button onClick={() => mutation.mutate()} disabled={!equipmentId || mutation.isPending}
              className="min-h-11 flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50 transition-colors">
              {mutation.isPending ? '登记中...' : '开始使用'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
