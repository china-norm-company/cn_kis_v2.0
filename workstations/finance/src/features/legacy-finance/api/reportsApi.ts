/**
 * 财务报表 API
 * 职责：生成周报、月报、项目报表
 */

import { apiClient } from "@/shared/api/client";
import { createMockAdapterCaller } from "@/shared/api/mock-adapter";
import { getApiMode } from "@/shared/config/env";
import type { WeeklyReport, MonthlyReport, ProjectReport } from "@/entities/finance/report-domain";
import { invoicesApi } from "./invoicesApi";
import { paymentsApi } from "./paymentsApi";

const callWithMock = createMockAdapterCaller({ 
  fallbackToMockOnError: true // 允许fallback，确保后端不可用时仍可使用mock数据 
});

// ============= Mock 实现 =============

const mockReportsApi = {
  /**
   * 生成周报
   */
  getWeeklyReport: async (weekStart?: string): Promise<WeeklyReport> => {
    try {
      // 如果没有指定周开始日期，使用当前周
      const now = new Date();
      const currentWeekStart = weekStart 
        ? new Date(weekStart) 
        : new Date(now.setDate(now.getDate() - now.getDay())); // 本周一
      
      currentWeekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6); // 本周日
      weekEnd.setHours(23, 59, 59, 999);
      
      const weekStartStr = currentWeekStart.toISOString().split('T')[0];
      const weekEndStr = weekEnd.toISOString().split('T')[0];
      
      // 获取本周的发票和收款
      const allInvoices = await invoicesApi.getInvoices({ page_size: 1000 });
      const allPayments = await paymentsApi.getPayments({ page_size: 1000 });
      
      // 筛选本周的发票
      const weekInvoices = allInvoices.invoices.filter(inv => {
        const invDate = new Date(inv.invoice_date);
        return invDate >= currentWeekStart && invDate <= weekEnd;
      });
      
      // 筛选本周的收款
      const weekPayments = allPayments.payments.filter(pay => {
        const payDate = new Date(pay.payment_date);
        return payDate >= currentWeekStart && payDate <= weekEnd;
      });
      
      // 计算逾期发票（已开票但未完全收款，且超过应到账日期）
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const overdueInvoices = allInvoices.invoices.filter(inv => {
        if (inv.status === 'paid') return false;
        
        const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
        if (unpaidAmount <= 0) return false;
        
        // 计算应到账日期
        let expectedDate: Date | null = null;
        if (inv.expected_payment_date) {
          expectedDate = new Date(inv.expected_payment_date);
        } else if (inv.payment_term && inv.invoice_date) {
          const invDate = new Date(inv.invoice_date);
          expectedDate = new Date(invDate);
          expectedDate.setDate(expectedDate.getDate() + inv.payment_term);
        }
        
        if (!expectedDate) return false;
        expectedDate.setHours(0, 0, 0, 0);
        
        return expectedDate < today;
      });
      
      return {
        report_date: new Date().toISOString().split('T')[0],
        week_start: weekStartStr,
        week_end: weekEndStr,
        invoice_count: weekInvoices.length,
        invoice_amount: weekInvoices.reduce((sum, inv) => sum + inv.revenue_amount, 0),
        invoice_list: weekInvoices.map(inv => ({
          invoice_no: inv.invoice_no,
          invoice_date: inv.invoice_date,
          customer_name: inv.customer_name,
          project_code: inv.project_code,
          amount: inv.revenue_amount,
        })),
        payment_count: weekPayments.length,
        payment_amount: weekPayments.reduce((sum, pay) => sum + pay.payment_amount, 0),
        payment_list: weekPayments.map(pay => ({
          payment_date: pay.payment_date,
          customer_name: pay.customer_name || '未知',
          project_code: pay.project_code || '未知',
          amount: pay.payment_amount,
          invoice_no: pay.invoice_no,
        })),
        overdue_count: overdueInvoices.length,
        overdue_amount: overdueInvoices.reduce((sum, inv) => {
          const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
          return sum + unpaidAmount;
        }, 0),
      };
    } catch (error) {
      console.error('[周报生成] 失败:', error);
      // 返回空报表
      const now = new Date();
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      return {
        report_date: new Date().toISOString().split('T')[0],
        week_start: weekStart.toISOString().split('T')[0],
        week_end: weekEnd.toISOString().split('T')[0],
        invoice_count: 0,
        invoice_amount: 0,
        invoice_list: [],
        payment_count: 0,
        payment_amount: 0,
        payment_list: [],
        overdue_count: 0,
        overdue_amount: 0,
      };
    }
  },
  
  /**
   * 生成月报
   */
  getMonthlyReport: async (year?: number, month?: number): Promise<MonthlyReport> => {
    try {
      const now = new Date();
      const reportYear = year || now.getFullYear();
      const reportMonth = month || (now.getMonth() + 1);
      
      // 计算月份的开始和结束日期
      const monthStart = new Date(reportYear, reportMonth - 1, 1);
      monthStart.setHours(0, 0, 0, 0);
      const monthEnd = new Date(reportYear, reportMonth, 0, 23, 59, 59, 999);
      
      // 获取本月的发票和收款
      const allInvoices = await invoicesApi.getInvoices({ page_size: 1000 });
      const allPayments = await paymentsApi.getPayments({ page_size: 1000 });
      
      // 筛选本月的发票和收款
      const monthInvoices = allInvoices.invoices.filter(inv => {
        const invDate = new Date(inv.invoice_date);
        return invDate >= monthStart && invDate <= monthEnd;
      });
      
      const monthPayments = allPayments.payments.filter(pay => {
        const payDate = new Date(pay.payment_date);
        return payDate >= monthStart && payDate <= monthEnd;
      });
      
      // 计算逾期发票
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const overdueInvoices = allInvoices.invoices.filter(inv => {
        if (inv.status === 'paid') return false;
        const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
        if (unpaidAmount <= 0) return false;
        
        let expectedDate: Date | null = null;
        if (inv.expected_payment_date) {
          expectedDate = new Date(inv.expected_payment_date);
        } else if (inv.payment_term && inv.invoice_date) {
          const invDate = new Date(inv.invoice_date);
          expectedDate = new Date(invDate);
          expectedDate.setDate(expectedDate.getDate() + inv.payment_term);
        }
        if (!expectedDate) return false;
        expectedDate.setHours(0, 0, 0, 0);
        return expectedDate < today;
      });
      
      // 按周分组统计
      const weeklyBreakdown: Array<{
        week_start: string;
        week_end: string;
        invoice_count: number;
        invoice_amount: number;
        payment_count: number;
        payment_amount: number;
      }> = [];
      
      // 计算该月有多少周
      let currentWeekStart = new Date(monthStart);
      while (currentWeekStart <= monthEnd) {
        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (weekEnd > monthEnd) weekEnd.setTime(monthEnd.getTime());
        
        const weekInvoices = monthInvoices.filter(inv => {
          const invDate = new Date(inv.invoice_date);
          return invDate >= currentWeekStart && invDate <= weekEnd;
        });
        
        const weekPayments = monthPayments.filter(pay => {
          const payDate = new Date(pay.payment_date);
          return payDate >= currentWeekStart && payDate <= weekEnd;
        });
        
        weeklyBreakdown.push({
          week_start: currentWeekStart.toISOString().split('T')[0],
          week_end: weekEnd.toISOString().split('T')[0],
          invoice_count: weekInvoices.length,
          invoice_amount: weekInvoices.reduce((sum, inv) => sum + inv.revenue_amount, 0),
          payment_count: weekPayments.length,
          payment_amount: weekPayments.reduce((sum, pay) => sum + pay.payment_amount, 0),
        });
        
        currentWeekStart = new Date(weekEnd);
        currentWeekStart.setDate(currentWeekStart.getDate() + 1);
      }
      
      return {
        report_date: `${reportYear}-${String(reportMonth).padStart(2, '0')}`,
        month: reportMonth,
        year: reportYear,
        invoice_count: monthInvoices.length,
        invoice_amount: monthInvoices.reduce((sum, inv) => sum + inv.revenue_amount, 0),
        payment_count: monthPayments.length,
        payment_amount: monthPayments.reduce((sum, pay) => sum + pay.payment_amount, 0),
        overdue_count: overdueInvoices.length,
        overdue_amount: overdueInvoices.reduce((sum, inv) => {
          const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
          return sum + unpaidAmount;
        }, 0),
        weekly_breakdown: weeklyBreakdown,
      };
    } catch (error) {
      console.error('[月报生成] 失败:', error);
      const now = new Date();
      return {
        report_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        invoice_count: 0,
        invoice_amount: 0,
        payment_count: 0,
        payment_amount: 0,
        overdue_count: 0,
        overdue_amount: 0,
        weekly_breakdown: [],
      };
    }
  },
  
  /**
   * 生成项目报表
   */
  getProjectReport: async (projectCode: string): Promise<ProjectReport | null> => {
    try {
      // 获取该项目的所有发票
      const invoices = await invoicesApi.getInvoices({ 
        project_code: projectCode, 
        page_size: 1000 
      });
      
      if (invoices.invoices.length === 0) {
        return null;
      }
      
      // 获取该项目的所有收款
      const payments = await paymentsApi.getPayments({ 
        project_code: projectCode, 
        page_size: 1000 
      });
      
      // 使用第一个发票获取项目基本信息
      const firstInvoice = invoices.invoices[0];
      
      // 计算未收款和逾期
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let totalUnpaid = 0;
      let totalOverdue = 0;
      let maxOverdueDays = 0;
      
      for (const inv of invoices.invoices) {
        const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
        if (unpaidAmount > 0) {
          totalUnpaid += unpaidAmount;
          
          // 计算逾期
          let expectedDate: Date | null = null;
          if (inv.expected_payment_date) {
            expectedDate = new Date(inv.expected_payment_date);
          } else if (inv.payment_term && inv.invoice_date) {
            const invDate = new Date(inv.invoice_date);
            expectedDate = new Date(invDate);
            expectedDate.setDate(expectedDate.getDate() + inv.payment_term);
          }
          
          if (expectedDate) {
            expectedDate.setHours(0, 0, 0, 0);
            if (expectedDate < today) {
              const overdueDays = Math.floor((today.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24));
              totalOverdue += unpaidAmount;
              maxOverdueDays = Math.max(maxOverdueDays, overdueDays);
            }
          }
        }
      }
      
      return {
        project_code: projectCode,
        customer_name: firstInvoice.customer_name,
        sales_manager: firstInvoice.sales_manager,
        total_invoice_amount: invoices.invoices.reduce((sum, inv) => sum + inv.revenue_amount, 0),
        invoice_count: invoices.invoices.length,
        invoices: invoices.invoices.map(inv => ({
          invoice_no: inv.invoice_no,
          invoice_date: inv.invoice_date,
          amount: inv.revenue_amount,
          status: inv.status,
        })),
        total_payment_amount: payments.payments.reduce((sum, pay) => sum + pay.payment_amount, 0),
        payment_count: payments.payments.length,
        payments: payments.payments.map(pay => ({
          payment_date: pay.payment_date,
          amount: pay.payment_amount,
          invoice_no: pay.invoice_no,
        })),
        unpaid_amount: totalUnpaid,
        overdue_amount: totalOverdue,
        overdue_days: maxOverdueDays,
      };
    } catch (error) {
      console.error('[项目报表生成] 失败:', error);
      return null;
    }
  },
};

// ============= API 实现 =============

export const reportsApi = {
  /**
   * 获取周报
   */
  getWeeklyReport: (weekStart?: string) =>
    callWithMock(
      "finance.reports.weekly",
      async () => {
        const response = await apiClient.get<WeeklyReport>("/finance/reports/weekly", {
          params: { week_start: weekStart },
        });
        return response.data;
      },
      () => mockReportsApi.getWeeklyReport(weekStart)
    ),
  
  /**
   * 获取月报
   */
  getMonthlyReport: (year?: number, month?: number) =>
    callWithMock(
      "finance.reports.monthly",
      async () => {
        const response = await apiClient.get<MonthlyReport>("/finance/reports/monthly", {
          params: { year, month },
        });
        return response.data;
      },
      () => mockReportsApi.getMonthlyReport(year, month)
    ),
  
  /**
   * 获取项目报表
   */
  getProjectReport: (projectCode: string) =>
    callWithMock(
      "finance.reports.project",
      async () => {
        const response = await apiClient.get<ProjectReport>(`/finance/reports/project/${projectCode}`);
        return response.data;
      },
      () => mockReportsApi.getProjectReport(projectCode)
    ),
};
