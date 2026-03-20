/**
 * 催款提醒 React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { overdueRemindersApi } from "../api/overdueRemindersApi";
import { useToast } from "@/shared/ui/use-toast";

/**
 * 获取逾期提醒列表
 */
export function useOverdueReminders(params?: {
  page?: number;
  page_size?: number;
  customer_name?: string;
  sales_manager?: string;
  min_overdue_days?: number;
}) {
  return useQuery({
    queryKey: ["finance", "overdue-reminders", params],
    queryFn: () => overdueRemindersApi.getOverdueReminders(params),
  });
}

/**
 * 发送催款通知（单个）
 */
export function useSendReminder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: (reminderId: number) => overdueRemindersApi.sendReminder(reminderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance", "overdue-reminders"] });
      toast({
        title: "发送成功",
        description: "催款通知已发送",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "发送失败",
        description: error.message || "发送催款通知时发生错误",
        variant: "destructive",
      });
    },
  });
}

/**
 * 批量发送催款通知
 */
export function useSendBatchReminders() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: (reminderIds: number[]) => overdueRemindersApi.sendBatchReminders(reminderIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["finance", "overdue-reminders"] });
      toast({
        title: "批量发送完成",
        description: `成功发送 ${data.success_count} 条，失败 ${data.failed_count} 条`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "批量发送失败",
        description: error.message || "批量发送催款通知时发生错误",
        variant: "destructive",
      });
    },
  });
}
