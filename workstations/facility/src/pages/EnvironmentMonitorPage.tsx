import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { facilityApi } from '@cn-kis/api-client'
import type { EnvironmentReading, EnvironmentLog, ComplianceStats } from '@cn-kis/api-client'
import { Link } from 'react-router-dom'
import { Thermometer, Plus, Settings } from 'lucide-react'
import { MaterialIsolationAlert } from '../components/MaterialIsolationAlert'

export function EnvironmentMonitorPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'logs'>('overview')
  const [venueFilter, setVenueFilter] = useState('')
  const [complianceFilter, setComplianceFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createMsg, setCreateMsg] = useState('')

  const [form, setForm] = useState({ venue_id: '', temperature: '', humidity: '' })

  const { data: venuesData } = useQuery({
    queryKey: ['facility', 'venues'],
    queryFn: () => facilityApi.getVenues({ page_size: 200 }),
  })
  const venues = ((venuesData as any)?.data as { items: { id: number; name: string; code: string }[] } | undefined)?.items ?? []

  const { data: compData } = useQuery({
    queryKey: ['facility', 'compliance'],
    queryFn: () => facilityApi.getComplianceStats(),
  })
  const compliance = (compData as any)?.data as ComplianceStats | undefined

  const { data: currentData } = useQuery({
    queryKey: ['facility', 'env-current'],
    queryFn: () => facilityApi.getCurrentEnvironment(),
  })
  const readings = ((currentData as any)?.data as { readings: EnvironmentReading[] } | undefined)?.readings ?? []

  const { data: logsData } = useQuery({
    queryKey: ['facility', 'env-logs', { venueFilter, complianceFilter }],
    queryFn: () => facilityApi.getEnvironmentLogs({
      ...(venueFilter ? { venue_id: venueFilter } : {}),
      ...(complianceFilter ? { is_compliant: complianceFilter } : {}),
    }),
    enabled: activeTab === 'logs',
  })
  const logs = ((logsData as any)?.data as { items: EnvironmentLog[] } | undefined)?.items ?? []

  const statCards = [
    { key: 'compliance_rate', label: '合规率', value: compliance ? `${compliance.overall_rate}%` : '--', color: 'text-emerald-600' },
    { key: 'non_compliant', label: '不合规次数', value: compliance?.non_compliant_count ?? '--', color: 'text-red-600' },
    { key: 'sensor_online', label: '传感器在线率', value: compliance ? `${compliance.sensor_online_rate}%` : '--', color: 'text-blue-600' },
  ]

  function formatTime(iso: string) {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  async function handleCreate() {
    try {
      await facilityApi.createEnvironmentLog({ venue_id: Number(form.venue_id), temperature: Number(form.temperature), humidity: Number(form.humidity) })
      setCreateMsg('记录已创建')
      setTimeout(() => { setShowCreate(false); setCreateMsg('') }, 1500)
    } catch { setCreateMsg('创建失败') }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">环境监控</h2>
          <p className="text-sm text-slate-500 mt-1">实时温湿度监控与合规性管理</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/environment/settings"
            className="flex min-h-11 items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <Settings className="w-4 h-4" /> 监控设置
          </Link>
          <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
            <Plus className="w-4 h-4" />录入记录
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
        {statCards.map(s => (
          <div key={s.key} className="bg-white rounded-xl border border-slate-200 p-4" data-stat={s.key}>
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tab Switch */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button title="查看实时概览" onClick={() => setActiveTab('overview')} className={`shrink-0 min-h-11 px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'overview' ? 'bg-emerald-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>实时概览</button>
        <button title="查看历史记录" onClick={() => setActiveTab('logs')} className={`shrink-0 min-h-11 px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'logs' ? 'bg-emerald-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50'}`}>历史记录</button>
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* M4 跨工作台：温度异常时展示物料隔离建议 */}
          {readings.filter(r => !r.is_compliant).map(r => (
            <MaterialIsolationAlert
              key={`alert-${r.venue_id}`}
              locationCode={r.venue_name || String(r.venue_id)}
              currentTemperature={r.temperature}
              upperLimit={(r.target_temp ?? 25) + (r.temp_tolerance ?? 2)}
              lowerLimit={(r.target_temp ?? 25) - (r.temp_tolerance ?? 2)}
            />
          ))}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
          {readings.map(r => (
            <div key={r.venue_id} className={`env-card reading-card bg-white rounded-xl border p-4 ${r.is_compliant ? 'border-slate-200' : 'border-red-300'}`}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-medium text-slate-800">{r.venue_name}</h3>
                {r.is_compliant
                  ? <span className="bg-green-50 text-green-600 badge-success px-2 py-0.5 rounded text-xs font-medium" data-compliant="true">合规</span>
                  : <span className="bg-red-50 text-red-600 badge-danger px-2 py-0.5 rounded text-xs font-medium" data-compliant="false">不合规</span>
                }
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500">温度</p>
                  <p className={`text-xl font-bold ${!r.is_compliant ? 'text-red-600' : 'text-slate-800'}`}>{r.temperature}°C</p>
                  <p className="text-xs text-slate-400">目标 {r.target_temp}±{r.temp_tolerance}°C</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">湿度</p>
                  <p className={`text-xl font-bold ${!r.is_compliant ? 'text-red-600' : 'text-slate-800'}`}>{r.humidity}%</p>
                  <p className="text-xs text-slate-400">目标 {r.target_humidity}±{r.humidity_tolerance}%</p>
                </div>
              </div>
            </div>
          ))}
          {readings.length === 0 && (
            <div className="col-span-full bg-white rounded-xl border p-8 text-center text-slate-400">
              <Thermometer className="w-10 h-10 mx-auto mb-2 opacity-50" />暂无实时数据
            </div>
          )}
        </div>
        </div>
      )}

      {/* Logs */}
      {activeTab === 'logs' && (
        <>
          <div className="flex gap-3 overflow-x-auto pb-1">
            <select title="场地筛选" value={venueFilter} onChange={e => setVenueFilter(e.target.value)} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="">全部场地</option>
              {venues.map(v => (
                <option key={v.id} value={v.id}>{v.name}（{v.code}）</option>
              ))}
            </select>
            <select title="合规筛选" value={complianceFilter} onChange={e => setComplianceFilter(e.target.value)} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option value="">合规状态</option>
              <option value="true">合规</option>
              <option value="false">不合规</option>
            </select>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">场地</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">温度</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">湿度</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">合规</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">记录人</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">时间</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} className={`border-b ${!l.is_compliant ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                    <td className="px-4 py-3">{l.venue_name}</td>
                    <td className="px-4 py-3">{l.temperature}°C</td>
                    <td className="px-4 py-3">{l.humidity}%</td>
                    <td className="px-4 py-3">
                      {l.is_compliant
                        ? <span className="text-green-600 text-xs font-medium">合规</span>
                        : <span className="text-red-600 text-xs font-medium">{l.non_compliance_reason || '不合规'}</span>
                      }
                    </td>
                    <td className="px-4 py-3">{l.recorder_name}</td>
                    <td className="px-4 py-3 text-slate-500">{formatTime(l.recorded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setShowCreate(false); setCreateMsg('') }} />
          <div className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-[500px] max-h-[90vh] overflow-y-auto relative z-10">
            <h3 className="text-lg font-semibold mb-4">新增环境记录</h3>
            {createMsg && <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm">{createMsg}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">场地</label><select aria-label="场地" title="选择场地" value={form.venue_id} onChange={e => setForm(p => ({ ...p, venue_id: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm"><option value="">选择场地</option>{venues.map(v => (<option key={v.id} value={v.id}>{v.name}（{v.code}）</option>))}</select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">温度 (°C)</label><input type="number" aria-label="温度" title="温度" step="0.1" value={form.temperature} onChange={e => setForm(p => ({ ...p, temperature: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">湿度 (%)</label><input type="number" aria-label="湿度" title="湿度" step="0.1" value={form.humidity} onChange={e => setForm(p => ({ ...p, humidity: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" /></div>
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
