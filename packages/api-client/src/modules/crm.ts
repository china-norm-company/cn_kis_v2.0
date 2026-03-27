/**
 * 进思·客户台 API 模块 — 管理驾驶舱
 *
 * 对应后端：/api/v1/crm/
 *
 * 端点分组：
 * - P0: 客户画像 + 关键联系人 + 组织架构
 * - P1: 产品矩阵 + 创新日历 + 健康度 + 预警
 * - P2: 赋能（洞察/简报/价值标注）+ 满意度 + 里程碑
 * - P3: 宣称趋势 + 市场趋势通报
 * - 原有: 商机 + 工单（保留）
 */
import { api } from '../client'
import type { ApiListResponse } from '../types'

// ============================================================================
// 接口定义
// ============================================================================
export interface Client {
  id: number
  name: string
  short_name: string
  level: 'strategic' | 'key' | 'normal' | 'potential'
  industry: string
  contact_name: string
  contact_phone: string
  contact_email: string
  address: string
  total_projects: number
  total_revenue: string
  notes: string
  company_type: string
  headquarters: string
  china_entity: string
  annual_revenue_estimate: string
  employee_count_range: string
  partnership_start_date: string | null
  partnership_tier: string
  account_manager_id: number | null
  backup_manager_id: number | null
  main_categories: string[]
  main_claim_types: string[]
  preferred_test_methods: string[]
  regulatory_regions: string[]
  annual_project_budget: string | null
  known_competitors: string[]
  our_share_estimate: number | null
  competitive_advantages: string[]
  competitive_risks: string[]
  communication_preference: string
  report_language: string
  invoice_requirements: Record<string, unknown>
  payment_terms_days: number
  create_time: string
}

export interface ClientContact {
  id: number
  client_id: number
  name: string
  title: string
  department: string
  role_type: string
  phone: string
  email: string
  wechat: string
  relationship_level: string
  last_contact_date: string | null
  contact_frequency_days: number
  preferences: Record<string, unknown>
  birthday: string | null
  notes: string
  create_time: string
}

export interface ClientOrgMap {
  id: number
  client_id: number
  org_structure: Record<string, unknown>
  decision_chain: unknown[]
  budget_authority: unknown[]
  update_time: string
}

export interface Opportunity {
  id: number
  code?: string
  title: string
  client_id: number
  client_name: string
  stage: string
  estimated_amount: string
  probability: number
  owner: string
  owner_id?: number | null
  commercial_owner_name?: string
  research_group?: string
  business_segment?: string
  client_pm?: string
  client_contact_info?: string
  client_department_line?: string
  is_decision_maker?: string
  actual_decision_maker?: string
  actual_decision_maker_department_line?: string
  actual_decision_maker_level?: string
  demand_stages?: string[]
  project_elements?: string
  project_detail?: Record<string, unknown>
  necessity_pct?: number | null
  urgency_pct?: number | null
  uniqueness_pct?: number | null
  expected_close_date: string
  planned_start_date?: string
  demand_name?: string
  sales_amount_total?: string
  sales_by_year?: Record<string, string>
  sales_amount_change?: string
  key_opportunity?: boolean
  description: string
  remark?: string
  cancel_reason?: string
  lost_reason?: string
  create_time: string
}

export interface CRMTicket {
  id: number
  code: string
  title: string
  client_id: number
  client_name: string
  category: string
  priority: string
  status: string
  description: string
  assignee: string
  resolved_at: string | null
  create_time: string
}

export interface ProductLine {
  id: number
  client_id: number
  brand: string
  category: string
  sub_category: string
  price_tier: string
  annual_sku_count: number
  typical_claims: string[]
  notes: string
  create_time: string
}

export interface InnovationCalendarItem {
  id: number
  client_id: number
  product_line_id: number | null
  year: number
  season: string
  launch_date: string | null
  product_concept: string
  innovation_type: string
  test_requirements: string[]
  status: string
  our_opportunity: string
  competitor_info: string
  create_time: string
}

export interface HealthScore {
  id: number
  client_id: number
  score_date: string
  overall_score: number
  engagement_score: number
  revenue_score: number
  satisfaction_score: number
  growth_score: number
  loyalty_score: number
  innovation_score: number
  churn_risk: string
  risk_factors: string[]
  recommended_actions: string[]
}

