/**
 * 中书·数字员工中心 — 门户与价值看板 API
 * 对应后端：GET /api/v1/digital-workforce/portal、/value-metrics
 */
import { api } from '../client'

export interface DomainWorkerBlueprintItem {
  domain_code: string
  display_name: string
  lead_agent_id: string
  workstation_hint: string
  responsibilities: string[]
}

export interface PortalAgentItem {
  agent_id: string
  name: string
  description: string
  capabilities: string[]
  provider: string
  role_title?: string
  tier?: string
  avatar_url?: string
  phase?: string
  is_editable_via_ui?: boolean
}

export interface ExecutionTodayItem {
  total: number
  success: number
}

/** 岗位定义（role-first 门户/花名册用） */
export interface PortalRoleItem {
  role_code: string
  role_name: string
  role_cluster: string
  service_targets: string[]
  core_scenarios: string[]
  automation_level: string
  human_confirmation_points: string[]
  kpi_metrics: string[]
  mapped_agent_ids: string[]
  mapped_skill_ids: string[]
  workstation_scope: string[]
  baseline_manual_minutes: number | null
}

export interface RoleDefinitionItem extends PortalRoleItem {
  input_contract: string[]
  output_contract: string[]
  enabled?: boolean
}

export interface RoleCreatePayload {
  role_code: string
  role_name: string
  role_cluster?: string
  service_targets?: string[]
  core_scenarios?: string[]
  input_contract?: string[]
  output_contract?: string[]
  automation_level?: string
  human_confirmation_points?: string[]
  kpi_metrics?: string[]
  mapped_agent_ids?: string[]
  mapped_skill_ids?: string[]
  workstation_scope?: string[]
  baseline_manual_minutes?: number | null
  enabled?: boolean
}

export interface RoleUpdatePayload {
  role_name?: string
  role_cluster?: string
  service_targets?: string[]
  core_scenarios?: string[]
  input_contract?: string[]
  output_contract?: string[]
  automation_level?: string
  human_confirmation_points?: string[]
  kpi_metrics?: string[]
  mapped_agent_ids?: string[]
  mapped_skill_ids?: string[]
  workstation_scope?: string[]
  baseline_manual_minutes?: number | null
  enabled?: boolean
}

export interface DigitalWorkforcePortalData {
  blueprints: DomainWorkerBlueprintItem[]
  agents: PortalAgentItem[]
  roles?: PortalRoleItem[]
  execution_today: Record<string, ExecutionTodayItem>
  execution_7d?: Record<string, ExecutionTodayItem>
}

export interface DigitalWorkforcePortalResponse {
  code: number
  msg: string
  data: DigitalWorkforcePortalData
}

/** 聚合序列项：名称、次数、预估节省工时 */
export interface ValueMetricsSeriesItem {
  count: number
  saved_hours_estimate: number
}
export interface ValueMetricsByRoleItem extends ValueMetricsSeriesItem {
  role_code: string
}
export interface ValueMetricsByWorkstationItem extends ValueMetricsSeriesItem {
  workstation_key: string
}
export interface ValueMetricsByBusinessObjectItem extends ValueMetricsSeriesItem {
  business_object_type: string
}

export interface DigitalWorkforceValueMetricsData {
  window_days: number
  skill_execution_total: number
  skill_execution_success: number
  governance_summary: Record<string, number>
  saved_hours_estimate: number
  baseline_minutes_per_skill_run: number
  by_role?: ValueMetricsByRoleItem[]
  by_workstation?: ValueMetricsByWorkstationItem[]
  by_business_object_type?: ValueMetricsByBusinessObjectItem[]
}

export interface DigitalWorkforceValueMetricsResponse {
  code: number
  msg: string
  data: DigitalWorkforceValueMetricsData
}

/** 编排回放列表项 */
export interface ReplayRunItem {
  task_id: string
  business_run_id: string
  role_code: string
  domain_code: string
  workstation_key: string
  business_object_type: string
  business_object_id: string
  status: string
  query: string
  query_snippet?: string
  sub_task_count: number
  duration_ms: number | null
  created_at: string | null
  completed_at: string | null
}

