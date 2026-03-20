/**
 * 催款提醒 API
 * 职责：识别逾期收款、生成催款提醒列表、批量发送催款通知
 */

import { apiClient } from "@/shared/api/client";
import { createMockAdapterCaller } from "@/shared/api/mock-adapter";
import { getApiMode } from "@/shared/config/env";
import type { OverdueReminder } from "@/entities/finance/report-domain";
import { invoicesApi } from "./invoicesApi";
import { sendFeishuMessage } from "@/shared/services/feishuService";

const callWithMock = createMockAdapterCaller({ 
  fallbackToMockOnError: true // 允许fallback，确保后端不可用时仍可使用mock数据 
});

// ============= Mock 实现 =============

const mockOverdueRemindersApi = {
  /**
   * 获取逾期提醒列表
   */
  getOverdueReminders: async (params?: {
    page?: number;
    page_size?: number;
    customer_name?: string;
    sales_manager?: string;
    min_overdue_days?: number;
  }): Promise<{
    reminders: OverdueReminder[];
    total_records: number;
    total_pages: number;
    current_page: number;
  }> => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // 获取所有未完全收款的发票
      const allInvoices = await invoicesApi.getInvoices({ page_size: 1000 });
      
      const overdueReminders: OverdueReminder[] = [];
      
      for (const invoice of allInvoices.invoices) {
        // 跳过已完全收款的发票
        if (invoice.status === 'paid') continue;
        
        const unpaidAmount = invoice.revenue_amount - (invoice.payment_amount || 0);
        if (unpaidAmount <= 0) continue;
        
        // 计算应到账日期
        let expectedDate: Date | null = null;
        if (invoice.expected_payment_date) {
          expectedDate = new Date(invoice.expected_payment_date);
        } else if (invoice.payment_term && invoice.invoice_date) {
          try {
            const invDate = new Date(invoice.invoice_date);
            if (!isNaN(invDate.getTime())) {
              expectedDate = new Date(invDate);
              expectedDate.setDate(expectedDate.getDate() + (invoice.payment_term || 0));
            }
          } catch (error) {
            console.warn('[催款管理] 日期解析失败:', invoice.invoice_date, error);
          }
        }
        
        // 如果没有应到账日期，跳过
        if (!expectedDate) continue;
        
        expectedDate.setHours(0, 0, 0, 0);
        
        // 检查是否逾期
        if (expectedDate < today) {
          const overdueDays = Math.floor((today.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24));
          
          // 如果设置了最小逾期天数，进行过滤
          if (params?.min_overdue_days && overdueDays < params.min_overdue_days) {
            continue;
          }
          
          // 获取发送记录
          const sendRecords = mockOverdueRemindersApi.getReminderSendRecords();
          const sendRecord = sendRecords[invoice.id] || { count: 0, last_send_date: '' };
          
          overdueReminders.push({
            id: invoice.id, // 使用发票ID作为提醒ID
            invoice_id: invoice.id,
            invoice_no: invoice.invoice_no,
            invoice_date: invoice.invoice_date,
            customer_name: invoice.customer_name,
            project_code: invoice.project_code,
            sales_manager: invoice.sales_manager,
            invoice_amount: invoice.revenue_amount,
            paid_amount: invoice.payment_amount || 0,
            unpaid_amount: unpaidAmount,
            payment_term: invoice.payment_term,
            expected_payment_date: expectedDate.toISOString().split('T')[0],
            overdue_days: overdueDays,
            reminder_count: sendRecord.count,
            last_reminder_date: sendRecord.last_send_date || undefined,
            status: sendRecord.count > 0 ? 'reminded' : 'pending',
            created_at: invoice.created_at,
            updated_at: invoice.updated_at,
          });
        }
      }
      
      // 按逾期天数降序排序
      overdueReminders.sort((a, b) => b.overdue_days - a.overdue_days);
      
      // 应用筛选条件
      let filtered = [...overdueReminders];
      
      if (params?.customer_name) {
        filtered = filtered.filter(r => r.customer_name.includes(params.customer_name!));
      }
      
      if (params?.sales_manager) {
        filtered = filtered.filter(r => r.sales_manager.includes(params.sales_manager!));
      }
      
      // 分页
      const page = params?.page || 1;
      const pageSize = params?.page_size || 20;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      
      return {
        reminders: filtered.slice(start, end),
        total_records: filtered.length,
        total_pages: Math.ceil(filtered.length / pageSize),
        current_page: page,
      };
    } catch (error) {
      console.error('[催款提醒] 获取列表失败:', error);
      return {
        reminders: [],
        total_records: 0,
        total_pages: 0,
        current_page: 1,
      };
    }
  },
  
  /**
   * 获取发送记录存储
   */
  getReminderSendRecords: (): Record<number, { count: number; last_send_date: string }> => {
    try {
      const stored = localStorage.getItem('finance_overdue_reminder_records');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  },

  /**
   * 保存发送记录
   */
  saveReminderSendRecord: (reminderId: number, sendDate: string): void => {
    try {
      const records = mockOverdueRemindersApi.getReminderSendRecords();
      const existing = records[reminderId] || { count: 0, last_send_date: '' };
      
      records[reminderId] = {
        count: existing.count + 1,
        last_send_date: sendDate,
      };
      
      localStorage.setItem('finance_overdue_reminder_records', JSON.stringify(records));
    } catch (error) {
      console.error('[催款提醒] 保存发送记录失败:', error);
    }
  },

  /**
   * 检查今天是否已发送
   */
  hasSentToday: (reminderId: number): boolean => {
    try {
      const records = mockOverdueRemindersApi.getReminderSendRecords();
      const record = records[reminderId];
      
      if (!record || !record.last_send_date) {
        return false;
      }
      
      const today = new Date().toISOString().split('T')[0];
      return record.last_send_date === today;
    } catch {
      return false;
    }
  },

  /**
   * 发送催款通知（单个）
   */
  sendReminder: async (reminderId: number): Promise<void> => {
    try {
      // 检查今天是否已发送
      if (mockOverdueRemindersApi.hasSentToday(reminderId)) {
        throw new Error('今天已发送过催款通知，请明天再试');
      }
      
      // 获取提醒信息
      const reminders = await mockOverdueRemindersApi.getOverdueReminders({ page_size: 1000 });
      const reminder = reminders.reminders.find(r => r.id === reminderId);
      
      if (!reminder) {
        throw new Error('Reminder not found');
      }
      
      // 调用通知服务发送飞书消息
      const { sendOverdueReminder } = await import("../services/notificationService");
      await sendOverdueReminder(reminder, {
        recipient: reminder.sales_manager,
        channels: ['feishu', 'system'],
      });
      
      // 保存发送记录
      const today = new Date().toISOString().split('T')[0];
      mockOverdueRemindersApi.saveReminderSendRecord(reminderId, today);
      
      console.log('[催款提醒] ✅ 通知已发送，发送记录已保存');
    } catch (error) {
      console.error('[催款提醒] 发送通知失败:', error);
      throw error;
    }
  },
  
  /**
   * 批量发送催款通知
   */
  sendBatchReminders: async (reminderIds: number[]): Promise<{
    success_count: number;
    failed_count: number;
    failed_ids: number[];
  }> => {
    let successCount = 0;
    let failedCount = 0;
    const failedIds: number[] = [];
    
    for (const id of reminderIds) {
      try {
        // 检查今天是否已发送
        if (mockOverdueRemindersApi.hasSentToday(id)) {
          failedCount++;
          failedIds.push(id);
          console.warn(`[批量催款] 提醒 ${id} 今天已发送过，跳过`);
          continue;
        }
        
        await mockOverdueRemindersApi.sendReminder(id);
        successCount++;
      } catch (error) {
        failedCount++;
        failedIds.push(id);
        console.error(`[批量催款] 提醒 ${id} 发送失败:`, error);
      }
    }
    
    return {
      success_count: successCount,
      failed_count: failedCount,
      failed_ids: failedIds,
    };
  },
};

