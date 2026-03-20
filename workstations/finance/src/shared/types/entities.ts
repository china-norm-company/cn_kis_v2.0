/**
 * 业务实体类型定义
 * 基于ChinaNORM MIS系统核心业务领域
 */

import { BaseEntity } from './api';
export type { BaseEntity } from './api';

// ============ 客户管理 (CRM) ============

/** 客户状态 */
export type CustomerStatus = 'active' | 'inactive' | 'prospect' | 'churned';

/** 客户等级 */
export type CustomerLevel = 'VIP' | 'A' | 'B' | 'C';

/** 客户信息 */
export interface Customer extends BaseEntity {
  code: string;
  name: string;
  short_name?: string;
  industry?: string;
  scale?: string;
  status: CustomerStatus;
  level: CustomerLevel;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  description?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/** 联系人 */
export interface Contact extends BaseEntity {
  client_id: number;
  full_name: string;
  position?: string;
  department?: string;
  mobile_phone?: string;
  office_phone?: string;
  email?: string;
  is_primary: boolean;
  notes?: string;
}

/** 商机状态 */
export type OpportunityStatus = 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

/** 商机 */
export interface Opportunity extends BaseEntity {
  code: string;
  name: string;
  client_id: number;
  client_name?: string;
  status: OpportunityStatus;
  expected_amount: number;
  probability: number;
  expected_close_date?: string;
  owner_id?: number;
  owner_name?: string;
  description?: string;
  source?: string;
}

// ============ 项目管理 ============

/** 项目状态 */
export type ProjectStatus = 'draft' | 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';

/** 项目类型 */
export type ProjectType = 'efficacy' | 'safety' | 'rws' | 'sensory' | 'other';

/** 项目 */
export interface Project extends BaseEntity {
  code: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  client_id?: number;
  client_name?: string;
  protocol_id?: number;
  start_date?: string;
  end_date?: string;
  planned_subjects: number;
  actual_subjects: number;
  budget?: number;
  actual_cost?: number;
  pm_id?: number;
  pm_name?: string;
  description?: string;
  tags?: string[];
}

// ============ 受试者管理 ============

/** 受试者状态 */
export type SubjectStatus = 'screening' | 'enrolled' | 'active' | 'completed' | 'withdrawn' | 'excluded';

/** 性别 */
export type Gender = 'male' | 'female' | 'other';

/** 受试者 */
export interface Subject extends BaseEntity {
  subject_no: string;
  project_id: number;
  project_name?: string;
  name?: string;
  gender?: Gender;
  age?: number;
  phone?: string;
  email?: string;
  status: SubjectStatus;
  enrollment_date?: string;
  completion_date?: string;
  withdrawal_reason?: string;
  notes?: string;
}

// ============ 工单管理 ============

/** 工单状态 */
export type WorkOrderStatus = 'pending' | 'assigned' | 'in_progress' | 'paused' | 'completed' | 'cancelled';

/** 工单优先级 */
export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'urgent';

/** 工单 */
export interface WorkOrder extends BaseEntity {
  code: string;
  name: string;
  type: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  project_id?: number;
  project_name?: string;
  assignee_id?: number;
  assignee_name?: string;
  planned_start?: string;
  planned_end?: string;
  actual_start?: string;
  actual_end?: string;
  description?: string;
  result?: string;
}

// ============ 资源库 ============

/** 资源状态 */
export type ResourceStatus = 'available' | 'in_use' | 'maintenance' | 'retired';

/** 资源类型 */
export type ResourceType = 'equipment' | 'room' | 'personnel' | 'material';

/** 资源 */
export interface Resource extends BaseEntity {
  code: string;
  name: string;
  type: ResourceType;
  status: ResourceStatus;
  category?: string;
  location?: string;
  specifications?: string;
  purchase_date?: string;
  last_maintenance?: string;
  next_maintenance?: string;
  responsible_id?: number;
  responsible_name?: string;
  notes?: string;
}

// ============ 访视管理 ============

/** 访视状态 */
export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'missed' | 'cancelled';

/** 访视 */
export interface Visit extends BaseEntity {
  visit_no: string;
  name: string;
  project_id: number;
  subject_id: number;
  subject_no?: string;
  status: VisitStatus;
  scheduled_date: string;
  actual_date?: string;
  window_start?: string;
  window_end?: string;
  notes?: string;
}

// ============ 财务管理 ============

/** 发票状态 */
export type InvoiceStatus = 'draft' | 'pending' | 'sent' | 'paid' | 'cancelled' | 'overdue';

/** 发票 */
export interface Invoice extends BaseEntity {
  invoice_no: string;
  client_id: number;
  client_name?: string;
  project_id?: number;
  project_name?: string;
  amount: number;
  tax_amount?: number;
  total_amount: number;
  status: InvoiceStatus;
  issue_date?: string;
  due_date?: string;
  paid_date?: string;
  notes?: string;
}

// ============ 审批管理 ============

/** 审批状态 */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

/** 审批记录 */
export interface Approval extends BaseEntity {
  approval_no: string;
  type: string;
  title: string;
  status: ApprovalStatus;
  applicant_id: number;
  applicant_name?: string;
  approver_id?: number;
  approver_name?: string;
  submit_time?: string;
  approve_time?: string;
  content?: Record<string, unknown>;
  comments?: string;
}

// ============ 报价管理 ============

/** 报价状态 */
export type QuoteStatus = 'draft' | 'pending' | 'approved' | 'sent' | 'accepted' | 'rejected' | 'expired';

/** 报价 */
export interface Quote extends BaseEntity {
  quote_no: string;
  client_id: number;
  client_name?: string;
  opportunity_id?: number;
  status: QuoteStatus;
  total_amount: number;
  discount?: number;
  final_amount: number;
  valid_until?: string;
  notes?: string;
  items?: QuoteItem[];
}

/** 报价项 */
export interface QuoteItem {
  id: number;
  quote_id: number;
  name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

// ============ 图表数据类型 ============

/** 雷达图数据点 */
export interface RadarDataPoint {
  subject: string;
  value: number;
  fullMark: number;
}

/** 甘特图任务 */
export interface GanttTask {
  id: string;
  name: string;
  start: Date;
  end: Date;
  progress: number;
  dependencies?: string[];
  assignee?: string;
  status?: string;
}

/** 热力图数据 */
export interface HeatmapData {
  x: string;
  y: string;
  value: number;
}

/** 桑基图数据 */
export interface SankeyData {
  nodes: Array<{ name: string }>;
  links: Array<{ source: string; target: string; value: number }>;
}

