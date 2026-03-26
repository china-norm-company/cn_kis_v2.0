import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { launchGovernanceApi, type LaunchGoalItem } from '@cn-kis/api-client'
import { CalendarRange, Plus } from 'lucide-react'

export function LaunchGoalsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [scope, setScope] = useState<'phase' | 'weekly'>('weekly')
  const [targetDate, setTargetDate] = useState('')
  const [progress, setProgress] = useState(0)
  const [notes, setNotes] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'launch-goals'],
    queryFn: () => launchGovernanceApi.listGoals(),
  })

  const createMut = useMutation({
    mutationFn: () =>
      launchGovernanceApi.createGoal({
        title,
        scope,
        target_date: targetDate || undefined,
        progress_percent: progress,
        rhythm_notes: notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'launch-goals'] })
      setShowForm(false)
      setTitle('')
      setTargetDate('')
      setProgress(0)
      setNotes('')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { status?: string; progress_percent?: number } }) =>
      launchGovernanceApi.updateGoal(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'launch-goals'] }),
  })

  const items: LaunchGoalItem[] = data?.items || []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">目标与节奏</h2>
          <p className="text-sm text-slate-500 mt-1">阶段目标与周目标，配合缺口池推进验收</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1 rounded-lg bg-primary-600 text-white text-sm px-3 py-2 hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          新建目标
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-sm">
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2"
            placeholder="目标标题 *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              className="border border-slate-200 rounded-lg px-3 py-2"
              value={scope}
              onChange={(e) => setScope(e.target.value as 'phase' | 'weekly')}
            >
              <option value="phase">阶段目标</option>
              <option value="weekly">周目标</option>
            </select>
            <input
              type="date"
              className="border border-slate-200 rounded-lg px-3 py-2"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
            <input
              type="number"
              min={0}
              max={100}
              className="border border-slate-200 rounded-lg px-3 py-2"
              placeholder="进度 %"
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
            />
          </div>
          <textarea
            className="w-full border border-slate-200 rounded-lg px-3 py-2 min-h-[64px]"
            placeholder="节奏备注（如：本周每日开发群同步项）"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            type="button"
            disabled={!title.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
            className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            保存
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-slate-400 py-8 text-center">加载中…</div>
      ) : (
        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-400 text-sm">
              暂无目标，建议每周一更新阶段/周目标
            </div>
          ) : (
            items.map((g) => (
              <div
                key={g.id}
                className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row gap-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CalendarRange className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-slate-800">{g.title}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {g.scope === 'phase' ? '阶段' : '周'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    目标日 {g.target_date || '—'} · 进度 {g.progress_percent}% · 状态 {g.status}
                  </div>
                  {g.rhythm_notes ? (
                    <p className="text-sm text-slate-600 mt-2">{g.rhythm_notes}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 items-start">
                  {g.status === 'active' ? (
                    <>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border border-slate-200"
                        onClick={() =>
                          updateMut.mutate({
                            id: g.id,
                            body: { progress_percent: Math.min(100, g.progress_percent + 10) },
                          })
                        }
                      >
                        +10%
                      </button>
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-700"
                        onClick={() => updateMut.mutate({ id: g.id, body: { status: 'done' } })}
                      >
                        完成
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
