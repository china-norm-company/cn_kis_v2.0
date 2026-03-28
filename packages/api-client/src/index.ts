/**
 * @cn-kis/api-client - 统一 API 客户端
 *
 * 所有工作台和微信小程序共享此 API 调用封装。
 * 统一响应格式：{ code, msg, data }
 */

// 核心客户端（getAxiosInstance 用于 blob 下载、自定义响应处理等）
export { createApiClient, api, getAxiosInstance } from './client'

// 类型定义
export type {
  ApiResponse,
  ApiListResponse,
  ApiClientConfig,
  PaginationParams,
  // WorkOrder
  WorkOrder,
  WorkOrderResource,
  WorkOrderQualityAudit,
  WorkOrderCreateIn,
  WorkOrderStats,
  // EDC / eCRF
  CRFTemplate,
  CRFSchema,
  CRFFieldDef,
  CRFQuestion,
  CRFRecord,
  CRFRecordCreateIn,
  CRFValidationResult,
  SDVProgress,
  DataQuery,
  // Subject
  Subject,
  SubjectCreateIn,
  SubjectProfile,
  Enrollment,
  EnrollIn,
  // Recruitment
  RecruitmentPlan,
  RecruitmentPlanCreateIn,
  EligibilityCriteria,
  RecruitmentChannel,
  ChannelEvaluation,
  RecruitmentAd,
  SubjectRegistration,
  ScreeningRecord,
  EnrollmentRecord,
  RecruitmentStatistics,
  // Execution
  SubjectCheckin,
  ComplianceRecord,
  SubjectPayment,
  SubjectQuestionnaire,
  SubjectAppointment,
  SupportTicket,
  TimelineEvent,
  // Protocol
  Protocol,
  ProtocolBasicUpdateIn,
  ProtocolCreateIn,
  ScreeningDay,
  // Resource
  ResourceCategory,
  ResourceItem,
  ActivityTemplate,
  ActivityBOM,
  CalibrationRecord,
  // Quality
  Deviation,
  DeviationCreateIn,
  CAPA,
  CAPAActionItem,
  SOP,
  // Audit
  AuditLog,
  // Identity
  Account,
  LoginResult,
  // Visit
  VisitPlan,
  VisitNode,
  VisitActivity,
  // Scheduling
  SchedulePlan,
  ScheduleSlot,
  ScheduleMilestone,
  SchedulePlanCreateIn,
  SlotUpdateIn,
  SchedulePrediction,
  // Workflow
  WorkflowDefinition,
  WorkflowStep,
  WorkflowInstance,
  ApprovalRecord,
  ChangeCreateIn,
  ImpactAnalysis,
  // Notification / Alerts
  AlertItem,
  AlertDashboard,
  ResourceStatusOverview,
} from './types'

