import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { recruitmentApi, protocolApi } from '@cn-kis/api-client'
import type { RecruitmentPlan } from '@cn-kis/api-client'
import { toast } from '../hooks/useToast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorAlert } from '../components/ErrorAlert'
import { Pagination } from '../components/Pagination'
import { exportToCsv } from '../utils/exportCsv'
import { Download, Search } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

const statusLabels: Record<string, string> = {
  draft: '草稿', pending_approval: '待审批', active: '进行中',
  paused: '已暂停', completed: '已完成', cancelled: '已取消',
}

const statusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700', pending_approval: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700', paused: 'bg-orange-100 text-orange-700',
  completed: 'bg-blue-100 text-blue-700', cancelled: 'bg-red-100 text-red-700',
}

const statusTransitions: Record<string, string[]> = {
  draft: ['pending_approval'],
  pending_approval: ['active', 'draft'],
  active: ['paused', 'completed'],
  paused: ['active'],
}

export default function PlansPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)
  const [confirmTransition, setConfirmTransition] = useState<{ planId: number; status: string; title: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recruitment', 'plans', { status: statusFilter, page }],
    queryFn: async () => {
      const res = await recruitmentApi.listPlans({ status: statusFilter || undefined, page, page_size: 20 })
      if (!res?.data) throw new Error('获取招募计划列表失败')
      return res
    },
  })

  const transitionMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: number; status: string }) =>
      recruitmentApi.transitionPlanStatus(planId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plans'] })
      toast.success('计划状态已更新')
      setConfirmTransition(null)
    },
    onError: (err) => {
      toast.error((err as Error).message || '状态变更失败')
      setConfirmTransition(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (planId: number) => recruitmentApi.deletePlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plans'] })
      toast.success('计划已删除')
      setConfirmDelete(null)
    },
    onError: (err) => { toast.error((err as Error).message || '删除失败'); setConfirmDelete(null) },
  })

  const allItems: RecruitmentPlan[] = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const items = keyword ? allItems.filter((p) => p.title.includes(keyword) || p.plan_no.includes(keyword)) : allItems

  const handleExport = () => {
    exportToCsv('招募计划', [
      { key: 'plan_no', label: '计划编号' },
      { key: 'title', label: '标题' },
      { key: 'target_count', label: '目标人数' },
      { key: 'registered_count', label: '报名数' },
      { key: 'screened_count', label: '筛选数' },
      { key: 'enrolled_count', label: '入组数' },
      { key: 'completion_rate', label: '完成率', formatter: (v) => `${((v as number) * 100).toFixed(1)}%` },
      { key: 'status', label: '状态', formatter: (v) => statusLabels[v as string] || String(v) },
      { key: 'start_date', label: '开始日期' },
      { key: 'end_date', label: '结束日期' },
    ], allItems as unknown as Record<string, unknown>[])
    toast.success('导出成功')
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 md:text-xl">招募计划管理</h2>
          <p className="text-sm text-slate-500 mt-1">创建和管理招募计划，追踪招募进度</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={handleExport} disabled={allItems.length === 0} title="导出招募计划" className="flex min-h-11 items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Download className="w-4 h-4" /> 导出</button>
          <PermissionGuard permission="recruitment.plan.create">
            <button onClick={() => setShowCreate(true)} title="新建招募计划" className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">新建计划</button>
          </PermissionGuard>
        </div>
      </div>

      {error && <ErrorAlert message={(error as Error).message} onRetry={() => refetch()} />}

      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="relative min-w-[220px] flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={searchInput} title="搜索计划编号标题" onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setKeyword(searchInput)} placeholder="搜索编号/标题" className="min-h-11 w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" title="状态筛选">
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="shrink-0 self-center text-sm text-slate-400">共 {total} 条</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-400 py-12 text-center">暂无招募计划</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">计划编号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">标题</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">目标/入组</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">完成率</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">日期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((plan) => (
                <tr key={plan.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/plans/${plan.id}`)} className="inline-flex min-h-9 items-center text-emerald-600 hover:underline font-medium">{plan.plan_no}</button>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{plan.title}</td>
                  <td className="px-4 py-3 text-slate-600">{plan.enrolled_count} / {plan.target_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(plan.completion_rate * 100, 100)}%` }} />
                      </div>
                      <span className="text-slate-600">{(plan.completion_rate * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[plan.status] || 'bg-slate-100'}`}>{statusLabels[plan.status] || plan.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{plan.start_date} ~ {plan.end_date}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {(statusTransitions[plan.status] || []).map((next) => (
                        <button key={next} onClick={() => setConfirmTransition({ planId: plan.id, status: next, title: plan.title })} className="min-h-9 px-2 py-1 text-xs rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors" disabled={transitionMutation.isPending}>
                          {statusLabels[next] || next}
                        </button>
                      ))}
                      {plan.status === 'draft' && (
                        <button onClick={() => setConfirmDelete({ id: plan.id, title: plan.title })} className="min-h-9 px-2 py-1 text-xs rounded text-red-600 hover:bg-red-50">删除</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Pagination page={page} pageSize={20} total={total} onChange={setPage} />

      {showCreate && <CreatePlanModal onClose={() => setShowCreate(false)} />}

      <ConfirmDialog
        open={!!confirmTransition}
        title="确认状态变更"
        message={confirmTransition ? `确定要将「${confirmTransition.title}」的状态变更为「${statusLabels[confirmTransition.status]}」吗？` : ''}
        confirmLabel="确认变更"
        loading={transitionMutation.isPending}
        onConfirm={() => confirmTransition && transitionMutation.mutate({ planId: confirmTransition.planId, status: confirmTransition.status })}
        onCancel={() => setConfirmTransition(null)}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="删除计划"
        message={confirmDelete ? `确定要删除「${confirmDelete.title}」吗？此操作不可恢复。` : ''}
        confirmLabel="删除"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}

function CreatePlanModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ protocol_id: 0, title: '', target_count: 0, start_date: '', end_date: '', description: '' })

  const protocolsQuery = useQuery({
    queryKey: ['protocols', 'select'],
    queryFn: async () => {
      const res = await protocolApi.list({ page_size: 100 })
      return res?.data?.items ?? []
    },
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error('请输入计划标题')
      if (!form.protocol_id) throw new Error('请选择关联协议')
      if (!form.target_count || form.target_count <= 0) throw new Error('目标人数必须大于 0')
      if (!form.start_date || !form.end_date) throw new Error('请选择日期范围')
      if (form.end_date < form.start_date) throw new Error('结束日期不能早于开始日期')
      const res = await recruitmentApi.createPlan({ ...form, target_count: Number(form.target_count), protocol_id: Number(form.protocol_id) })
      if (!res?.data) throw new Error('创建失败')
      return res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plans'] })
      toast.success('招募计划创建成功')
      onClose()
    },
    onError: (err) => toast.error((err as Error).message || '创建失败'),
  })

  const protocols = protocolsQuery.data ?? []

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-lg max-h-[90vh] overflow-y-auto p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">新建招募计划</h3>
        <div className="space-y-3">
          <Field label="计划标题">
            <input value={form.title} title="计划标题" onChange={(e) => setForm({ ...form, title: e.target.value })} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="输入计划标题" />
          </Field>
          <Field label="关联协议">
            <select value={form.protocol_id} onChange={(e) => setForm({ ...form, protocol_id: Number(e.target.value) })} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" title="选择协议">
              <option value={0}>请选择协议</option>
              {protocols.map((p: { id: number; title: string; protocol_no?: string }) => (
                <option key={p.id} value={p.id}>{p.protocol_no ? `${p.protocol_no} - ` : ''}{p.title}</option>
              ))}
            </select>
          </Field>
          <Field label="目标人数">
            <input type="number" min={1} title="目标人数" value={form.target_count || ''} onChange={(e) => setForm({ ...form, target_count: Number(e.target.value) })} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="输入目标人数" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="开始日期"><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" title="开始日期" /></Field>
            <Field label="结束日期"><input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" title="结束日期" /></Field>
          </div>
          <Field label="描述">
            <textarea value={form.description} title="计划描述" onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={3} placeholder="计划描述（可选）" />
          </Field>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="min-h-11 px-4 py-2 text-sm text-slate-600 hover:text-slate-800">取消</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
            {mutation.isPending ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  )
}
