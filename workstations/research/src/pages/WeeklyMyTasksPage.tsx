/**
 * 周报 - 我的任务
 *
 * 查看“我的任务”列表（按年/周、变更/阻塞/逾期筛选）；更新任务状态、进度、实际工时、阻塞原因
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  weeklyReportApi,
  getCurrentISOWeek,
  weeklyPriorityLabel,
  type WeeklyReportTask,
} from '@cn-kis/api-client'
import { Badge, Empty } from '@cn-kis/ui-kit'

function statusLabel(s: string) {
  if (s === 'todo') return '未开始'
  if (s === 'doing') return '进行中'
  if (s === 'blocked') return '阻塞'
  return '已完成'
}

function badgeClass(task: WeeklyReportTask) {
  if (task.is_overdue) return 'bg-red-100 text-red-700'
  if (task.status === 'blocked') return 'bg-amber-100 text-amber-700'
  if (task.status === 'done') return 'bg-emerald-100 text-emerald-700'
  return 'bg-slate-100 text-slate-600'
}

export default function WeeklyMyTasksPage() {
  const cur = useMemo(() => getCurrentISOWeek(), [])
  const [year, setYear] = useState(cur.year)
  const [week, setWeek] = useState(cur.week)
  const [filterChanged, setFilterChanged] = useState(false)
  const [filterBlocked, setFilterBlocked] = useState(false)
  const [filterOverdue, setFilterOverdue] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<Partial<{ status: string; progress: number; actual_hours: number; blocked_reason: string }>>({})
  const queryClient = useQueryClient()

  const { data: tasksRes, isLoading, error } = useQuery({
    queryKey: ['weekly-report', 'my-tasks', year, week, filterChanged, filterBlocked, filterOverdue],
    queryFn: () =>
      weeklyReportApi.listTasks({
        year,
        week,
        changed: filterChanged || undefined,
        blocked: filterBlocked || undefined,
        overdue: filterOverdue || undefined,
      }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number; payload: Record<string, unknown> }) =>
      weeklyReportApi.updateTask(taskId, payload as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'my-tasks'] })
      setEditingId(null)
      setEditForm({})
    },
  })

  const raw = (tasksRes as any)?.data
  const tasks: WeeklyReportTask[] = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : []

  const startEdit = (t: WeeklyReportTask) => {
    setEditingId(t.id)
    setEditForm({
      status: t.status,
      progress: t.progress,
      actual_hours: t.actual_hours,
      blocked_reason: t.blocked_reason ?? '',
    })
  }

  const submitEdit = () => {
    if (editingId == null) return
    const payload: Record<string, unknown> = {}
    if (editForm.status != null) payload.status = editForm.status
    if (editForm.progress != null) payload.progress = editForm.progress
    if (editForm.actual_hours != null) payload.actual_hours = editForm.actual_hours
    if (editForm.blocked_reason !== undefined) payload.blocked_reason = editForm.blocked_reason || null
    updateMutation.mutate({ taskId: editingId, payload })
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">我的任务</h2>
        <p className="text-sm text-slate-500 mt-1">按年/周查看任务，更新状态、进度、工时与阻塞原因</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            年
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            周（ISO）
            <input
              type="number"
              min={1}
              max={53}
              value={week}
              onChange={(e) => setWeek(Number(e.target.value))}
              className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <span className="text-slate-400">|</span>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={filterChanged}
              onChange={(e) => setFilterChanged(e.target.checked)}
              className="rounded border-slate-300"
            />
            本周有变更
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={filterBlocked}
              onChange={(e) => setFilterBlocked(e.target.checked)}
              className="rounded border-slate-300"
            />
            阻塞
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={filterOverdue}
              onChange={(e) => setFilterOverdue(e.target.checked)}
              className="rounded border-slate-300"
            />
            逾期
          </label>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{(error as Error).message}</div>
        )}
        {isLoading && <div className="text-sm text-slate-500 py-6">加载中…</div>}
        {!isLoading && tasks.length === 0 && (
          <Empty description="该周期暂无任务或筛选无结果" />
        )}
        {!isLoading && tasks.length > 0 && (
          <div className="space-y-3">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border border-slate-200 bg-slate-50/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-800">
                      {t.project_name ? `[${t.project_name}] ` : ''}{t.title}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      项目 #{t.project_id} · {statusLabel(t.status)} · 截止 {t.due_date ?? '-'} · 优先级 {weeklyPriorityLabel(t.priority)} · 进度 {t.progress}% · 工时 {t.actual_hours}h
                    </div>
                    {t.status === 'blocked' && t.blocked_reason && (
                      <div className="mt-2 text-sm text-amber-700">阻塞原因：{t.blocked_reason}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${badgeClass(t)}`}>
                      {t.is_overdue ? '逾期' : t.status === 'blocked' ? '阻塞' : t.is_changed_this_week ? '本周有变更' : '正常'}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(t)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      编辑
                    </button>
                  </div>
                </div>

                {editingId === t.id && (
                  <div className="mt-4 pt-4 border-t border-slate-200 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-600">状态</label>
                      <select
                        value={editForm.status ?? 'todo'}
                        onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        <option value="todo">未开始</option>
                        <option value="doing">进行中</option>
                        <option value="blocked">阻塞</option>
                        <option value="done">已完成</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600">进度 %</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={editForm.progress ?? 0}
                        onChange={(e) => setEditForm((f) => ({ ...f, progress: Number(e.target.value) }))}
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600">实际工时</label>
                      <input
                        type="number"
                        step={0.5}
                        min={0}
                        value={editForm.actual_hours ?? 0}
                        onChange={(e) => setEditForm((f) => ({ ...f, actual_hours: Number(e.target.value) }))}
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-slate-600">阻塞原因</label>
                      <input
                        type="text"
                        value={editForm.blocked_reason ?? ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, blocked_reason: e.target.value }))}
                        placeholder="仅当状态为阻塞时填写"
                        className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2 flex gap-2">
                      <button
                        type="button"
                        onClick={submitEdit}
                        disabled={updateMutation.isPending}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setEditForm({}) }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