// API 模块
export { workorderApi } from './modules/workorder'
export { edcApi } from './modules/edc'
export { subjectApi } from './modules/subject'
export { mySubjectApi } from './modules/my-subject'
export type { MyHomeDashboardData, MyHomeDashboardProject } from './modules/my-subject'
export { protocolApi } from './modules/protocol'
export type {
  ICFVersion,
  MiniSignRules,
  ConsentRecord,
  ConsentPreviewData,
  ConsentStats,
  ProtocolConsentOverview,
  ScreeningBatchConsent,
  DualSignStaff,
  ConsentSettings,
  WitnessStaffRecord,
  DualSignStaffVerificationStatus,
  WitnessSignatureAuthStatus,
} from './modules/protocol'
export { resourceApi } from './modules/resource'
export { qualityApi } from './modules/quality'
export type {
  SupervisionPlanEntry,
  SupervisionActualEntry,
  ProjectSupervisionItem,
  ProjectSupervisionDetail,
  ProjectSupervisionListStats,
} from './modules/quality'
export { auditApi } from './modules/audit'
export { identityApi } from './modules/identity'
export { visitApi } from './modules/visit'
export { schedulingApi } from './modules/scheduling'
export type { LabScheduleRow, ExecutionOrderSummaryItem, ExecutionOrderFullDetailItem } from './modules/scheduling'
export { workflowApi } from './modules/workflow'
export { notificationApi } from './modules/notification'
export type { NotificationItem, NotificationInbox } from './modules/notification'
export { qrcodeApi } from './modules/qrcode'
export type {
  QRCodeRecord,
  SmartResolveAction,
  SmartResolveResult,
  SmartResolveParams,
  CheckoutActionData,
  CheckinActionData,
  StipendPayActionData,
  ScanAuditLog,
} from './modules/qrcode'
export { recruitmentApi } from './modules/recruitment'
export type { TaskItem } from './modules/recruitment'
export { preScreeningApi } from './modules/prescreening'
export type {
  PreScreeningRecord,
  PreScreeningDraftIn,
  PreScreeningSummary,
  PreScreeningFunnel,
} from './modules/prescreening'
export { receptionApi } from './modules/reception'
export type {
  QueueItem,
  TodayQueue,
  TodayStats,
  CheckinResult,
  DisplayBoard,
  FlowcardData,
  FlowcardProgress,
  FlowcardStep,
  ReceptionAnalytics,
  ReceptionInsights,
  AlertItem as ReceptionAlertItem,
} from './modules/reception'
export { executionApi } from './modules/execution'
export { questionnaireApi } from './modules/questionnaire'
export type { QuestionnaireTemplate, QuestionnaireAssignment, QuestionnaireStatistics } from './modules/questionnaire'
export { loyaltyApi } from './modules/loyalty'
export type { LoyaltyScore } from './modules/loyalty'
export { evaluatorApi } from './modules/evaluator'
export { equipmentApi } from './modules/equipment'
export { materialApi } from './modules/material'
export { productDistributionApi } from './modules/productDistribution'
export { facilityApi } from './modules/facility'
export type {
  MaterialDashboard,
  ProductItem,
  ProductDetail,
  ProductStats,
  ProductBatchItem,
  ConsumableItem,
  ConsumableStats,
  SampleItem,
  SampleDetail,
  SampleStats,
  SampleReceiptItem,
  SampleDestructionItem,
  ProductKitItem,
  ProductDispensingItem,
  ProductUsageItem,
  TraceResult,
  TransactionItem,
  TransactionStats,
  ExpiryAlertItem,
  ExpiryAlerts,
  InventoryItem,
  InventoryCheck,
  InventoryCheckRecord,
  StorageZoneOverview,
  StorageLocation,
  StorageLocationNode,
  StorageLocationDetail,
  TemperatureLogItem,
  ConsumableBatchItem,
  ExportResult,
  AuditTrailItem,
  SignatureResult,
  FeishuAlertResult,
  FeishuApprovalResult,
  AlertCheckResult,
  ProductReturnItem,
} from './modules/material'
export type {
  EquipmentDashboard,
  EquipmentItem,
  EquipmentDetail,
  CalibrationInfo,
  CalibrationRecord as EquipmentCalibrationRecord,
  CalibrationPlan,
  CalibrationPlanItem,
  CalibrationPlanListItem,
  VerificationPlan,
  VerificationPlanItem,
  VerificationPlanListItem,
  VerificationRecord,
  MaintenancePlan,
  MaintenancePlanItem,
  MaintenancePlanListItem,
  MaintenanceOrder,
  MaintenanceStats,
  UsageRecord,
  UsageStats,
  Authorization as EquipmentAuthorization,
  DetectionMethod,
  DetectionMethodDetail,
} from './modules/equipment'
export type {
  EvaluatorDashboard,
  EvaluatorWorkOrder,
  ExperimentStep,
  InstrumentDetection,
  WorkOrderException as EvaluatorException,
  EvaluatorProfile,
  WeeklySchedule,
  ScheduleNote,
  ScheduleAttachment,
  WaitingSubject,
  EnvironmentStatus,
  InstrumentStatus,
} from './modules/evaluator'
export type {
  FacilityDashboard,
  VenueItem,
  VenueDetail,
  VenueStats,
  VenueCreateIn,
  VenueChangeIn,
  VenueChangeLogItem,
  VenueChangeLogsResponse,
  ReservationItem,
  ReservationStats,
  CalendarEntry,
  ReservationCreateIn,
  EnvironmentReading,
  EnvironmentLog,
  ComplianceStats,
  EnvironmentLogCreateIn,
  IncidentItem,
  IncidentDetail,
  IncidentStats,
  IncidentCreateIn,
  CleaningItem,
  CleaningStats,
  CleaningCreateIn,
  VenueUsageScheduleItem,
  VenueUsageScheduleCreateIn,
  VenueMonitorItem,
  AccountForMonitor,
} from './modules/facility'