export interface ClientAlert {
  id: number
  client_id: number
  client_name: string
  alert_type: string
  severity: string
  description: string
  suggested_action: string
  acknowledged: boolean
  acknowledged_at: string | null
  resolved: boolean
  resolved_at: string | null
  resolved_note: string
  create_time: string
}

export interface ValueInsight {
  id: number
  client_id: number
  insight_type: string
  title: string
  content: string
  source: string
  shared_with: number[]
  shared_at: string | null
  client_feedback: string
  led_to_opportunity_id: number | null
  create_time: string
}

export interface ClientBrief {
  id: number
  client_id: number
  brief_type: string
  title: string
  client_strategy: string
  market_context: string
  competition_landscape: string
  client_pain_points: string[]
  quality_expectations: string[]
  communication_tips: string[]
  key_contacts: unknown[]
  target_roles: string[]
  published: boolean
  published_at: string | null
  create_time: string
}

export interface ProjectValueTag {
  id: number
  protocol_id: number
  strategic_importance: string
  client_sensitivity: string
  delivery_emphasis: string[]
  upsell_potential: string
  competitor_context: string
  expected_timeline_note: string
  quality_bar: string
  report_format_preference: string
  create_time: string
}

export interface SatisfactionSurvey {
  id: number
  client_id: number
  protocol_id: number | null
  survey_type: string
  overall_satisfaction: number
  quality_score: number
  timeliness_score: number
  communication_score: number
  innovation_score: number
  value_score: number
  nps_score: number | null
  strengths: string
  improvements: string
  respondent_id: number | null
  follow_up_actions: unknown[]
  followed_up: boolean
  create_time: string
}

export interface SuccessMilestone {
  id: number
  client_id: number
  milestone_type: string
  title: string
  achieved_at: string
  description: string
  value: string | null
  create_time: string
}

export interface ClaimTrendItem {
  id: number
  claim_category: string
  claim_text: string
  region: string
  regulatory_basis: string
  test_methods: string[]
  trending_score: number
  year: number
  market_data: Record<string, unknown>
  competitor_usage: unknown[]
}

export interface MarketBulletin {
  id: number
  title: string
  category: string
  summary: string
  detail: string
  impact_analysis: string
  action_items: string[]
  source_references: string[]
  ai_generated: boolean
  relevance_client_ids: number[]
  published: boolean
  published_at: string | null
  create_time: string
}

export interface ClientInsight {
  health_score?: number
  renewal_risk?: string
  cross_sell_suggestions?: string[]
  analysis?: string
}

