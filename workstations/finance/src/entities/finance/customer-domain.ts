import type { BaseEntity } from "@/shared/types/entities";

/**
 * 客户信息实体（财务管理专用）
 * 用于维护客户名称和账期信息
 */
export interface FinanceCustomer extends BaseEntity {
  /** 客户编号（不要求唯一，一个客户编号可对应多个客户名称，如：欧莱雅中国和欧莱雅日本使用相同编号） */
  customer_code: string;
  
  /** 客户完整名称 */
  customer_name: string;
  
  /** 客户简称（可选） */
  short_name?: string;
  
  /** 账期（天数，如：30、60、90） */
  payment_term_days: number;
  
  /** 账期描述（如：月结30天、月结60天） */
  payment_term_description?: string;
  
  /** 备注 */
  remark?: string;
  
  /** 是否启用 */
  is_active: boolean;
}
