/**
 * 收款管理实体定义
 */

import { BaseEntity } from "@/shared/types/entities";

/** 收款状态 */
export type PaymentStatus = 'pending' | 'matched' | 'partial' | 'completed';

/** 收款记录 */
export interface Payment extends BaseEntity {
  // 基本信息
  payment_date: string;                 // 到账日期 (YYYY-MM-DD)
  payment_amount: number;               // 到账金额
  payment_method?: string;              // 付款方式（银行转账、现金等）
  bank_account?: string;                // 收款账户
  payment_reference?: string;           // 付款参考号（银行流水号等）
  remark?: string;                      // 备注
  
  // 发票关联
  invoice_id?: number;                  // 关联的发票ID（自动匹配或手动选择）
  invoice_no?: string;                  // 关联的发票号码
  project_code?: string;                // 主项目编号（用于自动匹配，兼容字段）
  project_codes?: string[];             // 项目编号列表（支持一个收款对应多个项目）
  
  // 匹配信息
  match_status: PaymentStatus;          // 匹配状态
  matched_amount: number;               // 已匹配金额
  remaining_amount: number;             // 剩余未匹配金额
  
  // 自动匹配信息
  auto_matched_invoices?: Array<{      // 自动匹配的发票列表
    invoice_id: number;
    invoice_no: string;
    matched_amount: number;
  }>;
  
  // 客户信息（从发票获取）
  customer_name?: string;               // 客户名称
  sales_manager?: string;               // 客户经理
}
