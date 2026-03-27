/**
 * 周报系统 API（研究台）
 *
 * 与设计文档 2.3 节接口对应，后端前缀 /weekly-report-management
 */
import { api } from '../client'

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done'

/** 优先级：1=正常，2=高，3=急 */
export const WEEKLY_PRIORITY = { NORMAL: 1, HIGH: 2, URGENT: 3 } as const
export const WEEKLY_PRIORITY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '正常' },
  { value: 2, label: '高' },
  { value: 3, label: '急' },
]
export function weeklyPriorityLabel(priority: number): string {
  const opt = WEEKLY_PRIORITY_OPTIONS.find((o) => o.value === priority)
  return opt?.label ?? (priority >= 3 ? '急' : priority === 2 ? '高' : '正常')
}

export interface WeeklyReportTask {
  id: number
  project_id: number
  project_name?: string
  assignee_id: number
  title: string
  status: TaskStatus
  priority: number
  progress: number
  plan_hours: number
  actual_hours: number
  due_date?: string | null
  blocked_reason?: string | null
  is_overdue: boolean
  is_changed_this_week: boolean
}

export interface WeeklyReportItemOut {
  report_id: number
  task_id: number
  this_week_delta: string
  progress_before: number
  progress_after: number
  actual_hours: number
  is_delayed: boolean
}

export interface WeeklyReportNotesOut {
  report_id: number
  blockers: string
  support_needed: string
  next_week_focus: string
  ops_work: string
  next_week_plan: string
}

export interface WeeklyReportOut {
  id: number
  user_id: number
  report_year: number
  report_week: number
  period_start: string
  period_end: string
  status: 'draft' | 'submitted'
  submitted_at?: string | null
  /** 提交时保存的周报正文（预览框编辑后内容） */
  submitted_content?: string
  /** 草稿保存的预览正文（预览框编辑后内容） */
  draft_content?: string
  items: WeeklyReportItemOut[]
  notes: WeeklyReportNotesOut
}

export interface WeeklyReportInitOut {
  report: WeeklyReportOut
  tasks: WeeklyReportTask[]
}

/** 草稿/历史列表项（简要信息） */
export interface WeeklyReportListItem {
  id: number
  report_year: number
  report_week: number
  period_start: string | null
  period_end: string | null
  status: 'draft' | 'submitted'
  submitted_at?: string | null
}

export interface WeeklyReportDraftIn {
  report_year: number
  report_week: number
  selected_task_ids: number[]
  item_updates: Record<number, { progress_after?: number; actual_hours?: number; this_week_delta?: string }>
  notes?: {
    blockers?: string
    support_needed?: string
    next_week_focus?: string
    ops_work?: string
  }
  draft_content?: string
}

const BASE = '/weekly-report-management'

