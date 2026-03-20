/**
 * 管理驾驶舱 API 模块
 *
 * 对应后端：/api/v1/dashboard/
 * 功能：A1 趋势分析 / A2 预警中心 / A3 项目组合 / E1 团队负荷
 */
import { api } from '../client'

export interface DashboardKPI {
  active_projects: number
  total_subjects: number
  week_completed: number
  overdue_workorders: number
  pending_payment: number
  open_deviations: number
}

export interface ProjectHealth {
  id: number
  title: string
  code: string
  product_category: string
  sample_size: number
  enrolled: number
  enrollment_rate: number
  wo_total: number
  wo_done: number
  completion_rate: number
  deviation_count: number
  capa_count: number
  overdue_wo: number
  health: 'healthy' | 'warning' | 'critical'
  risk_score: number
}

export interface DashboardAlert {
  type: string
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  entity_id: number
  entity_type?: string
  link?: string
}

export interface ManagerOverview {
  kpi: DashboardKPI
  project_health: ProjectHealth[]
  alerts: DashboardAlert[]
}

export interface TrendPoint {
  date: string
  count: number
}

export interface WorkorderTrendPoint {
  date: string
  created: number
  completed: number
  backlog: number
}

export interface RevenueTrendPoint {
  month: string
  contracted: number
  received: number
  receivable: number
}

export interface DeviationTrendPoint {
  month: string
  critical: number
  major: number
  minor: number
  total: number
}

export interface EnrollmentTrend {
  plan: TrendPoint[]
  actual: TrendPoint[]
  predicted: TrendPoint[]
  summary: {
    enrolled: number
    sample_size: number
    enrollment_rate: number
    predicted_completion_date: string | null
  }
}

export interface TrendsData {
  enrollment?: EnrollmentTrend
  workorder?: {
    series: WorkorderTrendPoint[]
    granularity: string
    total_created: number
    total_completed: number
    current_backlog: number
  }
  deviation?: { series: DeviationTrendPoint[] }
  revenue?: { series: RevenueTrendPoint[] }
  prediction?: {
    predicted_date: string | null
    confidence: number
    days_remaining?: number
    daily_rate?: number
    message: string
  }
}

export interface PortfolioProject {
  id: number
  title: string
  code: string
  enrolled: number
  sample_size: number
  contract_amount: number
  milestones: Array<{
    type: string
    name: string
    target_date: string
    actual_date: string | null
    is_achieved: boolean
  }>
}

export interface ResourceConflict {
  person_id: number
  date: string
  count: number
  slots: Array<{
    id: number
    visit_node: string
    start_time: string | null
    end_time: string | null
  }>
}

export interface TeamMember {
  id: number
  name: string
  avatar: string
  role: string
  active_count: number
  week_completed: number
  overdue_count: number
  load_rate: number
}

export interface TeamCapacity {
  members: TeamMember[]
  heatmap: Record<number, Record<string, number>>
  total_members: number
  utilization_rate: number
  period: { start: string; end: string }
}

export interface TodoItem {
  id: string
  type: string
  title: string
  detail: string
  entity_id: number
  entity_type: string
  urgency: 'critical' | 'high' | 'medium' | 'low'
  created_at: string | null
  link: string
}

export interface TodoSummary {
  approvals: number
  overdue_workorders: number
  pending_changes: number
  upcoming_visits: number
  unread_notifications: number
  total: number
}

export interface MyTodoData {
  items: TodoItem[]
  summary: TodoSummary
}

export interface BusinessFunnel {
  opportunities: { count: number; amount: number }
  quotes: { count: number; amount: number }
  contracts: { count: number; amount: number }
  payments: { count: number; amount: number }
}

export interface ProjectBusiness {
  project_id: number
  project_title: string
  project_code: string
  contract_amount: number
  invoiced: number
  received: number
  outstanding: number
  collection_rate: number
  overdue: boolean
}

export interface BusinessPipelineData {
  funnel: BusinessFunnel
  projects: ProjectBusiness[]
}

export const dashboardApi = {
  /** 管理驾驶舱总览 */
  getManagerOverview() {
    return api.get<ManagerOverview>('/dashboard/manager-overview')
  },

  /** A1: 趋势分析 */
  getTrends(params?: { protocol_id?: number; granularity?: string }) {
    return api.get<TrendsData>('/dashboard/trends', { params })
  },

  /** A2: 多维预警 */
  getAlerts() {
    return api.get<DashboardAlert[]>('/dashboard/alerts')
  },

  /** A3: 项目组合 */
  getPortfolio() {
    return api.get<{ projects: PortfolioProject[] }>('/dashboard/portfolio')
  },

  /** A3: 资源冲突检测 */
  getResourceConflicts(params?: { start_date?: string; end_date?: string }) {
    return api.get<{ conflicts: ResourceConflict[] }>('/dashboard/resource-conflicts', { params })
  },

  /** E1: 团队全景 */
  getTeamOverview() {
    return api.get<TeamMember[]>('/dashboard/team-overview')
  },

  /** E1: 团队产能 */
  getTeamCapacity(params?: { start_date?: string; end_date?: string }) {
    return api.get<TeamCapacity>('/dashboard/team-capacity', { params })
  },

  /** 工作台统计 */
  getStats() {
    return api.get('/dashboard/stats')
  },

  /** 最近动态 */
  getActivities() {
    return api.get<Array<{ id: number; title: string; type: string; time: string }>>('/dashboard/activities')
  },

  /** 项目客户分析 */
  getProjectAnalysis(refresh = false) {
    return api.get('/dashboard/project-analysis', { params: { refresh } })
  },

  /** 个人待办聚合 */
  getMyTodo() {
    return api.get<MyTodoData>('/dashboard/my-todo')
  },

  /** 商务管线概览 */
  getBusinessPipeline() {
    return api.get<BusinessPipelineData>('/dashboard/business-pipeline')
  },
}
