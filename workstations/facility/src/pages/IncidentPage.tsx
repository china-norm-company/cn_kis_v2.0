import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { facilityApi } from '@cn-kis/api-client'
import type { IncidentItem, IncidentDetail, IncidentStats } from '@cn-kis/api-client'
import { AlertOctagon, Plus, X } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

export function IncidentPage() {
  const [severityFilter, setSeverityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [createMsg, setCreateMsg] = useState('')
  const [actionMsg, setActionMsg] = useState('')

  const [form, setForm] = useState({ title: '', venue_id: '', severity: '', description: '' })

  const { data: statsData } = useQuery({
    queryKey: ['facility', 'incident-stats'],
    queryFn: () => facilityApi.getIncidentStats(),
  })
  const stats = (statsData as any)?.data as IncidentStats | undefined

  const { data: listData, refetch } = useQuery({
    queryKey: ['facility', 'incidents', { severityFilter, statusFilter }],
    queryFn: () => facilityApi.getIncidents({
      ...(severityFilter ? { severity: severityFilter } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    }),
  })
  const items = ((listData as any)?.data as { items: IncidentItem[] } | undefined)?.items ?? []

  const { data: detailData } = useQuery({
    queryKey: ['facility', 'incident-detail', detailId],
    queryFn: () => facilityApi.getIncidentDetail(detailId!),
    enabled: detailId !== null,
  })
  const detail = (detailData as any)?.data as IncidentDetail | undefined

  const statCards = [
    { key: 'open', label: '未关闭', value: stats?.open_count ?? '--', color: 'text-red-600' },
    { key: 'month_new', label: '本月新增', value: stats?.month_new ?? '--', color: 'text-amber-600' },
    { key: 'avg_response', label: '平均响应(分)', value: stats?.avg_response_minutes ?? '--', color: 'text-blue-600' },
    { key: 'closure_rate', label: '关闭率(%)', value: stats?.closure_rate ?? '--', color: 'text-emerald-600' },
  ]

  const severityBadge = (severity: string, display: string) => {
    const cls: Record<string, string> = {
      minor: 'bg-yellow-50 text-yellow-600',
      major: 'bg-orange-50 text-orange-600',
      critical: 'bg-red-50 text-red-600',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[severity] || 'bg-slate-100'}`}>{display}</span>
  }

  const statusBadge = (status: string, display: string) => {
    const cls: Record<string, string> = {
      open: 'bg-red-50 text-red-600',
      investigating: 'bg-blue-50 text-blue-600',
      corrected: 'bg-amber-50 text-amber-600',
      closed: 'bg-green-50 text-green-600',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[status] || 'bg-slate-100'}`}>{display}</span>
  }

  async function handleCreate() {
    try {
      await facilityApi.createIncident({ title: form.title, venue_id: Number(form.venue_id), severity: form.severity, description: form.description })
      setCreateMsg('事件已创建')
      setTimeout(() => { setShowCreate(false); setCreateMsg('') }, 1500)
      refetch()
    } catch { setCreateMsg('创建失败') }
  }

  async function handleUpdateStatus(id: number, newStatus: string) {
    try {
      await facilityApi.updateIncident(id, { status: newStatus })
      setActionMsg('更新成功')
      setTimeout(() => setActionMsg(''), 2000)
      refetch()
    } catch { setActionMsg('更新失败') }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">不合规事件</h2>
          <p className="text-sm text-slate-500 mt-1">环境偏差记录、影响评估、纠正与预防措施</p>
        </div>
        <PermissionGuard permission="facility.incident.create">
          <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
            <Plus className="w-4 h-4" />创建事件
          </button>
        </PermissionGuard>
      </div>

      {actionMsg && <div className="p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm">{actionMsg}</div>}

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
        <select title="严重级别筛选" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm">
          <option value="">全部严重级别</option>
          <option value="minor">轻微</option>
          <option value="major">一般</option>
          <option value="critical">严重</option>
        </select>
        <select title="状态筛选" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm">
          <option value="">全部状态</option>
          <option value="open">待处理</option>
          <option value="investigating">调查中</option>
          <option value="corrected">已纠正</option>
          <option value="closed">已关闭</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="bg-slate-50 border-b">
              <th className="text-left px-4 py-3 font-medium text-slate-600">事件编号</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">标题</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">场地</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">严重级别</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => setDetailId(i.id)}>
                <td className="px-4 py-3 font-mono text-xs">{i.incident_no}</td>
                <td className="px-4 py-3">{i.title}</td>
                <td className="px-4 py-3 text-slate-500">{i.venue_name}</td>
                <td className="px-4 py-3">{severityBadge(i.severity, i.severity_display)}</td>
                <td className="px-4 py-3">{statusBadge(i.status, i.status_display)}</td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  {i.status === 'open' && (
                    <button onClick={() => handleUpdateStatus(i.id, 'investigating')} className="min-h-9 px-2 py-1 text-blue-600 hover:underline text-xs">开始调查</button>
                  )}
                  {i.status === 'investigating' && (
                    <button onClick={() => handleUpdateStatus(i.id, 'corrected')} className="min-h-9 px-2 py-1 text-amber-600 hover:underline text-xs">标记已纠正</button>
                  )}
                  {i.status === 'corrected' && (
                    <button onClick={() => handleUpdateStatus(i.id, 'closed')} className="min-h-9 px-2 py-1 text-green-600 hover:underline text-xs">关闭事件</button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400"><AlertOctagon className="w-10 h-10 mx-auto mb-2 opacity-50" />暂无事件数据</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Detail Drawer */}
      {detailId !== null && detail && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/30" onClick={() => setDetailId(null)} />
          <div className="ml-auto w-[92vw] max-w-[600px] bg-white h-full overflow-auto shadow-xl relative z-10">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">事件详情</h3>
              <button title="关闭详情" onClick={() => setDetailId(null)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-sm text-slate-500">{detail.incident_no}</span>
                  {severityBadge(detail.severity, detail.severity_display)}
                  {statusBadge(detail.status, detail.status_display)}
                </div>
                <h4 className="text-lg font-medium text-slate-800">{detail.title}</h4>
                <p className="text-sm text-slate-600 mt-2">{detail.description}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-slate-500 text-xs mb-1">偏离参数</p>
                  <p className="font-medium">{detail.deviation_param}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-slate-500 text-xs mb-1">偏离时长</p>
                  <p className="font-medium">{detail.deviation_duration}</p>
                </div>
              </div>
              <div>
                <h5 className="text-sm font-medium text-slate-700 mb-2">影响评估</h5>
                <p className="text-sm text-slate-600 bg-red-50 rounded-lg p-3">{detail.affected_tests}</p>
              </div>
              {detail.root_cause && (
                <div>
                  <h5 className="text-sm font-medium text-slate-700 mb-2">根因分析</h5>
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{detail.root_cause}</p>
                </div>
              )}
              {detail.corrective_action && (
                <div>
                  <h5 className="text-sm font-medium text-slate-700 mb-2">纠正措施</h5>
                  <p className="text-sm text-slate-600 bg-emerald-50 rounded-lg p-3">{detail.corrective_action}</p>
                </div>
              )}
              {detail.preventive_action && (
                <div>
                  <h5 className="text-sm font-medium text-slate-700 mb-2">预防措施</h5>
                  <p className="text-sm text-slate-600 bg-blue-50 rounded-lg p-3">{detail.preventive_action}</p>
                </div>
              )}
              {detail.timeline && detail.timeline.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-slate-700 mb-2">事件时间线</h5>
                  <div className="space-y-3">
                    {detail.timeline.map(t => (
                      <div key={t.step} className="flex gap-3 text-sm">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{t.step}</div>
                        <div>
                          <p className="font-medium">{t.action}</p>
                          <p className="text-slate-500 text-xs">{t.operator} · {new Date(t.date).toLocaleString('zh-CN')}</p>
                          <p className="text-slate-600 mt-0.5">{t.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setShowCreate(false); setCreateMsg('') }} />
          <div className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-[500px] max-h-[90vh] overflow-y-auto relative z-10">
            <h3 className="text-lg font-semibold mb-4">创建事件</h3>
            {createMsg && <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm">{createMsg}</div>}
            <div className="space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">事件名称</label><input type="text" aria-label="事件名称" title="事件名称" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">场地</label><select aria-label="场地" title="选择场地" value={form.venue_id} onChange={e => setForm(p => ({ ...p, venue_id: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm"><option value="">选择场地</option><option value="1">恒温恒湿测试室 A</option><option value="2">恒温恒湿测试室 B</option><option value="3">受试者等候区</option><option value="5">仪器存放室</option><option value="6">样品存储区</option><option value="8">清洁准备间</option></select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">严重级别</label><select aria-label="严重级别" title="严重级别" value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))} className="min-h-11 w-full px-3 py-2 border rounded-lg text-sm"><option value="">选择级别</option><option value="minor">轻微</option><option value="major">一般</option><option value="critical">严重</option></select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">描述</label><textarea aria-label="描述" title="事件描述" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" rows={3} /></div>
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