// 管理驾驶舱（A1/A2/A3/E1）
export { dashboardApi } from './modules/dashboard'
export type {
  DashboardKPI,
  ProjectHealth,
  DashboardAlert,
  ManagerOverview,
  TrendPoint,
  WorkorderTrendPoint,
  RevenueTrendPoint,
  DeviationTrendPoint,
  EnrollmentTrend,
  TrendsData,
  PortfolioProject,
  ResourceConflict,
  TeamMember,
  TeamCapacity,
  TodoItem,
  TodoSummary,
  MyTodoData,
  BusinessFunnel,
  ProjectBusiness,
  BusinessPipelineData,
} from './modules/dashboard'

// 可行性评估（B1）
export { feasibilityApi } from './modules/feasibility'
export type {
  FeasibilityAssessment,
  AssessmentItem as FeasibilityItem,
  AssessmentCreateIn as FeasibilityCreateIn,
} from './modules/feasibility'

// 方案准备（B2/E3）
export { proposalApi } from './modules/proposal'
export type {
  Proposal,
  ProposalVersion,
  ProposalChecklist,
  CommunicationLog,
  Meeting,
  ProposalCreateIn,
} from './modules/proposal'

// 结项管理（B4）
export { closeoutApi } from './modules/closeout'
export type {
  ProjectCloseout,
  CloseoutChecklist,
  ProjectRetrospective,
  ClientAcceptance,
  CloseoutDetail,
} from './modules/closeout'

// 知识库（D3）
export { knowledgeApi } from './modules/knowledge'

// 项目全链路（研究台）
export { projectFullLinkApi } from './modules/project-full-link'
export type {
  ProjectFullLinkProject,
  ProjectFullLinkProtocol,
  ProjectListResponse,
  ProtocolListResponse,
  ProjectUpdateIn,
  ProtocolUpdateIn,
} from './modules/project-full-link'

// 周报系统（研究台）
export { weeklyReportApi, getCurrentISOWeek, WEEKLY_PRIORITY_OPTIONS, weeklyPriorityLabel } from './modules/weekly-report'
export type {
  WeeklyReportTask,
  WeeklyReportOut,
  WeeklyReportInitOut,
  WeeklyReportDraftIn,
  WeeklyReportItemOut,
  WeeklyReportNotesOut,
  WeeklyReportListItem,
  TaskStatus as WeeklyTaskStatus,
} from './modules/weekly-report'
export type {
  KnowledgeEntry,
  KnowledgeTag,
  KnowledgeEntryType,
  EntryCreateIn as KnowledgeEntryCreateIn,
} from './modules/knowledge'

// CRM 客户服务（C1/C2/C3）
export { crmApi } from './modules/crm'
export type {
  Client,
  Opportunity,
  CRMTicket,
  ClientInsight,
} from './modules/crm'

// 财务管理
export { financeApi } from './modules/finance'
export type {
  Quote,
  QuoteCreateIn,
  QuoteItem,
  Contract,
  ContractPaymentTerm,
  ContractChange,
  Invoice,
  InvoiceCreateIn,
  Payment,
  PaymentCreateIn,
} from './modules/finance'

// 智能体网关（D1/D2）
export { agentApi } from './modules/agent-gateway'
export type {
  AgentDefinition,
  AgentSession,
  AgentCall,
  ChatResponse,
  InsightResponse,
} from './modules/agent-gateway'

// 伦理审查与法规合规（御史·伦理台）
export { ethicsApi } from './modules/ethics'
export type {
  EthicsDashboard,
  EthicsApplicationItem,
  EthicsApplicationDetail,
  EthicsApplicationCreateIn,
  ApprovalDocumentItem,
  ReviewOpinionItem,
  SupervisionItem,
  SupervisionCreateIn,
  RegulationItem,
  RegulationCreateIn,
  ComplianceCheckItem,
  ComplianceFindingItem,
  ComplianceCheckCreateIn,
  ComplianceFindingCreateIn,
  CorrespondenceItem,
  CorrespondenceCreateIn,
  TrainingItem,
  TrainingParticipantItem,
  TrainingCreateIn,
} from './modules/ethics'

// 安全管理（AE/SAE）
export { safetyApi } from './modules/safety'
export type {
  AdverseEvent,
  AEFollowUp,
  AECreateIn,
  AEFollowUpCreateIn,
  AEQueryParams,
  AEListResult,
  AEStats,
} from './modules/safety'

// Claw 注册表
export { clawRegistryApi } from './modules/claw-registry'
export type {
  ClawQuickAction,
  WorkstationClawConfig,
  ClawRegistryFull,
} from './modules/claw-registry'

