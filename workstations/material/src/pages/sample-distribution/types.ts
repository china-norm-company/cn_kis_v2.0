/**
 * 样品发放模块类型，与后端 product/* 接口对齐
 */

export type ExecutionProgress = 'not_started' | 'in_progress' | 'completed'

export interface WorkOrderListItem {
  id: string | number
  work_order_no: string
  project_no: string
  project_name: string
  project_start_date: string
  project_end_date: string
  visit_count: number
  researcher: string | null
  supervisor: string | null
  execution_progress: ExecutionProgress
  created_at?: string
  updated_at?: string
}

export interface ExecutionItemSummary {
  id: string
  execution_date: string | null
  subject_rd: string
  subject_initials: string
  operator_name: string | null
  remark: string | null
  created_at: string
}

export interface WorkOrderDetail extends WorkOrderListItem {
  usage_method: string | null
  usage_frequency: string | null
  precautions: string | null
  project_requirements: string | null
  executions: ExecutionItemSummary[]
}

export interface WorkOrderCreate {
  project_no: string
  project_name: string
  project_start_date: string
  project_end_date: string
  visit_count?: number
  researcher?: string | null
  supervisor?: string | null
  usage_method?: string | null
  usage_frequency?: string | null
  precautions?: string | null
  project_requirements?: string | null
}

/** 执行记录详情（查看工单时每条执行记录的详情） */
export interface ExecutionRecordDetailProduct {
  stage: string
  execution_cycle?: string | null
  product_code: string
  product_name: string
  bottle_sequence?: string | null
  product_operation_type?: string | null
  product_distribution?: number
  product_inspection?: number
  product_recovery?: number
  distribution_weight?: number | null
  inspection_weight?: number | null
  recovery_weight?: number | null
  diary_distribution?: number
  diary_inspection?: number
  diary_recovery?: number
}

export interface ExecutionRecordDetail {
  id: string | number
  work_order_id?: string
  related_project_no: string
  project_no?: string | null
  project_name?: string | null
  subject_rd: string
  subject_initials: string
  screening_no?: string | null
  execution_date: string | null
  operator_name: string | null
  remark: string | null
  exception_type?: string | null
  exception_description?: string | null
  products: ExecutionRecordDetailProduct[]
}

// ---------- 样品领用 ----------
export type SampleOperationType = 'receive' | 'return_to_stock'

export interface SampleRequestListItem {
  id: string
  operation_type: SampleOperationType
  operation_date: string
  related_project_no: string
  project_name: string | null
  supervisor?: string | null
  product_name: string
  product_code: string
  quantity: number
  unit: string | null
  purpose: string
  operator_name: string | null
  remark: string | null
  created_at: string
}

export interface SampleRequestCreate {
  operation_type: SampleOperationType
  operation_date: string
  related_project_no: string
  project_name?: string | null
  project_start_date?: string | null
  project_end_date?: string | null
  supervisor?: string | null
  product_name: string
  product_code: string
  quantity: number
  unit?: string | null
  purpose: string
  remark?: string | null
}

export type SampleLedgerCloseStatus = 'completed' | 'pending_return' | 'abnormal'

export interface SampleLedgerItem {
  related_project_no: string
  project_name: string | null
  project_start_date: string | null
  project_end_date: string | null
  project_close_status: SampleLedgerCloseStatus
  product_name: string
  product_code: string
  unit: string
  total_received: number
  total_returned: number
  total_distributed: number
  total_recovered: number
  pending_return_qty: number
  work_order_no?: string | null
}

/** 待执行工单：工单管理字段 + 和序工单执行队列（按项目编号拼接） */
export interface PendingExecutionRow {
  key: string
  workOrder: WorkOrderListItem
  subjectSc: string
  subjectInitials: string
  subjectRd: string
  enrollmentStatus: string
  queueStatus: string
  subjectId: number
  /** 和序队列签到记录，用于「无需执行」结案去重 */
  checkinId: number | null
}

// ---------- 工单执行记录 ----------
export interface ExecutionRecordListItem {
  id: string
  work_order_id: string
  related_project_no: string
  subject_rd: string
  subject_initials: string
  screening_no?: string | null
  execution_date: string | null
  operator_name: string | null
  exception_type: string | null
  remark: string | null
  created_at: string
  /** 后端：待执行「无需执行」结案 */
  skip_execution?: boolean
}

export type ExceptionType =
  | 'usage_error'
  | 'diary_error'
  | 'product_damage'
  | 'distribution_error'
  | 'recovery_error'
  | 'other'

export interface ProductOperationItemCreate {
  id?: number
  stage: string
  execution_cycle?: string | null
  product_code: string
  product_name: string
  bottle_sequence?: string | null
  is_selected: number
  product_operation_type?: 'distribution' | 'inspection' | 'recovery' | 'site_use' | '' | null
  product_distribution: boolean
  product_inspection: boolean
  product_recovery: boolean
  distribution_weight?: number | null
  inspection_weight?: number | null
  recovery_weight?: number | null
  diary_distribution: boolean
  diary_inspection: boolean
  diary_recovery: boolean
}

export interface ExecutionRecordCreate {
  work_order_id: number | string
  related_project_no: string
  /** 选填；空字符串表示未填 */
  subject_rd: string
  subject_initials: string
  operator_name?: string | null
  /** 受试者SC号（必填） */
  screening_no: string
  execution_date?: string | null
  exception_type?: ExceptionType | string | null
  exception_description?: string | null
  remark?: string | null
  products: ProductOperationItemCreate[]
}
