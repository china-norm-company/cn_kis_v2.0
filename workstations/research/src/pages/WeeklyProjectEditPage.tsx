/**
 * 周报 - 编辑项目
 *
 * 仅创建人和管理员可进入并编辑；表单与创建页一致，提交调用更新接口。
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { weeklyReportApi, WEEKLY_PRIORITY_OPTIONS } from '@cn-kis/api-client'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'
import { UserSearchSelect } from '../components/UserSearchSelect'

export default function WeeklyProjectEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const projectId = id ? parseInt(id, 10) : 0

  const [name, setName] = useState('')
  const [ownerId, setOwnerId] = useState<number>(0)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [tasks, setTasks] = useState<Array<{ title: string; assignee_id: number; due_date: string; priority: number; plan_hours: number }>>([])

  const { data: usersRes } = useQuery({
    queryKey: ['weekly-report', 'users'],
    queryFn: () => weeklyReportApi.listUsers(),
  })
  const rawUsers = (usersRes as any)?.data
  const users: { id: number; name: string }[] = Array.isArray(rawUsers?.data) ? rawUsers.data : Array.isArray(rawUsers) ? rawUsers : []

  const { data: projectRes, isLoading: projectLoading, error: projectError } = useQuery({
    queryKey: ['weekly-report', 'project', projectId],
    queryFn: () => weeklyReportApi.getProject(projectId),
    enabled: projectId > 0,
  })

  const rawProject = (projectRes as any)?.data
  const payload = rawProject?.data ?? rawProject
  const project = payload?.project ?? payload
  const canEdit = payload?.can_edit === true
  const existingTasks = payload?.tasks ?? []

  useEffect(() => {
    if (!project || !project.id) return
    setName(project.name ?? '')
    setOwnerId(project.owner_id ?? 0)
    setStartDate(project.start_date ?? '')
    setEndDate(project.end_date ?? '')
    if (Array.isArray(existingTasks) && existingTasks.length > 0) {
      setTasks(
        (existingTasks as any[]).map((t: any) => ({
          title: t.title ?? '',
          assignee_id: t.assignee_id ?? 0,
          due_date: t.due_date ?? '',
          priority: t.priority ?? 3,
          plan_hours: t.plan_hours ?? 0,
        }))
      )
    } else {
      setTasks([{ title: '', assignee_id: project.owner_id ?? 0, due_date: '', priority: 1, plan_hours: 0 }])
    }
  }, [project?.id, project?.name, project?.owner_id, project?.start_date, project?.end_date, existingTasks])

  const updateMutation = useMutation({
    mutationFn: () =>
      weeklyReportApi.updateProject(projectId, {
        name,
        owner_id: ownerId,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        member_ids: [],
        tasks: tasks.filter((t) => t.title.trim()).map((t) => ({
          title: t.title,
          assignee_id: t.assignee_id || ownerId || users[0]?.id,
          due_date: t.due_date || undefined,
          priority: t.priority,
          plan_hours: t.plan_hours,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'projects'] })
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'project', projectId] })
      navigate(`/weekly/projects/${projectId}`)
    },
  })

  const addTask = () => {
    setTasks((prev) => [...prev, { title: '', assignee_id: users[0]?.id ?? ownerId ?? 0, due_date: '', priority: 1, plan_hours: 0 }])
  }
  const removeTask = (i: number) => {
    setTasks((prev) => prev.filter((_, idx) => idx !== i))
  }
  const updateTask = (i: number, field: string, value: string | number) => {
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)))
  }

  if (projectId <= 0) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        无效的项目 ID
        <Link to="/weekly/projects" className="ml-2 underline">返回列表</Link>
      </div>
    )
  }
  if (projectLoading) {
    return <div className="text-sm text-slate-500 py-8">加载中…</div>
  }
  if (projectError) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        {(projectError as Error).message}
        <Link to="/weekly/projects" className="ml-2 underline">返回列表</Link>
      </div>
    )
  }
  if (!canEdit) {
    return (
      <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        您没有编辑该项目的权限（仅创建人和管理员可编辑）。
        <Link to={`/weekly/projects/${projectId}`} className="ml-2 underline">返回详情</Link>
      </div>
    )
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to={`/weekly/projects/${projectId}`}
          className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-800 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> 返回详情
        </Link>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">编辑项目</h2>
        <p className="text-sm text-slate-500 mt-1">修改项目名称、时间与任务列表（任务负责人即参与该项目）</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">项目名称 *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入项目名称"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">负责人</label>
            <UserSearchSelect
              users={users}
              value={ownerId || null}
              onChange={(id) => setOwnerId(id ?? users[0]?.id ?? 0)}
              placeholder="搜索人名"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-slate-600">任务列表</label>
            <button
              type="button"
              onClick={addTask}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
            >
              <Plus className="w-4 h-4" /> 添加任务
            </button>
          </div>
          <div className="space-y-3">
            {tasks.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-3">
                <input
                  type="text"
                  value={t.title}
                  onChange={(e) => updateTask(i, 'title', e.target.value)}
                  placeholder="任务标题"
                  className="flex-1 min-w-[120px] rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
                <div className="w-[140px]">
                  <UserSearchSelect
                    users={users}
                    value={t.assignee_id || null}
                    onChange={(id) => updateTask(i, 'assignee_id', id ?? 0)}
                    placeholder="负责人"
                  />
                </div>
                <input
                  type="date"
                  value={t.due_date}
                  onChange={(e) => updateTask(i, 'due_date', e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
                <select
                  value={[1, 2, 3].includes(t.priority) ? t.priority : 1}
                  onChange={(e) => updateTask(i, 'priority', Number(e.target.value))}
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm min-w-[72px]"
                >
                  {WEEKLY_PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  value={t.plan_hours || ''}
                  onChange={(e) => updateTask(i, 'plan_hours', Number(e.target.value) || 0)}
                  placeholder="计划工时"
                  className="w-20 rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button type="button" onClick={() => removeTask(i)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
        {updateMutation.error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{(updateMutation.error as Error).message}</div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => updateMutation.mutate()}
            disabled={!name.trim() || updateMutation.isPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => navigate(`/weekly/projects/${projectId}`)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
