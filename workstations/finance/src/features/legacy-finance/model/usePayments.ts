/**
 * 收款管理 Hooks
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { paymentsApi, type CreatePaymentRequest, type UpdatePaymentRequest } from "../api/paymentsApi";
import type { Payment, PaymentStatus } from "@/entities/finance/payment-domain";
import { useToast } from "@/shared/ui/use-toast";

export function usePayments(params?: {
  page?: number;
  page_size?: number;
  project_code?: string;
  customer_name?: string;
  match_status?: PaymentStatus;
  start_date?: string;
  end_date?: string;
}) {
  return useQuery({
    queryKey: ["payments", params],
    queryFn: () => paymentsApi.getPayments(params),
  });
}

export function usePayment(id: number) {
  return useQuery({
    queryKey: ["payment", id],
    queryFn: () => paymentsApi.getPaymentById(id),
    enabled: !!id,
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreatePaymentRequest) => paymentsApi.createPayment(data),
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] }); // 更新发票列表
      toast({
        title: "创建成功",
        description: "收款记录已创建，系统将自动匹配发票",
      });
      return payment; // 返回payment对象，供调用方使用
    },
    onError: (error: Error) => {
      toast({
        title: "创建失败",
        description: error.message || "创建收款记录时发生错误",
        variant: "destructive",
      });
    },
  });
}

export function useUpdatePayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: UpdatePaymentRequest) => paymentsApi.updatePayment(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] }); // 更新发票列表
      toast({
        title: "更新成功",
        description: "收款记录已更新",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "更新失败",
        description: error.message || "更新收款记录时发生错误",
        variant: "destructive",
      });
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: number) => paymentsApi.deletePayment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] }); // 更新发票列表
      toast({
        title: "删除成功",
        description: "收款记录已删除",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "删除失败",
        description: error.message || "删除收款记录时发生错误",
        variant: "destructive",
      });
    },
  });
}

export function useAutoMatchInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (params: { paymentId: number; projectCode?: string }) => {
      return await paymentsApi.autoMatchInvoice(params.paymentId, params.projectCode);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment", variables.paymentId] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] }); // 更新发票列表
      if (data.total_matched > 0) {
        toast({
          title: "匹配成功",
          description: `已匹配 ${data.matched_invoices.length} 张发票，匹配金额 ¥${data.total_matched.toLocaleString()}`,
        });
      } else {
        toast({
          title: "未找到匹配发票",
          description: "请检查项目编号是否正确，或发票是否已完全收款",
          variant: "default",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "匹配失败",
        description: error.message || "自动匹配发票时发生错误",
        variant: "destructive",
      });
    },
  });
}