export const weeklyReportApi = {
  /** 初始化/获取指定年周的周报与任务；管理员可传 user_id 查看指定用户周报 */
  init(year: number, week: number, params?: { user_id?: number }) {
    return api.get<WeeklyReportInitOut>(`${BASE}/my-weekly-report/init`, { params: { year, week, ...params } })
  },

  /** 保存周报草稿 */
  saveDraft(payload: WeeklyReportDraftIn) {
    return api.post<WeeklyReportOut>(`${BASE}/my-weekly-report/draft`, payload)
  },

  /** 删除周报草稿（仅草稿可删） */
  deleteDraft(report_year: number, report_week: number) {
    return api.post<void>(`${BASE}/my-weekly-report/draft/delete`, { report_year, report_week })
  },

  /** 提交周报；可传 submitted_content 提交预览框编辑后的周报正文 */
  submit(report_year: number, report_week: number, params?: { submitted_content?: string }) {
    return api.post<WeeklyReportOut>(`${BASE}/my-weekly-report/submit`, {
      report_year,
      report_week,
      ...(params?.submitted_content != null && { submitted_content: params.submitted_content }),
    })
  },

  /** 周报草稿列表（当前用户） */
  listDrafts(limit = 20) {
    return api.get<WeeklyReportListItem[]>(`${BASE}/my-weekly-report/drafts`, { params: { limit } })
  },

  /** 历史周报列表（当前用户，已提交） */
  listHistory(limit = 20) {
    return api.get<WeeklyReportListItem[]>(`${BASE}/my-weekly-report/history`, { params: { limit } })
  },

  /** 查看指定年周周报详情 */
  getHistory(year: number, week: number) {
    return api.get<WeeklyReportOut>(`${BASE}/my-weekly-report/${year}/${week}`)
  },

  /** 已提交的周报重新打开为草稿，可再次编辑；管理员可传 target_user_id 重开指定用户的周报 */
  reopen(report_year: number, report_week: number, target_user_id?: number) {
    return api.post<WeeklyReportOut>(`${BASE}/my-weekly-report/reopen`, {
      report_year,
      report_week,
      ...(target_user_id != null && { target_user_id }),
    })
  },

  /** 我的任务列表；all_weeks=true 时返回全部任务（不做本周限制） */
  listTasks(params: {
    year: number
    week: number
    changed?: boolean
    blocked?: boolean
    overdue?: boolean
    all_weeks?: boolean
  }) {
    return api.get<WeeklyReportTask[]>(`${BASE}/tasks`, { params })
  },

  /** 更新任务 */
  updateTask(taskId: number, payload: { status?: TaskStatus; progress?: number; actual_hours?: number; blocked_reason?: string }) {
    return api.put<WeeklyReportTask>(`${BASE}/tasks/${taskId}`, payload)
  },

  /** 项目列表（自己创建和参与的）；支持搜索、分页，按 start_date 年周倒序 */
  listProjects(params?: {
    created_by?: 'all' | 'mine' | 'others'
    search?: string
    page?: number
    page_size?: number
  }) {
    return api.get<unknown[] | { items: unknown[]; total: number }>(`${BASE}/projects`, { params })
  },

  /** 项目详情 */
  getProject(projectId: number) {
    return api.get<unknown>(`${BASE}/projects/${projectId}`)
  },

  /** 创建项目 */
  createProject(payload: {
    name: string
    owner_id: number
    start_date?: string
    end_date?: string
    member_ids: number[]
    tasks: Array<{
      title: string
      assignee_id: number
      due_date?: string
      priority?: number
      plan_hours?: number
      status?: string
      progress?: number
    }>
  }) {
    return api.post<unknown>(`${BASE}/projects`, payload)
  },

  /** 更新项目（仅创建人或管理员可编辑） */
  updateProject(
    projectId: number,
    payload: {
      name: string
      owner_id: number
      start_date?: string
      end_date?: string
      member_ids: number[]
      tasks: Array<{
        title: string
        assignee_id: number
        due_date?: string
        priority?: number
        plan_hours?: number
        status?: string
        progress?: number
      }>
    }
  ) {
    return api.put<unknown>(`${BASE}/projects/${projectId}`, payload)
  },

  /** 将项目及其任务标记为已完成 */
  completeProject(projectId: number) {
    return api.post<unknown>(`${BASE}/projects/${projectId}/complete`)
  },

  /** 将项目恢复为未完成 */
  activateProject(projectId: number) {
    return api.post<unknown>(`${BASE}/projects/${projectId}/activate`)
  },

  /** 用户列表 */
  listUsers() {
    return api.get<{ id: number; name: string }[]>(`${BASE}/users`)
  },

  /** 周期总览（提交率、完成率、延期率、风险项目占比） */
  dashboardOverview(params?: { period_type?: 'week' | 'month' | 'year'; period_key?: string }) {
    return api.get<{
      period_type: string
      period_key: string
      submit_rate: number
      completion_rate: number
      overdue_rate: number
      risk_rate: number
    }>(`${BASE}/dashboard/overview`, { params })
  },

  /** 项目健康（延期比、阻塞数、甘特；created_by: all | mine | others） */
  dashboardProjectHealth(params?: { period_type?: string; period_key?: string; created_by?: 'all' | 'mine' | 'others' }) {
    return api.get<{
      period_type: string
      period_key: string
      items: Array<{
        project: Record<string, unknown>
        delayed_ratio: number
        blocked_count: number
        gantt: unknown[]
      }>
    }>(`${BASE}/dashboard/project-health`, { params })
  },

  /** 团队活跃热力图 */
  dashboardTeamHeatmap(params?: { period_type?: string; period_key?: string }) {
    return api.get<{
      period_type: string
      period_key: string
      users: Array<{ user_id: number; task_updates: number; report_submits: number; heat: number }>
    }>(`${BASE}/dashboard/team-heatmap`, { params })
  },

  /** 下钻（scope_type: user | project | report） */
  dashboardDrilldown(params: { scope_type: 'user' | 'project' | 'report'; scope_id: string; period_key: string }) {
    return api.get<{ scope_type: string; scope_id: string; period_key: string; data: unknown }>(
      `${BASE}/dashboard/drilldown`,
      { params }
    )
  },

  /** 下属已提交周报列表（领导可见） */
  listSubordinateReports(year: number, week: number) {
    return api.get<{ reports: (WeeklyReportOut & { user_name: string })[]; subordinate_ids: number[] }>(
      `${BASE}/my-weekly-report/subordinates`,
      { params: { year, week } },
    )
  },

  /** 催办（nudge） */
  nudge(payload: { week_key: string; user_ids: number[]; remind_type?: 'nudge' | 'auto' }) {
    return api.post<{ ok: boolean; sent: number }>(`${BASE}/reminders/nudge`, payload)
  },

  /** 触发周报提醒（内部/定时调用） */
  triggerWeeklyReminder(params?: { scope?: 'team' | 'all'; now_iso?: string }) {
    return api.post<{ ok: boolean; week_key: string; reminded_count: number; reminded_ids: number[] }>(
      '/internal/scheduler/weekly-reminder',
      undefined,
      { params }
    )
  },
}

/** 获取当前 ISO 周 */
export function getCurrentISOWeek(): { year: number; week: number } {
  const now = new Date()
  const target = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNr = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const diff = target.getTime() - firstThursday.getTime()
  const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000))
  const year = target.getUTCFullYear()
  return { year, week }
}
