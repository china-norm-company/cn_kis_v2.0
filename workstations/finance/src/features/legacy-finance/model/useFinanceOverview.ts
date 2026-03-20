/**
 * 财务概览 Hooks
 */

import { useQuery } from "@tanstack/react-query";
import { financeOverviewApi } from "../api/financeOverviewApi";
import type { FinanceOverview } from "@/entities/finance/domain";

export function useFinanceOverview() {
  return useQuery({
    queryKey: ["finance-overview"],
    queryFn: async () => {
      try {
        const data = await financeOverviewApi.getOverview();
        console.log('[财务概览] 获取到的数据:', data);
        // 确保返回的数据不为null
        if (!data) {
          console.warn('[财务概览] 返回数据为null，使用默认值');
          return getDefaultOverview();
        }
        return data;
      } catch (error) {
        console.error('[财务概览] 获取数据失败:', error);
        // 即使出错也返回默认值，避免显示"暂无数据"
        return getDefaultOverview();
      }
    },
    refetchInterval: 60000, // 每分钟刷新一次
    retry: 1, // 失败后重试1次
    // 设置初始数据，避免首次加载时显示"暂无数据"
    initialData: getDefaultOverview(),
  });
}

function getDefaultOverview(): FinanceOverview {
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
