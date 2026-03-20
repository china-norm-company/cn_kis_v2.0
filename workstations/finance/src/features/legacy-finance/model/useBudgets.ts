/**
 * 项目预算管理 Hooks
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { budgetsApi, type CreateBudgetRequest, type UpdateBudgetRequest } from "../api/budgetsApi";
import type { ProjectBudget } from "@/entities/finance/domain";
import { useToast } from "@/shared/ui/use-toast";

export function useBudgets(params?: {
  page?: number;
  page_size?: number;
  project_code?: string;
  customer_name?: string;
}) {
  return useQuery({
    queryKey: ["budgets", params],
    queryFn: async () => {
      try {
        const data = await budgetsApi.getBudgets(params);
        console.log('[预算Hook] 获取到的数据:', data);
        return data;
      } catch (error) {
        console.error('[预算Hook] 获取数据失败:', error);
        // 返回空列表，避免显示错误
        return {
          budgets: [],
          total_records: 0,
          total_pages: 0,
          current_page: 1,
        };
      }
    },
    retry: 1,
  });
}

export function useBudget(id: number) {
  return useQuery({
    queryKey: ["budget", id],
    queryFn: () => budgetsApi.getBudgetById(id),
    enabled: !!id,
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreateBudgetRequest) => budgetsApi.createBudget(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast({
        title: "创建成功",
        description: "项目预算已创建",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "创建失败",
        description: error.message || "创建项目预算时发生错误",
        variant: "destructive",
      });
    },
  });
}

export function useUpdateBudget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: UpdateBudgetRequest) => budgetsApi.updateBudget(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["budget", variables.id] });
      toast({
        title: "更新成功",
        description: "项目预算已更新",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "更新失败",
        description: error.message || "更新项目预算时发生错误",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: number) => budgetsApi.deleteBudget(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      toast({
        title: "删除成功",
        description: "项目预算已删除",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "删除失败",
        description: error.message || "删除项目预算时发生错误",
        variant: "destructive",
      });
    },
  });
}
