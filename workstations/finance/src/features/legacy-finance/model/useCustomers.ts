import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customersApi, type CreateCustomerRequest, type UpdateCustomerRequest, type GetCustomersParams } from "../api/customersApi";
import type { FinanceCustomer } from "@/entities/finance/customer-domain";
import { useToast } from "@/shared/ui/use-toast";

/**
 * 获取客户列表
 */
export function useCustomers(params?: GetCustomersParams) {
  return useQuery({
    queryKey: ["finance-customers", params],
    queryFn: () => customersApi.getCustomers(params),
  });
}

/**
 * 获取客户详情
 */
export function useCustomer(id: number) {
  return useQuery({
    queryKey: ["finance-customers", id],
    queryFn: () => customersApi.getCustomerById(id),
    enabled: !!id,
  });
}

/**
 * 根据名称查找客户
 */
export function useFindCustomerByName(customerName: string) {
  return useQuery({
    queryKey: ["finance-customers", "find", customerName],
    queryFn: () => customersApi.findCustomerByName(customerName),
    enabled: !!customerName && customerName.length > 0,
  });
}

/**
 * 创建客户
 */
export function useCreateCustomer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreateCustomerRequest) => customersApi.createCustomer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-customers"] });
      toast({
        title: "创建成功",
        description: "客户已创建",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "创建失败",
        description: error.message || "创建客户时发生错误",
        variant: "destructive",
      });
    },
  });
}

/**
 * 更新客户
 */
export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: UpdateCustomerRequest) => customersApi.updateCustomer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-customers"] });
      toast({
        title: "更新成功",
        description: "客户信息已更新",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "更新失败",
        description: error.message || "更新客户时发生错误",
        variant: "destructive",
      });
    },
  });
}

/**
 * 删除客户
 */
export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: number) => customersApi.deleteCustomer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-customers"] });
      toast({
        title: "删除成功",
        description: "客户已删除",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "删除失败",
        description: error.message || "删除客户时发生错误",
        variant: "destructive",
      });
    },
  });
}
