import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { facilityApi } from '@cn-kis/api-client'
import type {
  VenueUsageScheduleItem,
  VenueUsageScheduleCreateIn,
  VenueMonitorItem,
  VenueItem,
  AccountForMonitor,
} from '@cn-kis/api-client'
import { Clock, UserPlus, Plus, Trash2, Star } from 'lucide-react'

const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const PRESET_OPTIONS = [
  { label: '每天', value: 'all', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: '工作日（周一至周五）', value: 'workdays', days: [0, 1, 2, 3, 4] },
  { label: '自定义', value: 'custom', days: [] as number[] },
]

export function EnvMonitorSettingsPage() {
  const [activeTab, setActiveTab] = useState<'schedule' | 'monitor'>('schedule')
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [showMonitorModal, setShowMonitorModal] = useState(false)
  const [venueFilter, setVenueFilter] = useState<number | ''>('')
  const [msg, setMsg] = useState('')

  const queryClient = useQueryClient()

  const { data: venuesData } = useQuery({
    queryKey: ['facility', 'venues'],
    queryFn: () => facilityApi.getVenues({ page_size: 200 }),
  })
  const venues = ((venuesData as any)?.data as { items: VenueItem[] } | undefined)?.items ?? []

  const { data: schedulesData } = useQuery({
    queryKey: ['facility', 'usage-schedules', venueFilter],
    queryFn: () =>
      facilityApi.getVenueUsageSchedules(venueFilter ? { venue_id: venueFilter } : {}),
      enabled: activeTab === 'schedule',
  })
  const schedules = ((schedulesData as any)?.data as { items: VenueUsageScheduleItem[] } | undefined)?.items ?? []

  const { data: monitorsData } = useQuery({
    queryKey: ['facility', 'venue-monitors', venueFilter],
    queryFn: () =>
      facilityApi.getVenueMonitors(venueFilter ? { venue_id: venueFilter } : {}),
    enabled: activeTab === 'monitor',
  })
  const monitors = ((monitorsData as any)?.data as { items: VenueMonitorItem[] } | undefined)?.items ?? []

  const { data: accountsData } = useQuery({
    queryKey: ['facility', 'accounts-for-monitor'],
    queryFn: () => facilityApi.getAccountsForMonitor({ page_size: 100 }),
    enabled: showMonitorModal,
  })
  const accounts = ((accountsData as any)?.data as { items: AccountForMonitor[] } | undefined)?.items ?? []

  const createScheduleMutation = useMutation({
    mutationFn: (data: { venue_id: number; schedule_type: string; days_of_week?: number[]; specific_date?: string; start_time: string; end_time: string; is_enabled: boolean }) =>
      facilityApi.createVenueUsageSchedule(data as VenueUsageScheduleCreateIn),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facility', 'usage-schedules'] })
      setShowScheduleModal(false)
      setMsg('已添加')
      setTimeout(() => setMsg(''), 1500)
    },
    onError: (e: any) => setMsg(e?.message ?? '添加失败'),
  })

  const deleteScheduleMutation = useMutation({
    mutationFn: (id: number) => facilityApi.deleteVenueUsageSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facility', 'usage-schedules'] })
      setMsg('已删除')
      setTimeout(() => setMsg(''), 1500)
    },
    onError: (e: any) => setMsg(e?.message ?? '删除失败'),
  })

  const addMonitorMutation = useMutation({
    mutationFn: (data: { venue_id: number; monitor_account_id: number; is_primary: boolean }) =>
      facilityApi.addVenueMonitor(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facility', 'venue-monitors'] })
      setShowMonitorModal(false)
      setMsg('已添加')
      setTimeout(() => setMsg(''), 1500)
    },
    onError: (e: any) => setMsg(e?.message ?? '添加失败'),
  })

  const removeMonitorMutation = useMutation({
    mutationFn: (id: number) => facilityApi.removeVenueMonitor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facility', 'venue-monitors'] })
      setMsg('已移除')
      setTimeout(() => setMsg(''), 1500)
    },
    onError: (e: any) => setMsg(e?.message ?? '移除失败'),
  })

  const setPrimaryMutation = useMutation({
    mutationFn: (id: number) => facilityApi.setVenuePrimaryMonitor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facility', 'venue-monitors'] })
      setMsg('已设为主监控人')
      setTimeout(() => setMsg(''), 1500)
    },
    onError: (e: any) => setMsg(e?.message ?? '设置失败'),
  })

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">环境监控设置</h2>
          <p className="text-sm text-slate-500 mt-1">配置房间使用时段与监控人，监控仅在使用时段内生效</p>
        </div>
      </div>

      {msg && (
        <div className="p-3 rounded-lg text-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
          {msg}
        </div>
      )}

      {/* Tab */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('schedule')}
          className={`shrink-0 min-h-11 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
            activeTab === 'schedule' ? 'bg-emerald-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-4 h-4" /> 房间使用时段
        </button>
        <button
          onClick={() => setActiveTab('monitor')}
          className={`shrink-0 min-h-11 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
            activeTab === 'monitor' ? 'bg-emerald-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'
          }`}
        >
          <UserPlus className="w-4 h-4" /> 监控人配置
        </button>
      </div>

      {/* Venue filter */}
      <div className="flex gap-3">
        <select
          value={venueFilter}
          onChange={(e) => setVenueFilter(e.target.value ? Number(e.target.value) : '')}
          className="min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">全部场地</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>{v.name}（{v.code}）</option>
          ))}
        </select>
        {activeTab === 'schedule' && (
          <button
            onClick={() => setShowScheduleModal(true)}
            className="flex min-h-11 items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" /> 添加时段
          </button>
        )}
        {activeTab === 'monitor' && (
          <button
            onClick={() => setShowMonitorModal(true)}
            className="flex min-h-11 items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
          >
            <Plus className="w-4 h-4" /> 添加监控人
          </button>
        )}
      </div>

      {/* Schedule list */}
      {activeTab === 'schedule' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">场地</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">星期/日期</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">时段</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3">{s.venue_name}</td>
                    <td className="px-4 py-3">{s.day_display}</td>
                    <td className="px-4 py-3">{s.start_time} ~ {s.end_time}</td>
                    <td className="px-4 py-3">
                      {s.is_enabled ? (
                        <span className="text-green-600 text-xs font-medium">启用</span>
                      ) : (
                        <span className="text-slate-400 text-xs">停用</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteScheduleMutation.mutate(s.id)}
                        className="text-red-600 hover:text-red-700 p-1"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {schedules.length === 0 && (
            <div className="p-8 text-center text-slate-400">
              <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>暂无使用时段配置</p>
              <p className="text-sm mt-1">添加后，监控将仅在使用时段内生效</p>
            </div>
          )}
        </div>
      )}

      {/* Monitor list */}
      {activeTab === 'monitor' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">场地</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">监控人</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">角色</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {monitors.map((m) => (
                  <tr key={m.id} className="border-b hover:bg-slate-50">
                    <td className="px-4 py-3">{m.venue_name}</td>
                    <td className="px-4 py-3">{m.monitor_display_name}</td>
                    <td className="px-4 py-3">
                      {m.is_primary ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
                          <Star className="w-3.5 h-3.5 fill-current" /> 主监控人
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">监控人</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right flex gap-2 justify-end">
                      {!m.is_primary && (
                        <button
                          onClick={() => setPrimaryMutation.mutate(m.id)}
                          className="text-amber-600 hover:text-amber-700 p-1"
                          title="设为主监控人"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => removeMonitorMutation.mutate(m.id)}
                        className="text-red-600 hover:text-red-700 p-1"
                        title="移除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {monitors.length === 0 && (
            <div className="p-8 text-center text-slate-400">
              <UserPlus className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>暂无监控人配置</p>
              <p className="text-sm mt-1">添加后，环境异常时将飞书消息通知监控人</p>
            </div>
          )}
        </div>
      )}

      {/* Schedule modal */}
      {showScheduleModal && (
        <ScheduleModal
          venues={venues}
          onClose={() => setShowScheduleModal(false)}
          onSubmit={(data) => createScheduleMutation.mutate(data)}
          isSubmitting={createScheduleMutation.isPending}
          error={createScheduleMutation.isError ? (createScheduleMutation.error as Error)?.message : ''}
        />
      )}

      {/* Monitor modal */}
      {showMonitorModal && (
        <MonitorModal
          venues={venues}
          accounts={accounts}
          monitors={monitors}
          onClose={() => setShowMonitorModal(false)}
          onSubmit={(data) => addMonitorMutation.mutate(data)}
          isSubmitting={addMonitorMutation.isPending}
          error={addMonitorMutation.isError ? (addMonitorMutation.error as Error)?.message : ''}
        />
      )}
    </div>
  )
}

function ScheduleModal({
  venues,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  venues: VenueItem[]
  onClose: () => void
  onSubmit: (data: { venue_id: number; schedule_type: string; days_of_week?: number[]; specific_date?: string; start_time: string; end_time: string; is_enabled: boolean }) => void
  isSubmitting?: boolean
  error: string
}) {
  const [form, setForm] = useState({
    venue_id: '',
    schedule_type: 'recurring' as 'recurring' | 'specific',
    preset: 'workdays' as string,
    days_of_week: [0, 1, 2, 3, 4] as number[],
    specific_date: '',
    start_time: '08:00',
    end_time: '18:00',
    is_enabled: true,
  })

  const handlePresetChange = (preset: string) => {
    const opt = PRESET_OPTIONS.find((o) => o.value === preset)
    setForm((f) => ({
      ...f,
      preset,
      days_of_week: opt?.days ?? f.days_of_week,
    }))
  }

  const toggleDay = (d: number) => {
    setForm((f) => {
      const next = f.days_of_week.includes(d)
        ? f.days_of_week.filter((x) => x !== d)
        : [...f.days_of_week, d].sort((a, b) => a - b)
      return { ...f, days_of_week: next, preset: 'custom' }
    })
  }

  const handleSubmit = () => {
    if (isSubmitting) return
    const vid = Number(form.venue_id)
    if (!vid) return
    if (form.schedule_type === 'specific') {
      if (!form.specific_date) return
      onSubmit({
        venue_id: vid,
        schedule_type: 'specific',
        specific_date: form.specific_date,
        start_time: form.start_time,
        end_time: form.end_time,
        is_enabled: form.is_enabled,
      })
    } else {
      const days = form.preset === 'custom' ? form.days_of_week : (PRESET_OPTIONS.find((o) => o.value === form.preset)?.days ?? [0, 1, 2, 3, 4])
      if (days.length === 0) return
      onSubmit({
        venue_id: vid,
        schedule_type: 'recurring',
        days_of_week: days,
        start_time: form.start_time,
        end_time: form.end_time,
        is_enabled: form.is_enabled,
      })
    }
  }

  const canSubmit =
    !isSubmitting &&
    form.venue_id &&
    (form.schedule_type === 'specific' ? form.specific_date : form.days_of_week.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-[520px] max-h-[90vh] overflow-y-auto relative z-10">
        <h3 className="text-lg font-semibold mb-4">添加使用时段</h3>
        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">场地</label>
            <select
              value={form.venue_id}
              onChange={(e) => setForm((f) => ({ ...f, venue_id: e.target.value }))}
              className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            >
              <option value="">请选择场地</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}（{v.code}）</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">类型</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="schedule_type"
                  checked={form.schedule_type === 'recurring'}
                  onChange={() => setForm((f) => ({ ...f, schedule_type: 'recurring' }))}
                  className="border-slate-300"
                />
                <span className="text-sm">按周重复</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="schedule_type"
                  checked={form.schedule_type === 'specific'}
                  onChange={() => setForm((f) => ({ ...f, schedule_type: 'specific' }))}
                  className="border-slate-300"
                />
                <span className="text-sm">指定日期</span>
              </label>
            </div>
          </div>

          {form.schedule_type === 'recurring' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">星期</label>
                <select
                  value={form.preset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  {PRESET_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {form.preset === 'custom' && (
                <div className="flex flex-wrap gap-2">
                  {DAY_NAMES.map((name, i) => (
                    <label key={i} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.days_of_week.includes(i)}
                        onChange={() => toggleDay(i)}
                        className="rounded border-slate-300"
                      />
                      <span className="text-sm">{name}</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {form.schedule_type === 'specific' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">指定日期</label>
              <input
                type="date"
                value={form.specific_date}
                onChange={(e) => setForm((f) => ({ ...f, specific_date: e.target.value }))}
                className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">开始时间</label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">结束时间</label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_enabled"
              checked={form.is_enabled}
              onChange={(e) => setForm((f) => ({ ...f, is_enabled: e.target.checked }))}
              className="rounded border-slate-300"
            />
            <label htmlFor="is_enabled" className="text-sm text-slate-700">启用监控</label>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="min-h-11 px-4 py-2 border rounded-lg text-sm">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '提交中...' : '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MonitorModal({
  venues,
  accounts,
  monitors,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  venues: VenueItem[]
  accounts: AccountForMonitor[]
  monitors: VenueMonitorItem[]
  onClose: () => void
  onSubmit: (data: { venue_id: number; monitor_account_id: number; is_primary: boolean }) => void
  isSubmitting?: boolean
  error: string
}) {
  const [form, setForm] = useState({
    venue_id: '',
    monitor_account_id: '',
    is_primary: false,
  })

  const handleSubmit = () => {
    if (isSubmitting) return
    const vid = Number(form.venue_id)
    const aid = Number(form.monitor_account_id)
    if (!vid || !aid) return
    onSubmit({
      venue_id: vid,
      monitor_account_id: aid,
      is_primary: form.is_primary,
    })
  }

  const alreadyUsed = form.venue_id && form.monitor_account_id
    ? monitors.some(
        (m) =>
          m.venue_id === Number(form.venue_id) &&
          m.monitor_account_id === Number(form.monitor_account_id)
      )
    : false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-[480px] relative z-10">
        <h3 className="text-lg font-semibold mb-4">添加监控人</h3>
        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">场地</label>
            <select
              value={form.venue_id}
              onChange={(e) => setForm((f) => ({ ...f, venue_id: e.target.value }))}
              className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            >
              <option value="">请选择场地</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}（{v.code}）</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">监控人</label>
            <select
              value={form.monitor_account_id}
              onChange={(e) => setForm((f) => ({ ...f, monitor_account_id: e.target.value }))}
              className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            >
              <option value="">请选择账号</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.display_name || a.username}（{a.username}）</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_primary"
              checked={form.is_primary}
              onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))}
              className="rounded border-slate-300"
            />
            <label htmlFor="is_primary" className="text-sm text-slate-700">设为主监控人</label>
          </div>
          {alreadyUsed && (
            <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
              该场地已配置此监控人
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="min-h-11 px-4 py-2 border rounded-lg text-sm">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !form.venue_id || !form.monitor_account_id || alreadyUsed}
            className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '提交中...' : '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}
