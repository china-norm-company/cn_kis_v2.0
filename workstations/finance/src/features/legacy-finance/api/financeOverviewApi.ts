/**
 * 财务概览 API
 * 职责：获取财务统计数据
 */

import { apiClient } from "@/shared/api/client";
import { createMockAdapterCaller } from "@/shared/api/mock-adapter";
import { getApiMode } from "@/shared/config/env";
import type { FinanceOverview } from "@/entities/finance/domain";
import { invoicesApi } from "./invoicesApi";
import { paymentsApi } from "./paymentsApi";

// 财务模块：即使real模式也允许fallback到mock（因为后端API可能还未实现）
const callWithMock = createMockAdapterCaller({ 
  fallbackToMockOnError: true // 允许fallback，确保后端不可用时仍可使用mock数据
});

// ============= 后端响应类型 =============

interface FinanceOverviewResponse {
  data: FinanceOverview;
}

// ============= Mock 实现 =============

const mockFinanceOverviewApi = {
  getOverview: async (): Promise<FinanceOverview> => {
    try {
      // 从发票和收款数据计算统计信息
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      
      // 获取所有发票
      const allInvoices = await invoicesApi.getInvoices({ page_size: 1000 });
      console.log('[财务概览] 获取到发票数据:', allInvoices);
      console.log('[财务概览] 发票数量:', allInvoices?.invoices?.length || 0);
      
      // 获取所有收款
      const allPayments = await paymentsApi.getPayments({ page_size: 1000 });
      console.log('[财务概览] 获取到收款数据:', allPayments);
      console.log('[财务概览] 收款数量:', allPayments?.payments?.length || 0);
      
      // 确保数据存在，如果数据格式不对，使用空数组
      const invoices = allInvoices?.invoices || [];
      const payments = allPayments?.payments || [];
      
      console.log('[财务概览] 处理后的发票数量:', invoices.length);
      console.log('[财务概览] 处理后的收款数量:', payments.length);
    
    // 计算本月收入（已收款的发票）
    const monthlyRevenue = invoices
      .filter(inv => {
        if (!inv.payment_date) return false;
        const paymentDate = new Date(inv.payment_date);
        return paymentDate.getMonth() + 1 === currentMonth && 
               paymentDate.getFullYear() === currentYear;
      })
      .reduce((sum, inv) => sum + (inv.payment_amount || 0), 0);
    
    // 计算本年收入
    const yearlyRevenue = invoices
      .filter(inv => {
        if (!inv.payment_date) return false;
        const paymentDate = new Date(inv.payment_date);
        return paymentDate.getFullYear() === currentYear;
      })
      .reduce((sum, inv) => sum + (inv.payment_amount || 0), 0);
    
    // 计算本月支出（从费用数据，暂时为0，等费用管理实现后补充）
    const monthlyExpense = 0;
    const yearlyExpense = 0;
    
    // 计算待开票金额（状态为draft或issued但未完全收款的发票）
    const pendingInvoiceAmount = invoices
      .filter(inv => {
        const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
        return inv.status === 'draft' || (inv.status === 'issued' && unpaidAmount > 0);
      })
      .reduce((sum, inv) => {
        const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
        return sum + unpaidAmount;
      }, 0);
    
    // 计算已开票金额
    const issuedInvoiceAmount = invoices
      .filter(inv => inv.status === 'issued' || inv.status === 'paid' || inv.status === 'partial')
      .reduce((sum, inv) => sum + inv.revenue_amount, 0);
    
    // 计算逾期收款（有应到账时间但未到账的发票）
    const overduePayments = invoices.filter(inv => {
      if (inv.status === 'paid') return false;
      if (!inv.expected_payment_date) return false;
      const expectedDate = new Date(inv.expected_payment_date);
      return expectedDate < now && (inv.payment_amount || 0) < inv.revenue_amount;
    });
    
    const overduePaymentAmount = overduePayments.reduce((sum, inv) => {
      const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
      return sum + unpaidAmount;
    }, 0);
    
    const overduePaymentCount = overduePayments.length;
    
    // 计算现金余额（简化：收入 - 支出）
    const cashBalance = yearlyRevenue - yearlyExpense;
    
    return {
      monthly_revenue: monthlyRevenue,
      yearly_revenue: yearlyRevenue,
      monthly_expense: monthlyExpense,
      yearly_expense: yearlyExpense,
      pending_invoice_amount: pendingInvoiceAmount,
      issued_invoice_amount: issuedInvoiceAmount,
      overdue_payment_amount: overduePaymentAmount,
      overdue_payment_count: overduePaymentCount,
      cash_balance: cashBalance,
      cash_safety_threshold: 100000, // 默认10万
      project_count: 0, // 等项目管理模块实现后补充
      over_budget_count: 0, // 等预算管理实现后补充
    };
    } catch (error) {
      console.error('[财务概览] 计算统计数据失败:', error);
      // 返回默认值，避免显示"暂无数据"
      return {
        monthly_revenue: 0,
        yearly_revenue: 0,
        monthly_expense: 0,
        yearly_expense: 0,
        pending_invoice_amount: 0,
        issued_invoice_amount: 0,
        overdue_payment_amount: 0,
        overdue_payment_count: 0,
        cash_balance: 0,
        cash_safety_threshold: 100000,
        project_count: 0,
        over_budget_count: 0,
      };
    }
  },
};

// ============= API 实现 =============

export const financeOverviewApi = {
  /**
   * 获取财务概览统计
   */
  getOverview: callWithMock(
    "finance-overview",
    async (): Promise<FinanceOverview> => {
      const response = await apiClient.get<FinanceOverviewResponse>("/api/v1/finance/overview");
      return response.data.data;
    },
    async (): Promise<FinanceOverview> => {
      return mockFinanceOverviewApi.getOverview();
    }
  ) as unknown as () => Promise<FinanceOverview>,
};