/** 经营日报请求参数 */
export interface DailyBriefRequest {
  target_role?: string
  focus_areas?: string[]
}

/** 经营日报返回（与 orchestration_service.generate_daily_brief 一致） */
export interface DailyBriefResponse {
  code: number
  msg: string
  data?: {
    summary?: string
    sections?: Array<{ title: string; content: string }>
    kpis?: Record<string, unknown>
    [key: string]: unknown
  }
}

/** 数字员工主动建议项 */
export interface SuggestionAction {
  action_id: string
  label: string
  endpoint: string
}

export interface SuggestionItem {
  suggestion_id: string
  type: string
  title: string
  summary: string
  business_object_type: string
  business_object_id: string
  role_code: string
  actions: SuggestionAction[]
}

export const digitalWorkforcePortalApi = {
  /** 门户数据：数字员工蓝图 + Agent 列表 + 今日执行统计 */
  getPortal() {
    return api.get<DigitalWorkforcePortalResponse>('/digital-workforce/portal')
  },

  /** 数字员工主动建议（流程内嵌） */
  getSuggestions(workstationKey: string) {
    return api.get<{ code: number; msg: string; data: { items: SuggestionItem[] } }>(
      '/digital-workforce/suggestions',
      { params: { workstation_key: workstationKey } }
    )
  },

  /** Agent 观测指标（延迟/Token/工具调用），供绩效仪表盘 */
  getAgentObservability(days: number = 7) {
    return api.get<{
      code: number
      msg: string
      data: { days: number; items: Array<{ agent_id: string; total: number; success: number; avg_duration_ms: number; total_tokens: number; tool_calls_count: number }> }
    }>('/digital-workforce/agent-observability', { params: { days } })
  },

  /** 价值指标：技能执行量 + 治理事件 + 预估节省工时 */
  getValueMetrics(days: number = 30) {
    return api.get<DigitalWorkforceValueMetricsResponse>('/digital-workforce/value-metrics', {
      params: { days },
    })
  },

  /** 生成经营日报（调用编排器 generate_daily_brief） */
  postDailyBrief(payload: DailyBriefRequest = {}) {
    return api.post<DailyBriefResponse>('/dashboard/orchestrate/daily-brief', payload)
  },

  /** 编排回放列表（支持按工作台/岗位/业务对象过滤） */
  getReplayRuns(params?: { limit?: number; workstation_key?: string; role_code?: string; business_object_type?: string }) {
    return api.get<{ code: number; msg: string; data: { items: ReplayRunItem[] } }>(
      '/digital-workforce/replay-runs',
      params ? { params } : undefined
    )
  },

  /** 回放详情：编排运行 + 子任务 + 结构化产物 */
  getReplay(taskId: string) {
    return api.get<{
      code: number
      msg: string
      data: {
        task_id: string
        business_run_id: string
        account_id: number
        query: string
        status: string
        sub_task_count: number
        aggregated_output: string
        duration_ms: number
        structured_artifacts: Record<string, unknown>
        sub_tasks: Array<{
          index: number
          domain: string
          agent_id: string
          task_text: string
          status: string
          output: string
          error: string
          duration_ms: number
          token_usage?: Record<string, unknown>
        }>
        role_code?: string
        domain_code?: string
        workstation_key?: string
        business_object_type?: string
        business_object_id?: string
        created_at: string | null
        completed_at: string | null
      }
    }>('/digital-workforce/replay/' + encodeURIComponent(taskId))
  },

  /** 我的助手列表：当前用户工作台绑定的 Agent + 7 天任务数 */
  getMyAssistants() {
    return api.get<{ code: number; msg: string; data: { assistants: MyAssistantItem[] } }>(
      '/digital-workforce/my-assistants'
    )
  },

  /** 工作动态：当前用户 UnifiedExecutionTask 时间线 */
  getMyActivity(limit?: number) {
    return api.get<{ code: number; msg: string; data: { items: MyActivityItem[] } }>(
      '/digital-workforce/my-activity',
      limit != null ? { params: { limit } } : undefined
    )
  },

  /** 工具清单：Agent 可调用的工具名称与描述 */
  getTools() {
    return api.get<{ code: number; msg: string; data: { tools: Array<{ name: string; description: string }> } }>(
      '/digital-workforce/tools'
    )
  },

  /** 编排执行历史（来自 dashboard claw/execution/history） */
  getOrchestrationHistory(limit: number = 50) {
    return api.get<{
      code: number
      msg: string
      data: {
        items: Array<{
          task_id: string
          query: string
          status: string
          sub_task_count: number
          duration_ms: number | null
          errors: unknown
          created_at: string
        }>
      }
    }>('/dashboard/claw/execution/history', { params: { limit } })
  },

  /** 记忆档案：最近 WorkerMemoryRecord 列表 */
  getMemoryArchive(limit: number = 50) {
    return api.get<{
      code: number
      msg: string
      data: {
        items: Array<{
          id: number
          worker_code: string
          memory_type: string
          subject_type: string
          subject_key: string
          summary: string
          importance_score: number
          source_task_id: string
          created_at: string
        }>
      }
    }>('/digital-workforce/memory-archive', { params: { limit } })
  },

  /** 策略学习：最近 WorkerPolicyUpdate 列表 */
  getPolicyLearning(limit: number = 50) {
    return api.get<{
      code: number
      msg: string
      data: {
        items: Array<{
          id: number
          worker_code: string
          domain_code: string
          policy_key: string
          outcome: string
          root_cause: string
          better_policy: string
          replay_score: number
          status: string
          created_at: string
          activated_at: string | null
        }>
      }
    }>('/digital-workforce/policy-learning', { params: { limit } })
  },

  /** 验收门禁运行记录 */
  getEvidenceGateRuns(limit: number = 50) {
    return api.get<{
      code: number
      msg: string
      data: { items: Array<{ id: number; gate_type: string; scope: string; status: string; score: number; summary: Record<string, unknown>; created_at: string }> }
    }>('/digital-workforce/evidence-gate-runs', { params: { limit } })
  },

  /** 持续升级哨塔报告 */
  getEvergreenWatchReports(limit: number = 50) {
    return api.get<{
      code: number
      msg: string
      data: { items: Array<{ id: number; watch_type: string; source_name: string; source_url: string; status: string; headline: string; findings: Record<string, unknown>; created_at: string }> }
    }>('/digital-workforce/evergreen-watch-reports', { params: { limit } })
  },

  /** 哨塔报告详情 */
  getEvergreenWatchReportDetail(reportId: number) {
    return api.get<{ code: number; msg: string; data: Record<string, unknown> }>(`/digital-workforce/evergreen-watch-reports/${reportId}`)
  },

  /** 恢复中断的编排（断点续跑） */
  resumeOrchestration(taskId: string) {
    return api.post<{ code: number; msg: string; data: { new_task_id: string; original_task_id: string; status: string } }>(
      `/digital-workforce/orchestrate/resume/${taskId}`,
    )
  },

  /** L2 验收最新结论 */
  getL2EvalLatest() {
    return api.get<{ code: number; msg: string; data: { verdict: string; run_id: string | null; passed: boolean; pass_rate: number; total: number; passed_count: number; failed_count: number; by_batch: Record<string, unknown>; decision_reason: string; available: boolean } }>(
      '/digital-workforce/l2-eval-latest',
    )
  },

  /** L2 验收报告详情 */
  getL2EvalResults(runId: string) {
    return api.get<{ code: number; msg: string; data: Record<string, unknown> }>(
      `/digital-workforce/l2-eval-results/${runId}`,
    )
  },

  /** 知识质量趋势查询 */
  getKnowledgeQualityTrend(packageId?: string, days: number = 30) {
    return api.get<{ code: number; msg: string; data: { items: Array<Record<string, unknown>>; window_days: number } }>(
      '/digital-workforce/knowledge-quality-trend',
      { params: { package_id: packageId || '', days } },
    )
  },

  /** 知识质量汇总 */
  getKnowledgeQualitySummary() {
    return api.get<{ code: number; msg: string; data: { summaries: Array<{ package_id: string; package_label: string; total_entries: number; published_entries: number; avg_quality_score: number; coverage_rate: number; expiry_rate: number; cite_rate_per_entry: number }>; snapshot_date: string | null } }>(
      '/digital-workforce/knowledge-quality-summary',
    )
  },

  /** KPI 趋势查询 */
  getKpiTrend(roleCode?: string, days: number = 30) {
    return api.get<{ code: number; msg: string; data: { items: Array<{ role_code: string; snapshot_date: string; period_days: number; kpis: Record<string, unknown> }>; window_days: number } }>(
      '/digital-workforce/kpi-trend',
      { params: { role_code: roleCode || '', days } },
    )
  },

  /** KPI 环比汇总 */
  getKpiTrendSummary() {
    return api.get<{ code: number; msg: string; data: { summaries: Array<{ role_code: string; role_name: string; recent_7d_executions: number; prev_7d_executions: number; delta: number; trend: string }> } }>(
      '/digital-workforce/kpi-trend/summary',
    )
  },

  /** [管理] 暂停 Agent */
  pauseAgent(agentId: string, reason?: string) {
    return api.post<{ code: number; msg: string; data: { agent_id: string; paused: boolean } }>(
      `/digital-workforce/agents/${agentId}/pause`,
      { reason: reason ?? '' },
    )
  },

  /** [管理] 恢复 Agent */
  resumeAgent(agentId: string) {
    return api.post<{ code: number; msg: string; data: { agent_id: string; paused: boolean } }>(
      `/digital-workforce/agents/${agentId}/resume`,
    )
  },

  /** [管理] 设置 Agent 月预算 */
  setAgentBudget(agentId: string, monthlyBudgetUsd: number) {
    return api.post<{ code: number; msg: string; data: { agent_id: string; monthly_budget_usd: number } }>(
      `/digital-workforce/agents/${agentId}/set-budget`,
      null,
      { params: { monthly_budget_usd: monthlyBudgetUsd } },
    )
  },

  /** 组织架构图 */
  getOrgChart() {
    return api.get<{ code: number; msg: string; data: { nodes: Array<{ agent_id: string; name: string; role_title: string; tier: string; parent_agent_id: string; paused: boolean; provider: string; capabilities: string[] }> } }>(
      '/digital-workforce/org-chart',
    )
  },

  /** 转交记录 */
  getHandoffRecords(limit: number = 50) {
    return api.get<{ code: number; msg: string; data: { items: Array<{ handoff_id: string; from_agent_id: string; to_agent_id: string; handoff_type: string; reason: string; status: string; task_id: string; created_at: string }> } }>(
      '/digital-workforce/handoff-records',
      { params: { limit } },
    )
  },

  /** 技能进化模板列表 */
  getSkillTemplates(status: string = 'draft') {
    return api.get<{ code: number; msg: string; data: { items: Array<{ id: number; template_id: string; source: string; skill_id_hint: string; worker_code: string; description: string; confidence_score: number; status: string; created_at: string }> } }>(
      '/digital-workforce/skill-templates',
      { params: { status } },
    )
  },

  /** 提升技能模板为正式技能 */
  promoteSkillTemplate(templateId: string) {
    return api.post<{ code: number; msg: string; data: { skill_id: string; created: boolean } }>(
      `/digital-workforce/skill-templates/${templateId}/promote`,
    )
  },

  /** 拒绝技能模板 */
  rejectSkillTemplate(templateId: string) {
    return api.post<{ code: number; msg: string; data: null }>(
      `/digital-workforce/skill-templates/${templateId}/reject`,
    )
  },

  /** 启动 Agent 训练会话 */
  startAgentTraining(agentId: string) {
    return api.post<{ code: number; msg: string; data: { session_id: string; agent_id: string; scenario_id: string; agent_output: string; total_scenarios: number } }>(
      `/digital-workforce/agents/${agentId}/train`,
    )
  },

  /** 提交训练反馈 */
  submitTrainingFeedback(agentId: string, sessionId: string, payload: { scenario_id: string; agent_output: string; score: number; feedback?: string }) {
    return api.post<{ code: number; msg: string; data: { policy_id: number | null; saved: boolean } }>(
      `/digital-workforce/agents/${agentId}/train/${sessionId}/feedback`,
      payload,
    )
  },

  /** 训练历史 */
  getAgentTrainingHistory(agentId: string) {
    return api.get<{ code: number; msg: string; data: { items: Array<{ id: number; policy_key: string; outcome: string; better_policy: string; replay_score: number; status: string; created_at: string }> } }>(
      `/digital-workforce/agents/${agentId}/train/history`,
    )
  },

  /** Agent 成本概览 */
  getAgentCostOverview() {
    return api.get<{ code: number; msg: string; data: { items: Array<{ agent_id: string; name: string; paused: boolean; monthly_budget_usd: number | null; current_month_spend_usd: number; remaining_usd: number | null; utilization_pct: number }> } }>(
      '/digital-workforce/agent-cost-overview',
    )
  },

  /** 获取单个 Agent 配置（花名册详情/编辑用） */
  getAgent(agentId: string) {
    return api.get<{ code: number; msg: string; data: AgentDetail }>(`/digital-workforce/agents/${agentId}`)
  },

  /** 更新 Agent 配置（需 dashboard.admin.manage，立即生效） */
  putAgent(agentId: string, payload: AgentUpdatePayload) {
    return api.put<{ code: number; msg: string; data: { agent_id: string } }>(`/digital-workforce/agents/${agentId}`, payload)
  },

  /** [管理] 技能列表 */
  listSkills() {
    return api.get<{ code: number; msg: string; data: { items: SkillDefinitionItem[] } }>('/digital-workforce/skills')
  },

  /** [管理] 新建技能 */
  createSkill(payload: SkillCreatePayload) {
    return api.post<{ code: number; msg: string; data: { skill_id: string } }>('/digital-workforce/skills', payload)
  },

  /** [管理] 更新技能 */
  updateSkill(skillId: string, payload: SkillUpdatePayload) {
    return api.put<{ code: number; msg: string; data: { skill_id: string } }>(`/digital-workforce/skills/${skillId}`, payload)
  },

  /** [管理] 删除技能 */
  deleteSkill(skillId: string) {
    return api.delete<{ code: number; msg: string; data: null }>(`/digital-workforce/skills/${skillId}`)
  },

  /** [管理] 岗位定义列表 */
  listRoles(includeDisabled: boolean = false) {
    return api.get<{ code: number; msg: string; data: { items: RoleDefinitionItem[] } }>('/digital-workforce/roles', {
      params: includeDisabled ? { include_disabled: true } : undefined,
    })
  },

  /** [管理] 单个岗位定义 */
  getRole(roleCode: string, includeDisabled: boolean = false) {
    return api.get<{ code: number; msg: string; data: RoleDefinitionItem }>(`/digital-workforce/roles/${roleCode}`, {
      params: includeDisabled ? { include_disabled: true } : undefined,
    })
  },

  /** [管理] 新建岗位定义 */
  createRole(payload: RoleCreatePayload) {
    return api.post<{ code: number; msg: string; data: { role_code: string } }>('/digital-workforce/roles', payload)
  },

  /** [管理] 更新岗位定义 */
  updateRole(roleCode: string, payload: RoleUpdatePayload) {
    return api.put<{ code: number; msg: string; data: { role_code: string } }>(`/digital-workforce/roles/${roleCode}`, payload)
  },

  /** [管理] 删除岗位定义 */
  deleteRole(roleCode: string) {
    return api.delete<{ code: number; msg: string; data: null }>(`/digital-workforce/roles/${roleCode}`)
  },

  /** [管理] 工作台绑定列表 */
  getWorkstationBindings() {
    return api.get<{ code: number; msg: string; data: { items: WorkstationBindingItem[] } }>('/digital-workforce/workstation-bindings')
  },

  /** [管理] 更新工作台绑定 */
  putWorkstationBindings(items: WorkstationBindingItem[]) {
    return api.put<{ code: number; msg: string; data: null }>('/digital-workforce/workstation-bindings', { items })
  },

  /** [管理] 刷新配置缓存 */
  reloadConfig() {
    return api.post<{ code: number; msg: string; data: { reloaded: boolean } }>('/digital-workforce/reload-config')
  },

  /** [管理] 激活策略升级记录 */
  activatePolicyLearning(updateId: number) {
    return api.post<{ code: number; msg: string; data: { policy_update_id: number; status: string; retired_update_ids: number[] } }>(
      `/digital-workforce/policy-learning/${updateId}/activate`
    )
  },

  /** [管理] 退役策略升级记录 */
  retirePolicyLearning(updateId: number, reason?: string) {
    return api.post<{ code: number; msg: string; data: { policy_update_id: number; status: string } }>(
      `/digital-workforce/policy-learning/${updateId}/retire`,
      { reason: reason ?? '' }
    )
  },

  /** [管理] 回滚策略升级记录 */
  rollbackPolicyLearning(updateId: number, reason?: string) {
    return api.post<{ code: number; msg: string; data: { policy_update_id: number; status: string; restored_policy_update_id: number } }>(
      `/digital-workforce/policy-learning/${updateId}/rollback`,
      { reason: reason ?? '' }
    )
  },

  /** [管理] 提交策略评测 DRAFT -> EVALUATING */
  submitPolicyForEvaluation(updateId: number) {
    return api.post<{ code: number; msg: string; data: { policy_update_id: number; status: string } }>(
      `/digital-workforce/policy-learning/${updateId}/submit-evaluation`
    )
  },

  /** [管理] 批准策略生效 EVALUATING -> ACTIVE */
  approvePolicyEvaluation(updateId: number) {
    return api.post<{ code: number; msg: string; data: { policy_update_id: number; status: string } }>(
      `/digital-workforce/policy-learning/${updateId}/approve`
    )
  },

  /** [管理] 驳回策略评测 EVALUATING -> RETIRED */
  rejectPolicyEvaluation(updateId: number, reason?: string) {
    return api.post<{ code: number; msg: string; data: { policy_update_id: number; status: string } }>(
      `/digital-workforce/policy-learning/${updateId}/reject`,
      { reason: reason ?? '' }
    )
  },

  /** [管理] 哨塔报告沉淀为知识条目 */
  depositWatchReportToKnowledge(reportId: number) {
    return api.post<{ code: number; msg: string; data: { report_id: number; knowledge_entry_id: number; linked_packages: string[] } }>(
      `/digital-workforce/evergreen-watch-reports/${reportId}/deposit-to-knowledge`
    )
  },

  /** [管理] 编排路由配置 */
  getRouting() {
    return api.get<{
      code: number
      msg: string
      data: {
        domain_agent: Array<{ domain_code: string; agent_id: string; display_name: string; priority: number }>
        domain_skill: Array<{ domain_code: string; skill_id: string; priority: number }>
        keyword_domain: Array<{ keyword: string; domain_code: string }>
      }
    }>('/digital-workforce/routing')
  },

  /** [管理] 更新编排路由 */
  putRouting(payload: {
    domain_agent?: Array<{ domain_code: string; agent_id: string; display_name?: string; priority?: number }>
    domain_skill?: Array<{ domain_code: string; skill_id: string; priority?: number }>
    keyword_domain?: Array<{ keyword: string; domain_code: string }>
  }) {
    return api.put<{ code: number; msg: string; data: null }>('/digital-workforce/routing', payload)
  },

  /** [管理] 知识委员会：待审核条目列表 */
  getKnowledgeReviewList(params: { limit?: number; source_type?: string } = {}) {
    return api.get<{
      code: number
      msg: string
      data: {
        items: Array<{
          id: number
          entry_type: string
          title: string
          summary: string
          tags: string[]
          source_type: string
          source_id: number | null
          quality_score: number | null
          create_time: string
          update_time: string
        }>
        total: number
        source_stats: Array<{ source_type: string; count: number }>
      }
    }>('/digital-workforce/knowledge-review', { params })
  },

  /** [管理] 知识委员会：批量发布或拒绝 */
  batchKnowledgeReviewAction(payload: { entry_ids: number[]; action: 'publish' | 'reject' }) {
    return api.post<{
      code: number
      msg: string
      data: { action: string; processed: number; entry_ids: number[] }
    }>('/digital-workforce/knowledge-review/batch-action', payload)
  },

  /** [管理] 知识委员会：质量抽查报告 */
  getKnowledgeQualityReport(limit = 100) {
    return api.get<{
      code: number
      msg: string
      data: {
        total_pending_review: number
        total_without_quality_score: number
        by_source_quality: Array<{ source_type: string; count: number; avg_quality: number | null }>
        low_quality_entries: Array<{ id: number; title: string; source_type: string; quality_score: number | null; create_time: string }>
        no_search_vector_entries: Array<{ id: number; title: string; source_type: string; quality_score: number | null }>
        no_summary_entries: Array<{ id: number; title: string; source_type: string; quality_score: number | null }>
        recommendations: string[]
      }
    }>('/digital-workforce/knowledge-review/quality-report', { params: { limit } })
  },
}

