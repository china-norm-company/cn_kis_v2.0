import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { executionApi, subjectApi } from '@cn-kis/api-client'
import type { Subject, ComplianceRecord } from '@cn-kis/api-client'
import { toast } from '../hooks/useToast'
import { ErrorAlert } from '../components/ErrorAlert'
import { Search } from 'lucide-react'

const levelColors: Record<string, string> = { excellent: 'bg-emerald-100 text-emerald-700', good: 'bg-blue-100 text-blue-700', fair: 'bg-amber-100 text-amber-700', poor: 'bg-red-100 text-red-700' }
const levelLabels: Record<string, string> = { excellent: '优秀', good: '良好', fair: '一般', poor: '差' }

export default function CompliancePage() {
  const queryClient = useQueryClient()
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null)
  const [showAssess, setShowAssess] = useState(false)
  const [searchInput, setSearchInput] = useState('')

  const subjectsQuery = useQuery({
    queryKey: ['subjects', 'compliance-list'],
    queryFn: async () => { const res = await subjectApi.list({ page_size: 200 }); if (!res?.data) throw new Error('加载失败'); return res },
  })

  const complianceQuery = useQuery({
    queryKey: ['compliance', selectedSubject],
    queryFn: async () => { const res = await executionApi.listCompliance(selectedSubject!); if (!res?.data) throw new Error('加载失败'); return res },
    enabled: !!selectedSubject,
  })

  const allSubjects: Subject[] = subjectsQuery.data?.data?.items ?? []
  const subjects = searchInput ? allSubjects.filter((s) => s.name.includes(searchInput) || s.subject_no?.includes(searchInput)) : allSubjects
  const records: ComplianceRecord[] = complianceQuery.data?.data?.items ?? []

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 md:text-xl">依从性管理</h2>
          <p className="text-sm text-slate-500 mt-1">评估和追踪受试者依从性</p>
        </div>
        {selectedSubject && <button onClick={() => setShowAssess(true)} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">新建评估</button>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">选择受试者</h3>
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="搜索" className="w-full min-h-11 pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          {subjectsQuery.error && <ErrorAlert message="加载失败" onRetry={() => subjectsQuery.refetch()} />}
          <div className="space-y-1 max-h-72 overflow-y-auto md:max-h-96">
            {subjects.map((s) => (
              <button key={s.id} onClick={() => { setSelectedSubject(s.id); setShowAssess(false) }} className={`min-h-10 w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedSubject === s.id ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>{s.name}</button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3">
          {selectedSubject ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">依从性记录</h3>
              {complianceQuery.isLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
              ) : complianceQuery.error ? (
                <ErrorAlert message="加载依从性记录失败" onRetry={() => complianceQuery.refetch()} />
              ) : records.length === 0 ? (
                <div className="text-sm text-slate-400 py-6 text-center">暂无依从性记录</div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 font-medium text-slate-600">评估日期</th>
                      <th className="text-left py-2 font-medium text-slate-600">到访率</th>
                      <th className="text-left py-2 font-medium text-slate-600">问卷完成率</th>
                      <th className="text-left py-2 font-medium text-slate-600">窗口偏差(天)</th>
                      <th className="text-left py-2 font-medium text-slate-600">总分</th>
                      <th className="text-left py-2 font-medium text-slate-600">等级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id} className="border-b border-slate-100">
                        <td className="py-2 text-slate-700">{r.assessment_date}</td>
                        <td className="py-2 text-slate-600">{r.visit_attendance_rate}%</td>
                        <td className="py-2 text-slate-600">{r.questionnaire_completion_rate}%</td>
                        <td className="py-2 text-slate-600">{r.time_window_deviation}</td>
                        <td className="py-2 text-slate-700 font-medium">{r.overall_score}</td>
                        <td className="py-2"><span className={`px-2 py-0.5 rounded text-xs font-medium ${levelColors[r.level] || 'bg-slate-100'}`}>{levelLabels[r.level] || r.level}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-5 text-sm text-slate-400 text-center py-12">请从左侧选择受试者</div>
          )}
        </div>
      </div>

      {showAssess && selectedSubject && <AssessModal subjectId={selectedSubject} onClose={() => setShowAssess(false)} />}
    </div>
  )
}

function AssessModal({ subjectId, onClose }: { subjectId: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ visit_attendance_rate: 100, questionnaire_completion_rate: 100, time_window_deviation_days: 0, notes: '' })

  const mutation = useMutation({
    mutationFn: async () => {
      if (form.visit_attendance_rate < 0 || form.visit_attendance_rate > 100) throw new Error('到访率必须在 0-100 之间')
      if (form.questionnaire_completion_rate < 0 || form.questionnaire_completion_rate > 100) throw new Error('问卷完成率必须在 0-100 之间')
      return executionApi.assessCompliance(subjectId, form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance', subjectId] })
      toast.success('依从性评估已提交')
      onClose()
    },
    onError: (err) => toast.error((err as Error).message || '评估提交失败'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-md max-h-[90vh] overflow-y-auto p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">新建依从性评估</h3>
        <div className="space-y-3">
          <div><label className="block text-sm font-medium text-slate-600 mb-1">到访率 (%)</label><input title="到访率" type="number" min={0} max={100} value={form.visit_attendance_rate} onChange={(e) => setForm({ ...form, visit_attendance_rate: Number(e.target.value) })} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div><label className="block text-sm font-medium text-slate-600 mb-1">问卷完成率 (%)</label><input title="问卷完成率" type="number" min={0} max={100} value={form.questionnaire_completion_rate} onChange={(e) => setForm({ ...form, questionnaire_completion_rate: Number(e.target.value) })} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div><label className="block text-sm font-medium text-slate-600 mb-1">时间窗口偏差 (天)</label><input title="时间窗口偏差" type="number" min={0} value={form.time_window_deviation_days} onChange={(e) => setForm({ ...form, time_window_deviation_days: Number(e.target.value) })} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm" /></div>
          <div><label className="block text-sm font-medium text-slate-600 mb-1">备注</label><textarea title="备注" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={2} /></div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="min-h-11 px-4 py-2 text-sm text-slate-600">取消</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{mutation.isPending ? '提交中...' : '提交评估'}</button>
        </div>
      </div>
    </div>
  )
}
