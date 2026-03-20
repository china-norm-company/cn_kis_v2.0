/**
 * 发票管理 Hooks
 * 职责：提供发票相关的 React Query hooks
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoicesApi, type CreateInvoiceRequest, type UpdateInvoiceRequest } from "../api/invoicesApi";
import type { Invoice, InvoiceStatus } from "@/entities/finance/domain";
import { useToast } from "@/shared/ui/use-toast";
import { sendInvoiceCreatedNotification } from "../services/notificationService";

// ============= 查询 Hooks =============

/**
 * 获取发票列表
 */
export function useInvoices(params?: {
  page?: number;
  page_size?: number;
  project_code?: string;
  customer_name?: string;
  status?: InvoiceStatus;
  start_date?: string;
  end_date?: string;
  revenue_amount?: number; // 支持按金额搜索
}) {
  return useQuery({
    queryKey: ["invoices", params],
    queryFn: () => invoicesApi.getInvoices(params),
  });
}

/**
 * 获取发票详情
 */
export function useInvoice(id: number) {
  return useQuery({
    queryKey: ["invoice", id],
    queryFn: () => invoicesApi.getInvoiceById(id),
    enabled: !!id,
  });
}

// ============= 变更 Hooks =============

/**
 * 创建发票
 */
export function useCreateInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateInvoiceRequest) => {
      // 1. 创建发票
      const invoice = await invoicesApi.createInvoice(data);
      
      // 2. 发送开票通知（异步，不阻塞）
      console.log('[创建发票] 准备发送开票通知，发票ID:', invoice.id, '接收人:', invoice.sales_manager);
      sendInvoiceCreatedNotification(invoice, {
        recipient: invoice.sales_manager,
        channels: ['feishu', 'system'],
      })
        .then(() => {
          console.log('[创建发票] ✅ 开票通知发送成功');
        })
        .catch(error => {
          console.error('[创建发票] ❌ 开票通知发送失败:', error);
          // 不影响发票创建，只记录错误
        });
      
      return invoice;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-requests"] }); // 同时刷新开票申请列表
      toast({
        title: "创建成功",
        description: "发票已创建，已自动通知商务人员",
      });
      return invoice; // 返回发票对象，供调用方使用
    },
    onError: (error: Error) => {
      toast({
        title: "创建失败",
        description: error.message || "创建发票时发生错误",
        variant: "destructive",
      });
    },
  });
}

/**
 * 更新发票
 */
export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: UpdateInvoiceRequest) => invoicesApi.updateInvoice(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", variables.id] });
      toast({
        title: "更新成功",
        description: "发票已更新",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "更新失败",
        description: error.message || "更新发票时发生错误",
        variant: "destructive",
      });
    },
  });
}

/**
 * 删除发票
 */
export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: number) => invoicesApi.deleteInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({
        title: "删除成功",
        description: "发票已删除",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "删除失败",
        description: error.message || "删除发票时发生错误",
        variant: "destructive",
      });
    },
  });
}
