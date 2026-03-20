import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { labPersonnelApi } from '@cn-kis/api-client'
import type { WorkTimeLogItem, WorkTimeSummaryItem, UtilizationAnalysis, CapacityForecast } from '@cn-kis/api-client'
import { Clock, Plus, TrendingUp, AlertTriangle, BarChart3, X, Download } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { WorktimeBarChart, CapacityCompareChart } from '../components/WorktimeCharts'

export function WorktimePage() {
  const [activeTab, setActiveTab] = useState<'logs' | 'summary' | 'utilization' | 'forecast'>('logs')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ staff_id: '', work_date: '', start_time: '09:00', end_time: '18:00', actual_hours: '8', description: '' })
  const [createMsg, setCreateMsg] = useState('')

  const { data: logData } = useQuery({
    queryKey: ['lab-personnel', 'worktime-logs'],
    queryFn: () => labPersonnelApi.getWorktimeLogs({}),
  })
  const logs = ((logData as any)?.data as { items: WorkTimeLogItem[] } | undefined)?.items ?? []

  const { data: summaryData } = useQuery({
    queryKey: ['lab-personnel', 'worktime-summary'],
    queryFn: () => labPersonnelApi.getWorktimeSummary({}),
  })
  const summaries = ((summaryData as any)?.data as { items: WorkTimeSummaryItem[] } | undefined)?.items ?? []

  const { data: utilData } = useQuery({
    queryKey: ['lab-personnel', 'utilization'],
    queryFn: () => labPersonnelApi.getUtilization(),
  })
  const utilization = (utilData as any)?.data as UtilizationAnalysis | undefined

  const { data: forecastData } = useQuery({
    queryKey: ['lab-personnel', 'capacity-forecast'],
    queryFn: () => labPersonnelApi.getCapacityForecast(4),
  })
  const forecast = (forecastData as any)?.data as CapacityForecast | undefined

  const utilizationColor = (rate: number) => {
    if (rate > 0.9) return 'text-red-600 bg-red-50'
    if (rate >= 0.75) return 'text-green-600 bg-green-50'
    return 'text-blue-600 bg-blue-50'
  }

  const statCards = [
    { key: 'total_logs', label: '工时记录', value: logs.length, color: 'text-blue-600', icon: Clock },
    { key: 'avg_util', label: '平均利用率', value: utilization?.avg_utilization != null ? `${(utilization.avg_utilization * 100).toFixed(0)}%` : '--', color: 'text-green-600', icon: TrendingUp },
    { key: 'overloaded', label: '超负荷人员', value: utilization?.staff?.filter(s => s.status === 'overloaded').length ?? '--', color: 'text-red-600', icon: AlertTriangle },
    { key: 'forecasts', label: '未来预测周', value: forecast?.weeks?.length ?? '--', color: 'text-violet-600', icon: BarChart3 },
  ]

  async function handleCreate() {
    try {
      await labPersonnelApi.createWorktimeLog({
        staff_id: Number(createForm.staff_id),
        work_date: createForm.work_date,
        start_time: createForm.start_time,
        end_time: createForm.end_time,
        actual_hours: Number(createForm.actual_hours),
        description: createForm.description,
      })
      setCreateMsg('工时记录已创建')
      setTimeout(() => { setShowCreate(false); setCreateMsg('') }, 1500)
    } catch { setCreateMsg('创建失败') }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">工时统计</h2>
          <p className="text-sm text-slate-500 mt-1">实际工时记录、利用率分析、负荷均衡与产能预测</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => window.open('/api/v1/lab-personnel/export/worktime', '_blank')}
            className="flex min-h-11 items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" />导出 Excel
          </button>
          <PermissionGuard permission="lab-personnel.worktime.create">
            <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors">
              <Plus className="w-4 h-4" />录入工时
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {statCards.map(s => (
          <div key={s.key} className="bg-white rounded-xl border border-slate-200 p-4" data-stat={s.key}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{s.label}</p>
              <s.icon className={`w-5 h-5 ${s.color} opacity-60`} />
            </div>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 md:gap-4">
        <WorktimeBarChart summaries={summaries} />
        <CapacityCompareChart forecast={forecast} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto bg-slate-100 rounded-lg p-1 w-full sm:w-fit">
        {[
          { key: 'logs' as const, label: '工时明细' },
          { key: 'summary' as const, label: '周汇总' },
          { key: 'utilization' as const, label: '利用率' },
          { key: 'forecast' as const, label: '产能预测' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 min-h-11 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            data-tab={tab.key}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Logs Table */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl border border-slate-200" data-section="logs">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">人员</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">日期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">时段</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">实际工时</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">来源</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">描述</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{log.staff_name}</td>
                  <td className="px-4 py-3 text-slate-600">{log.work_date}</td>
                  <td className="px-4 py-3 text-slate-600">{log.start_time}{log.end_time ? ` - ${log.end_time}` : ''}</td>
                  <td className="px-4 py-3 text-slate-800 font-medium">{log.actual_hours}h</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">{log.source_display}</span></td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{log.description || '-'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">暂无工时记录</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Summary Table */}
      {activeTab === 'summary' && (
        <div className="bg-white rounded-xl border border-slate-200" data-section="summary">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">人员</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">周起始</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">总工时</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">工单</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">培训</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">其他</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">利用率</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(s => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{s.staff_name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.week_start_date}</td>
                  <td className="px-4 py-3 text-right font-medium">{s.total_hours}h</td>
                  <td className="px-4 py-3 text-right text-slate-600">{s.workorder_hours}h</td>
                  <td className="px-4 py-3 text-right text-slate-600">{s.training_hours}h</td>
                  <td className="px-4 py-3 text-right text-slate-600">{s.other_hours}h</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${utilizationColor(s.utilization_rate)}`}>
                      {(s.utilization_rate * 100).toFixed(0)}%
                    </span>
                  </td>
                </tr>
              ))}
              {summaries.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">暂无汇总数据</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Utilization */}
      {activeTab === 'utilization' && (
        <div className="space-y-3" data-section="utilization">
          {utilization?.staff?.map(s => (
            <div key={s.staff_id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-slate-800">{s.staff_name}</span>
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${utilizationColor(s.utilization_rate)}`}>
                  {(s.utilization_rate * 100).toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  title={`利用率 ${(s.utilization_rate * 100).toFixed(0)}%`}
                  className={`h-2 rounded-full ${s.status === 'overloaded' ? 'bg-red-500' : s.status === 'normal' ? 'bg-green-500' : 'bg-blue-400'}`}
                  style={{ width: `${Math.min(s.utilization_rate * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">{s.total_hours}h / {s.available_hours}h 可用</p>
            </div>
          )) ?? <div className="text-center text-slate-400 py-8">暂无利用率数据</div>}
        </div>
      )}

      {/* Forecast */}
      {activeTab === 'forecast' && (
        <div className="space-y-3" data-section="forecast">
          {forecast?.weeks?.map((w, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-slate-800">{w.week_start}</span>
                <span className={`text-sm font-bold ${w.gap > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {w.gap > 0 ? `缺口 ${w.gap}h` : '充足'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-500">可用工时</p><p className="font-semibold">{w.available_hours}h</p></div>
                <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-500">预估需求</p><p className="font-semibold">{w.projected_demand}h</p></div>
              </div>
              {w.bottleneck_methods && w.bottleneck_methods.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {w.bottleneck_methods.map(m => (
                    <span key={m} className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs">{m}</span>
                  ))}
                </div>
              )}
            </div>
          )) ?? <div className="text-center text-slate-400 py-8">暂无产能预测数据</div>}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setShowCreate(false); setCreateMsg('') }} />
          <div className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-[500px] max-h-[90vh] overflow-y-auto relative z-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">录入工时</h3>
              <button title="关闭录入" onClick={() => { setShowCreate(false); setCreateMsg('') }}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            {createMsg && <div className="mb-4 p-3 bg-violet-50 text-violet-700 rounded-lg text-sm">{createMsg}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">日期</label><input type="date" title="工作日期" aria-label="工作日期" value={createForm.work_date} onChange={e => setCreateForm(p => ({ ...p, work_date: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">开始</label><input type="time" title="开始时间" aria-label="开始时间" value={createForm.start_time} onChange={e => setCreateForm(p => ({ ...p, start_time: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">结束</label><input type="time" title="结束时间" aria-label="结束时间" value={createForm.end_time} onChange={e => setCreateForm(p => ({ ...p, end_time: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">实际工时 (h)</label><input type="number" title="实际工时" aria-label="实际工时" value={createForm.actual_hours} onChange={e => setCreateForm(p => ({ ...p, actual_hours: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">描述</label><input type="text" title="工时描述" aria-label="描述" value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowCreate(false); setCreateMsg('') }} className="min-h-11 px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={handleCreate} className="min-h-11 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
