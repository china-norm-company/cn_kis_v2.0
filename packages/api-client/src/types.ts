/**
 * 统一 API 响应格式与类型定义
 *
 * 与后端 Django Ninja Schema 对应
 */

// ============================================================================
// 通用响应格式
// ============================================================================
export interface ApiResponse<T = unknown> {
  code: number
  msg: string
  data: T
}

export interface ApiListResponse<T = unknown> {
  code: number
  msg: string
  data: {
    items: T[]
    total: number
    page: number
    page_size: number
  }
}

export interface ApiClientConfig {
  baseURL?: string
  timeout?: number
  getToken?: () => string | null
  onUnauthorized?: () => void
}

// ============================================================================
// WorkOrder 工单模块
// ============================================================================
export interface WorkOrder {
  id: number
  enrollment_id: number
  visit_node_id: number | null
  visit_activity_id: number | null
  schedule_slot_id: number | null
  title: string
  description: string
  work_order_type: string
  status: string
  scheduled_date: string | null
  actual_date: string | null
  assigned_to: number | null
  created_by_id: number | null
  due_date: string | null
  feishu_task_id: string
  create_time: string
  update_time: string
  completed_at: string | null
  // 关联信息（/my-today 接口返回）
  subject_name?: string
  subject_id?: number
  protocol_title?: string
  protocol_id?: number
  visit_node_name?: string
  activity_name?: string
  resources?: WorkOrderResource[]
  crf_template_name?: string
  crf_template_id?: number
}

export interface WorkOrderResource {
  id: number
  work_order_id: number
  resource_category_id: number
  resource_category_name: string
  resource_item_id: number | null
  resource_item_name: string | null
  required_quantity: number
  actual_quantity: number | null
  is_mandatory: boolean
  calibration_status?: 'valid' | 'expiring' | 'expired'
  next_calibration_date?: string | null
}

export interface WorkOrderQualityAudit {
  id: number
  work_order_id: number
  completeness: number
  has_anomaly: boolean
  result: 'auto_pass' | 'auto_reject' | 'manual_review'
  details: Record<string, unknown>
  reviewer_id: number | null
  reviewer_comment: string
  create_time: string
}

export interface WorkOrderCreateIn {
  enrollment_id: number
  visit_node_id?: number
  title: string
  description?: string
  assigned_to?: number
  due_date?: string
}

export interface WorkOrderStats {
  total: number
  pending: number
  assigned: number
  in_progress: number
  completed: number
  review: number
  approved: number
  rejected: number
  cancelled: number
  overdue: number
}

// ============================================================================
// EDC / eCRF 模块
// ============================================================================
export interface CRFTemplate {
  id: number
  name: string
  version: string
  schema: CRFSchema
  description: string
  is_active: boolean
  create_time: string
  update_time: string
}

export interface CRFSchema {
  title?: string
  description?: string
  properties?: Record<string, CRFFieldDef>
  required?: string[]
  questions?: CRFQuestion[]
}

export interface CRFFieldDef {
  type: string
  title?: string
  description?: string
  minimum?: number
  maximum?: number
  enum?: string[]
  format?: string
}

export interface CRFQuestion {
  id: string
  type: 'text' | 'number' | 'select' | 'radio' | 'checkbox' | 'date' | 'textarea' | 'scale' | 'image-upload'
  title: string
  required: boolean
  options?: { label: string; value: string }[]
  placeholder?: string
  min?: number
  max?: number
  step?: number
  unit?: string
  repeat?: number
  auto_average?: boolean
}

export interface CRFRecord {
  id: number
  template_id: number
  template_name?: string
  work_order_id: number
  data: Record<string, unknown>
  status: 'draft' | 'submitted' | 'verified' | 'queried' | 'sdv_completed' | 'locked'
  submitted_by: number | null
  submitted_at: string | null
  verified_by: number | null
  verified_at: string | null
  sdv_status?: string | null
  validation_errors?: string[]
  create_time: string
  update_time: string
}

