import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { facilityApi } from '@cn-kis/api-client'
import type { ReservationItem, ReservationStats, CalendarEntry } from '@cn-kis/api-client'
import { CalendarCheck, Plus, X } from 'lucide-react'

export function ReservationPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [venueFilter, setVenueFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [createMsg, setCreateMsg] = useState('')

  const [form, setForm] = useState({ venue_id: '', purpose: '', project_name: '', start_time: '', end_time: '' })

  const { data: statsData } = useQuery({
    queryKey: ['facility', 'reservation-stats'],
    queryFn: () => facilityApi.getReservationStats(),
  })
  const stats = (statsData as any)?.data as ReservationStats | undefined

  const { data: listData } = useQuery({
    queryKey: ['facility', 'reservations', { statusFilter, venueFilter }],
    queryFn: () => facilityApi.getReservations({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(venueFilter ? { venue_id: venueFilter } : {}),
    }),
  })
  const items = ((listData as any)?.data as { items: ReservationItem[] } | undefined)?.items ?? []

  const { data: calendarData } = useQuery({
    queryKey: ['facility', 'calendar'],
    queryFn: () => facilityApi.getCalendar(),
    enabled: viewMode === 'calendar',
  })
  const calendarEntries = ((calendarData as any)?.data as { entries: CalendarEntry[] } | undefined)?.entries ?? []

  const statCards = [
    { key: 'today', label: '今日预约', value: stats?.today_count ?? '--', color: 'text-blue-600' },
    { key: 'week', label: '本周预约', value: stats?.week_count ?? '--', color: 'text-green-600' },
    { key: 'pending', label: '待确认', value: stats?.pending_count ?? '--', color: 'text-amber-600' },
    { key: 'utilization', label: '场地利用率', value: stats ? `${stats.utilization_rate}%` : '--', color: 'text-emerald-600' },
  ]

  const statusBadge = (status: string, display: string) => {
    const cls: Record<string, string> = {
      confirmed: 'bg-green-50 text-green-600',
      pending: 'bg-amber-50 text-amber-600',
      in_use: 'bg-blue-50 text-blue-600',
      completed: 'bg-slate-100 text-slate-600',
      cancelled: 'bg-red-50 text-red-600',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[status] || 'bg-slate-100'}`}>{display}</span>
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  async function handleConfirm(id: number) {
    await facilityApi.confirmReservation(id)
    setCreateMsg('预约已确认')
    setTimeout(() => setCreateMsg(''), 2000)
  }

  async function handleCancel(id: number) {
    await facilityApi.cancelReservation(id)
    setCreateMsg('预约已取消')
    setTimeout(() => setCreateMsg(''), 2000)
  }

  async function handleCreate() {
    try {
      await facilityApi.createReservation({ venue_id: Number(form.venue_id), start_time: form.start_time, end_time: form.end_time, purpose: form.purpose, project_name: form.project_name })
      setCreateMsg('预约创建成功')
      setTimeout(() => { setShowCreate(false); setCreateMsg('') }, 1500)
    } catch { setCreateMsg('创建失败') }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">场地预约</h2>
          <p className="text-sm text-slate-500 mt-1">测试室资源调度与预约审批</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button title="切换视图" onClick={() => setViewMode(v => v === 'list' ? 'calendar' : 'list')} className="min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            {viewMode === 'list' ? '日历视图' : '列表视图'}
          </button>
          <button title="新建预约" onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
            <Plus className="w-4 h-4" />新建预约
          </button>
        </div>
      </div>

      {createMsg && <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm">{createMsg}</div>}

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
        <select title="状态筛选" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm">
          <option value="">全部状态</option>
          <option value="pending">待确认</option>
          <option value="confirmed">已确认</option>
          <option value="in_use">进行中</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select>
        <select title="场地筛选" value={venueFilter} onChange={e => setVenueFilter(e.target.value)} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm">
          <option value="">全部场地</option>
          <option value="1">恒温恒湿测试室 A</option>
          <option value="2">恒温恒湿测试室 B</option>
          <option value="3">受试者等候区</option>
          <option value="5">仪器存放室</option>
          <option value="6">样品存储区</option>
        </select>
      </div>

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <div className="calendar-view bg-white rounded-xl border border-slate-200 p-6" data-view="calendar">
          <h3 className="text-sm font-medium text-slate-700 mb-4">日历视图</h3>
          <div className="space-y-2">
            {calendarEntries.slice(0, 10).map(entry => (
              <div key={entry.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg text-sm">
                <span className="font-medium w-40 truncate">{entry.venue_name}</span>
                <span className="text-slate-500">{formatTime(entry.start_time)} — {formatTime(entry.end_time)}</span>
                <span className="flex-1 truncate">{entry.purpose}</span>
                {statusBadge(entry.status, entry.status)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-slate-600">场地</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">时间</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">用途</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">预约人</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(r => (
                <tr key={r.id} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-3">{r.venue_name}</td>
                  <td className="px-4 py-3 text-slate-500">{formatTime(r.start_time)} — {formatTime(r.end_time)}</td>
                  <td className="px-4 py-3">{r.purpose}</td>
                  <td className="px-4 py-3">{r.reserved_by_name}</td>
                  <td className="px-4 py-3">{statusBadge(r.status, r.status_display)}</td>
                  <td className="px-4 py-3">
                    {r.status === 'pending' && (
                      <div className="flex gap-2">
                        <button title="确认预约" onClick={() => handleConfirm(r.id)} className="min-h-9 px-2 py-1 text-emerald-600 hover:underline text-xs">确认</button>
                        <button title="取消预约" onClick={() => handleCancel(r.id)} className="min-h-9 px-2 py-1 text-red-600 hover:underline text-xs">取消</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400"><CalendarCheck className="w-10 h-10 mx-auto mb-2 opacity-50" />暂无预约数据</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setShowCreate(false); setCreateMsg('') }} />
          <div className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-[500px] max-h-[90vh] overflow-y-auto relative z-10">
            <h3 className="text-lg font-semibold mb-4">新建预约</h3>
            {createMsg && <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm">{createMsg}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">场地</label><select title="场地" aria-label="场地" value={form.venue_id} onChange={e => setForm(p => ({ ...p, venue_id: e.target.value }))} className="w-full min-h-11 px-3 py-2 border rounded-lg text-sm"><option value="">选择场地</option><option value="1">恒温恒湿测试室 A</option><option value="2">恒温恒湿测试室 B</option></select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">用途</label><input type="text" title="用途" aria-label="用途" value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} className="w-full min-h-11 px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">项目</label><input type="text" title="项目" aria-label="项目" value={form.project_name} onChange={e => setForm(p => ({ ...p, project_name: e.target.value }))} className="w-full min-h-11 px-3 py-2 border rounded-lg text-sm" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button title="取消新建预约" onClick={() => { setShowCreate(false); setCreateMsg('') }} className="min-h-11 px-4 py-2 border rounded-lg text-sm">取消</button>
              <button title="确认新建预约" onClick={handleCreate} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
