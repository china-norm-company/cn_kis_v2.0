/**
 * 工单管理类型，与后端 product/* 工单接口对齐（复刻自度支·物料台 样品发放）
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

/** 排期计划行（来自执行台项目管理详情页） */
export interface SchedulePlanRow {
  visitPoint: string
  dates: string[]
}

/** 排期计划（来自执行台项目管理详情页） */
export interface SchedulePlanData {
  raw?: string
  rows?: SchedulePlanRow[]
  overall_start?: string
  overall_end?: string
}

export interface WorkOrderDetail extends WorkOrderListItem {
  usage_method: string | null
  usage_frequency: string | null
  precautions: string | null
  project_requirements: string | null
  executions: ExecutionItemSummary[]
  schedule_plan?: SchedulePlanData | null
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