// ============================================================================
// API
// ============================================================================
export const crmApi = {
  // ===== 客户 (P0) =====

  listClients(params?: {
    level?: string; industry?: string; company_type?: string; partnership_tier?: string;
    keyword?: string; page?: number; page_size?: number
  }) {
    return api.get<ApiListResponse<Client>['data']>('/crm/clients/list', { params })
  },

  getClient(id: number) {
    return api.get<Client>(`/crm/clients/${id}`)
  },

  createClient(data: Partial<Client>) {
    return api.post<Client>('/crm/clients/create', data)
  },

  updateClient(id: number, data: Partial<Client>) {
    return api.put<Client>(`/crm/clients/${id}`, data)
  },

  deleteClient(id: number) {
    return api.delete(`/crm/clients/${id}`)
  },

  getClientStats() {
    return api.get('/crm/clients/stats')
  },

  // ===== 关键联系人 (P0) =====

  listClientContacts(clientId: number) {
    return api.get<ClientContact[]>(`/crm/clients/${clientId}/contacts`)
  },

  createClientContact(clientId: number, data: Partial<ClientContact>) {
    return api.post<ClientContact>(`/crm/clients/${clientId}/contacts`, data)
  },

  updateClientContact(contactId: number, data: Partial<ClientContact>) {
    return api.put<ClientContact>(`/crm/contacts/${contactId}`, data)
  },

  deleteClientContact(contactId: number) {
    return api.delete(`/crm/contacts/${contactId}`)
  },

  getOverdueContacts() {
    return api.get<ClientContact[]>('/crm/contacts/overdue')
  },

  recordContact(contactId: number) {
    return api.post<ClientContact>(`/crm/contacts/${contactId}/record-contact`)
  },

  // ===== 组织架构 (P0) =====

  getClientOrgMap(clientId: number) {
    return api.get<ClientOrgMap | null>(`/crm/clients/${clientId}/org-map`)
  },

  updateClientOrgMap(clientId: number, data: Partial<ClientOrgMap>) {
    return api.put<ClientOrgMap>(`/crm/clients/${clientId}/org-map`, data)
  },

  // ===== 产品线 (P1) =====

  listProductLines(clientId: number) {
    return api.get<ProductLine[]>(`/crm/clients/${clientId}/product-lines`)
  },

  createProductLine(clientId: number, data: Partial<ProductLine>) {
    return api.post<ProductLine>(`/crm/clients/${clientId}/product-lines`, data)
  },

  updateProductLine(plId: number, data: Partial<ProductLine>) {
    return api.put<ProductLine>(`/crm/product-lines/${plId}`, data)
  },

  deleteProductLine(plId: number) {
    return api.delete(`/crm/product-lines/${plId}`)
  },

  // ===== 创新日历 (P1) =====

  listInnovationCalendar(clientId: number) {
    return api.get<InnovationCalendarItem[]>(`/crm/clients/${clientId}/innovation-calendar`)
  },

  createInnovationCalendar(clientId: number, data: Partial<InnovationCalendarItem>) {
    return api.post<InnovationCalendarItem>(`/crm/clients/${clientId}/innovation-calendar`, data)
  },

  updateInnovationCalendar(icId: number, data: Partial<InnovationCalendarItem>) {
    return api.put<InnovationCalendarItem>(`/crm/innovation-calendar/${icId}`, data)
  },

  deleteInnovationCalendar(icId: number) {
    return api.delete(`/crm/innovation-calendar/${icId}`)
  },

  // ===== 健康度 (P1) =====

  getHealthScore(clientId: number) {
    return api.get<HealthScore | null>(`/crm/clients/${clientId}/health-score`)
  },

  getHealthOverview() {
    return api.get('/crm/health-scores/overview')
  },

  triggerHealthCalculation(clientId: number) {
    return api.post<HealthScore>(`/crm/health-scores/calculate/${clientId}`)
  },

  // ===== 预警 (P1) =====

  listAlerts(params?: {
    client_id?: number; alert_type?: string; severity?: string;
    resolved?: boolean; page?: number; page_size?: number
  }) {
    return api.get<ApiListResponse<ClientAlert>['data']>('/crm/alerts/list', { params })
  },

  getAlertStats() {
    return api.get('/crm/alerts/stats')
  },

  acknowledgeAlert(alertId: number) {
    return api.put(`/crm/alerts/${alertId}/acknowledge`)
  },

  resolveAlert(alertId: number, data?: { resolved_note?: string }) {
    return api.put(`/crm/alerts/${alertId}/resolve`, data)
  },

  // ===== 商机（原有保留） =====

  listOpportunities(params?: {
    client_id?: number; stage?: string; owner?: string;
    page?: number; page_size?: number
  }) {
    return api.get<ApiListResponse<Opportunity>['data']>('/crm/opportunities/list', { params })
  },

  getOpportunity(id: number) {
    return api.get<Opportunity>(`/crm/opportunities/${id}`)
  },

  createOpportunity(data: {
    title: string; client_id: number; stage?: string;
    estimated_amount?: number; probability?: number;
    owner?: string; expected_close_date?: string; description?: string
  }) {
    return api.post<Opportunity>('/crm/opportunities/create', data)
  },

  updateOpportunity(id: number, data: Partial<Opportunity>) {
    return api.put<Opportunity>(`/crm/opportunities/${id}`, data)
  },

  deleteOpportunity(id: number) {
    return api.delete(`/crm/opportunities/${id}`)
  },

  getOpportunityStats() {
    return api.get('/crm/opportunities/stats')
  },

  // ===== 工单（原有保留） =====

  listTickets(params?: {
    client_id?: number; status?: string; priority?: string;
    page?: number; page_size?: number
  }) {
    return api.get<ApiListResponse<CRMTicket>['data']>('/crm/tickets/list', { params })
  },

  createTicket(data: {
    code: string; title: string; client_id: number;
    category: string; priority?: string; description?: string; assignee?: string
  }) {
    return api.post<CRMTicket>('/crm/tickets/create', data)
  },

  getTicket(id: number) {
    return api.get<CRMTicket>(`/crm/tickets/${id}`)
  },

  getTicketStats() {
    return api.get('/crm/tickets/stats')
  },

  // ===== 价值洞察 (P2) =====

  listInsights(params?: { client_id?: number; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<ValueInsight>['data']>('/crm/insights/list', { params })
  },

  createInsight(data: { client_id: number; insight_type: string; title: string; content: string; source?: string }) {
    return api.post<ValueInsight>('/crm/insights/create', data)
  },

  updateInsight(id: number, data: Partial<ValueInsight>) {
    return api.put<ValueInsight>(`/crm/insights/${id}`, data)
  },

  shareInsight(id: number) {
    return api.post(`/crm/insights/${id}/share`)
  },

  // ===== 客户简报 (P2) =====

  listBriefs(params?: { client_id?: number; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<ClientBrief>['data']>('/crm/briefs/list', { params })
  },

  createBrief(data: Partial<ClientBrief> & { client_id: number; brief_type: string; title: string }) {
    return api.post<ClientBrief>('/crm/briefs/create', data)
  },

  updateBrief(id: number, data: Partial<ClientBrief>) {
    return api.put<ClientBrief>(`/crm/briefs/${id}`, data)
  },

  publishBrief(id: number) {
    return api.post(`/crm/briefs/${id}/publish`)
  },

  // ===== 项目价值标注 (P2) =====

  getValueTag(protocolId: number) {
    return api.get<ProjectValueTag | null>(`/crm/value-tags/${protocolId}`)
  },

  createValueTag(data: Partial<ProjectValueTag> & { protocol_id: number }) {
    return api.post<ProjectValueTag>('/crm/value-tags/create', data)
  },

  updateValueTag(protocolId: number, data: Partial<ProjectValueTag>) {
    return api.put<ProjectValueTag>(`/crm/value-tags/${protocolId}`, data)
  },

  // ===== 满意度 (P2) =====

  listSurveys(params?: { client_id?: number; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<SatisfactionSurvey>['data']>('/crm/surveys/list', { params })
  },

  createSurvey(data: Partial<SatisfactionSurvey> & { client_id: number; survey_type: string }) {
    return api.post<SatisfactionSurvey>('/crm/surveys/create', data)
  },

  updateSurvey(id: number, data: Partial<SatisfactionSurvey>) {
    return api.put<SatisfactionSurvey>(`/crm/surveys/${id}`, data)
  },

  getSurveyStats(clientId?: number) {
    return api.get('/crm/surveys/stats', { params: clientId ? { client_id: clientId } : {} })
  },

  // ===== 里程碑 (P2) =====

  listMilestones(clientId: number) {
    return api.get<SuccessMilestone[]>(`/crm/clients/${clientId}/milestones`)
  },

  createMilestone(data: Partial<SuccessMilestone> & { client_id: number; milestone_type: string; title: string; achieved_at: string }) {
    return api.post<SuccessMilestone>('/crm/milestones/create', data)
  },

  // ===== 宣称趋势 (P3) =====

  listClaimTrends(params?: { claim_category?: string; region?: string; year?: number; keyword?: string; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<ClaimTrendItem>['data']>('/crm/trends/list', { params })
  },

  createClaimTrend(data: Partial<ClaimTrendItem>) {
    return api.post<ClaimTrendItem>('/crm/trends/create', data)
  },

  // ===== 市场趋势通报 (P3) =====

  listBulletins(params?: { category?: string; published?: boolean; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<MarketBulletin>['data']>('/crm/bulletins/list', { params })
  },

  createBulletin(data: Partial<MarketBulletin>) {
    return api.post<MarketBulletin>('/crm/bulletins/create', data)
  },

  updateBulletin(id: number, data: Partial<MarketBulletin>) {
    return api.put<MarketBulletin>(`/crm/bulletins/${id}`, data)
  },

  publishBulletin(id: number) {
    return api.post(`/crm/bulletins/${id}/publish`)
  },

  // ===== AI (已有 + P2增强) =====

  getClientInsight(clientId: number) {
    return api.get<ClientInsight>(`/crm/clients/${clientId}/insight`)
  },

  getClientCrossSell(clientId: number) {
    return api.get(`/crm/clients/${clientId}/cross-sell`)
  },

  aiGenerateBrief(clientId: number) {
    return api.post(`/crm/clients/${clientId}/ai/generate-brief`)
  },

  aiGenerateInsight(clientId: number) {
    return api.post(`/crm/clients/${clientId}/ai/generate-insight`)
  },

  aiGenerateTrend(category?: string, region?: string) {
    return api.post('/crm/ai/generate-trend', null, { params: { category, region } })
  },
}
