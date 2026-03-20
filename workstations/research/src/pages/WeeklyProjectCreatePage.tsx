/**
 * 周报 - 创建项目
 *
 * 项目名称、时间、任务列表（任务负责人即参与项目）
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { weeklyReportApi, getCurrentISOWeek, WEEKLY_PRIORITY_OPTIONS } from '@cn-kis/api-client'
import { Plus, Trash2 } from 'lucide-react'
import { UserSearchSelect } from '../components/UserSearchSelect'

export default function WeeklyProjectCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [ownerId, setOwnerId] = useState<number>(1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [tasks, setTasks] = useState<Array<{ title: string; assignee_id: number; due_date: string; priority: number; plan_hours: number }>>([
    { title: '', assignee_id: 0, due_date: '', priority: 1, plan_hours: 0 },
  ])

  const { data: usersRes } = useQuery({
    queryKey: ['weekly-report', 'users'],
    queryFn: () => weeklyReportApi.listUsers(),
  })
  const rawUsers = (usersRes as any)?.data
  const users: { id: number; name: string }[] = Array.isArray(rawUsers?.data) ? rawUsers.data : Array.isArray(rawUsers) ? rawUsers : []

  const createMutation = useMutation({
    mutationFn: () =>
      weeklyReportApi.createProject({
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
      navigate('/weekly/projects')
    },
  })

  const addTask = () => {
    setTasks((prev) => [...prev, { title: '', assignee_id: users[0]?.id ?? 0, due_date: '', priority: 1, plan_hours: 0 }])
  }
  const removeTask = (i: number) => {
    setTasks((prev) => prev.filter((_, idx) => idx !== i))
  }
  const updateTask = (i: number, field: string, value: string | number) => {
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: value } : t)))
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">创建项目</h2>
        <p className="text-sm text-slate-500 mt-1">填写项目名称、时间与任务列表（任务负责人即参与该项目）</p>
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
                  value={t.priority}
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
        {createMutation.error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{(createMutation.error as Error).message}</div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            创建项目
          </button>
          <button
            type="button"
            onClick={() => navigate('/weekly/projects')}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
