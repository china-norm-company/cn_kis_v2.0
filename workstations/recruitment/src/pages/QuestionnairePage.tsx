import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { questionnaireApi } from '@cn-kis/api-client'
import type { QuestionnaireTemplate, QuestionnaireAssignment } from '@cn-kis/api-client'
import { toast } from '../hooks/useToast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorAlert } from '../components/ErrorAlert'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

const categoryLabels: Record<string, string> = {
  screening: '筛选问卷', follow_up: '随访问卷', satisfaction: '满意度调查',
  safety: '安全性问卷', pro: '患者报告结局', other: '其他',
}

type Tab = 'templates' | 'assignments' | 'statistics'

export default function QuestionnairePage() {
  const [activeTab, setActiveTab] = useState<Tab>('templates')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'templates', label: '问卷模板' },
    { key: 'assignments', label: '分配跟踪' },
    { key: 'statistics', label: '统计概览' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">问卷管理</h2>
        <p className="text-sm text-slate-500 mt-1">管理问卷模板、分配和统计</p>
      </div>
      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.key ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{tab.label}</button>
          ))}
        </div>
      </div>
      {activeTab === 'templates' && <TemplatesTab />}
      {activeTab === 'assignments' && <AssignmentsTab />}
      {activeTab === 'statistics' && <StatisticsTab />}
    </div>
  )
}

function TemplatesTab() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['questionnaire', 'templates', categoryFilter],
    queryFn: () => questionnaireApi.listTemplates({ category: categoryFilter || undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => questionnaireApi.deleteTemplate(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['questionnaire', 'templates'] }); toast.success('模板已删除'); setConfirmDelete(null) },
    onError: (err) => { toast.error((err as Error).message || '删除失败'); setConfirmDelete(null) },
  })

  const items: QuestionnaireTemplate[] = data?.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" title="类型筛选">
            <option value="">全部类型</option>
            {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="text-sm text-slate-400">共 {items.length} 个模板</span>
        </div>
        <PermissionGuard permission="recruitment.questionnaire.create">
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">新建模板</button>
        </PermissionGuard>
      </div>

      {error && <ErrorAlert message="加载模板失败" onRetry={() => refetch()} />}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-400 py-12 text-center">暂无问卷模板</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">模板名称</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">类型</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">版本</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">创建时间</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700 font-medium">{t.template_name}</td>
                  <td className="px-4 py-3 text-slate-500">{categoryLabels[t.category] || t.category}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${t.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{t.is_active ? '启用' : '禁用'}</span></td>
                  <td className="px-4 py-3 text-slate-500">v{t.version}</td>
                  <td className="px-4 py-3 text-slate-500">{t.create_time?.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setConfirmDelete({ id: t.id, name: t.template_name })} className="text-xs text-red-600 hover:underline">删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreateTemplateModal onClose={() => setShowCreate(false)} />}

      <ConfirmDialog open={!!confirmDelete} title="删除模板" message={confirmDelete ? `确定要删除「${confirmDelete.name}」吗？` : ''} confirmLabel="删除" variant="danger" loading={deleteMutation.isPending} onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)} onCancel={() => setConfirmDelete(null)} />
    </div>
  )
}

function CreateTemplateModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ template_name: '', category: 'other', description: '' })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.template_name.trim()) throw new Error('请输入模板名称')
      return questionnaireApi.createTemplate(form)
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['questionnaire', 'templates'] }); toast.success('模板创建成功'); onClose() },
    onError: (err) => toast.error((err as Error).message || '创建失败'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">新建问卷模板</h3>
        <div className="space-y-3">
          <div><label className="block text-sm font-medium text-slate-600 mb-1">模板名称 *</label><input value={form.template_name} onChange={(e) => setForm({ ...form, template_name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="输入模板名称" /></div>
          <div><label className="block text-sm font-medium text-slate-600 mb-1">问卷类型</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" title="问卷类型">
              {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-slate-600 mb-1">描述</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={3} placeholder="问卷描述" /></div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600">取消</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{mutation.isPending ? '创建中...' : '创建'}</button>
        </div>
      </div>
    </div>
  )
}

function AssignmentsTab() {
  const [statusFilter, setStatusFilter] = useState('')
  const statusLabels: Record<string, string> = { pending: '待完成', in_progress: '进行中', completed: '已完成', overdue: '已逾期', cancelled: '已取消' }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['questionnaire', 'assignments', statusFilter],
    queryFn: () => questionnaireApi.listAssignments({ status: statusFilter || undefined }),
  })

  const items: QuestionnaireAssignment[] = data?.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" title="状态筛选">
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-sm text-slate-400">共 {items.length} 条</span>
      </div>

      {error && <ErrorAlert message="加载失败" onRetry={() => refetch()} />}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-400 py-12 text-center">暂无分配记录</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 bg-slate-50"><th className="text-left px-4 py-3 font-medium text-slate-600">问卷</th><th className="text-left px-4 py-3 font-medium text-slate-600">受试者ID</th><th className="text-left px-4 py-3 font-medium text-slate-600">状态</th><th className="text-left px-4 py-3 font-medium text-slate-600">截止日期</th><th className="text-left px-4 py-3 font-medium text-slate-600">完成时间</th><th className="text-left px-4 py-3 font-medium text-slate-600">评分</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{a.template_name}</td>
                  <td className="px-4 py-3 text-slate-500">#{a.subject_id}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${a.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : a.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{statusLabels[a.status] || a.status}</span></td>
                  <td className="px-4 py-3 text-slate-500">{a.due_date || '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{a.completed_at?.slice(0, 10) || '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{a.score ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatisticsTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['questionnaire', 'statistics'],
    queryFn: () => questionnaireApi.getStatistics(),
  })

  const stats = data?.data

  if (isLoading) return <div className="space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
  if (error) return <ErrorAlert message="加载统计失败" onRetry={() => refetch()} />
  if (!stats) return <div className="text-sm text-slate-400 py-12 text-center">暂无统计数据</div>

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard title="总分配数" value={stats.total_assignments} color="bg-blue-50 text-blue-700" />
      <StatCard title="已完成" value={stats.completed} color="bg-emerald-50 text-emerald-700" />
      <StatCard title="完成率" value={`${stats.completion_rate}%`} color="bg-indigo-50 text-indigo-700" />
      <StatCard title="已逾期" value={stats.overdue} color="bg-red-50 text-red-700" />
    </div>
  )
}

function StatCard({ title, value, color }: { title: string; value: string | number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-sm text-slate-500">{title}</p>
      <p className={`text-3xl font-bold mt-2 ${color}`}>{value}</p>
    </div>
  )
}
