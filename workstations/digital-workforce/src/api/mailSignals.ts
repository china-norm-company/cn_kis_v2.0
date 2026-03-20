import { api } from '@cn-kis/api-client'

export interface MailSignalListItem {
  id: number
  subject: string
  sender_name?: string
  sender_email: string
  received_at?: string
  is_external: boolean
  mail_signal_type: string
  importance_score?: number
  sentiment_score?: number
  status: string
  primary_client?: { id: number; label: string; type: string }
  primary_contact?: { id: number; label: string; type: string }
  task_count: number
  pending_confirm_count: number
}

export interface MailSignalListResponse {
  items: MailSignalListItem[]
  pagination?: {
    page: number
    page_size: number
    total: number
  }
}

export interface MailSignalDetail extends Record<string, unknown> {
  id: number
  subject: string
  sender_name?: string
  sender_email: string
  body_preview?: string
  body_text?: string
  received_at?: string
  mail_signal_type: string
  status: string
  links?: Array<Record<string, unknown>>
  tasks?: Array<Record<string, unknown>>
}

export interface AnalysisEvidenceRef {
  source: string
  source_id?: number | null
  description: string
  keywords?: string[]
  quality: string
}

export interface AnalysisDraftArtifact {
  artifact_type: string
  governance_level: string
  generated_at: string
  summary: string
  detail?: Record<string, unknown>
  review_required: boolean
  auto_send_to_client: boolean
}

export interface AnalysisExecuteResult {
  ok: boolean
  action_plan_id?: number
  task_key?: string
  inferred_category?: string
  matched_keywords?: string[]
  evidence_refs?: AnalysisEvidenceRef[]
  draft_artifact_refs?: AnalysisDraftArtifact[]
  summary?: string
  governance_level?: string
  review_required?: boolean
  error?: string
}

export interface AnalysisResultDetail {
  id: number
  task_key: string
  title: string
  status: string
  evidence_refs: AnalysisEvidenceRef[]
  draft_artifact_refs: AnalysisDraftArtifact[]
  has_result: boolean
  governance_level: string
  ai_status: string
  review_required: boolean
}

export interface MailSignalTaskGenerateResult {
  created_tasks: Array<Record<string, unknown>>
  duplicate_tasks: Array<Record<string, unknown>>
  skipped_tasks: Array<Record<string, unknown>>
}

export interface MailSignalWritebackResult {
  results: Array<Record<string, unknown>>
  status: string
}

export interface MailTaskPlanItem extends Record<string, unknown> {
  id: number
  task_key: string
  title: string
  risk_level: string
  status: string
  source_event_id?: number
  created_at?: string
  priority_score?: number
  confidence_score?: number
  ai_analysis_status?: string
  has_result?: boolean
}

export interface MailTaskPlanListResponse {
  items: MailTaskPlanItem[]
  pagination?: {
    page: number
    page_size: number
    total: number
  }
}