export interface CRFRecordCreateIn {
  template_id: number
  work_order_id: number
  data: Record<string, unknown>
}

export interface CRFValidationResult {
  id: number
  record_id: number
  field_name: string
  severity: 'error' | 'warning'
  message: string
  field_value: string
  is_resolved: boolean
  create_time: string
}

export interface SDVProgress {
  total_fields: number
  verified_fields: number
  discrepancy_fields: number
  progress_percent: number
}

export interface DataQuery {
  id: number
  crf_record_id: number
  field_name: string
  query_text: string
  status: 'open' | 'answered' | 'closed'
  answer_text: string
  answered_by_id: number | null
  answered_at: string | null
  closed_by_id: number | null
  closed_at: string | null
  created_by_id: number | null
  create_time: string
}

// ============================================================================
// Subject 受试者模块
// ============================================================================
export interface Subject {
  id: number
  subject_no: string
  name: string
  gender: string
  age: number | null
  phone: string
  skin_type: string
  risk_level: 'low' | 'medium' | 'high'
  source_channel: string
  status: string
  created_by_id: number | null
  create_time: string
  update_time: string
}

export interface SubjectCreateIn {
  name: string
  gender?: string
  age?: number
  phone?: string
  skin_type?: string
  risk_level?: string
  source_channel?: string
}

export interface SubjectProfile {
  birth_date: string | null
  age: number | null
  ethnicity: string
  education: string
  occupation: string
  marital_status: string
  name_pinyin: string
  id_card_last4: string
  phone_backup: string
  email: string
  province: string
  city: string
  district: string
  address: string
  postal_code: string
  emergency_contact_name: string
  emergency_contact_phone: string
  emergency_contact_relation: string
  first_screening_date: string | null
  first_enrollment_date: string | null
  total_enrollments: number
  total_completed: number
  privacy_level: string
  consent_data_sharing: boolean
  consent_rwe_usage: boolean
  consent_biobank: boolean
  consent_follow_up: boolean
  data_retention_years: number
}

export interface Enrollment {
  id: number
  subject_id: number
  subject_name?: string
  protocol_id: number
  protocol_title?: string
  status: 'pending' | 'enrolled' | 'completed' | 'withdrawn'
  enrolled_at: string | null
  create_time: string
}

export interface EnrollIn {
  subject_id: number
  protocol_id: number
}

// ============================================================================
// Recruitment 招募管理模块
// ============================================================================
export interface RecruitmentPlan {
  id: number
  plan_no: string
  protocol_id: number
  title: string
  description: string
  target_count: number
  enrolled_count: number
  screened_count: number
  registered_count: number
  start_date: string
  end_date: string
  status: string
  completion_rate: number
  create_time: string
}

export interface RecruitmentPlanCreateIn {
  protocol_id: number
  title: string
  target_count: number
  start_date: string
  end_date: string
  description?: string
}

export interface EligibilityCriteria {
  id: number
  criteria_type: 'inclusion' | 'exclusion'
  sequence: number
  description: string
  is_mandatory: boolean
}

export interface RecruitmentChannel {
  id: number
  channel_type: string
  name: string
  registered_count: number
  screened_count: number
  enrolled_count: number
  status: string
}

export interface ChannelEvaluation {
  channel_id: number
  name: string
  conversion_rate: number
  cost_per_enrollment: number
}

export interface RecruitmentAd {
  id: number
  ad_type: string
  title: string
  status: string
  view_count: number
  click_count: number
  registration_count: number
}

export interface SubjectRegistration {
  id: number
  registration_no: string
  name: string
  phone: string
  gender: string
  age: number | null
  status: string
  contacted_at: string | null
  contact_notes: string
  next_contact_date: string | null
  withdrawal_reason?: string
  create_time: string
}

