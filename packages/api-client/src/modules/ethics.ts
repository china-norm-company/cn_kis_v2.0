/**
 * 伦理审查与法规合规管理工作台（御史·伦理台）API 模块
 *
 * 对应后端：/api/v1/ethics/
 * 覆盖：仪表盘、伦理申请、批件、审查意见、监督、法规、合规检查、监管沟通、培训
 */
import { api } from '../client'

// ============================================================================
// 类型定义
// ============================================================================

export interface EthicsDashboard {
  application_count: number
  pending_count: number
  valid_approval_count: number
  expiring_count: number
  pending_response_count: number
  supervision_count: number
  compliance_finding_count: number
  todo_items?: Array<{
    title: string
    link: string
    urgency?: 'low' | 'medium' | 'high'
  }>
}

// ----- 伦理申请 -----

export interface EthicsApplicationItem {
  id: number
  application_no: string
  protocol_id: number
  protocol_title: string
  committee_id: number
  committee_name: string
  application_type: string
  application_type_display: string
  status: string
  status_display: string
  description: string
  submitted_at: string | null
  created_at: string
}

export interface EthicsApplicationDetail extends EthicsApplicationItem {
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string
  feishu_approval_instance_id: string
  approval_documents: ApprovalDocumentItem[]
  review_opinions: ReviewOpinionItem[]
}

export interface EthicsApplicationCreateIn {
  protocol_id: number
  committee_id: number
  application_type?: string
  description?: string
}

// ----- 批件 -----

export interface ApprovalDocumentItem {
  id: number
  application_id: number
  application_no: string
  document_no: string
  approved_at: string | null
  valid_until: string | null
  file_url: string
  created_at: string
}

// ----- 审查意见 -----

export interface ReviewOpinionItem {
  id: number
  application_id: number
  application_no: string
  opinion_no: string
  opinion_type: string
  opinion_type_display: string
  review_date: string
  summary: string
  detailed_opinion: string
  modification_requirements: string
  reviewer_names: string[]
  response_required: boolean
  response_deadline: string | null
  response_received: boolean
  response_text: string
  response_date: string | null
  created_at: string
}

// ----- 伦理监督 -----

export interface SupervisionItem {
  id: number
  supervision_no: string
  protocol_id: number
  protocol_title: string
  supervision_type: string
  supervision_type_display: string
  status: string
  status_display: string
  planned_date: string | null
  completed_date: string | null
  findings: string
  corrective_actions: string
  created_at: string
}

export interface SupervisionCreateIn {
  protocol_id: number
  supervision_type: string
  planned_date: string
  scope?: string
  notes?: string
}

// ----- 法规 -----

export interface RegulationItem {
  id: number
  title: string
  regulation_type: string
  regulation_type_display: string
  publish_date: string | null
  effective_date: string | null
  impact_level: string
  impact_level_display: string
  affected_areas: string[]
  status: string
  status_display: string
  action_items: string
  created_at: string
}

export interface RegulationCreateIn {
  title: string
  regulation_type: string
  publish_date?: string
  effective_date?: string
  impact_level?: string
  affected_areas?: string[]
  summary?: string
}

// ----- 合规检查 -----

export interface ComplianceCheckItem {
  id: number
  check_no: string
  check_type: string
  check_type_display: string
  scope: string
  status: string
  status_display: string
  check_date: string | null
  finding_count: number
  lead_auditor: string
  created_at: string
}

export interface ComplianceFindingItem {
  id: number
  check_id: number
  finding_no: string
  severity: string
  severity_display: string
  description: string
  corrective_action: string
  status: string
  related_deviation_id: number | null
  related_capa_id: number | null
  verified_by: string
  verified_at: string | null
  created_at: string
}

export interface ComplianceCheckCreateIn {
  check_type: string
  scope: string
  check_date?: string
  lead_auditor?: string
  team_members?: string[]
  notes?: string
}

export interface ComplianceFindingCreateIn {
  check_id: number
  severity: string
  description: string
  corrective_action?: string
  related_deviation_id?: number
  related_capa_id?: number
}

// ----- 监管沟通 -----

export interface CorrespondenceItem {
  id: number
  correspondence_no: string
  direction: string
  subject: string
  counterpart: string
  correspondence_date: string | null
  status: string
  status_display: string
  reply_deadline: string | null
  parent_id: number | null
  created_at: string
}

export interface CorrespondenceCreateIn {
  direction: string
  subject: string
  counterpart: string
  correspondence_date?: string
  content?: string
  reply_deadline?: string
  parent_id?: number
  protocol_id?: number
}

// ----- 培训 -----

export interface TrainingItem {
  id: number
  training_no: string
  title: string
  training_type: string
  training_type_display: string
  training_date: string | null
  status: string
  status_display: string
  participant_count: number
  pass_rate: number | null
  created_at: string
}

export interface TrainingParticipantItem {
  id: number
  training_id: number
  staff_name: string
  attended: boolean
  exam_score: number | null
  passed: boolean
  certificate_no: string
  feedback: string
}

export interface TrainingCreateIn {
  title: string
  training_type: string
  training_date?: string
  duration_hours?: number
  location?: string
  trainer?: string
  content?: string
  passing_score?: number
}

// ============================================================================
// API 方法
// ============================================================================

const BASE = '/ethics'

