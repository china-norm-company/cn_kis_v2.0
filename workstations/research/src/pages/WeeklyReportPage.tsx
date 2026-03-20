/**
 * 周报填写页（研究台）
 *
 * 与周报系统设计文档一致：选年/周 → 初始化 → 三步填写（选任务 → 调整卡片 → 补充说明）→ 保存草稿/提交
 * UI 风格与 cn_kis_v1.0 研究台一致：Tailwind、白卡、圆角
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  weeklyReportApi,
  getCurrentISOWeek,
  weeklyPriorityLabel,
  type WeeklyReportTask,
  type WeeklyReportInitOut,
  type WeeklyReportListItem,
} from '@cn-kis/api-client'
import { UserSearchSelect } from '../components/UserSearchSelect'

function getISOWeekPeriod(y: number, w: number): { start: string; end: string } {
  const jan4 = new Date(Date.UTC(y, 0, 4))
  const dayOfWeek = (jan4.getUTCDay() + 6) % 7
  const monday = new Date(jan4.getTime() - dayOfWeek * 86400000 + (w - 1) * 7 * 86400000)
  const sunday = new Date(monday.getTime() + 6 * 86400000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(monday), end: fmt(sunday) }
}

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

export default function WeeklyReportPage() {
  const cur = useMemo(() => getCurrentISOWeek(), [])
  const [year, setYear] = useState(cur.year)
  const [week, setWeek] = useState(cur.week)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [viewAsUserId, setViewAsUserId] = useState<number | null>(null)
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [progressAfter, setProgressAfter] = useState<Record<number, number>>({})
  const [hours, setHours] = useState<Record<number, number>>({})
  const [completionNotes, setCompletionNotes] = useState<Record<number, string>>({})
  const [notes, setNotes] = useState({
    blockers: '',
    support_needed: '',
    next_week_focus: '',
    ops_work: '',
    next_week_plan: '',
  })
  /** 用户编辑后的预览正文；为 null 时使用由表单生成的 previewText */
  const [editedPreviewText, setEditedPreviewText] = useState<string | null>(null)
  /** 下周计划的年/周（默认为当前填写周+1） */
  const [planYear, setPlanYear] = useState(week >= 52 ? year + 1 : year)
  const [planWeek, setPlanWeek] = useState(week >= 52 ? 1 : week + 1)
  /** 选任务：项目搜索关键词、当前页、每页条数 */
  const [projectSearch, setProjectSearch] = useState('')
  const [projectPage, setProjectPage] = useState(1)
  const projectPageSize = 10
  const queryClient = useQueryClient()
  const skipRestoreRef = useRef(true)
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null)
  const [activeHistoryId, setActiveHistoryId] = useState<number | null>(null)

  const resetToNewReport = () => {
    skipRestoreRef.current = true
    const now = getCurrentISOWeek()
    setYear(now.year)
    setWeek(now.week)
    setStep(1)
    setSelected({})
    setProgressAfter({})
    setHours({})
    setCompletionNotes({})
    setNotes({ blockers: '', support_needed: '', next_week_focus: '', ops_work: '', next_week_plan: '' })
    setEditedPreviewText(null)
    setViewAsUserId(null)
    setActiveDraftId(null)
    setActiveHistoryId(null)
    setPlanYear(now.week >= 52 ? now.year + 1 : now.year)
    setPlanWeek(now.week >= 52 ? 1 : now.week + 1)
    queryClient.removeQueries({ queryKey: ['weekly-report', 'init'] })
    queryClient.removeQueries({ queryKey: ['weekly-report', 'tasks-all'] })
    queryClient.invalidateQueries({ queryKey: ['weekly-report', 'drafts'] })
  }

  const { data: initRes, isLoading, error, refetch } = useQuery({
    queryKey: ['weekly-report', 'init', year, week, viewAsUserId],
    queryFn: () => weeklyReportApi.init(year, week, viewAsUserId != null ? { user_id: viewAsUserId } : undefined),
    staleTime: 0,
  })

  const raw = (initRes as any)?.data
  const initData = (raw?.data ?? raw) as (WeeklyReportInitOut & { is_admin?: boolean; viewing_user_id?: number; current_user_id?: number }) | undefined
  const report = initData?.report as (typeof initData.report) & { submitted_content?: string; draft_content?: string } | undefined
  const initTasks = initData?.tasks ?? []
  const isAdmin = initData?.is_admin === true
  const viewingUserId = initData?.viewing_user_id
  const currentUserId = initData?.current_user_id
  const isViewingOthers = viewingUserId != null && currentUserId != null && viewingUserId !== currentUserId

  const { data: allTasksRes } = useQuery({
    queryKey: ['weekly-report', 'tasks-all', year, week],
    queryFn: () => weeklyReportApi.listTasks({ year, week, all_weeks: true }),
    enabled: !isViewingOthers,
  })
  const allTasksList: WeeklyReportTask[] = Array.isArray((allTasksRes as any)?.data?.data)
    ? (allTasksRes as any).data.data
    : Array.isArray((allTasksRes as any)?.data)
    ? (allTasksRes as any).data
    : []
  const tasks = allTasksList.length > 0 ? allTasksList : initTasks

  useEffect(() => {
    if (!initData) return
    if (skipRestoreRef.current) {
      skipRestoreRef.current = false
      return
    }
    setActiveDraftId(initData.report.status === 'draft' ? initData.report.id : null)
    const sel: Record<number, boolean> = {}
    for (const it of initData.report.items) sel[it.task_id] = true
    setSelected(sel)
    const pa: Record<number, number> = {}
    const hs: Record<number, number> = {}
    const notesMap: Record<number, string> = {}
    for (const it of initData.report.items) {
      pa[it.task_id] = it.progress_after
      hs[it.task_id] = it.actual_hours
      notesMap[it.task_id] = it.this_week_delta || ''
    }
    setProgressAfter(pa)
    setHours(hs)
    setCompletionNotes(notesMap)
    setNotes({
      blockers: initData.report.notes?.blockers ?? '',
      support_needed: initData.report.notes?.support_needed ?? '',
      next_week_focus: initData.report.notes?.next_week_focus ?? '',
      ops_work: initData.report.notes?.ops_work ?? '',
      next_week_plan: (initData.report.notes as any)?.next_week_plan ?? '',
    })
    const dc = (initData.report as any)?.draft_content
    if (initData.report.status === 'draft' && dc) {
      setEditedPreviewText(dc)
    }
  }, [initData])

  useEffect(() => {
    setEditedPreviewText(null)
    setProjectPage(1)
    setPlanYear(week >= 52 ? year + 1 : year)
    setPlanWeek(week >= 52 ? 1 : week + 1)
  }, [year, week])

  const selectedIds = useMemo(() => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)), [selected])

  const saveDraftMutation = useMutation({
    mutationFn: () =>
      weeklyReportApi.saveDraft({
        report_year: year,
        report_week: week,
        selected_task_ids: selectedIds,
        item_updates: Object.fromEntries(
          selectedIds.map((tid) => [
            tid,
            {
              progress_after: progressAfter[tid] ?? report?.items?.find((i) => i.task_id === tid)?.progress_after ?? 0,
              actual_hours: hours[tid] ?? 0,
              this_week_delta: completionNotes[tid] ?? '',
            },
          ])
        ),
        notes,
        draft_content: editedPreviewText ?? previewText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'init', year, week, viewAsUserId] })
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'drafts'] })
    },
  })

  const submitMutation = useMutation({
    mutationFn: (vars?: { submitted_content?: string }) =>
      weeklyReportApi.submit(year, week, { submitted_content: vars?.submitted_content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'init', year, week, viewAsUserId] })
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'drafts'] })
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'history'] })
    },
  })

  const reopenMutation = useMutation({
    mutationFn: () => weeklyReportApi.reopen(year, week, isViewingOthers ? viewingUserId : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'init', year, week, viewAsUserId] })
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'drafts'] })
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'history'] })
    },
  })

  const deleteDraftMutation = useMutation({
    mutationFn: ({ report_year, report_week }: { report_year: number; report_week: number }) =>
      weeklyReportApi.deleteDraft(report_year, report_week),
    onSuccess: (_, { report_year, report_week }) => {
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'drafts'] })
      queryClient.invalidateQueries({ queryKey: ['weekly-report', 'init', report_year, report_week] })
      if (report_year === year && report_week === week) {
        queryClient.invalidateQueries({ queryKey: ['weekly-report', 'init', year, week, viewAsUserId] })
      }
    },
  })

  const { data: usersRes } = useQuery({
    queryKey: ['weekly-report', 'users'],
    queryFn: () => weeklyReportApi.listUsers(),
    enabled: isAdmin,
  })

  const { data: subordinateRes } = useQuery({
    queryKey: ['weekly-report', 'subordinates', year, week],
    queryFn: () => weeklyReportApi.listSubordinateReports(year, week),
  })
  const subordinatePayload = (subordinateRes as any)?.data?.data ?? (subordinateRes as any)?.data
  const subordinateReports: (typeof initData extends undefined ? never : any)[] =
    Array.isArray(subordinatePayload?.reports) ? subordinatePayload.reports : []
  const subordinateIds: number[] = Array.isArray(subordinatePayload?.subordinate_ids) ? subordinatePayload.subordinate_ids : []
  const isLeader = subordinateIds.length > 0

  const [expandedSubReport, setExpandedSubReport] = useState<number | null>(null)

  const { data: draftsRes } = useQuery({
    queryKey: ['weekly-report', 'drafts'],
    queryFn: () => weeklyReportApi.listDrafts(20),
    enabled: !isViewingOthers,
  })
  const draftsList: WeeklyReportListItem[] = Array.isArray((draftsRes as any)?.data?.data)
    ? (draftsRes as any).data.data
    : Array.isArray((draftsRes as any)?.data)
    ? (draftsRes as any).data
    : []

  const { data: historyRes } = useQuery({
    queryKey: ['weekly-report', 'history'],
    queryFn: () => weeklyReportApi.listHistory(20),
    enabled: !isViewingOthers,
  })
  const historyList: WeeklyReportListItem[] = Array.isArray((historyRes as any)?.data?.data)
    ? (historyRes as any).data.data
    : Array.isArray((historyRes as any)?.data)
    ? (historyRes as any).data
    : []

  const { data: projectsRes } = useQuery({
    queryKey: ['weekly-report', 'projects', projectSearch, projectPage, projectPageSize],
    queryFn: () =>
      weeklyReportApi.listProjects({
        search: projectSearch || undefined,
        page: projectPage,
        page_size: projectPageSize,
      }),
    enabled: !isViewingOthers,
  })
  const projectsPayload = (projectsRes as any)?.data
  const projectList: { id: number; name: string; [k: string]: unknown }[] = Array.isArray(projectsPayload?.items)
    ? projectsPayload.items
    : Array.isArray(projectsPayload)
    ? projectsPayload
    : []
  const projectsTotal: number =
    typeof projectsPayload?.total === 'number' ? projectsPayload.total : projectList.length

  const tasksByProjectId = useMemo(() => {
    const map: Record<number, WeeklyReportTask[]> = {}
    for (const t of tasks) {
      const pid = t.project_id
      if (!map[pid]) map[pid] = []
      map[pid].push(t)
    }
    return map
  }, [tasks])

  const usersList: { id: number; name: string }[] = Array.isArray((usersRes as any)?.data?.data)
    ? (usersRes as any).data.data
    : Array.isArray((usersRes as any)?.data)
    ? (usersRes as any).data
    : []

  const loading = isLoading || saveDraftMutation.isPending || submitMutation.isPending || reopenMutation.isPending
  const errMsg = error?.message || saveDraftMutation.error?.message || submitMutation.error?.message || reopenMutation.error?.message
  const statusPill = report?.status === 'submitted' ? '已提交' : '草稿'
  const canReopen = report?.status === 'submitted'
  const viewingUserName = isViewingOthers && viewingUserId != null ? usersList.find((u) => u.id === viewingUserId)?.name ?? `用户${viewingUserId}` : ''

  const previewText = useMemo(() => {
    if (!initData) return ''
    const lines: string[] = []
    lines.push(`周报：${initData.report.report_year}-W${String(initData.report.report_week).padStart(2, '0')}`)
    lines.push(`周期：${initData.report.period_start} ~ ${initData.report.period_end}`)
    lines.push(`状态：${initData.report.status}`)
    lines.push('')
    lines.push('任务更新：')
    const itById = new Map(initData.report.items.map((x) => [x.task_id, x]))
    for (const t of tasks.filter((x) => selected[x.id])) {
      const it = itById.get(t.id)
      const proj = t.project_name ? `[${t.project_name}] ` : ''
      lines.push(
        `- ${proj}${t.title} [${statusLabel(t.status)}] ${it?.progress_before ?? t.progress}% → ${progressAfter[t.id] ?? t.progress}% / 工时 ${hours[t.id] ?? 0}`
      )
      const delta = completionNotes[t.id] ?? ''
      if (delta) {
        lines.push('  完成情况：')
        lines.push(...delta.split('\n').map((l) => '  ' + l))
      }
    }
    if (notes.blockers) { lines.push(''); lines.push('阻塞：' + notes.blockers) }
    if (notes.support_needed) { lines.push(''); lines.push('需要支持：' + notes.support_needed) }
    if (notes.next_week_focus) { lines.push(''); lines.push('下周聚焦：' + notes.next_week_focus) }
    if (notes.ops_work) { lines.push(''); lines.push('运维琐细工作：'); lines.push(notes.ops_work) }
    if (notes.next_week_plan) {
      const pp = getISOWeekPeriod(planYear, planWeek)
      lines.push('')
      lines.push('【下周计划】')
      lines.push(`周报：${planYear}-W${String(planWeek).padStart(2, '0')}`)
      lines.push(`周期：${pp.start} ~ ${pp.end}`)
      lines.push(notes.next_week_plan)
    }
    return lines.join('\n')
  }, [initData, notes, progressAfter, hours, completionNotes, selected, tasks, planYear, planWeek])

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">周报填写</h2>
        <p className="text-sm text-slate-500 mt-1">用任务卡片更新替代长文本，默认带出本周有变更任务</p>
      </div>

      {isAdmin && usersList.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            查看成员周报：
            <div className="w-48">
              <UserSearchSelect
                users={[{ id: 0, name: '我的周报' }, ...usersList]}
                value={viewAsUserId ?? 0}
                onChange={(id) => setViewAsUserId(id === 0 ? null : id)}
                placeholder="搜索人名"
              />
            </div>
          </label>
        </div>
      )}

      {isViewingOthers && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          正在查看：{viewingUserName} 的最新提交内容（仅读）。可点击「重新编辑」为该成员重新打开周报以便其再次编辑。
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  状态：{statusPill}
                </span>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  Step {step}/4
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                <button
                  type="button"
                  onClick={() => resetToNewReport()}
                  disabled={loading}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  新建周报
                </button>
                <button
                  type="button"
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={loading || !report || report.status === 'submitted' || isViewingOthers}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  保存草稿
                </button>
                <button
                  type="button"
                  onClick={() =>
                    submitMutation.mutate({
                      submitted_content: editedPreviewText ?? previewText,
                    })
                  }
                  disabled={loading || !report || isViewingOthers}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  提交周报
                </button>
                {canReopen && (
                  <button
                    type="button"
                    onClick={() => reopenMutation.mutate()}
                    disabled={loading}
                    className="rounded-lg border border-slate-400 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    title="将已提交的周报重新打开为草稿，可再次编辑后保存或提交"
                  >
                    重新编辑
                  </button>
                )}
              </div>
            </div>
            {canReopen && (
              <p className="mt-2 text-xs text-slate-500">当前为已提交状态，仅可查看。点击「重新编辑」后可再次修改并保存或提交。</p>
            )}
            {errMsg ? (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errMsg}</div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
              {[1, 2, 3, 4].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStep(s as 1 | 2 | 3 | 4)}
                  disabled={s === 2 && selectedIds.length === 0}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    step === s ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {s} {s === 1 ? '选任务' : s === 2 ? '调整卡片' : s === 3 ? '补充说明' : '下周计划'}
                </button>
              ))}
              <span className="text-sm text-slate-500">已选 {selectedIds.length} / {tasks.length}</span>
            </div>

            {loading && !initData ? (
              <div className="mt-4 text-sm text-slate-500">加载中…</div>
            ) : null}

            {step === 1 && (
              <div className="mt-4">
                        <p className="mb-3 text-sm text-slate-500">按项目分页展示自己创建和参与的项目及全部任务，勾选要选入本周周报的任务。</p>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <input
                    type="search"
                    value={projectSearch}
                    onChange={(e) => {
                      setProjectSearch(e.target.value)
                      setProjectPage(1)
                    }}
                    placeholder="搜索项目名称"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-56"
                  />
                  <span className="text-sm text-slate-500">
                    共 {projectsTotal} 个项目，第 {(projectPage - 1) * projectPageSize + 1}–{Math.min(projectPage * projectPageSize, projectsTotal)} 项
                  </span>
                </div>
                <div className="space-y-4">
                  {projectList.map((proj) => {
                    const projectTasks = tasksByProjectId[proj.id as number] ?? []
                    return (
                      <div key={proj.id} className="rounded-lg border border-slate-200 bg-slate-50/30 overflow-hidden">
                        <div className="bg-slate-100/80 px-4 py-2 text-sm font-medium text-slate-700">
                          {proj.name as string}
                          {projectTasks.length > 0 && (
                            <span className="ml-2 text-slate-500 font-normal">
                              （{projectTasks.length} 个任务）
                            </span>
                          )}
                        </div>
                        <div className="p-3 space-y-2">
                          {projectTasks.length === 0 ? (
                            <p className="text-sm text-slate-400 py-1">该项目下暂无你的任务</p>
                          ) : (
                            projectTasks.map((t) => (
                              <div
                                key={t.id}
                                className="rounded-lg border border-slate-200 bg-white p-3"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <div className="font-medium text-slate-800">{t.title}</div>
                                    <div className="mt-1 text-sm text-slate-500">
                                      {statusLabel(t.status)} · 截止 {t.due_date ?? '-'} · 优先级 {weeklyPriorityLabel(t.priority)}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${badgeClass(t)}`}>
                                      {t.is_overdue ? '逾期' : t.status === 'blocked' ? '阻塞' : '正常'}
                                    </span>
                                    <label className="flex items-center gap-2 text-sm text-slate-600">
                                      <input
                                        type="checkbox"
                                        checked={!!selected[t.id]}
                                        onChange={(e) => setSelected((s) => ({ ...s, [t.id]: e.target.checked }))}
                                        disabled={report?.status === 'submitted' || isViewingOthers}
                                        className="rounded border-slate-300"
                                      />
                                      选入周报
                                    </label>
                                  </div>
                                </div>
                                {t.status === 'blocked' && t.blocked_reason ? (
                                  <div className="mt-2 text-sm text-slate-500">阻塞原因：{t.blocked_reason}</div>
                                ) : null}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {projectsTotal > projectPageSize && (
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setProjectPage((p) => Math.max(1, p - 1))}
                      disabled={projectPage <= 1}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      上一页
                    </button>
                    <span className="text-sm text-slate-600">
                      第 {projectPage} / {Math.ceil(projectsTotal / projectPageSize)} 页
                    </span>
                    <button
                      type="button"
                      onClick={() => setProjectPage((p) => p + 1)}
                      disabled={projectPage >= Math.ceil(projectsTotal / projectPageSize)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      下一页
                    </button>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-slate-500">调整进度、工时与完成情况。</p>
                {tasks
                  .filter((t) => selected[t.id])
                  .map((t) => {
                    const adjustedProgress = progressAfter[t.id] ?? t.progress ?? 0
                    const displayStatus =
                      t.status === 'blocked'
                        ? statusLabel('blocked')
                        : adjustedProgress >= 100
                        ? statusLabel('done')
                        : adjustedProgress > 0
                        ? statusLabel('doing')
                        : statusLabel('todo')
                    return (
                    <div key={t.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-medium text-slate-800">
                            {t.project_name ? `[${t.project_name}] ` : ''}{t.title}
                          </div>
                          <div className="text-sm text-slate-500">
                            状态：{displayStatus} · 当前进度 {adjustedProgress}%
                          </div>
                        </div>
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${badgeClass(t)}`}>
                          {t.is_overdue ? '逾期风险' : '—'}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-slate-600">
                            进度：{progressAfter[t.id] ?? t.progress ?? 0}%
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Number(progressAfter[t.id] ?? t.progress ?? 0)}
                            onChange={(e) => setProgressAfter((m) => ({ ...m, [t.id]: Number(e.target.value) }))}
                            disabled={report?.status === 'submitted' || isViewingOthers}
                            className="mt-1 w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-600">实际工时（小时）</label>
                          <div className="mt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setHours((m) => ({ ...m, [t.id]: Math.max(0, (m[t.id] ?? t.actual_hours ?? 0) - 0.5) }))}
                              disabled={report?.status === 'submitted' || isViewingOthers}
                              className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
                            >
                              -0.5
                            </button>
                            <input
                              type="number"
                              step={0.5}
                              min={0}
                              value={Number(hours[t.id] ?? t.actual_hours ?? 0)}
                              onChange={(e) => setHours((m) => ({ ...m, [t.id]: Number(e.target.value) }))}
                              disabled={report?.status === 'submitted' || isViewingOthers}
                              className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setHours((m) => ({ ...m, [t.id]: (m[t.id] ?? t.actual_hours ?? 0) + 0.5 }))}
                              disabled={report?.status === 'submitted' || isViewingOthers}
                              className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
                            >
                              +0.5
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className="block text-sm text-slate-500">完成情况（本周实现内容）</label>
                        <textarea
                          value={completionNotes[t.id] ?? ''}
                          onChange={(e) => setCompletionNotes((m) => ({ ...m, [t.id]: e.target.value }))}
                          disabled={report?.status === 'submitted' || isViewingOthers}
                          placeholder="简述本周完成内容…"
                          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm min-h-[60px]"
                        />
                      </div>
                    </div>
                  )
                  })}
              </div>
            )}

            {step === 3 && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-slate-500">补充说明：阻塞 / 需要支持 / 下周聚焦；运维琐细工作供管理查看。</p>
                <div className="space-y-3">
                  {[
                    { key: 'blockers' as const, label: '阻塞' },
                    { key: 'support_needed' as const, label: '需要支持' },
                    { key: 'next_week_focus' as const, label: '下周聚焦' },
                    { key: 'ops_work' as const, label: '运维琐细工作（可选）', placeholder: '如：环境维护、值班、发布、故障处理等…' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-slate-600">{label}</label>
                      <textarea
                        value={notes[key]}
                        onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))}
                        disabled={report?.status === 'submitted' || isViewingOthers}
                        placeholder={placeholder}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm min-h-[60px]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (() => {
              const planPeriod = getISOWeekPeriod(planYear, planWeek)
              return (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-slate-500">填写下周工作计划，便于团队提前协调安排。</p>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    年
                    <input
                      type="number"
                      value={planYear}
                      onChange={(e) => setPlanYear(Number(e.target.value))}
                      disabled={report?.status === 'submitted' || isViewingOthers}
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    周（ISO）
                    <input
                      type="number"
                      min={1}
                      max={53}
                      value={planWeek}
                      onChange={(e) => setPlanWeek(Number(e.target.value))}
                      disabled={report?.status === 'submitted' || isViewingOthers}
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <span className="text-sm text-slate-500">
                    周期：{planPeriod.start} ~ {planPeriod.end}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">下周计划</label>
                  <textarea
                    value={notes.next_week_plan}
                    onChange={(e) => setNotes((n) => ({ ...n, next_week_plan: e.target.value }))}
                    disabled={report?.status === 'submitted' || isViewingOthers}
                    placeholder="列出下周的主要工作计划、预计产出…"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm min-h-[120px]"
                  />
                </div>
              </div>
              )
            })()}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700">预览</h3>
          <p className="mt-1 text-sm text-slate-500">可编辑，提交时将以此处内容作为周报正文提交(手动编辑后不能使用左边周报填写框)</p>
          <textarea
            value={
              editedPreviewText ??
              (activeHistoryId != null && report?.status === 'submitted' && report?.submitted_content != null && report.submitted_content !== ''
                ? report.submitted_content
                : previewText)
            }
            onChange={(e) => setEditedPreviewText(e.target.value)}
            readOnly={report?.status === 'submitted' || isViewingOthers}
            placeholder="加载中…"
            className="mt-3 w-full min-h-[320px] rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
          />
        </div>
      </div>

      {/* 周报草稿 & 历史周报（仅自己的周报时展示） */}
      {!isViewingOthers && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700">周报草稿</h3>
            <p className="mt-1 text-sm text-slate-500">未提交的周报，点击切换至该周继续编辑</p>
            <ul className="mt-3 space-y-2 max-h-[200px] overflow-y-auto">
              {draftsList.length === 0 ? (
                <li className="text-sm text-slate-400 py-2">暂无草稿</li>
              ) : (
                draftsList.map((item) => {
                  const isActive = activeDraftId === item.id
                  const deleting = deleteDraftMutation.isPending && deleteDraftMutation.variables?.report_year === item.report_year && deleteDraftMutation.variables?.report_week === item.report_week
                  return (
                    <li key={item.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (isActive) {
                            resetToNewReport()
                          } else {
                            setActiveDraftId(item.id)
                            setActiveHistoryId(null)
                            setYear(item.report_year)
                            setWeek(item.report_week)
                            setViewAsUserId(null)
                            queryClient.invalidateQueries({ queryKey: ['weekly-report', 'init', item.report_year, item.report_week] })
                          }
                        }}
                        className={`flex-1 min-w-0 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="font-medium">{item.report_year}-W{String(item.report_week).padStart(2, '0')}</span>
                        {item.period_start && item.period_end && (
                          <span className="ml-2 text-slate-500">
                            {item.period_start} ~ {item.period_end}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm(`确定删除 ${item.report_year}-W${String(item.report_week).padStart(2, '0')} 的草稿？`)) {
                            deleteDraftMutation.mutate({ report_year: item.report_year, report_week: item.report_week })
                          }
                        }}
                        disabled={deleting}
                        className="shrink-0 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                        title="删除草稿"
                      >
                        {deleting ? '删除中…' : '删除'}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700">历史周报</h3>
            <p className="mt-1 text-sm text-slate-500">已提交的周报，点击切换至该周查看</p>
            <ul className="mt-3 space-y-2 max-h-[200px] overflow-y-auto">
              {historyList.length === 0 ? (
                <li className="text-sm text-slate-400 py-2">暂无历史</li>
              ) : (
                historyList.map((item) => {
                  const isActive = activeHistoryId === item.id
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (isActive) {
                            resetToNewReport()
                          } else {
                            setActiveHistoryId(item.id)
                            setActiveDraftId(null)
                            setYear(item.report_year)
                            setWeek(item.report_week)
                            setViewAsUserId(null)
                            skipRestoreRef.current = false
                            queryClient.invalidateQueries({ queryKey: ['weekly-report', 'init', item.report_year, item.report_week] })
                          }
                        }}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="font-medium">{item.report_year}-W{String(item.report_week).padStart(2, '0')}</span>
                        {item.period_start && item.period_end && (
                          <span className="ml-2 text-slate-500">
                            {item.period_start} ~ {item.period_end}
                          </span>
                        )}
                        {item.submitted_at && (
                          <span className="block mt-0.5 text-xs text-slate-400">
                            提交于 {new Date(item.submitted_at).toLocaleString('zh-CN')}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
          </div>
        </div>
      )}

      {/* 员工周报 */}
      {isLeader && !isViewingOthers && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700">员工周报</h3>
          <p className="mt-1 text-sm text-slate-500">
            {year}-W{String(week).padStart(2, '0')} 已提交的周报
          </p>
          {subordinateReports.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">该周暂无已提交的周报</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {subordinateReports.map((sr: any) => {
                const isExpanded = expandedSubReport === sr.id
                return (
                  <li key={sr.id} className="rounded-lg border border-slate-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedSubReport(isExpanded ? null : sr.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <span className="font-medium text-slate-800">{sr.user_name}</span>
                        <span className="ml-3 text-sm text-slate-500">
                          {sr.period_start} ~ {sr.period_end}
                        </span>
                        {sr.submitted_at && (
                          <span className="ml-3 text-xs text-slate-400">
                            提交于 {new Date(sr.submitted_at).toLocaleString('zh-CN')}
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-slate-400">{isExpanded ? '收起 ▲' : '展开 ▼'}</span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-slate-200 px-4 py-3 bg-slate-50/50">
                        <pre className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                          {sr.submitted_content || '（无提交内容）'}
                        </pre>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
