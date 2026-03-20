import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { labPersonnelApi } from '@cn-kis/api-client'
import type { DispatchMonitor, DispatchCandidate } from '@cn-kis/api-client'
import { ClipboardList, UserCheck, Clock, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

export function DispatchPage() {
  const [selectedWorkorder, setSelectedWorkorder] = useState<number | null>(null)
  const [assignMsg, setAssignMsg] = useState('')

  const { data: monitorData } = useQuery({
    queryKey: ['lab-personnel', 'dispatch-monitor'],
    queryFn: () => labPersonnelApi.getDispatchMonitor(),
  })
  const monitor = (monitorData as any)?.data as DispatchMonitor | undefined

  const { data: candidateData } = useQuery({
    queryKey: ['lab-personnel', 'dispatch-candidates', selectedWorkorder],
    queryFn: () => labPersonnelApi.getDispatchCandidates(selectedWorkorder!),
    enabled: selectedWorkorder !== null,
  })
  const candidates = ((candidateData as any)?.data as DispatchCandidate[] | undefined) ?? []

  const checkIcon = (passed: boolean) =>
    passed
      ? <CheckCircle2 className="w-4 h-4 text-green-500" />
      : <XCircle className="w-4 h-4 text-red-500" />

  const statCards = [
    { key: 'in_progress', label: '执行中', value: monitor?.in_progress ?? '--', color: 'text-blue-600', icon: ClipboardList },
    { key: 'pending', label: '待派发', value: monitor?.pending_assignment ?? '--', color: 'text-amber-600', icon: Clock },
    { key: 'overdue', label: '已逾期', value: monitor?.overdue ?? '--', color: 'text-red-600', icon: AlertTriangle },
    { key: 'completed', label: '今日完成', value: monitor?.completed_today ?? '--', color: 'text-green-600', icon: CheckCircle2 },
  ]

  async function handleAssign(staffId: number) {
    if (!selectedWorkorder) return
    try {
      await labPersonnelApi.dispatchAssign({ workorder_id: selectedWorkorder, staff_id: staffId })
      setAssignMsg('派工成功')
      setTimeout(() => setAssignMsg(''), 3000)
    } catch { setAssignMsg('派工失败') }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">工单派发</h2>
        <p className="text-sm text-slate-500 mt-1">基于5项资质校验的智能派工 — GCP证书、方法资质、设备授权、排班冲突、工时负荷</p>
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

      {/* Assign Message */}
      {assignMsg && (
        <div className={`p-3 rounded-lg text-sm font-medium ${assignMsg === '派工成功' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`} data-section="assign-result">
          {assignMsg}
        </div>
      )}

      {/* Monitor — Current Assignments */}
      <div className="bg-white rounded-xl border border-slate-200" data-section="monitor">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">执行监控</h3>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-600">工单ID</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">执行人</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">开始时间</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">预计完成</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {monitor?.assignments?.map(a => (
              <tr key={a.workorder_id} className="border-b border-slate-100 hover:bg-slate-50" data-workorder-item>
                <td className="px-4 py-3 font-medium text-slate-700">WO-{a.workorder_id}</td>
                <td className="px-4 py-3 text-slate-600">{a.staff_name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${a.status === 'in_progress' ? 'bg-blue-50 text-blue-600' : a.status === 'overdue' ? 'bg-red-50 text-red-600' : a.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-600'}`}>
                    {a.status === 'in_progress' ? '进行中' : a.status === 'overdue' ? '已逾期' : a.status === 'completed' ? '已完成' : a.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{a.started_at}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{a.expected_end}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setSelectedWorkorder(a.workorder_id)} className="min-h-9 px-2 py-1 text-xs text-violet-600 hover:underline">查看候选人</button>
                </td>
              </tr>
            ))}
            {(!monitor?.assignments || monitor.assignments.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">暂无执行中的工单</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Candidate Selection */}
      {selectedWorkorder && candidates.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5" data-section="candidates">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-semibold text-slate-800">工单 WO-{selectedWorkorder} — 候选执行人</h3>
            <button onClick={() => setSelectedWorkorder(null)} className="min-h-10 px-2 text-sm text-slate-400 hover:text-slate-600" title="关闭候选人列表">关闭</button>
          </div>
          <div className="space-y-3">
            {candidates.map(c => (
              <div key={c.staff_id} className="flex flex-col gap-3 bg-slate-50 rounded-lg p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <UserCheck className="w-5 h-5 text-violet-500" />
                    <span className="font-medium text-slate-800">{c.staff_name}</span>
                    <span className="text-xs px-2 py-0.5 bg-violet-50 text-violet-600 rounded">{c.competency_level}</span>
                    <span className="text-sm font-bold text-violet-600">评分: {c.score}</span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <div className="flex items-center gap-1">{checkIcon(c.checks.gcp_valid)} GCP证书</div>
                    <div className="flex items-center gap-1">{checkIcon(c.checks.method_qualified)} 方法资质</div>
                    <div className="flex items-center gap-1">{checkIcon(c.checks.equipment_authorized)} 设备授权</div>
                    <div className="flex items-center gap-1">{checkIcon(c.checks.no_schedule_conflict)} 排班无冲突</div>
                    <div className="flex items-center gap-1">{checkIcon(c.checks.workload_ok)} 工时负荷</div>
                  </div>
                </div>
                <button onClick={() => handleAssign(c.staff_id)} title="指派候选人"
                  className="ml-4 min-h-11 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors">
                  指派
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
