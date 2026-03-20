/**
 * 开票申请 React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoiceRequestsApi } from "../api/invoiceRequestsApi";
import type { 
  InvoiceRequest, 
  InvoiceRequestStatus,
  CreateInvoiceRequestRequest,
  UpdateInvoiceRequestRequest 
} from "@/entities/finance/invoice-request-domain";
import { useToast } from "@/shared/ui/use-toast";

// ============= 查询 Hooks =============

/**
 * 获取开票申请列表
 */
export function useInvoiceRequests(params?: {
  page?: number;
  page_size?: number;
  status?: InvoiceRequestStatus;
  request_by?: string;
  customer_name?: string;
  start_date?: string;
  end_date?: string;
}) {
  return useQuery({
    queryKey: ["invoice-requests", params],
    queryFn: () => invoiceRequestsApi.getInvoiceRequests(params),
  });
}

/**
 * 获取开票申请详情
 */
export function useInvoiceRequest(id: number) {
  return useQuery({
    queryKey: ["invoice-requests", id],
    queryFn: () => invoiceRequestsApi.getInvoiceRequestById(id),
    enabled: !!id,
  });
}

// ============= 变更 Hooks =============

/**
 * 创建开票申请
 */
export function useCreateInvoiceRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreateInvoiceRequestRequest) => invoiceRequestsApi.createInvoiceRequest(data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-requests"] });
      await queryClient.refetchQueries({ queryKey: ["invoice-requests"] });
      toast({
        title: "创建成功",
        description: "开票申请已提交",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "创建失败",
        description: error.message || "创建开票申请时发生错误",
        variant: "destructive",
      });
    },
  });
}

/**
 * 更新开票申请
 */
export function useUpdateInvoiceRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: UpdateInvoiceRequestRequest) => invoiceRequestsApi.updateInvoiceRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-requests"] });
      toast({
        title: "更新成功",
        description: "开票申请已更新",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "更新失败",
        description: error.message || "更新开票申请时发生错误",
        variant: "destructive",
      });
    },
  });
}

/**
 * 删除开票申请
 */
export function useDeleteInvoiceRequest() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: number) => invoiceRequestsApi.deleteInvoiceRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-requests"] });
      toast({
        title: "删除成功",
        description: "开票申请已删除",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "删除失败",
        description: error.message || "删除开票申请时发生错误",
        variant: "destructive",
      });
    },
  });
}
