/**
 * 设备管理工作台（器监）API 模块
 *
 * 对应后端：/api/v1/equipment/
 * 覆盖：仪表盘、设备台账、校准管理、维护工单、使用记录、操作授权、检测方法
 */
import { api } from '../client'

// ============================================================================
// 类型定义
// ============================================================================

/** 设备管理仪表盘 */
export interface EquipmentDashboard {
  summary: {
    total: number
    active: number
    maintenance: number
    calibrating: number
    idle: number
    retired: number
  }
  calibration_alerts: {
    overdue: number
    due_in_7_days: number
    due_in_30_days: number
  }
  maintenance_overview: {
    pending: number
    in_progress: number
    completed_this_month: number
  }
  recent_activities: Array<{
    type: string
    equipment_name: string
    description: string
    time: string
  }>
  usage_today: {
    total_uses: number
    active_now: number
  }
}

/** 设备校准信息 */
export interface CalibrationInfo {
  last_date: string | null
  next_due_date: string | null
  days_remaining: number | null
  status: 'valid' | 'expiring' | 'urgent' | 'overdue' | 'unknown'
}

/** 设备列表项 */
export interface EquipmentItem {
  id: number
  name: string
  code: string
  category_id: number
  category_name: string
  /** LIMS「名称分类」：同规格统一类型（如 电子天平、glossymeter），与设备类别 ResourceCategory 无关 */
  name_classification?: string
  status: string
  status_display: string
  location: string
  manufacturer: string
  model_number: string
  serial_number: string
  purchase_date: string | null
  warranty_expiry: string | null
  next_calibration_date?: string | null
  next_verification_date?: string | null
  next_maintenance_date?: string | null
  calibration_cycle_days?: number | null
  verification_cycle_days?: number | null
  maintenance_cycle_days?: number | null
  calibration_info: CalibrationInfo
  authorized_operators_count: number
  usage_count_30d: number
  manager_id: number | null
  create_time: string
  /** 扩展属性：货主组织、LIMS编号、计量单位、组别等 */
  attributes?: Record<string, unknown>
  organization?: string
  lims_code?: string
  unit?: string
  quantity?: number
  initial_value?: number
  group?: string
  /** LIMS 最后一次写入本设备台账字段的同步时间（ISO8601） */
  lims_synced_at?: string | null
  /** 对应 LIMS 导入批次号 */
  lims_sync_batch_no?: string | null
}

/** 设备详情 */
export interface EquipmentDetail extends EquipmentItem {
  category_path: string
  calibration_cycle_days: number | null
  last_calibration_date?: string | null
  last_verification_date?: string | null
  last_maintenance_date?: string | null
  attributes: Record<string, unknown>
  recent_calibrations: CalibrationRecord[]
  recent_maintenances: MaintenanceOrder[]
  recent_usages: UsageRecord[]
  authorizations: Authorization[]
}

export interface EquipmentCategoryLedgerItem {
  id: number
  category_name: string
  category_code: string
  category_path: string
  equipment_count: number
}

export interface EquipmentNameClassificationLedgerItem {
  name_classification: string
  category_id: number | null
  category_name: string
  equipment_count: number
}

/** 校准记录 */
export interface CalibrationRecord {
  id: number
  equipment_id: number
  equipment_name?: string
  equipment_code?: string
  calibration_type: string
  calibration_date: string
  next_due_date: string
  calibrator: string
  certificate_no: string
  certificate_file_url: string
  result: string
  notes: string
  create_time: string
}

/** 校准计划 */
export interface CalibrationPlan {
  overdue: { count: number; items: CalibrationPlanItem[] }
  due_in_7_days: { count: number; items: CalibrationPlanItem[] }
  due_this_month: { count: number; items: CalibrationPlanItem[] }
  /** 待发起校准工单（下次到期日<=下月末，尚未发起工单） */
  pending_work_orders?: { count: number; items: CalibrationPlanItem[] }
}

export interface CalibrationPlanItem {
  id: number
  name: string
  code: string
  next_calibration_date: string
  location: string
}

