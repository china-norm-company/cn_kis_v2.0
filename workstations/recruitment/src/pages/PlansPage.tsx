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
import { completionRatePercent } from '../utils/planDisplay'
import { Download, Search, Pencil, Eye } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

/** 可派发招募专员（与需求一致，多选） */
const RECRUIT_SPECIALIST_OPTIONS = ['孙燕萍', '童晓婷', '李思雨'] as const

const MATERIAL_PREP_LABELS: Record<string, string> = {
  draft: '草稿',
  in_progress: '进行中',
  published: '发布',
}

/** 与后端 RecruitmentPlanStatus / transition 一致 */
const statusLabels: Record<string, string> = {
  draft: '草稿',
  approved: '已批准',
  active: '进行中',
  paused: '已暂停',
  completed: '已完成',
  cancelled: '已取消',
}

const statusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  approved: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-orange-100 text-orange-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
}

const statusTransitions: Record<string, string[]> = {
  draft: ['approved', 'cancelled'],
  approved: ['active', 'cancelled'],
  active: ['paused', 'completed', 'cancelled'],
  paused: ['active', 'cancelled'],
}

function displayProjectCode(p: RecruitmentPlan): string {
  return (p.display_project_code || p.project_code || p.protocol_code || p.plan_no || '').trim() || '—'
}

function formatPct(v: number | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  return `${Number(v).toFixed(1)}%`
}

/** 计划汇总表：0–100 完成率进度条 + 文本 */
function CompletionRateBar({ rate }: { rate: number | undefined }) {
  const pct = Math.min(completionRatePercent(rate), 100)
  return (
    <div className="flex items-center gap-2 min-w-[140px] max-w-[200px]">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-600 shrink-0 w-11 text-right tabular-nums">{formatPct(rate)}</span>
    </div>
  )
}