export const mailSignalsApi = {
  getList: async (params?: {
    status?: string
    mail_signal_type?: string
    is_external?: boolean
    page?: number
    page_size?: number
  }): Promise<MailSignalListResponse> => {
    const searchParams = new URLSearchParams()
    if (params?.status && params.status !== 'all') searchParams.set('status', params.status)
    if (params?.mail_signal_type && params.mail_signal_type !== 'all') searchParams.set('mail_signal_type', params.mail_signal_type)
    if (params?.is_external !== undefined) searchParams.set('is_external', String(params.is_external))
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.page_size) searchParams.set('page_size', String(params.page_size))
    const qs = searchParams.toString()
    const resp = await api.get<{ items?: MailSignalListItem[]; pagination?: MailSignalListResponse['pagination'] } | MailSignalListItem[]>(
      qs ? `/mail-signals?${qs}` : '/mail-signals',
    )
    const data = resp.data
    if (Array.isArray(data)) {
      return { items: data, pagination: undefined }
    }
    return {
      items: data?.items ?? [],
      pagination: data?.pagination,
    }
  },

  getDetail: async (id: string): Promise<MailSignalDetail> => {
    const resp = await api.get<MailSignalDetail>(`/mail-signals/${id}`)
    return resp.data
  },

  generateTasks: async (id: string, taskKeys: string[]): Promise<MailSignalTaskGenerateResult> => {
    const resp = await api.post<MailSignalTaskGenerateResult>(`/mail-signals/${id}/tasks/generate`, {
      task_keys: taskKeys,
      force_regenerate: false,
    })
    return resp.data
  },

  confirmLink: async (id: string, linkType: string, targetId: number) => {
    const resp = await api.post<{ links: Array<Record<string, unknown>>; status: string }>(
      `/mail-signals/${id}/links/confirm`,
      {
        links: [
          {
            link_type: linkType,
            target_id: targetId,
            confirmed: true,
            is_primary: true,
            note: '中书前端确认',
          },
        ],
      },
    )
    return resp.data
  },

  writebackOpportunityDraft: async (id: string) => {
    const resp = await api.post<MailSignalWritebackResult>(
      `/mail-signals/${id}/writeback`,
      {
        operations: [
          {
            type: 'create_opportunity_draft',
            payload: {},
          },
        ],
        confirm_required: true,
      },
    )
    return resp.data
  },

  writebackResearchContext: async (id: string) => {
    const resp = await api.post<MailSignalWritebackResult>(
      `/mail-signals/${id}/writeback`,
      {
        operations: [
          {
            type: 'sync_research_context',
            payload: {},
          },
        ],
        confirm_required: true,
      },
    )
    return resp.data
  },

  getTaskPlans: async (): Promise<MailTaskPlanListResponse> => {
    const resp = await api.get<MailTaskPlanListResponse>('/mail-task-plans')
    return resp.data
  },

  executeAnalysis: async (signalId: string, taskId: number): Promise<AnalysisExecuteResult> => {
    const resp = await api.post<AnalysisExecuteResult>(
      `/mail-signals/${signalId}/tasks/${taskId}/execute-analysis`,
      {},
    )
    return resp.data
  },

  getAnalysisResult: async (signalId: string, taskId: number): Promise<AnalysisResultDetail> => {
    const resp = await api.get<AnalysisResultDetail>(
      `/mail-signals/${signalId}/tasks/${taskId}/analysis-result`,
    )
    return resp.data
  },

  depositKnowledge: async (
    signalId: string,
    taskId: number,
    candidateIndices: number[],
    note?: string,
  ): Promise<{
    deposited: Array<{ index: number; entry_id: number; conclusion: string; source_key: string }>
    skipped: Array<{ index: number; reason: string }>
    errors: Array<{ index: number; reason: string }>
    total_deposited: number
  }> => {
    const resp = await api.post(
      `/mail-signals/${signalId}/tasks/${taskId}/deposit-knowledge`,
      { candidate_indices: candidateIndices, note: note ?? '' },
    )
    return resp.data as ReturnType<typeof mailSignalsApi.depositKnowledge> extends Promise<infer R> ? R : never
  },

  generateReport: async (
    signalId: string,
    taskId: number,
    reportType: 'internal_brief' | 'specialist_report' | 'proposal_outline',
    note?: string,
  ): Promise<{
    report: Record<string, unknown>
    report_index: number
    report_label: string
    governance_level: string
    review_state: string
  }> => {
    const resp = await api.post(
      `/mail-signals/${signalId}/tasks/${taskId}/generate-report`,
      { report_type: reportType, note: note ?? '' },
    )
    return resp.data as ReturnType<typeof mailSignalsApi.generateReport> extends Promise<infer R> ? R : never
  },

  reviewReport: async (
    signalId: string,
    taskId: number,
    reportIndex: number,
    action: 'submit_review' | 'approve_internal' | 'approve_external' | 'revision_required' | 'send' | 'archive' | 'approve' | 'reject',
    note?: string,
  ): Promise<{
    report_index: number
    review_state: string
    reviewed_by: string
    reviewed_at: string
    auto_send_to_client: boolean
  }> => {
    const resp = await api.post(
      `/mail-signals/${signalId}/tasks/${taskId}/reports/${reportIndex}/review`,
      { action, note: note ?? '' },
    )
    return resp.data as ReturnType<typeof mailSignalsApi.reviewReport> extends Promise<infer R> ? R : never
  },

  recordAdoption: async (
    signalId: string,
    taskId: number,
    adopted: boolean,
    adoptionNote?: string,
    reportIndex?: number,
  ): Promise<{ task_id: number; status: string; adopted: boolean }> => {
    const resp = await api.post(
      `/mail-signals/${signalId}/tasks/${taskId}/adopt`,
      { adopted, adoption_note: adoptionNote ?? '', report_index: reportIndex ?? null },
    )
    return resp.data as ReturnType<typeof mailSignalsApi.recordAdoption> extends Promise<infer R> ? R : never
  },

  linkOpportunity: async (
    signalId: string,
    taskId: number,
    opportunityId: number,
    note?: string,
  ): Promise<{
    task_id: number
    opportunity_id: number
    opportunity_label: string
    target_object_refs: Array<Record<string, unknown>>
  }> => {
    const resp = await api.post(
      `/mail-signals/${signalId}/tasks/${taskId}/link-opportunity`,
      { opportunity_id: opportunityId, note: note ?? '' },
    )
    return resp.data as ReturnType<typeof mailSignalsApi.linkOpportunity> extends Promise<infer R> ? R : never
  },

  recordFeedback: async (
    signalId: string,
    taskId: number,
    payload: { source?: 'customer' | 'internal'; satisfaction_score?: number | null; reused?: boolean; feedback_text?: string; report_index?: number | null },
  ): Promise<{ feedback_count: number }> => {
    const resp = await api.post(
      `/mail-signals/${signalId}/tasks/${taskId}/feedback`,
      payload,
    )
    return resp.data as ReturnType<typeof mailSignalsApi.recordFeedback> extends Promise<infer R> ? R : never
  },

  getAnalytics: async (days = 30): Promise<{
    period_days: number
    signals: { total: number; by_type: Array<{ mail_signal_type: string; count: number }>; by_status: Array<{ status: string; count: number }> }
    tasks: { total: number; adopted: number; rejected: number; executed: number; adoption_rate_pct: number; by_task_key: Array<{ task_key: string; count: number }> }
    phase2_specialist: { total: number; adopted: number; adoption_rate_pct: number }
    opportunity_contribution: { tasks_linked_to_opportunity: number }
    feedback: { total_records: number; customer_records: number; report_reuse_rate_pct: number; customer_satisfaction_avg: number | null }
  }> => {
    const resp = await api.get(`/mail-signal-analytics?days=${days}`)
    return resp.data as ReturnType<typeof mailSignalsApi.getAnalytics> extends Promise<infer R> ? R : never
  },
}
