import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { facilityApi } from '@cn-kis/api-client'
import type { CleaningItem, CleaningStats } from '@cn-kis/api-client'
import { SprayCan, Plus } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

export function CleaningRecordPage() {
  const queryClient = useQueryClient()
  const [typeFilter, setTypeFilter] = useState('')
  const [venueFilter, setVenueFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createMsg, setCreateMsg] = useState('')

  const [form, setForm] = useState({ venue_id: '', cleaning_type: '', cleaner_name: '', cleaning_agents: '' })

  const { data: statsData } = useQuery({
    queryKey: ['facility', 'cleaning-stats'],
    queryFn: () => facilityApi.getCleaningStats(),
  })
  const stats = (statsData as any)?.data as CleaningStats | undefined

  const { data: listData } = useQuery({
    queryKey: ['facility', 'cleaning', { typeFilter, venueFilter, statusFilter }],
    queryFn: () => facilityApi.getCleaningRecords({
      ...(typeFilter ? { cleaning_type: typeFilter } : {}),
      ...(venueFilter ? { venue_id: venueFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    }),
  })
  const items = ((listData as any)?.data as { items: CleaningItem[] } | undefined)?.items ?? []

  const statCards = [
    { key: 'month_count', label: '本月清洁', value: stats?.month_count ?? '--', color: 'text-blue-600' },
    { key: 'execution_rate', label: '执行率(%)', value: stats?.execution_rate ?? '--', color: 'text-emerald-600' },
    { key: 'today_pending', label: '今日待清洁', value: stats?.today_pending ?? '--', color: 'text-amber-600' },
    { key: 'deep_pending', label: '深度清洁待执行', value: stats?.deep_pending ?? '--', color: 'text-red-600' },
  ]

  const statusBadge = (status: string, display: string) => {
    const cls: Record<string, string> = {
      pending: 'bg-amber-50 text-amber-600',
      completed: 'bg-blue-50 text-blue-600',
      verified: 'bg-green-50 text-green-600',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[status] || 'bg-slate-100'}`}>{display}</span>
  }

  const typeBadge = (type: string, display: string) => {
    const cls: Record<string, string> = {
      daily: 'bg-blue-50 text-blue-600',
      between: 'bg-purple-50 text-purple-600',
      deep: 'bg-orange-50 text-orange-600',
      special: 'bg-red-50 text-red-600',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[type] || 'bg-slate-100'}`}>{display}</span>
  }

  const createMutation = useMutation({
    mutationFn: async () => facilityApi.createCleaningRecord({
      venue_id: Number(form.venue_id),
      cleaning_type: form.cleaning_type,
      cleaner_name: form.cleaner_name,
      cleaning_agents: form.cleaning_agents,
    }),
    onSuccess: async () => {
      setCreateMsg('清洁记录已创建')
      await queryClient.invalidateQueries({ queryKey: ['facility', 'cleaning'] })
      await queryClient.invalidateQueries({ queryKey: ['facility', 'cleaning-stats'] })
      setTimeout(() => { setShowCreate(false); setCreateMsg('') }, 1200)
    },
    onError: () => setCreateMsg('创建失败'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      facilityApi.updateCleaningRecord(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['facility', 'cleaning'] })
      await queryClient.invalidateQueries({ queryKey: ['facility', 'cleaning-stats'] })
    },
  })

  async function handleCreate() {
    createMutation.mutate()
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">清洁记录</h2>
          <p className="text-sm text-slate-500 mt-1">测试区域清洁计划执行与验证记录</p>
        </div>
        <PermissionGuard permission="facility.cleaning.create">
          <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
            <Plus className="w-4 h-4" />新增清洁记录
          </button>
        </PermissionGuard>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {statCards.map(s => (
          <div key={s.key} className="bg-white rounded-xl border border-slate-200 p-4" data-stat={s.key}>
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <select aria-label="筛选清洁类型" title="清洁类型筛选" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm">
          <option value="">全部类型</option>
          <option value="daily">日常清洁</option>
          <option value="between">场次间清洁</option>
          <option value="deep">深度清洁</option>
          <option value="special">特殊清洁</option>
        </select>
        <select aria-label="筛选场地" title="场地筛选" value={venueFilter} onChange={e => setVenueFilter(e.target.value)} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm">
          <option value="">全部场地</option>
          <option value="1">恒温恒湿测试室 A</option>
          <option value="2">恒温恒湿测试室 B</option>
          <option value="3">受试者等候区</option>
          <option value="4">受试者洗漱区</option>
          <option value="6">样品存储区</option>
        </select>
        <select aria-label="筛选清洁状态" title="清洁状态筛选" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm">
          <option value="">全部状态</option>
          <option value="pending">待执行</option>
          <option value="completed">已完成</option>
          <option value="verified">已验证</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="bg-slate-50 border-b">
              <th className="text-left px-4 py-3 font-medium text-slate-600">场地</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">类型</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">清洁人员</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">验证人</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">清洁剂</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">日期</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map(c => (
              <tr key={c.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-3">{c.venue_name}</td>
                <td className="px-4 py-3">{typeBadge(c.cleaning_type, c.type_display)}</td>
                <td className="px-4 py-3">{c.cleaner_name || '-'}</td>
                <td className="px-4 py-3">{c.verifier_name || '-'}</td>
                <td className="px-4 py-3 text-xs text-slate-500 max-w-[150px] truncate">{c.cleaning_agents || '-'}</td>
                <td className="px-4 py-3">{statusBadge(c.status, c.status_display)}</td>
                <td className="px-4 py-3 text-slate-500">{c.cleaning_date}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {c.status === 'pending' && (
                      <button
                        onClick={() => updateMutation.mutate({ id: c.id, data: { status: 'completed' } })}
                        className="min-h-9 px-2 py-1 text-xs rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
                      >
                        标记完成
                      </button>
                    )}
                    {c.status === 'completed' && (
                      <button
                        onClick={() => updateMutation.mutate({ id: c.id, data: { status: 'verified', env_confirmed: true } })}
                        className="min-h-9 px-2 py-1 text-xs rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      >
                        验证并释放
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400"><SprayCan className="w-10 h-10 mx-auto mb-2 opacity-50" />暂无清洁记录</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setShowCreate(false); setCreateMsg('') }} />
          <div className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-[500px] max-h-[90vh] overflow-y-auto relative z-10">
            <h3 className="text-lg font-semibold mb-4">新增清洁记录</h3>
            {createMsg && <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm">{createMsg}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">场地</label><select aria-label="场地" title="选择场地" value={form.venue_id} onChange={e => setForm(p => ({ ...p, venue_id: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm"><option value="">选择场地</option><option value="1">恒温恒湿测试室 A</option><option value="2">恒温恒湿测试室 B</option><option value="3">受试者等候区</option></select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">类型</label><select aria-label="类型" title="清洁类型" value={form.cleaning_type} onChange={e => setForm(p => ({ ...p, cleaning_type: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm"><option value="">选择类型</option><option value="daily">日常清洁</option><option value="between">场次间清洁</option><option value="deep">深度清洁</option><option value="special">特殊清洁</option></select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">清洁人员</label><input type="text" aria-label="清洁人员" title="清洁人员" value={form.cleaner_name} onChange={e => setForm(p => ({ ...p, cleaner_name: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowCreate(false); setCreateMsg('') }} className="min-h-11 px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={handleCreate} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
