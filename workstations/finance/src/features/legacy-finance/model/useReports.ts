/**
 * 财务报表 React Query Hooks
 */

import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "../api/reportsApi";

/**
 * 获取周报
 */
export function useWeeklyReport(weekStart?: string) {
  return useQuery({
    queryKey: ["finance", "reports", "weekly", weekStart],
    queryFn: () => reportsApi.getWeeklyReport(weekStart),
  });
}

/**
 * 获取月报
 */
export function useMonthlyReport(year?: number, month?: number) {
  return useQuery({
    queryKey: ["finance", "reports", "monthly", year, month],
    queryFn: () => reportsApi.getMonthlyReport(year, month),
  });
}

/**
 * 获取项目报表
 */
export function useProjectReport(projectCode: string) {
  return useQuery({
    queryKey: ["finance", "reports", "project", projectCode],
    queryFn: () => reportsApi.getProjectReport(projectCode),
    enabled: !!projectCode && projectCode.length > 0,
  });
}