/** 校准计划列表项（已导入的计划） */
export interface CalibrationPlanListItem {
  id: number
  code: string
  name: string
  status: string
  status_display: string
  model_number: string
  serial_number: string
  traceability: string
  calibration_method: string
  calibration_institution: string
  calibration_procedure: string
  calibration_cycle_days: number
  last_calibration_date: string
  next_calibration_date: string
  reminder_days: number
  reminder_person: string
  traceability_params: string
}

/** 核查计划 */
export interface VerificationPlan {
  overdue: { count: number; items: VerificationPlanItem[] }
  due_in_7_days: { count: number; items: VerificationPlanItem[] }
  due_this_month: { count: number; items: VerificationPlanItem[] }
  pending_work_orders?: { count: number; items: VerificationPlanItem[] }
}

export interface VerificationPlanItem {
  id: number
  name: string
  code: string
  next_verification_date: string
  location: string
}

export interface VerificationPlanListItem {
  id: number
  code: string
  name: string
  status: string
  status_display: string
  model_number: string
  serial_number: string
  verification_cycle_days: number
  last_verification_date: string
  next_verification_date: string
  reminder_days: number
  reminder_person: string
  verification_method: string
}

/** 核查记录 */
export interface VerificationRecord {
  id: number
  equipment_id: number
  equipment_name?: string
  equipment_code?: string
  verification_date: string
  next_due_date: string
  verifier: string
  result: string
  method_notes: string
  notes: string
  create_time: string
}

/** 维护计划 */
export interface MaintenancePlan {
  overdue: { count: number; items: MaintenancePlanItem[] }
  due_in_7_days: { count: number; items: MaintenancePlanItem[] }
  due_this_month: { count: number; items: MaintenancePlanItem[] }
  pending_work_orders?: { count: number; items: MaintenancePlanItem[] }
}

export interface MaintenancePlanItem {
  id: number
  name: string
  code: string
  next_maintenance_date: string
  location: string
}

export interface MaintenancePlanListItem {
  id: number
  code: string
  name: string
  status: string
  status_display: string
  model_number: string
  serial_number: string
  maintenance_cycle_days: number
  last_maintenance_date: string
  next_maintenance_date: string
  reminder_days: number
  reminder_person: string
  maintenance_method: string
}

/** 维护工单 */
export interface MaintenanceOrder {
  id: number
  equipment_id: number
  equipment_name: string
  equipment_code: string
  title: string
  maintenance_type: string
  maintenance_type_display: string
  status: string
  status_display: string
  maintenance_date: string
  description: string
  performed_by: string
  cost: number | null
  next_maintenance_date: string | null
  reported_by_id: number | null
  assigned_to_id: number | null
  completed_at: string | null
  result_notes: string
  requires_recalibration: boolean
  create_time: string
}

/** 维护统计 */
export interface MaintenanceStats {
  pending: number
  in_progress: number
  completed_this_month: number
  avg_response_hours: number | null
}

/** 使用记录 */
export interface UsageRecord {
  id: number
  equipment_id: number
  equipment_name: string
  equipment_code: string
  work_order_id: number | null
  usage_type: string
  usage_date: string
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  operator_id: number | null
  operator_name: string
  notes: string
  is_active: boolean
  create_time: string
}

/** 使用统计 */
export interface UsageStats {
  today_count: number
  active_now: number
  total_duration_minutes: number
  period_days: number
  by_equipment: Array<{
    equipment_id: number
    equipment_name: string
    equipment_code: string
    count: number
  }>
  by_operator: Array<{
    operator_id: number
    operator_name: string
    count: number
  }>
}

/** 操作授权 */
export interface Authorization {
  id: number
  equipment_id: number
  equipment_name: string
  equipment_code: string
  operator_id: number
  operator_name: string
  authorized_at: string
  expires_at: string | null
  is_active: boolean
  training_record: string
  authorized_by_id: number | null
  notes: string
}

/** 检测方法 */
export interface DetectionMethod {
  id: number
  code: string
  name: string
  name_en: string
  /** 设备名称分类（同规格统一类型） */
  equipment_name_classification?: string
  category: string
  category_display: string
  description: string
  estimated_duration_minutes: number
  preparation_time_minutes: number
  temperature_range: string | null
  humidity_range: string | null
  status: string
  status_display: string
  resource_count: number
  personnel_count: number
}

