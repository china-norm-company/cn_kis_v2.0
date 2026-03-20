/**
 * 财务模块实体定义
 * 职责：定义发票、项目费用、项目预算等财务相关实体类型
 */

import { BaseEntity } from "@/shared/types/entities";

// ============ 发票管理 ============

/** 发票状态 */
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'partial' | 'overdue' | 'cancelled';

/** 发票类型 */
export type InvoiceType = '专票' | '普票' | '全电专票' | '全电普票';

/** 发票 */
export interface Invoice extends BaseEntity {
  // 基本信息
  invoice_no: string;                    // 发票号码
  invoice_date: string;                 // 开票日期 (YYYY-MM-DD)
  customer_name: string;                 // 客户名称
  invoice_content: string;               // 开票内容
  invoice_currency?: string;             // 开票币种
  invoice_amount_tax_included?: number;  // 开票金额（含税）
  revenue_amount: number;                // 收入金额
  invoice_type: InvoiceType;            // 发票类型
  company_name: string;                 // 我司名称
  
  // 项目关联（支持多项目）
  project_code: string;                 // 主项目编号（如 "C191914"，不含百分比）- 用于搜索和显示
  project_id?: number;                  // 关联项目ID
  po?: string;                          // PO号
  invoice_percentage?: number;          // 发票金额占项目总金额的比例（如 50 表示 50%）
  
  // 多项目支持（一个发票可能对应多个项目编号）
  invoice_items?: Array<{              // 发票明细（支持多个项目）
    id?: number;                        // 明细ID
    project_code: string;               // 项目编号
    project_id?: number;                 // 关联项目ID
    amount: number;                     // 该项目对应的金额
    service_content?: string;            // 服务内容
  }>;
  
  // 收款信息
  payment_date?: string;                // 到账日期 (YYYY-MM-DD)
  payment_amount?: number;              // 到账金额
  
  // 账期管理
  payment_term?: number;                 // 账期（天）
  expected_payment_date?: string;       // 应到账时间 (YYYY-MM-DD)
  receivable_date?: string;            // 应收时间 (YYYY-MM-DD)
  
  // 人员信息
  sales_manager: string;                // 客户经理
  
  // 统计字段（自动计算）
  invoice_year?: string;                // 开票年份（如 "2019年"）
  invoice_month?: string;              // 开票月份（如 "6月"）
  payment_year?: string;               // 到账年份
  payment_month?: string;              // 到账月份
  
  // 状态
  status: InvoiceStatus;
  
  // LIMS关联
  lims_report_submitted_at?: string;    // LIMS报告提交时间

  // 易快报附件追踪
  ekuaibao_attachment_count?: number;   // 附件数量（来自 EkbAttachmentIndex）
  ekuaibao_reconcile_status?: 'match' | 'mismatch' | 'only_in_ekb' | 'only_in_new'; // 对账状态
  
  // 电子发票管理
  electronic_invoice_file?: string;        // 电子发票文件路径/URL
  electronic_invoice_file_name?: string;   // 电子发票文件名
  electronic_invoice_uploaded_at?: string; // 上传时间
  electronic_invoice_download_count?: number; // 下载次数
}

// ============ 项目费用管理 ============

/** 费用类型 */
export type ExpenseType = '受试者礼金' | '耗材购买' | '兼职费用' | '招募费用' | '其他';

/** 审批状态 */
export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';

/** 项目费用 */
export interface ProjectExpense extends BaseEntity {
  // 易快报关联
  ekuaibao_no?: string;                 // 易快报单号（如 "B26000474"）
  ekuaibao_title?: string;              // 标题
  ekuaibao_id?: string;                 // 易快报内部 flowId（唯一键）
  import_source?: 'manual' | 'ekuaibao'; // 数据来源
  import_batch_id?: string;             // 导入批次号（用于回滚溯源）
  
