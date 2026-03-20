import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ethicsApi } from '@/services/ethicsApi'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  submitted: 'bg-blue-100 text-blue-700',
  reviewing: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  withdrawn: 'bg-slate-100 text-slate-500',
}

export function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['ethics', 'application', id],
    queryFn: () => ethicsApi.getApplicationDetail(Number(id)),
    enabled: !!id,
  })

  const submitMutation = useMutation({
    mutationFn: () => ethicsApi.submitApplication(Number(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ethics', 'application', id] }),
  })

  const withdrawMutation = useMutation({
    mutationFn: () => ethicsApi.withdrawApplication(Number(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ethics', 'application', id] }),
  })

  if (isLoading) {
    return <div className="text-sm text-slate-400">加载中...</div>
  }

  const app = data?.data
  if (!app) {
    return <div className="text-sm text-slate-400">未找到该申请</div>
  }

  return (
    <div className="max-w-3xl space-y-5 md:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">
          伦理申请详情
        </h2>
        <button
          onClick={() => navigate('/applications')}
          className="min-h-11 text-sm text-slate-500 hover:text-slate-700"
          title="返回伦理申请列表"
        >
          返回列表
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">状态</span>
          <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[app.status] || 'bg-slate-100'}`}>
            {app.status_display || app.status}
          </span>
        </div>

        <InfoRow label="申请编号" value={app.application_no} />
        <InfoRow label="项目名称" value={app.protocol_title} />
        <InfoRow label="申请类型" value={app.application_type_display || app.application_type} />
        <InfoRow label="伦理委员会" value={app.committee_name} />
        <InfoRow label="申请说明" value={app.description} />
        <InfoRow label="创建时间" value={app.created_at ? new Date(app.created_at).toLocaleString() : '-'} />
        <InfoRow label="提交时间" value={app.submitted_at ? new Date(app.submitted_at).toLocaleString() : '-'} />

        <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-100">
          {app.status === 'draft' && (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              className="min-h-11 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              title="提交伦理审查"
            >
              {submitMutation.isPending ? '提交中...' : '提交审查'}
            </button>
          )}
          {(app.status === 'submitted' || app.status === 'reviewing') && (
            <button
              onClick={() => withdrawMutation.mutate()}
              disabled={withdrawMutation.isPending}
              className="min-h-11 px-4 py-2 border border-slate-300 text-slate-600 text-sm rounded-lg hover:bg-slate-50 disabled:opacity-50"
              title="撤回伦理申请"
            >
              {withdrawMutation.isPending ? '撤回中...' : '撤回申请'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row">
      <span className="w-28 text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm text-slate-700">{value || '-'}</span>
    </div>
  )
}