export interface ScreeningRecord {
  id: number
  screening_no: string
  result: string
  criteria_checks: Array<{ criteria_id: number; met: boolean; notes: string }> | null
  create_time: string
}

export interface EnrollmentRecord {
  id: number
  enrollment_no: string
  subject_no: string
  enrollment_date: string | null
  icf_signed: boolean
  randomized: boolean
  status: string
}

export interface RecruitmentStatistics {
  plan_id: number
  plan_no: string
  target_count: number
  registered_count: number
  screened_count: number
  enrolled_count: number
  completion_rate: number
  channels: Array<{
    id: number
    name: string
    type: string
    registered: number
    screened: number
    enrolled: number
    cost: string
  }>
}

// ============================================================================
// Execution 执行管理模块（签到/依从/礼金）
// ============================================================================
export interface SubjectCheckin {
  id: number
  checkin_date: string
  checkin_time: string | null
  checkout_time: string | null
  status: string
}

export interface ComplianceRecord {
  id: number
  assessment_date: string
  visit_attendance_rate: string
  questionnaire_completion_rate: string
  time_window_deviation: string
  overall_score: string
  level: string
}

export interface SubjectPayment {
  id: number
  payment_no: string
  payment_type: string
  amount: string
  status: string
  paid_at: string | null
}

export interface SubjectQuestionnaire {
  id: number
  title: string
  questionnaire_type: string
  status: string
  due_date: string | null
}

export interface SubjectAppointment {
  id: number
  appointment_date: string
  appointment_time: string | null
  purpose: string
  status: string
}

export interface SupportTicket {
  id: number
  ticket_no: string
  category: string
  title: string
  status: string
  reply: string
  priority?: string
  assigned_to_id?: number | null
  sla?: {
    due_at: string | null
    remaining_minutes: number | null
    is_overdue: boolean
    first_response_minutes: number | null
  }
  create_time: string
}

export interface TimelineEvent {
  type: string
  id: number
  measured_at: string
  source: string
  enrollment_id: number | null
  work_order_id: number | null
  summary: string
}

// ============================================================================
// Protocol 协议模块
// ============================================================================
export interface Protocol {
  id: number
  title: string
  code: string
  file_path: string
  status: string
  parsed_data: Record<string, unknown> | null
  efficacy_type: string
  sample_size: number | null
  product_category?: string
  claim_type?: string
  test_methods?: string[]
  regulatory_standard?: string
  sponsor_id?: number | null
  team_members?: Array<{ id: number; name: string; role: string }>
  /** 治理台账号 ID，全局角色 QA质量管理（qa） */
  consent_config_account_id?: number | null
  created_by_id: number | null
  create_time: string
  update_time: string
}

/** 现场筛选计划日 + 预约人数 target_count（与协议知情配置 screening_schedule 一致） */
export interface ScreeningDay {
  date: string
  target_count: number
  /** 测试筛选：日期须早于最早正式筛选日；不参与「最早现场筛选日期」；发布前须删除 */
  is_test_screening?: boolean
  /** 该现场日知情签署工作人员姓名，须与知情配置中双签名单（dual_sign_staffs）姓名一致 */
  signing_staff_name?: string
}

export interface ProtocolCreateIn {
  title: string
  code?: string
  efficacy_type?: string
  sample_size?: number
  /** 可选；创建时写入 parsed_data.consent_settings */
  screening_schedule?: ScreeningDay[]
  /** 治理台账号，须具备全局角色 qa（QA质量管理） */
  consent_config_account_id?: number
  /** 项目级知情签署工作人员姓名（须为双签名单中的姓名；创建后写入 consent_settings） */
  consent_signing_staff_name?: string
}

/** 更新协议基本信息（执行台知情管理「编辑项目信息」） */
export interface ProtocolBasicUpdateIn {
  title?: string
  code?: string
  /** 0 表示清空知情配置负责人 */
  consent_config_account_id?: number
}