  // 项目关联
  project_code: string;                 // 项目编号
  project_id?: number;                  // 关联项目ID
  project_name?: string;                // 项目名称
  project_archive_name?: string;        // 项目档案名称（客户名称）
  
  // 费用信息
  expense_type: ExpenseType;            // 费用类型
  expense_amount: number;               // 报销金额
  expense_date: string;                 // 报销日期 (YYYY-MM-DD)
  write_off_amount?: number;            // 核销金额
  
  // 预算关联
  budget_no?: string;                   // 预算单号
  budget_relation?: string;              // 关联申请名称
  
  // 审批信息
  applicant_name: string;               // 提交人名称
  applicant_department: string;        // 费用承担部门名称
  current_approver?: string;            // 当前审批人
  approval_status: ApprovalStatus;      // 审批状态
  
  // 支付信息
  payment_amount?: number;              // 支付金额
  payment_method?: string;             // 支付方式
  payment_date?: string;               // 支付日期
  
  // 金蝶关联
  voucher_no?: string;                 // 凭证号
  voucher_status?: string;             // 凭证状态
}

// ============ 项目预算管理 ============

/** 预算项 */
export interface BudgetItem {
  id: number;
  budget_id: number;
  item_name: string;                    // 预算项名称
  item_type: ExpenseType;               // 预算项类型
  budget_amount: number;                // 预算金额
  actual_amount: number;                // 实际金额
  remaining_amount: number;             // 剩余金额
}

/** 项目预算 */
export interface ProjectBudget extends BaseEntity {
  project_code: string;                 // 项目编号
  project_id?: number;                  // 关联项目ID
  project_name?: string;                 // 项目名称
  customer_name?: string;               // 客户名称
  sales_manager?: string;               // 客户经理
  
  // 预算信息
  budget_total: number;                 // 项目标的（总预算）
  budget_items: BudgetItem[];          // 预算明细
  
  // 项目时间
  project_start_date: string;           // 项目开始日期 (YYYY-MM-DD)
  project_end_date: string;             // 项目结束日期 (YYYY-MM-DD)
  
  // 其他信息
  sample_count?: number;                 // 样本数量/人
  business_sector?: string;             // 业务板块名称
  
  // 统计字段（自动计算）
  actual_total?: number;                // 实际总支出
  remaining_total?: number;            // 剩余预算
  budget_execution_rate?: number;       // 预算执行率（%）
}

// ============ 收入确认 ============

/** 收入确认阶段 */
export type RevenueStage = '方案阶段' | '执行阶段' | '报告阶段';

/** 收入确认 */
export interface RevenueRecognition extends BaseEntity {
  project_code: string;                 // 项目编号
  project_id?: number;                  // 关联项目ID
  
  recognition_stage: RevenueStage;      // 确认阶段
  recognition_percentage: number;       // 确认比例（25% | 50% | 25%）
  recognition_amount: number;           // 确认金额
  
  recognition_date: string;             // 确认日期 (YYYY-MM-DD)
  
  // 确认依据
  basis: {
    stage: string;
    start_date?: string;                // 执行开始时间
    end_date?: string;                  // 执行结束时间
    report_submitted_at?: string;      // 报告提交时间
  };
}

// ============ 财务统计 ============

/** 财务概览统计 */
export interface FinanceOverview {
  // 收入
  monthly_revenue: number;               // 本月收入
  yearly_revenue: number;                // 本年收入
  
  // 支出
  monthly_expense: number;               // 本月支出
  yearly_expense: number;               // 本年支出
  
  // 开票
  pending_invoice_amount: number;        // 待开票金额
  issued_invoice_amount: number;        // 已开票金额
  
  // 收款
  overdue_payment_amount: number;       // 逾期收款金额
  overdue_payment_count: number;         // 逾期收款笔数
  
  // 现金流
  cash_balance: number;                  // 现金余额
  cash_safety_threshold?: number;        // 现金安全阈值
  
  // 项目
  project_count: number;                 // 项目总数
  over_budget_count: number;            // 超预算项目数
}