// 数字员工 assistant 领域（动作、回放、策略、治理、注册表、发布门禁）
export { assistantActionsApi } from './modules/assistant-actions'
export type { ActionItem, ActionInboxResponse, RouteRecommendedIn } from './modules/assistant-actions'
export { assistantReplayApi } from './modules/assistant-replay'
export type {
  ReplayResponse,
  ReplayAction,
  ReplayExecution,
  ReplayExecutionResult,
} from './modules/assistant-replay'
export { assistantPoliciesApi } from './modules/assistant-policies'
export type {
  PolicyItem,
  PolicyListResponse,
  PolicyUpsertIn,
  RiskLevel as PolicyRiskLevel,
} from './modules/assistant-policies'
export { assistantGovernanceApi } from './modules/assistant-governance'
export type {
  RouteGovernancePreset,
  RouteGovernanceThresholds,
  RouteGovernancePresetResponse,
  RouteGovernancePresetItem,
  RouteGovernanceThresholdResponse,
  ManagerOverviewResponse,
  AssistantMetricsResponse,
} from './modules/assistant-governance'
export { assistantRegistryApi } from './modules/assistant-registry'
export type {
  ClawTemplate,
  ClawPreset,
  ClawSkillBundle,
  ClawIterationMetrics,
  ClawTemplateResponse,
  ClawTemplateItem,
  ClawPresetResponse,
  ClawPresetItem,
  ClawSkillBundleResponse,
  ClawSkillBundleItem,
  ClawSkillBundleGroup,
  ClawIterationMetricsResponse,
  ClawIterationMetricItem,
  ClawSkillSuccessItem,
} from './modules/assistant-registry'
export { assistantReleaseGatesApi } from './modules/assistant-release-gates'
export type { ReleaseGateVerdict } from './modules/assistant-release-gates'
export { assistantPreferencesApi } from './modules/assistant-preferences'
export type {
  AssistantPreferenceValue,
  AssistantPreferenceResponse,
} from './modules/assistant-preferences'
export { assistantResearchApi } from './modules/assistant-research'
export type {
  ResearchInsightsResponse,
  ResearchRoutePreferenceResponse,
} from './modules/assistant-research'

// 中书·数字员工中心
export { digitalWorkforcePortalApi } from './modules/digital-workforce-portal'
export type {
  DomainWorkerBlueprintItem,
  PortalAgentItem,
  PortalRoleItem,
  RoleDefinitionItem,
  RoleCreatePayload,
  RoleUpdatePayload,
  SuggestionItem,
  SuggestionAction,
  ExecutionTodayItem,
  DigitalWorkforcePortalData,
  DigitalWorkforcePortalResponse,
  DigitalWorkforceValueMetricsData,
  DigitalWorkforceValueMetricsResponse,
  ValueMetricsByRoleItem,
  ValueMetricsByWorkstationItem,
  ValueMetricsByBusinessObjectItem,
  MyAssistantItem,
  MyActivityItem,
  AgentDetail,
  AgentUpdatePayload,
  SkillDefinitionItem,
  SkillCreatePayload,
  SkillUpdatePayload,
  WorkstationBindingItem,
} from './modules/digital-workforce-portal'

// 实验室人员管理
export { labPersonnelApi } from './modules/lab-personnel'
export type {
  PersonnelDashboard,
  StaffStats,
  StaffItem,
  StaffDetail,
  StaffProfileCreateIn,
  QualificationMatrix,
  GapAnalysis,
  CertificateExpiryOverview,
  CertificateItem,
  CertificateCreateIn,
  CertificateUpdateIn,
  CertificateRenewIn,
  ExpiryAlert,
  QualificationOverview,
  MethodQualItem,
  MethodQualCreateIn,
  MethodQualUpdateIn,
  ScheduleOverview,
  ScheduleItem,
  ScheduleDetail,
  ScheduleCreateIn,
  SlotItem,
  SlotCreateIn,
  SlotUpdateIn as PersonnelSlotUpdateIn,
  SwapRequestCreateIn,
  ConflictResult,
  WorktimeOverview,
  WorkTimeLogItem,
  WorkTimeSummaryItem,
  WorkTimeLogCreateIn,
  UtilizationAnalysis,
  CapacityForecast,
  DispatchCandidate,
  DispatchAssignIn,
  DispatchMonitor,
  RiskOverview,
  RiskItem,
  RiskStats,
  RiskResolveIn,
  RiskScanResult,
} from './modules/lab-personnel'

// 易快报集成（全量采集 + 四层安全注入）
export { ekuaibaoApi } from './modules/ekuaibao'
export type {
  EkbStatus,
  EkbBatch,
  EkbConflict,
  EkbReconcileResult,
  EkbInjectionLog,
} from './modules/ekuaibao'