// ============= API 实现 =============

export const overdueRemindersApi = {
  /**
   * 获取逾期提醒列表
   */
  getOverdueReminders: (params?: {
    page?: number;
    page_size?: number;
    customer_name?: string;
    sales_manager?: string;
    min_overdue_days?: number;
  }) =>
    callWithMock(
      "finance.overdue-reminders.list",
      async () => {
        const response = await apiClient.get<{
          reminders: OverdueReminder[];
          total_records: number;
          total_pages: number;
          current_page: number;
        }>("/finance/overdue-reminders", {
          params,
        });
        return response.data;
      },
      () => mockOverdueRemindersApi.getOverdueReminders(params)
    ),
  
  /**
   * 发送催款通知（单个）
   */
  sendReminder: (reminderId: number) =>
    callWithMock(
      "finance.overdue-reminders.send",
      async () => {
        await apiClient.post(`/finance/overdue-reminders/${reminderId}/send`, {});
      },
      () => mockOverdueRemindersApi.sendReminder(reminderId)
    ),
  
  /**
   * 批量发送催款通知
   */
  sendBatchReminders: (reminderIds: number[]) =>
    callWithMock(
      "finance.overdue-reminders.batch-send",
      async () => {
        const response = await apiClient.post<{
          success_count: number;
          failed_count: number;
          failed_ids: number[];
        }>("/finance/overdue-reminders/batch-send", {
          reminder_ids: reminderIds,
        });
        return response.data;
      },
      () => mockOverdueRemindersApi.sendBatchReminders(reminderIds)
    ),
};