export const ethicsApi = {
  // ----- 仪表盘 -----
  getDashboard: () =>
    api.get<EthicsDashboard>(`${BASE}/dashboard`),

  // ----- 伦理申请 -----
  getApplications: (params?: Record<string, string | number>) =>
    api.get<{ items: EthicsApplicationItem[]; total: number }>(`${BASE}/applications`, { params }),

  getApplicationDetail: (id: number) =>
    api.get<EthicsApplicationDetail>(`${BASE}/applications/${id}`),

  createApplication: (data: EthicsApplicationCreateIn) =>
    api.post<EthicsApplicationItem>(`${BASE}/applications`, data),

  submitApplication: (id: number) =>
    api.post<EthicsApplicationItem>(`${BASE}/applications/${id}/submit`),

  approveApplication: (id: number) =>
    api.post<EthicsApplicationItem>(`${BASE}/applications/${id}/approve`),

  rejectApplication: (id: number, reason?: string) =>
    api.post<EthicsApplicationItem>(`${BASE}/applications/${id}/reject`, { reason }),

  withdrawApplication: (id: number) =>
    api.post<EthicsApplicationItem>(`${BASE}/applications/${id}/withdraw`),

  // ----- 批件 -----
  getApprovals: () =>
    api.get<{ items: ApprovalDocumentItem[]; total: number }>(`${BASE}/approvals`),

  uploadApproval: (applicationId: number, data: FormData) =>
    api.upload<ApprovalDocumentItem>(`${BASE}/applications/${applicationId}/approval-doc`, data),

  getExpiringApprovals: (days?: number) =>
    api.get<ApprovalDocumentItem[]>(`${BASE}/approvals/expiring`, { params: { days: days ?? 30 } }),

  checkValid: (protocolId: number) =>
    api.get<{ has_valid: boolean; warning: string | null }>(`${BASE}/check-valid/${protocolId}`),

  // ----- 审查意见 -----
  getReviewOpinions: (params?: Record<string, string | number>) =>
    api.get<{ items: ReviewOpinionItem[]; total: number }>(`${BASE}/review-opinions`, { params }),

  getReviewOpinionDetail: (id: number) =>
    api.get<ReviewOpinionItem>(`${BASE}/review-opinions/${id}`),

  createReviewOpinion: (data: {
    application_id: number
    opinion_type: string
    review_date: string
    summary: string
    detailed_opinion: string
    modification_requirements?: string
    reviewer_names?: string[]
    response_required?: boolean
    response_deadline?: string
  }) =>
    api.post<ReviewOpinionItem>(`${BASE}/review-opinions`, data),

  respondToOpinion: (id: number, responseText: string) =>
    api.post<ReviewOpinionItem>(`${BASE}/review-opinions/${id}/respond`, { response_text: responseText }),

  // ----- 监督 -----
  getSupervisions: (params?: Record<string, string | number>) =>
    api.get<{ items: SupervisionItem[]; total: number }>(`${BASE}/supervisions`, { params }),

  createSupervision: (data: SupervisionCreateIn) =>
    api.post<SupervisionItem>(`${BASE}/supervisions`, data),

  updateSupervisionStatus: (id: number, status: string, data?: Record<string, string>) =>
    api.post<SupervisionItem>(`${BASE}/supervisions/${id}/status`, { status, ...data }),

  // ----- 法规 -----
  getRegulations: (params?: Record<string, string | number>) =>
    api.get<{ items: RegulationItem[]; total: number }>(`${BASE}/regulations`, { params }),

  createRegulation: (data: RegulationCreateIn) =>
    api.post<RegulationItem>(`${BASE}/regulations`, data),

  updateRegulation: (id: number, data: Partial<RegulationCreateIn>) =>
    api.put<RegulationItem>(`${BASE}/regulations/${id}`, data),

  // ----- 合规检查 -----
  getComplianceChecks: (params?: Record<string, string | number>) =>
    api.get<{ items: ComplianceCheckItem[]; total: number }>(`${BASE}/compliance-checks`, { params }),

  createComplianceCheck: (data: ComplianceCheckCreateIn) =>
    api.post<ComplianceCheckItem>(`${BASE}/compliance-checks`, data),

  getComplianceFindings: (checkId: number) =>
    api.get<ComplianceFindingItem[]>(`${BASE}/compliance-checks/${checkId}/findings`),

  createComplianceFinding: (data: ComplianceFindingCreateIn) =>
    api.post<ComplianceFindingItem>(`${BASE}/compliance-findings`, data),

  closeFinding: (findingId: number, verifiedBy: string) =>
    api.post<ComplianceFindingItem>(`${BASE}/compliance-findings/${findingId}/close`, { verified_by: verifiedBy }),

  // ----- 监管沟通 -----
  getCorrespondences: (params?: Record<string, string | number>) =>
    api.get<{ items: CorrespondenceItem[]; total: number }>(`${BASE}/correspondences`, { params }),

  createCorrespondence: (data: CorrespondenceCreateIn) =>
    api.post<CorrespondenceItem>(`${BASE}/correspondences`, data),

  // ----- 培训 -----
  getTrainings: (params?: Record<string, string | number>) =>
    api.get<{ items: TrainingItem[]; total: number }>(`${BASE}/trainings`, { params }),

  createTraining: (data: TrainingCreateIn) =>
    api.post<TrainingItem>(`${BASE}/trainings`, data),

  getTrainingParticipants: (trainingId: number) =>
    api.get<TrainingParticipantItem[]>(`${BASE}/trainings/${trainingId}/participants`),

  addTrainingParticipant: (trainingId: number, data: { staff_id: number }) =>
    api.post<TrainingParticipantItem>(`${BASE}/trainings/${trainingId}/participants`, data),

  updateParticipant: (participantId: number, data: Partial<TrainingParticipantItem>) =>
    api.put<TrainingParticipantItem>(`${BASE}/training-participants/${participantId}`, data),
}
