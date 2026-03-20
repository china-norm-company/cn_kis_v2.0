/**
 * 开票申请实体定义
 */

import { BaseEntity } from "@/shared/types/entities";

/** 开票申请状态 */
export type InvoiceRequestStatus = 'pending' | 'processing' | 'completed' | 'cancelled';

/** 金额类型：客户确认的是不含税还是含税；展示与票面统一为含税金额 */
export type InvoiceRequestAmountType = 'exclusive_of_tax' | 'inclusive_of_tax';

/** 开票申请明细项 */
export interface InvoiceRequestItem {
  id?: number;
  project_code: string;          // 项目编号
  project_id?: number;           // 关联项目ID
  amount: number;                // 金额（按申请金额类型：不含税或含税）
  amount_inclusive_of_tax?: number;  // 含税金额（展示/票面用，后端计算）
  service_content: string;       // 服务内容
}

/** 发票类型 */
export type InvoiceRequestInvoiceType = 'vat_special' | 'proforma';

/** 开票申请 */
export interface InvoiceRequest extends BaseEntity {
  // 基本信息
  request_date: string;          // 申请日期 (YYYY-MM-DD)
  customer_name: string;         // 客户名称
  invoice_type?: InvoiceRequestInvoiceType;  // 发票类型：vat_special=增值税专用发票, proforma=形式发票
  amount_type?: InvoiceRequestAmountType;   // 金额类型：客户确认的是不含税还是含税
  tax_rate?: number;                        // 税率，如 0.06 表示 6%
  items: InvoiceRequestItem[];   // 开票明细（支持多个项目编号，最多20个）
  po?: string;                   // PO号
  total_amount: number;          // 总金额（含税，展示与票面一致）
  
  // 申请人信息
  request_by: string;            // 申请人（商务人员姓名或ID）
  request_by_id?: number;        // 申请人ID
  
  // 状态
  status: InvoiceRequestStatus;  // 申请状态
  
  // 关联信息
  invoice_ids?: number[];        // 关联的发票ID（一个申请可能对应多个发票）
  notes?: string;                // 备注
  
  // 处理信息
  processed_by?: string;         // 处理人（财务人员）
  processed_at?: string;         // 处理时间
}

/** 创建开票申请请求 */
export interface CreateInvoiceRequestRequest {
  request_date: string;
  customer_name: string;
  invoice_type?: InvoiceRequestInvoiceType;  // 默认 vat_special
  amount_type?: InvoiceRequestAmountType;    // 默认 inclusive_of_tax
  tax_rate?: number;                         // 默认 0.06
  items: Array<{
    project_code: string;
    project_id?: number;
    amount: number;
    service_content: string;
  }>;
  po?: string;
  request_by: string;
  notes?: string;
}

/** 更新开票申请请求（未处理状态下可修改申请日期、客户、明细等） */
export interface UpdateInvoiceRequestRequest {
  id: number;
  status?: InvoiceRequestStatus;
  invoice_ids?: number[];
  processed_by?: string;
  processed_at?: string;
  notes?: string;
  /** 以下为未处理状态下的可编辑字段 */
  request_date?: string;
  customer_name?: string;
  invoice_type?: InvoiceRequestInvoiceType;
  amount_type?: InvoiceRequestAmountType;
  tax_rate?: number;
  items?: Array<{ project_code: string; project_id?: number; amount: number; service_content: string }>;
  po?: string;
  request_by?: string;
}