export interface SkillDefinitionItem {
  skill_id: string
  display_name: string
  description: string
  executor: string
  agent_id: string
  script_path: string
  service_path: string
  timeout: number
  requires_llm: boolean
  risk_level: string
  requires_approval: boolean
  agent_tools: string[]
  fallback_script: string
  is_active: boolean
  bound_workstations: string[]
}

export interface SkillCreatePayload {
  skill_id: string
  display_name?: string
  description?: string
  executor?: string
  agent_id?: string
  script_path?: string
  service_path?: string
  service_function?: string
  timeout?: number
  requires_llm?: boolean
  risk_level?: string
  requires_approval?: boolean
  agent_tools?: string[]
  fallback_script?: string
  is_active?: boolean
  bound_workstations?: string[]
}

export interface SkillUpdatePayload {
  display_name?: string
  description?: string
  executor?: string
  agent_id?: string
  script_path?: string
  service_path?: string
  service_function?: string
  timeout?: number
  requires_llm?: boolean
  risk_level?: string
  requires_approval?: boolean
  agent_tools?: string[]
  fallback_script?: string
  is_active?: boolean
  bound_workstations?: string[]
}

export interface WorkstationBindingItem {
  workstation_key: string
  display_name: string
  agent_ids: string[]
  skill_ids: string[]
  quick_actions: unknown[]
}

export interface AgentDetail {
  agent_id: string
  name: string
  description: string
  role_title: string
  system_prompt: string
  tools: string[]
  tier: string
  avatar_url: string
  phase: string
  knowledge_enabled: boolean
  knowledge_top_k: number
  is_editable_via_ui: boolean
  is_active: boolean
  provider: string
  model_id: string
  temperature: number
  max_tokens: number
  capabilities: string[]
}

export interface AgentUpdatePayload {
  name?: string
  description?: string
  role_title?: string
  system_prompt?: string
  tools?: string[]
  tier?: string
  avatar_url?: string
  phase?: string
  knowledge_enabled?: boolean
  knowledge_top_k?: number
  is_editable_via_ui?: boolean
  is_active?: boolean
}

export interface MyAssistantItem {
  agent_id: string
  name: string
  description: string
  capabilities: string[]
  tasks_last_7_days: number
}

export interface MyActivityItem {
  task_id: string
  name: string
  agent_or_target: string
  runtime_type: string
  status: string
  created_at: string | null
  completed_at: string | null
}
