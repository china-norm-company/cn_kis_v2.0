/**
 * 周报 - 项目管理列表
 *
 * 项目列表与详情入口；筛选：全部 / 我创建的 / 用户创建的
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { weeklyReportApi } from '@cn-kis/api-client'
import { Empty } from '@cn-kis/ui-kit'
import { Plus, ExternalLink, Pencil, CheckCircle2 } from 'lucide-react'

interface ProjectItem {
  id: number
  name: string
  owner_id: number
  created_by: number
  created_by_name?: string
  start_date?: string
  end_date?: string
  status: string
  risk_level: string
  member_ids: number[]
  task_count: number
  can_edit?: boolean
}

function projectStatusLabel(status?: string) {
  return status === 'completed' ? '已完成' : '未完成'
}

export default function WeeklyProjectListPage() {
  const [createdBy, setCreatedBy] = useState<'all' | 'mine' | 'others'>('all')
  const queryClient = useQueryClient()

  const { data: res, isLoading, error } = useQuery({
    queryKey: ['weekly-report', 'projects', createdBy],
    queryFn: () => weeklyReportApi.listProjects({ created_by: createdBy }),
  })

  const raw = (res as any)?.data
  const items: ProjectItem[] = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : []

  const toggleStatusMutation = useMutation({
    mutationFn: ({ projectId, nextStatus }: { projectId: number; nextStatus: 'completed' | 'active' }) =>
      nextStatus === 'completed' ? weeklyReportApi.completeProject(projectId) : weeklyReportApi.activateProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'projects'] })
    },
  })

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">项目管理</h2>
          <p className="text-sm text-slate-500 mt-1">创建项目、查看项目列表与详情</p>
        </div>
        <Link
          to="/weekly/projects/create"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" />
          创建项目
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm text-slate-600">筛选：</span>
          {(['all', 'mine', 'others'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setCreatedBy(key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                createdBy === key
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {key === 'all' ? '全部' : key === 'mine' ? '我创建的' : '用户创建的'}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{(error as Error).message}</div>
        )}
        {isLoading && <div className="text-sm text-slate-500 py-8">加载中…</div>}
        {!isLoading && items.length === 0 && (
          <Empty description="暂无项目" action={
            <Link
              to="/weekly/projects/create"
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
            >
              <Plus className="w-4 h-4" />
              创建项目
            </Link>
          } />
        )}
        {!isLoading && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 pr-4 font-medium">ID</th>
                  <th className="pb-2 pr-4 font-medium">项目名称</th>
                  <th className="pb-2 pr-4 font-medium">创建人</th>
                  <th className="pb-2 pr-4 font-medium">时间</th>
                  <th className="pb-2 pr-4 font-medium">状态</th>
                  <th className="pb-2 pr-4 font-medium">任务数</th>
                  <th className="pb-2 pr-4 font-medium">风险</th>
                  <th className="pb-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 text-slate-500">{p.id}</td>
                    <td className="py-3 pr-4 font-medium text-slate-800">{p.name}</td>
                    <td className="py-3 pr-4 text-slate-600">{p.created_by_name ?? p.created_by}</td>
                    <td className="py-3 pr-4 text-slate-500">
                      {p.start_date ?? '-'} ~ {p.end_date ?? '-'}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          p.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {projectStatusLabel(p.status)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{p.task_count}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          p.risk_level === 'red'
                            ? 'bg-red-100 text-red-700'
                            : p.risk_level === 'yellow'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {p.risk_level === 'red' ? '高' : p.risk_level === 'yellow' ? '中' : '低'}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-3">
                        <Link
                          to={`/weekly/projects/${p.id}`}
                          className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700"
                        >
                          <ExternalLink className="w-4 h-4" />
                          详情
                        </Link>
                        {p.can_edit && (
                          <Link
                            to={`/weekly/projects/${p.id}/edit`}
                            className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-800"
                          >
                            <Pencil className="w-4 h-4" />
                            编辑
                          </Link>
                        )}
                        {p.can_edit && p.status !== 'completed' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`确认将项目「${p.name}」标记为已完成？这会同时将项目下任务同步为已完成。`)) {
                                toggleStatusMutation.mutate({ projectId: p.id, nextStatus: 'completed' })
                              }
                            }}
                            disabled={toggleStatusMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            已完成
                          </button>
                        )}
                        {p.can_edit && p.status === 'completed' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`确认将项目「${p.name}」恢复为未完成？`)) {
                                toggleStatusMutation.mutate({ projectId: p.id, nextStatus: 'active' })
                              }
                            }}
                            disabled={toggleStatusMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            未完成
                          </button>
                        )}
                      </span>
                    </td>
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