// ============================================================================
// Resource 资源管理模块
// ============================================================================
export interface ResourceCategory {
  id: number
  name: string
  code: string
  resource_type: 'personnel' | 'equipment' | 'material' | 'method' | 'environment'
  parent_id: number | null
  description: string
  is_active: boolean
}

export interface ResourceItem {
  id: number
  name: string
  code: string
  category_id: number
  status: 'active' | 'idle' | 'maintenance' | 'calibrating' | 'retired' | 'reserved'
  location: string
  manufacturer: string
  model_number: string
  serial_number: string
  purchase_date: string | null
  next_calibration_date: string | null
  last_calibration_date: string | null
  calibration_cycle_days: number | null
  create_time: string
}

export interface ActivityTemplate {
  id: number
  name: string
  code: string
  description: string
  duration: number
  sop_id: number | null
  crf_template_id: number | null
  qualification_requirements: Array<{ name: string; level: string }>
  is_active: boolean
  bom?: ActivityBOM[]
  create_time: string
}

export interface ActivityBOM {
  id: number
  template_id: number
  resource_category_id: number
  resource_category_name: string
  resource_category_code: string
  resource_type: string
  quantity: number
  is_mandatory: boolean
  notes: string
}

export interface CalibrationRecord {
  id: number
  equipment_id: number
  calibration_date: string
  next_due_date: string
  result: 'pass' | 'fail' | 'conditional'
  calibrator: string
  certificate_no: string
}

// ============================================================================
// Quality 质量合规模块
// ============================================================================
export interface Deviation {
  id: number
  code: string
  title: string
  category: string
  severity: 'critical' | 'major' | 'minor'
  status: string
  reporter: string
  reporter_id: number | null
  reported_at: string
  project: string
  project_id: number | null
  description: string
  root_cause: string
  resolution: string
  closed_at: string | null
  create_time: string
}

export interface DeviationCreateIn {
  title: string
  category: string
  severity: string
  reported_at: string
  project: string
  project_id?: number
  description?: string
}

export interface CAPA {
  id: number
  code: string
  deviation_id: number
  type: 'corrective' | 'preventive'
  title: string
  responsible: string
  responsible_id: number | null
  due_date: string
  status: string
  effectiveness: string
  action_detail: string
  action_items?: CAPAActionItem[]
  create_time: string
}

export interface CAPAActionItem {
  id: number
  capa_id: number
  sequence: number
  title: string
  responsible_id: number | null
  responsible_name: string
  due_date: string
  status: string
  completion_note: string
  completed_at: string | null
}

export interface SOP {
  id: number
  code: string
  title: string
  version: string
  category: string
  status: 'effective' | 'draft' | 'under_review' | 'retired'
  effective_date: string | null
  next_review: string | null
  owner: string
  feishu_doc_url: string
  description: string
  create_time: string
}

// ============================================================================
// Audit 审计日志模块
// ============================================================================
export interface AuditLog {
  id: number
  account_id: number
  account_name: string
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'APPROVE' | 'REJECT' | 'SIGN' | 'EXPORT' | 'VIEW'
  description: string
  resource_type: string
  resource_id: string
  resource_name: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  changed_fields: string[] | null
  ip_address: string
  project_id: number | null
  create_time: string
}

// ============================================================================
// Identity 认证模块
// ============================================================================
export interface Account {
  id: number
  name: string
  email: string
  phone: string
  account_type: string
  feishu_user_id: string
  avatar_url: string
  is_active: boolean
  roles: string[]
  permissions: string[]
}

export interface LoginResult {
  token: string
  account: Account
}

// ============================================================================
// Visit 访视管理
// ============================================================================
export interface VisitPlan {
  id: number
  protocol_id: number
  name: string
  description: string
  status: string
  created_by_id: number | null
  create_time: string
}

export interface VisitNode {
  id: number
  plan_id: number
  name: string
  code: string
  baseline_day: number
  window_before: number
  window_after: number
  status: string
  order: number
  create_time: string
}

