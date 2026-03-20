/**
 * 周报 - 项目详情
 */
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { weeklyReportApi } from '@cn-kis/api-client'
import { ArrowLeft, Pencil } from 'lucide-react'

function statusLabel(s: string) {
  if (s === 'todo') return '未开始'
  if (s === 'doing') return '进行中'
  if (s === 'blocked') return '阻塞'
  return '已完成'
}

export default function WeeklyProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const projectId = id ? parseInt(id, 10) : 0

  const { data: res, isLoading, error } = useQuery({
    queryKey: ['weekly-report', 'project', projectId],
    queryFn: () => weeklyReportApi.getProject(projectId),
    enabled: projectId > 0,
  })

  const raw = (res as any)?.data
  const payload = raw?.data ?? raw
  const project = payload?.project ?? payload
  const tasks = payload?.tasks ?? []
  const membersContrib = payload?.members_contribution ?? []
  const canEdit = payload?.can_edit === true

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        {(error as Error).message}
        <Link to="/weekly/projects" className="ml-2 text-red-800 underline">返回列表</Link>
      </div>
    )
  }
  if (isLoading || !project) {
    return <div className="text-sm text-slate-500 py-8">加载中…</div>
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/weekly/projects"
          className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-800 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> 返回列表
        </Link>
        {canEdit && (
          <button
            type="button"
            onClick={() => navigate(`/weekly/projects/${projectId}/edit`)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="w-4 h-4" />
            编辑项目
          </button>
        )}
      </div>
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">{project.name}</h2>
        <p className="text-sm text-slate-500 mt-1">
          创建人：{project.created_by_name ?? project.created_by} · 风险：{project.risk_level === 'red' ? '高' : project.risk_level === 'yellow' ? '中' : '低'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">基本信息</h3>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-slate-500">开始 / 结束</dt><dd className="text-slate-800">{project.start_date ?? '-'} ~ {project.end_date ?? '-'}</dd></div>
            <div><dt className="text-slate-500">状态</dt><dd className="text-slate-800">{project.status ?? 'active'}</dd></div>
          </dl>
        </div>
        {membersContrib.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">成员贡献</h3>
            <ul className="space-y-1 text-sm">
              {membersContrib.map((m: { user_id: number; tasks: number; done: number }) => (
                <li key={m.user_id} className="text-slate-700">用户 {m.user_id}：任务 {m.tasks}，已完成 {m.done}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">任务列表</h3>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">暂无任务</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 pr-4 font-medium">标题</th>
                  <th className="pb-2 pr-4 font-medium">负责人</th>
                  <th className="pb-2 pr-4 font-medium">状态</th>
                  <th className="pb-2 pr-4 font-medium">进度</th>
                  <th className="pb-2 pr-4 font-medium">计划/实际工时</th>
                  <th className="pb-2 font-medium">截止日</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t: any) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 font-medium text-slate-800">{t.title}</td>
                    <td className="py-3 pr-4">{t.assignee_id}</td>
                    <td className="py-3 pr-4">{statusLabel(t.status)}</td>
                    <td className="py-3 pr-4">{t.progress}%</td>
                    <td className="py-3 pr-4">{t.plan_hours ?? 0} / {t.actual_hours ?? 0}h</td>
                    <td className="py-3">{t.due_date ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
