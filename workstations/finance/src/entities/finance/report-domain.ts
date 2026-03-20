/**
 * 财务报表实体定义
 */

import { BaseEntity } from "@/shared/types/entities";

/** 报表类型 */
export type ReportType = 'weekly' | 'monthly' | 'project';

/** 周报数据 */
export interface WeeklyReport {
  report_date: string;              // 报表日期 (YYYY-MM-DD)
  week_start: string;                // 周开始日期
  week_end: string;                  // 周结束日期
  
  // 开票统计
  invoice_count: number;             // 开票数量
  invoice_amount: number;            // 开票金额
  invoice_list: Array<{              // 开票明细
    invoice_no: string;
    invoice_date: string;
    customer_name: string;
    project_code: string;
    amount: number;
  }>;
  
  // 收款统计
  payment_count: number;             // 收款数量
  payment_amount: number;            // 收款金额
  payment_list: Array<{              // 收款明细
    payment_date: string;
    customer_name: string;
    project_code: string;
    amount: number;
    invoice_no?: string;
  }>;
  
  // 逾期统计
  overdue_count: number;              // 逾期发票数量
  overdue_amount: number;            // 逾期金额
}

/** 月报数据 */
export interface MonthlyReport {
  report_date: string;              // 报表日期 (YYYY-MM)
  month: number;                    // 月份 (1-12)
  year: number;                     // 年份
  
  // 开票统计
  invoice_count: number;             // 开票数量
  invoice_amount: number;            // 开票金额
  
  // 收款统计
  payment_count: number;             // 收款数量
  payment_amount: number;            // 收款金额
  
  // 逾期统计
  overdue_count: number;              // 逾期发票数量
  overdue_amount: number;            // 逾期金额
  
  // 按周统计
  weekly_breakdown: Array<{          // 每周明细
    week_start: string;
    week_end: string;
    invoice_count: number;
    invoice_amount: number;
    payment_count: number;
    payment_amount: number;
  }>;
}

/** 项目报表数据 */
export interface ProjectReport {
  project_code: string;             // 项目编号
  project_name?: string;            // 项目名称
  customer_name: string;            // 客户名称
  sales_manager: string;             // 客户经理
  
  // 开票统计
  total_invoice_amount: number;      // 累计开票金额
  invoice_count: number;            // 开票数量
  invoices: Array<{                  // 发票明细
    invoice_no: string;
    invoice_date: string;
    amount: number;
    status: string;
  }>;
  
  // 收款统计
  total_payment_amount: number;     // 累计收款金额
  payment_count: number;             // 收款次数
  payments: Array<{                 // 收款明细
    payment_date: string;
    amount: number;
    invoice_no?: string;
  }>;
  
  // 未收款统计
  unpaid_amount: number;            // 未收款金额
  overdue_amount: number;           // 逾期金额
  overdue_days: number;              // 逾期天数
}

/** 催款提醒项 */
export interface OverdueReminder extends BaseEntity {
  invoice_id: number;                // 发票ID
  invoice_no: string;                // 发票号码
  invoice_date: string;              // 开票日期
  customer_name: string;             // 客户名称
  project_code: string;              // 项目编号
  sales_manager: string;             // 客户经理
  
  // 金额信息
  invoice_amount: number;           // 发票金额
  paid_amount: number;              // 已收款金额
  unpaid_amount: number;            // 未收款金额
  
  // 账期信息
  payment_term?: number;             // 账期（天）
  expected_payment_date?: string;    // 应到账日期
  overdue_days: number;             // 逾期天数
  
  // 催款状态
  reminder_count: number;           // 催款次数
  last_reminder_date?: string;       // 最后催款日期
  status: 'pending' | 'reminded' | 'paid'; // 状态
}