export interface VisitActivity {
  id: number
  node_id: number
  name: string
  activity_type: string
  description: string
  is_required: boolean
  order: number
  activity_template_id: number | null
  create_time: string
}

// ============================================================================
// Scheduling 排程管理模块
// ============================================================================
export interface SchedulePlan {
  id: number
  visit_plan_id: number
  resource_demand_id: number | null
  name: string
  start_date: string
  end_date: string
  status: 'draft' | 'generated' | 'published' | 'cancelled'
  create_time: string
  slots?: ScheduleSlot[]
}

export interface ScheduleSlot {
  id: number
  schedule_plan_id: number
  visit_node_id: number
  visit_node_name: string
  scheduled_date: string
  start_time: string
  end_time: string
  status: 'planned' | 'confirmed' | 'completed' | 'cancelled' | 'conflict'
  assigned_to_id: number | null
  feishu_calendar_event_id: string
  conflict_reason: string
}

export interface ScheduleMilestone {
  id: number
  milestone_type: string
  name: string
  target_date: string
  actual_date: string | null
  is_achieved: boolean
}

export interface SchedulePlanCreateIn {
  visit_plan_id: number
  start_date: string
  end_date: string
  name?: string
}

export interface SlotUpdateIn {
  scheduled_date?: string
  start_time?: string
  end_time?: string
  assigned_to_id?: number
}

export interface SchedulePrediction {
  total_slots: number
  completed_slots: number
  completion_rate: number
  elapsed_days: number
  planned_end: string
  predicted_end: string | null
  on_track: boolean | null
}

// ============================================================================
// Workflow 工作流模块
// ============================================================================
export interface WorkflowDefinition {
  id: number
  name: string
  code: string
  business_type: string
  status: 'active' | 'inactive'
  steps: WorkflowStep[]
}

export interface WorkflowStep {
  step: number
  name: string
  type: 'sequential' | 'parallel' | 'any'
  approvers: Array<{ role?: string; user_id?: number }>
}

export interface WorkflowInstance {
  id: number
  definition_id: number
  business_type: string
  business_id: string
  title: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  current_step: number
  initiator_id: number
  form_data: Record<string, unknown>
  approval_records?: ApprovalRecord[]
  create_time: string
}

export interface ApprovalRecord {
  id: number
  instance_id: number
  step: number
  approver_id: number
  action: 'approve' | 'reject' | 'forward'
  comment: string
  approved_at: string
}

export interface ChangeCreateIn {
  definition_code?: string
  business_type: string
  business_id?: string
  title: string
  form_data: Record<string, unknown>
}

export interface ImpactAnalysis {
  affected_slots: number
  affected_work_orders: number
  affected_enrollments: number
  details: Record<string, unknown>
}

// ============================================================================
// Notification 通知预警模块
// ============================================================================
export interface AlertItem {
  type: string
  severity: 'low' | 'normal' | 'high' | 'urgent'
  title: string
  message: string
  source_type: string
  source_id: number | null
  created_at: string
}

export interface AlertDashboard {
  equipment_calibration: AlertItem[]
  material_expiry: AlertItem[]
  personnel_gcp: AlertItem[]
  workorder_overdue: AlertItem[]
  visit_window: AlertItem[]
  total_count: number
}

export interface ResourceStatusOverview {
  personnel: { total: number; available: number; gcp_expiring: number; workload: Record<string, number> }
  equipment: { total: number; active: number; calibration_expiring: number; maintenance: number }
  material: { total: number; in_stock: number; expiring_soon: number; low_stock: number }
  method: { total_sops: number; effective: number; under_review: number; training_completion_rate: number }
  environment: { total_venues: number; compliant: number; non_compliant: number; recent_compliance_rate: number }
}

// ============================================================================
// 通用分页参数
// ============================================================================
export interface PaginationParams {
  page?: number
  page_size?: number
}