export default function PlansPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'list' | 'summary'>('summary')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)
  const [confirmTransition, setConfirmTransition] = useState<{ planId: number; status: string; title: string } | null>(
    null,
  )
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [detailPlan, setDetailPlan] = useState<RecruitmentPlan | null>(null)
  const [editPlan, setEditPlan] = useState<RecruitmentPlan | null>(null)

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
    onError: (err) => {
      toast.error((err as Error).message || '删除失败')
      setConfirmDelete(null)
    },
  })

  const allItems: RecruitmentPlan[] = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const items = keyword
    ? allItems.filter((p) => {
        const k = keyword.trim()
        return (
          p.title.includes(k) ||
          p.plan_no.includes(k) ||
          (p.project_code || '').includes(k) ||
          (p.display_project_code || '').includes(k) ||
          (p.protocol_code || '').includes(k)
        )
      })
    : allItems

  const handleExport = () => {
    exportToCsv(
      '招募计划',
      [
        {
          key: 'plan_no',
          label: '项目编号',
          formatter: (_, row) => displayProjectCode(row as unknown as RecruitmentPlan),
        },
        { key: 'title', label: '项目名称' },
        { key: 'target_count', label: '样本量' },
        { key: 'planned_appointment_count', label: '计划预约人数' },
        { key: 'actual_appointment_count', label: '实际预约人数(V1)' },
        { key: 'start_date', label: '启动日期(维周)' },
        { key: 'end_date', label: '结束日期(维周)' },
        { key: 'recruit_start_date', label: '招募启动日期' },
        { key: 'recruit_end_date', label: '招募结束日期' },
        { key: 'enrolled_count', label: '已入组' },
        { key: 'registered_count', label: '已报名' },
        { key: 'screening_completed_count', label: '已完成筛选(通过+不通过)' },
        { key: 'completion_rate', label: '入组完成率', formatter: (v) => formatPct(v as number) },
        {
          key: 'appointment_completion_rate',
          label: '预约完成率',
          formatter: (v) => formatPct(v as number),
        },
        { key: 'status', label: '状态', formatter: (v) => statusLabels[v as string] || String(v) },
        {
          key: 'material_prep_status',
          label: '物料准备',
          formatter: (v) => MATERIAL_PREP_LABELS[v as string] || String(v),
        },
      ],
      allItems as unknown as Record<string, unknown>[],
    )
    toast.success('导出成功')
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 md:text-xl">招募计划管理</h2>
          <p className="text-sm text-slate-500 mt-1">创建和管理招募计划，追踪招募进度（维周工单 + 主管填报）</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExport}
            disabled={allItems.length === 0}
            title="导出当前页筛选结果中的本页数据；需全量请在列表调大分页或后续导出接口"
            className="flex min-h-11 items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> 导出
          </button>
          <PermissionGuard permission="subject.recruitment.create">
            <button
              onClick={() => setShowCreate(true)}
              title="新增计划（维周未同步时可手工录入）"
              className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              新增计划
            </button>
          </PermissionGuard>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-1 inline-flex gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            activeTab === 'summary' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          计划汇总
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('list')}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            activeTab === 'list' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          计划列表
        </button>
      </div>

      {error && <ErrorAlert message={(error as Error).message} onRetry={() => refetch()} />}

      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="relative min-w-[220px] flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={searchInput}
            title="搜索项目编号/计划编号/标题"
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setKeyword(searchInput)}
            placeholder="搜索项目编号/标题"
            className="min-h-11 w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          title="计划状态筛选"
        >
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span className="shrink-0 self-center text-sm text-slate-400">共 {total} 条</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-400 py-12 text-center">暂无招募计划</div>
        ) : activeTab === 'list' ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">项目编号</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600">项目名称</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">样本量</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 min-w-[8rem]">样本要求</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">启动日期</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">结束日期</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600">访视点</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">具体访视日期</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600">研究员</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600">督导</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((plan) => (
                  <tr key={plan.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">{displayProjectCode(plan)}</td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[12rem] truncate" title={plan.title}>
                      {plan.title}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{plan.target_count}</td>
                    <td className="px-3 py-2.5 text-slate-600 text-xs max-w-[10rem] line-clamp-2">
                      {(plan.sample_requirement || '').trim() || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{plan.start_date}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{plan.end_date}</td>
                    <td className="px-3 py-2.5 text-slate-600">{(plan.wei_visit_point || '').trim() || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{plan.wei_visit_date || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{(plan.researcher_name || '').trim() || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{(plan.supervisor_name || '').trim() || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDetailPlan(plan)}
                          className="inline-flex items-center gap-0.5 px-2 py-1 text-xs rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="w-3.5 h-3.5" /> 详情
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditPlan(plan)}
                          className="inline-flex items-center gap-0.5 px-2 py-1 text-xs rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        >
                          <Pencil className="w-3.5 h-3.5" /> 编辑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">项目编号</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600">项目名称</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">样本量</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">计划预约人数</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">实际预约人数</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">招募启动</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">招募结束</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600">项目专员</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">物料准备</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">预约完成率</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">入组完成率</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">状态</th>
                  <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((plan) => (
                  <tr key={plan.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">{displayProjectCode(plan)}</td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[12rem] truncate" title={plan.title}>
                      {plan.title}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{plan.target_count}</td>
                    <td className="px-3 py-2.5 text-slate-600">{plan.planned_appointment_count ?? 0}</td>
                    <td className="px-3 py-2.5 text-slate-600" title="预约管理中访视点为 V1 的条数">
                      {plan.actual_appointment_count ?? 0}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{plan.recruit_start_date || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{plan.recruit_end_date || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 text-xs max-w-[10rem]">
                      {(plan.recruit_specialist_names || []).length
                        ? (plan.recruit_specialist_names || []).join('、')
                        : '—'}
                      {plan.channel_recruitment_needed ? (
                        <span className="block text-slate-400 mt-0.5">渠道：樊亚娟可见</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {MATERIAL_PREP_LABELS[plan.material_prep_status || 'draft'] || plan.material_prep_status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      <CompletionRateBar rate={plan.appointment_completion_rate} />
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      <CompletionRateBar rate={plan.completion_rate} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[plan.status] || 'bg-slate-100'}`}
                      >
                        {statusLabels[plan.status] || plan.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setDetailPlan(plan)}
                          className="inline-flex items-center gap-0.5 px-2 py-1 text-xs rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="w-3.5 h-3.5" /> 详情
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditPlan(plan)}
                          className="inline-flex items-center gap-0.5 px-2 py-1 text-xs rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        >
                          <Pencil className="w-3.5 h-3.5" /> 编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/plans/${plan.id}`)}
                          className="px-2 py-1 text-xs text-emerald-600 hover:underline"
                        >
                          计划页
                        </button>
                        {(statusTransitions[plan.status] || []).map((next) => (
                          <button
                            key={next}
                            onClick={() => setConfirmTransition({ planId: plan.id, status: next, title: plan.title })}
                            className="min-h-8 px-2 py-0.5 text-[11px] rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                            disabled={transitionMutation.isPending}
                          >
                            {statusLabels[next] || next}
                          </button>
                        ))}
                        {plan.status === 'draft' && (
                          <button
                            onClick={() => setConfirmDelete({ id: plan.id, title: plan.title })}
                            className="min-h-8 px-2 py-0.5 text-[11px] rounded text-red-600 hover:bg-red-50"
                          >
                            删除
                          </button>
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

      {detailPlan && <PlanDetailModal plan={detailPlan} onClose={() => setDetailPlan(null)} />}

      {editPlan && (
        <PlanEditModal
          plan={editPlan}
          onClose={() => setEditPlan(null)}
          onSaved={() => {
            setEditPlan(null)
            void queryClient.invalidateQueries({ queryKey: ['recruitment', 'plans'] })
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmTransition}
        title="确认状态变更"
        message={
          confirmTransition
            ? `确定要将「${confirmTransition.title}」的状态变更为「${statusLabels[confirmTransition.status]}」吗？`
            : ''
        }
        confirmLabel="确认变更"
        loading={transitionMutation.isPending}
        onConfirm={() =>
          confirmTransition && transitionMutation.mutate({ planId: confirmTransition.planId, status: confirmTransition.status })
        }
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

function PlanDetailModal({ plan, onClose }: { plan: RecruitmentPlan; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-800 mb-4">计划详情</h3>
        <section className="mb-6">
          <h4 className="text-sm font-medium text-slate-500 mb-2 border-b border-slate-100 pb-1">第一部分 · 项目信息（维周/手工）</h4>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <DetailRow label="项目编号" value={displayProjectCode(plan)} />
            <DetailRow label="内部计划号" value={plan.plan_no} />
            <DetailRow label="项目名称" value={plan.title} className="sm:col-span-2" />
            <DetailRow label="样本量" value={String(plan.target_count)} />
            <DetailRow label="样本要求" value={(plan.sample_requirement || '').trim() || '—'} />
            <DetailRow label="启动日期（维周）" value={plan.start_date} />
            <DetailRow label="结束日期（维周）" value={plan.end_date} />
            <DetailRow label="访视点" value={(plan.wei_visit_point || '').trim() || '—'} />
            <DetailRow label="具体访视日期" value={plan.wei_visit_date || '—'} />
            <DetailRow label="研究员" value={(plan.researcher_name || '').trim() || '—'} />
            <DetailRow label="督导" value={(plan.supervisor_name || '').trim() || '—'} />
          </dl>
        </section>
        <section>
          <h4 className="text-sm font-medium text-slate-500 mb-2 border-b border-slate-100 pb-1">第二部分 · 招募主管填报</h4>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <DetailRow label="计划预约人数" value={String(plan.planned_appointment_count ?? 0)} />
            <DetailRow label="实际预约人数(V1)" value={String(plan.actual_appointment_count ?? 0)} />
            <DetailRow label="预计工时" value={plan.estimated_work_hours != null ? String(plan.estimated_work_hours) : '—'} />
            <DetailRow label="实际工时（专员）" value={plan.actual_work_hours != null ? String(plan.actual_work_hours) : '—'} />
            <DetailRow label="招募启动日期" value={plan.recruit_start_date || '—'} />
            <DetailRow label="招募结束日期" value={plan.recruit_end_date || '—'} />
            <DetailRow
              label="派发招募专员"
              value={(plan.recruit_specialist_names || []).length ? (plan.recruit_specialist_names || []).join('、') : '—'}
            />
            <DetailRow label="是否需要渠道招募" value={plan.channel_recruitment_needed ? '是（推广专员樊亚娟可见）' : '否'} />
            <DetailRow label="物料准备" value={MATERIAL_PREP_LABELS[plan.material_prep_status || 'draft'] || '—'} />
            <DetailRow label="预约完成率" value={formatPct(plan.appointment_completion_rate)} />
            <DetailRow label="入组完成率" value={formatPct(plan.completion_rate)} />
          </dl>
        </section>
        <div className="flex justify-end mt-6">
          <button type="button" onClick={onClose} className="min-h-11 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm">
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  className = '',
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-slate-400 text-xs">{label}</dt>
      <dd className="text-slate-800 mt-0.5">{value}</dd>
    </div>
  )
}

function PlanEditModal({
  plan,
  onClose,
  onSaved,
}: {
  plan: RecruitmentPlan
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    project_code: (plan.project_code || '').trim(),
    title: plan.title,
    sample_requirement: plan.sample_requirement || '',
    start_date: plan.start_date,
    end_date: plan.end_date,
    wei_visit_point: plan.wei_visit_point || '',
    wei_visit_date: plan.wei_visit_date || '',
    researcher_name: plan.researcher_name || '',
    supervisor_name: plan.supervisor_name || '',
    planned_appointment_count: plan.planned_appointment_count ?? 0,
    estimated_work_hours: plan.estimated_work_hours ?? '' as number | '',
    actual_work_hours: plan.actual_work_hours ?? '' as number | '',
    recruit_start_date: plan.recruit_start_date || '',
    recruit_end_date: plan.recruit_end_date || '',
    recruit_specialist_names: [...(plan.recruit_specialist_names || [])],
    channel_recruitment_needed: plan.channel_recruitment_needed ?? false,
    material_prep_status: plan.material_prep_status || 'draft',
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await recruitmentApi.updatePlan(plan.id, {
        project_code: form.project_code.trim() || undefined,
        title: form.title.trim(),
        sample_requirement: form.sample_requirement,
        start_date: form.start_date,
        end_date: form.end_date,
        wei_visit_point: form.wei_visit_point,
        wei_visit_date: form.wei_visit_date || undefined,
        researcher_name: form.researcher_name,
        supervisor_name: form.supervisor_name,
        planned_appointment_count: Number(form.planned_appointment_count) || 0,
        estimated_work_hours:
          form.estimated_work_hours === '' ? undefined : Number(form.estimated_work_hours),
        actual_work_hours: form.actual_work_hours === '' ? undefined : Number(form.actual_work_hours),
        recruit_start_date: form.recruit_start_date || undefined,
        recruit_end_date: form.recruit_end_date || undefined,
        recruit_specialist_names: form.recruit_specialist_names,
        channel_recruitment_needed: form.channel_recruitment_needed,
        material_prep_status: form.material_prep_status,
      })
      if (!res?.data) throw new Error('保存失败')
      return res
    },
    onSuccess: () => {
      toast.success('已保存')
      onSaved()
    },
    onError: (err) => toast.error((err as Error).message || '保存失败'),
  })

  const toggleSpecialist = (name: string) => {
    setForm((f) => {
      const set = new Set(f.recruit_specialist_names)
      if (set.has(name)) set.delete(name)
      else set.add(name)
      return { ...f, recruit_specialist_names: Array.from(set) }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-800 mb-4">编辑计划</h3>
        <p className="text-xs text-slate-500 mb-4">项目编号唯一；实际工时由招募专员填写。</p>

        <section className="mb-6 space-y-3">
          <h4 className="text-sm font-medium text-slate-700">第一部分 · 项目信息</h4>
          <Field label="项目编号">
            <input
              className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              value={form.project_code}
              onChange={(e) => setForm({ ...form, project_code: e.target.value })}
            />
          </Field>
          <Field label="项目名称">
            <input
              className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="样本要求">
            <textarea
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              rows={2}
              value={form.sample_requirement}
              onChange={(e) => setForm({ ...form, sample_requirement: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="启动日期（维周）">
              <input
                type="date"
                className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </Field>
            <Field label="结束日期（维周）">
              <input
                type="date"
                className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </Field>
          </div>
          <Field label="访视点">
            <input
              className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              value={form.wei_visit_point}
              onChange={(e) => setForm({ ...form, wei_visit_point: e.target.value })}
            />
          </Field>
          <Field label="具体访视日期">
            <input
              type="text"
              placeholder="如 2026-03-15 或 3 月上旬"
              className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              value={form.wei_visit_date}
              onChange={(e) => setForm({ ...form, wei_visit_date: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="研究员">
              <input
                className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.researcher_name}
                onChange={(e) => setForm({ ...form, researcher_name: e.target.value })}
              />
            </Field>
            <Field label="督导">
              <input
                className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.supervisor_name}
                onChange={(e) => setForm({ ...form, supervisor_name: e.target.value })}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-3 border-t border-slate-100 pt-4">
          <h4 className="text-sm font-medium text-slate-700">第二部分 · 主管 / 专员</h4>
          <Field label="计划预约人数">
            <input
              type="number"
              min={0}
              className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              value={form.planned_appointment_count}
              onChange={(e) => setForm({ ...form, planned_appointment_count: Number(e.target.value) })}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="预计工时">
              <input
                type="number"
                step="0.01"
                className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.estimated_work_hours === '' ? '' : form.estimated_work_hours}
                onChange={(e) =>
                  setForm({
                    ...form,
                    estimated_work_hours: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="实际工时（专员填写）">
              <input
                type="number"
                step="0.01"
                className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.actual_work_hours === '' ? '' : form.actual_work_hours}
                onChange={(e) =>
                  setForm({
                    ...form,
                    actual_work_hours: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="招募启动日期">
              <input
                type="date"
                className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.recruit_start_date}
                onChange={(e) => setForm({ ...form, recruit_start_date: e.target.value })}
              />
            </Field>
            <Field label="招募结束日期">
              <input
                type="date"
                className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.recruit_end_date}
                onChange={(e) => setForm({ ...form, recruit_end_date: e.target.value })}
              />
            </Field>
          </div>
          <div>
            <span className="block text-sm font-medium text-slate-600 mb-2">派发招募专员（多选）</span>
            <div className="flex flex-wrap gap-2">
              {RECRUIT_SPECIALIST_OPTIONS.map((name) => (
                <label key={name} className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.recruit_specialist_names.includes(name)}
                    onChange={() => toggleSpecialist(name)}
                  />
                  {name}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.channel_recruitment_needed}
              onChange={(e) => setForm({ ...form, channel_recruitment_needed: e.target.checked })}
            />
            需要渠道招募（推广专员樊亚娟可见）
          </label>
          <Field label="物料准备状态">
            <select
              className="min-h-10 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              value={form.material_prep_status}
              onChange={(e) => setForm({ ...form, material_prep_status: e.target.value })}
            >
              {Object.entries(MATERIAL_PREP_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </section>

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="min-h-11 px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
            取消
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {mutation.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CreatePlanModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    protocol_id: 0,
    project_code: '',
    title: '',
    target_count: 0,
    sample_requirement: '',
    start_date: '',
    end_date: '',
    wei_visit_point: '',
    wei_visit_date: '',
    researcher_name: '',
    supervisor_name: '',
    description: '',
    planned_appointment_count: 0,
    estimated_work_hours: '' as number | '',
    recruit_start_date: '',
    recruit_end_date: '',
    recruit_specialist_names: [] as string[],
    channel_recruitment_needed: false,
    material_prep_status: 'draft',
  })

  const protocolsQuery = useQuery({
    queryKey: ['protocols', 'select'],
    queryFn: async () => {
      const res = await protocolApi.list({ page_size: 100 })
      return res?.data?.items ?? []
    },
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error('请输入项目名称')
      if (!form.project_code.trim()) throw new Error('请输入项目编号')
      if (!form.target_count || form.target_count <= 0) throw new Error('样本量必须大于 0')
      if (!form.start_date || !form.end_date) throw new Error('请选择维周启动/结束日期')
      if (form.end_date < form.start_date) throw new Error('结束日期不能早于开始日期')
      const res = await recruitmentApi.createPlan({
        protocol_id: form.protocol_id || undefined,
        project_code: form.project_code.trim(),
        title: form.title.trim(),
        target_count: Number(form.target_count),
        start_date: form.start_date,
        end_date: form.end_date,
        description: form.description,
        sample_requirement: form.sample_requirement,
        wei_visit_point: form.wei_visit_point,
        wei_visit_date: form.wei_visit_date || undefined,
        researcher_name: form.researcher_name,
        supervisor_name: form.supervisor_name,
        planned_appointment_count: form.planned_appointment_count || 0,
        estimated_work_hours: form.estimated_work_hours === '' ? undefined : Number(form.estimated_work_hours),
        recruit_start_date: form.recruit_start_date || undefined,
        recruit_end_date: form.recruit_end_date || undefined,
        recruit_specialist_names: form.recruit_specialist_names,
        channel_recruitment_needed: form.channel_recruitment_needed,
        material_prep_status: form.material_prep_status,
      })
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

  const toggleSpecialist = (name: string) => {
    setForm((f) => {
      const set = new Set(f.recruit_specialist_names)
      if (set.has(name)) set.delete(name)
      else set.add(name)
      return { ...f, recruit_specialist_names: Array.from(set) }
    })
  }

  const protocols = protocolsQuery.data ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-4 md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-800 mb-2">新增计划</h3>
        <p className="text-xs text-slate-500 mb-4">维周未同步时可手工录入。可不选关联协议（系统将使用占位协议）。</p>

        <div className="space-y-3">
          <Field label="项目编号（唯一）">
            <input
              className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              value={form.project_code}
              onChange={(e) => setForm({ ...form, project_code: e.target.value })}
              placeholder="如 C260"
            />
          </Field>
          <Field label="项目名称">
            <input
              className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="关联协议（可选）">
            <select
              value={form.protocol_id}
              onChange={(e) => setForm({ ...form, protocol_id: Number(e.target.value) })}
              className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            >
              <option value={0}>不关联（占位协议）</option>
              {protocols.map((p: { id: number; title: string; protocol_no?: string }) => (
                <option key={p.id} value={p.id}>
                  {p.protocol_no ? `${p.protocol_no} - ` : ''}
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="样本量">
            <input
              type="number"
              min={1}
              className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              value={form.target_count || ''}
              onChange={(e) => setForm({ ...form, target_count: Number(e.target.value) })}
            />
          </Field>
          <Field label="样本要求">
            <textarea
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              rows={2}
              value={form.sample_requirement}
              onChange={(e) => setForm({ ...form, sample_requirement: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="启动日期（维周）">
              <input
                type="date"
                className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </Field>
            <Field label="结束日期（维周）">
              <input
                type="date"
                className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </Field>
          </div>
          <Field label="访视点">
            <input
              className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              value={form.wei_visit_point}
              onChange={(e) => setForm({ ...form, wei_visit_point: e.target.value })}
            />
          </Field>
          <Field label="具体访视日期">
            <input
              type="text"
              placeholder="如 2026-03-15 或 3 月上旬"
              className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              value={form.wei_visit_date}
              onChange={(e) => setForm({ ...form, wei_visit_date: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="研究员">
              <input
                className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.researcher_name}
                onChange={(e) => setForm({ ...form, researcher_name: e.target.value })}
              />
            </Field>
            <Field label="督导">
              <input
                className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.supervisor_name}
                onChange={(e) => setForm({ ...form, supervisor_name: e.target.value })}
              />
            </Field>
          </div>

          <div className="border-t border-slate-100 pt-3 mt-2">
            <p className="text-sm font-medium text-slate-700 mb-2">主管填报（可选）</p>
            <Field label="计划预约人数">
              <input
                type="number"
                min={0}
                className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.planned_appointment_count}
                onChange={(e) => setForm({ ...form, planned_appointment_count: Number(e.target.value) })}
              />
            </Field>
            <Field label="预计工时">
              <input
                type="number"
                step="0.01"
                className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={form.estimated_work_hours === '' ? '' : form.estimated_work_hours}
                onChange={(e) =>
                  setForm({
                    ...form,
                    estimated_work_hours: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="招募启动日期">
                <input
                  type="date"
                  className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={form.recruit_start_date}
                  onChange={(e) => setForm({ ...form, recruit_start_date: e.target.value })}
                />
              </Field>
              <Field label="招募结束日期">
                <input
                  type="date"
                  className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  value={form.recruit_end_date}
                  onChange={(e) => setForm({ ...form, recruit_end_date: e.target.value })}
                />
              </Field>
            </div>
            <div className="mb-2">
              <span className="block text-sm font-medium text-slate-600 mb-2">派发招募专员</span>
              <div className="flex flex-wrap gap-2">
                {RECRUIT_SPECIALIST_OPTIONS.map((name) => (
                  <label key={name} className="inline-flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.recruit_specialist_names.includes(name)}
                      onChange={() => toggleSpecialist(name)}
                    />
                    {name}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={form.channel_recruitment_needed}
                onChange={(e) => setForm({ ...form, channel_recruitment_needed: e.target.checked })}
              />
              需要渠道招募
            </label>
            <Field label="物料准备">
              <select
                className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                value={form.material_prep_status}
                onChange={(e) => setForm({ ...form, material_prep_status: e.target.value })}
              >
                {Object.entries(MATERIAL_PREP_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="备注">
            <textarea
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="min-h-11 px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
            取消
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
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