/** 检测方法详情 */
export interface DetectionMethodDetail extends DetectionMethod {
  qc_requirements?: string
  standard_procedure: string
  sop_reference: string
  /** SOP 附件 URL（多为 /media/...） */
  sop_attachment_url?: string
  sop_id: number | null
  temperature_min: number | null
  temperature_max: number | null
  humidity_min: number | null
  humidity_max: number | null
  environment_notes: string
  keywords: string[]
  normal_range: Record<string, unknown>
  measurement_points: Array<Record<string, unknown>>
  resources: Array<{
    id: number
    resource_type: string
    resource_category_id: number | null
    resource_category__name: string
    resource_category__code: string
    quantity: number
    is_mandatory: boolean
    recommended_models: string[]
    usage_notes: string
  }>
  personnel: Array<{
    id: number
    qualification_name: string
    qualification_code: string
    level: string
    min_experience_months: number
    notes: string
  }>
  create_time: string
}

/** 分页结果 */
interface Paginated<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}


// ============================================================================
// API 方法
// ============================================================================
export const equipmentApi = {
  // ===== 仪表盘 =====

  /** 设备管理总览面板 */
  dashboard() {
    return api.get<EquipmentDashboard>('/equipment/dashboard')
  },

  // ===== 设备台账 =====

  /** 设备列表（增强筛选） */
  listLedger(params?: {
    keyword?: string; category_id?: number; status?: string;
    calibration_status?: string; location?: string;
    page?: number; page_size?: number; sort_by?: string
  }) {
    return api.get<Paginated<EquipmentItem>>('/equipment/ledger', { params })
  },

  /** 设备列表（与 listLedger 相同，兼容调用 /equipment/index 的场景） */
  listLedgerIndex(params?: {
    keyword?: string; category_id?: number; status?: string;
    calibration_status?: string; location?: string;
    page?: number; page_size?: number; sort_by?: string; lims_only?: boolean
  }) {
    return api.get<Paginated<EquipmentItem>>('/equipment/index', { params })
  },

  /** 设备详情 */
  getLedgerDetail(id: number) {
    return api.get<EquipmentDetail>(`/equipment/ledger/${id}`)
  },

  /** 设备类别台账 */
  listCategoryLedger(params?: {
    keyword?: string
    page?: number
    page_size?: number
  }) {
    return api.get<Paginated<EquipmentCategoryLedgerItem>>('/equipment/ledger-categories', { params })
  },

  /** 设备细分类别台账 */
  listNameClassificationLedger(params?: {
    keyword?: string
    page?: number
    page_size?: number
  }) {
    return api.get<Paginated<EquipmentNameClassificationLedgerItem>>('/equipment/ledger-name-classifications', { params })
  },

  /** 批量导入设备（Excel） */
  importLedger(file: File) {
    const form = new FormData()
    form.append('file', file)
    return api.post<{
      total: number
      success: number
      failed: number
      created_ids: number[]
      updated_ids: number[]
      errors: Array<{ row: number; code: string; message: string }>
    }>('/equipment/ledger/import', form)
  },

  /** 新增设备 */
  createEquipment(data: {
    name: string; code: string; category_id: number;
    name_classification?: string;
    status?: string; location?: string; manufacturer?: string;
    model_number?: string; serial_number?: string;
    purchase_date?: string; warranty_expiry?: string;
    next_calibration_date?: string; next_verification_date?: string; next_maintenance_date?: string;
    calibration_cycle_days?: number; verification_cycle_days?: number; maintenance_cycle_days?: number;
    manager_id?: number
  }) {
    return api.post('/equipment/ledger/create', data)
  },

  /** 更新设备 */
  updateEquipment(id: number, data: {
    name?: string; name_classification?: string; location?: string; manufacturer?: string;
    model_number?: string; serial_number?: string;
    purchase_date?: string; warranty_expiry?: string;
    next_calibration_date?: string; next_verification_date?: string; next_maintenance_date?: string;
    calibration_cycle_days?: number; verification_cycle_days?: number; maintenance_cycle_days?: number;
    manager_id?: number
  }) {
    return api.put(`/equipment/ledger/${id}`, data)
  },

  /** 设备报废 */
  retireEquipment(id: number) {
    return api.post(`/equipment/ledger/${id}/retire`)
  },

  /** 变更设备状态 */
  changeStatus(id: number, data: { status: string; reason?: string }) {
    return api.post(`/equipment/ledger/${id}/change-status`, data)
  },

  // ===== 校准管理 =====

  /** 校准计划视图 */
  getCalibrationPlan() {
    return api.get<CalibrationPlan>('/equipment/calibrations/plan')
  },

  /** 下载校准计划导入模板（需登录态） */
  async downloadCalibrationPlanTemplate() {
    const blob = await api.get<Blob>('/equipment/calibrations/plan/template', {
      responseType: 'blob',
    } as any) as unknown as Blob
    if (blob instanceof Blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'calibration_plan_template.xlsx'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
    }
  },

  /** 批量导入校准计划（Excel） */
  importCalibrationPlan(file: File) {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ total: number; success: number; failed: number; created_ids: number[]; errors: Array<{ row: number; code: string; message: string }> }>(
      '/equipment/calibrations/plan/import', form
    )
  },

  /** 校准计划列表（已导入的计划） */
  listCalibrationPlans(params?: { keyword?: string; page?: number; page_size?: number }) {
    return api.get<{ items: CalibrationPlanListItem[]; total: number; page: number; page_size: number }>(
      '/equipment/calibrations/plan/list', { params }
    )
  },

  /** 待发起校准工单列表 */
  getPendingCalibrationWorkOrders() {
    return api.get<{ items: CalibrationPlanItem[]; count: number }>('/equipment/calibrations/pending-work-orders')
  },

  /** 批量发起校准工单 */
  createCalibrationWorkOrders(equipment_ids: number[]) {
    return api.post<{ created: Array<{ id: number; equipment_id: number; calibration_due_date: string }>; skipped: number[] }>(
      '/equipment/calibrations/create-work-orders', { equipment_ids }
    )
  },

  /** 校准记录列表 */
  listCalibrations(params?: {
    equipment_id?: number; result?: string;
    date_from?: string; date_to?: string;
    page?: number; page_size?: number
  }) {
    return api.get<Paginated<CalibrationRecord>>('/equipment/calibrations/list', { params })
  },

  /** 新增校准记录 */
  createCalibration(data: {
    equipment_id: number; calibration_date: string; next_due_date: string;
    calibration_type?: string; calibrator?: string; certificate_no?: string;
    certificate_file_url?: string; result?: string; notes?: string
  }) {
    return api.post('/equipment/calibrations/create', data)
  },

  /** 校准详情 */
  getCalibration(id: number) {
    return api.get<CalibrationRecord>(`/equipment/calibrations/${id}`)
  },

  // ===== 核查计划 =====

  /** 核查计划视图 */
  getVerificationPlan() {
    return api.get<VerificationPlan>('/equipment/verifications/plan')
  },

  /** 下载核查计划导入模板 */
  async downloadVerificationPlanTemplate() {
    const blob = await api.get<Blob>('/equipment/verifications/plan/template', {
      responseType: 'blob',
    } as any) as unknown as Blob
    if (blob instanceof Blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'verification_plan_template.xlsx'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
    }
  },

  /** 批量导入核查计划 */
  importVerificationPlan(file: File) {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ total: number; success: number; failed: number; errors: Array<{ row: number; code: string; message: string }> }>(
      '/equipment/verifications/plan/import', form
    )
  },

  /** 核查计划列表 */
  listVerificationPlans(params?: { keyword?: string; page?: number; page_size?: number }) {
    return api.get<{ items: VerificationPlanListItem[]; total: number; page: number; page_size: number }>(
      '/equipment/verifications/plan/list', { params }
    )
  },

  /** 待发起核查工单列表 */
  getPendingVerificationWorkOrders() {
    return api.get<{ items: VerificationPlanItem[]; count: number }>('/equipment/verifications/pending-work-orders')
  },

  /** 批量发起核查工单 */
  createVerificationWorkOrders(equipment_ids: number[]) {
    return api.post<{ created: Array<{ id: number; equipment_id: number; verification_due_date: string }>; skipped: number[] }>(
      '/equipment/verifications/create-work-orders', { equipment_ids }
    )
  },

  /** 核查记录列表 */
  listVerifications(params?: {
    equipment_id?: number; result?: string;
    date_from?: string; date_to?: string;
    page?: number; page_size?: number
  }) {
    return api.get<Paginated<VerificationRecord>>('/equipment/verifications/list', { params })
  },

  /** 新增核查记录 */
  createVerification(data: {
    equipment_id: number; verification_date: string; next_due_date: string;
    verifier?: string; result?: string; method_notes?: string; notes?: string
  }) {
    return api.post('/equipment/verifications/create', data)
  },

  // ===== 维护计划 =====

  /** 维护计划视图 */
  getMaintenancePlan() {
    return api.get<MaintenancePlan>('/equipment/maintenance-plans/plan')
  },

  /** 下载维护计划导入模板 */
  async downloadMaintenancePlanTemplate() {
    const blob = await api.get<Blob>('/equipment/maintenance-plans/plan/template', {
      responseType: 'blob',
    } as any) as unknown as Blob
    if (blob instanceof Blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'maintenance_plan_template.xlsx'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 100)
    }
  },

  /** 批量导入维护计划 */
  importMaintenancePlan(file: File) {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ total: number; success: number; failed: number; errors: Array<{ row: number; code: string; message: string }> }>(
      '/equipment/maintenance-plans/plan/import', form
    )
  },

  /** 维护计划列表 */
  listMaintenancePlans(params?: { keyword?: string; page?: number; page_size?: number }) {
    return api.get<{ items: MaintenancePlanListItem[]; total: number; page: number; page_size: number }>(
      '/equipment/maintenance-plans/plan/list', { params }
    )
  },

  /** 待发起维护工单列表 */
  getPendingMaintenanceWorkOrders() {
    return api.get<{ items: MaintenancePlanItem[]; count: number }>('/equipment/maintenance-plans/pending-work-orders')
  },

  /** 批量发起维护工单 */
  createMaintenanceWorkOrders(equipment_ids: number[]) {
    return api.post<{ created: Array<{ id: number; equipment_id: number; maintenance_due_date: string }>; skipped: number[] }>(
      '/equipment/maintenance-plans/create-work-orders', { equipment_ids }
    )
  },

  // ===== 维护工单 =====

  /** 维护工单列表 */
  listMaintenance(params?: {
    equipment_id?: number; status?: string; maintenance_type?: string;
    date_from?: string; date_to?: string; assigned_to_id?: number;
    page?: number; page_size?: number
  }) {
    return api.get<Paginated<MaintenanceOrder>>('/equipment/maintenance/list', { params })
  },

  /** 维护统计 */
  getMaintenanceStats() {
    return api.get<MaintenanceStats>('/equipment/maintenance/stats')
  },

  /** 创建维护工单 */
  createMaintenance(data: {
    equipment_id: number; maintenance_type: string;
    title: string; description: string;
    maintenance_date?: string; assigned_to_id?: number
  }) {
    return api.post('/equipment/maintenance/create', data)
  },

  /** 维护工单详情 */
  getMaintenance(id: number) {
    return api.get<MaintenanceOrder>(`/equipment/maintenance/${id}`)
  },

  /** 更新维护工单 */
  updateMaintenance(id: number, data: {
    title?: string; description?: string; maintenance_date?: string
  }) {
    return api.put(`/equipment/maintenance/${id}`, data)
  },

  /** 分配维护 */
  assignMaintenance(id: number, data: { assigned_to_id: number }) {
    return api.post(`/equipment/maintenance/${id}/assign`, data)
  },

  /** 开始维护 */
  startMaintenance(id: number) {
    return api.post(`/equipment/maintenance/${id}/start`)
  },

  /** 完成维护 */
  completeMaintenance(id: number, data: {
    result_notes: string; cost?: number;
    requires_recalibration?: boolean;
    next_maintenance_date?: string; performed_by?: string
  }) {
    return api.post(`/equipment/maintenance/${id}/complete`, data)
  },

  /** 取消维护 */
  cancelMaintenance(id: number, data: { reason?: string }) {
    return api.post(`/equipment/maintenance/${id}/cancel`, data)
  },

  // ===== 使用记录 =====

  /** 使用记录列表 */
  listUsage(params?: {
    equipment_id?: number; operator_id?: number; usage_type?: string;
    date_from?: string; date_to?: string;
    page?: number; page_size?: number
  }) {
    return api.get<Paginated<UsageRecord>>('/equipment/usage/list', { params })
  },

  /** 使用统计 */
  getUsageStats() {
    return api.get<UsageStats>('/equipment/usage/stats')
  },

  /** 手动登记使用 */
  registerUsage(data: {
    equipment_id: number; usage_type?: string; notes?: string
  }) {
    return api.post('/equipment/usage/register', data)
  },

  /** 结束使用 */
  endUsage(id: number) {
    return api.post(`/equipment/usage/${id}/end`)
  },

  // ===== 操作授权 =====

  /** 授权列表 */
  listAuthorizations(params?: {
    equipment_id?: number; operator_id?: number; is_active?: boolean
  }) {
    return api.get<Authorization[]>('/equipment/authorizations/list', { params })
  },

  /** 授予授权 */
  grantAuthorization(data: {
    equipment_id: number; operator_id: number; operator_name?: string;
    authorized_at?: string; expires_at?: string;
    training_record?: string; notes?: string
  }) {
    return api.post('/equipment/authorizations/grant', data)
  },

  /** 撤销授权 */
  revokeAuthorization(id: number) {
    return api.post(`/equipment/authorizations/${id}/revoke`)
  },

  /** 检查授权 */
  checkAuthorization(params: { equipment_id: number; operator_id: number }) {
    return api.get<{ authorized: boolean; reason: string; authorization_id?: number }>(
      '/equipment/authorizations/check', { params },
    )
  },

  // ===== 检测方法 =====

  /** 检测方法列表 */
  listDetectionMethods(params?: {
    category?: string; status?: string; keyword?: string;
    page?: number; page_size?: number
  }) {
    return api.get<Paginated<DetectionMethod>>('/equipment/detection-methods/list', { params })
  },

  /** 检测方法详情 */
  getDetectionMethod(id: number) {
    return api.get<DetectionMethodDetail>(`/equipment/detection-methods/${id}`)
  },

  /** 上传检测方法 SOP 附件，返回 url 供创建/更新时填入 sop_attachment_url */
  uploadDetectionMethodSop(file: File) {
    const form = new FormData()
    form.append('file', file)
    return api.post<{ url: string; original_filename: string }>(
      '/equipment/detection-methods/sop-upload',
      form,
    )
  },

  /** 创建检测方法 */
  createDetectionMethod(data: {
    code: string; name: string; category: string;
    name_en?: string;
    equipment_name_classification?: string;
    description?: string;
    qc_requirements?: string;
    sop_attachment_url?: string;
    estimated_duration_minutes?: number; preparation_time_minutes?: number;
    temperature_min?: number; temperature_max?: number;
    humidity_min?: number; humidity_max?: number;
    environment_notes?: string; sop_reference?: string;
    keywords?: string[]; status?: string
  }) {
    return api.post('/equipment/detection-methods/create', data)
  },

  /** 更新检测方法 */
  updateDetectionMethod(id: number, data: Record<string, unknown>) {
    return api.put(`/equipment/detection-methods/${id}`, data)
  },

  /** 添加资源需求 */
  addMethodResource(methodId: number, data: {
    resource_type: string; resource_category_id?: number;
    quantity?: number; is_mandatory?: boolean;
    recommended_models?: string[]; usage_notes?: string
  }) {
    return api.post(`/equipment/detection-methods/${methodId}/resources/add`, data)
  },

  /** 添加人员要求 */
  addMethodPersonnel(methodId: number, data: {
    qualification_name: string; qualification_code?: string;
    level?: string; min_experience_months?: number; notes?: string
  }) {
    return api.post(`/equipment/detection-methods/${methodId}/personnel/add`, data)
  },

  /** 删除资源需求 */
  removeMethodResource(resourceId: number) {
    return api.delete(`/equipment/detection-methods/resources/${resourceId}`)
  },

  /** 删除人员要求 */
  removeMethodPersonnel(personnelId: number) {
    return api.delete(`/equipment/detection-methods/personnel/${personnelId}`)
  },
}
