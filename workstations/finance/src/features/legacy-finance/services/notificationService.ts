/**
 * 财务通知服务
 * 职责：发送开票通知、收款通知等
 */

import { getApiMode } from "@/shared/config/env";
import type { Invoice } from "@/entities/finance/domain";
import type { Payment } from "@/entities/finance/payment-domain";
import { apiClient } from "@/shared/api/client";
import { sendFeishuMessage } from "@/shared/services/feishuService";

// ============= 通知类型 =============

export type NotificationChannel = 'feishu' | 'email' | 'system';

export interface NotificationOptions {
  channels?: NotificationChannel[];
  recipient?: string; // 接收人（商务人员姓名或飞书ID）
}

// ============= 通知内容生成 =============

/**
 * 生成开票通知内容
 */
function generateInvoiceNotificationContent(invoice: Invoice): string {
  const projectCodes = invoice.invoice_items && invoice.invoice_items.length > 0
    ? invoice.invoice_items.map(item => item.project_code).join('、')
    : invoice.project_code || '未知';

  // 生成下载链接（如果是Mock模式，使用系统内链接）
  const downloadLink = invoice.electronic_invoice_file
    ? `\n\n📎 电子发票下载：\n请在系统中查看发票详情并下载电子发票文件。\n发票号码：${invoice.invoice_no}\n系统地址：${window.location.origin}/workbench/finance`
    : '';

  return `📄 发票已开具

项目编号：${projectCodes}
发票号码：${invoice.invoice_no}
开票金额：¥${invoice.revenue_amount.toLocaleString()}
开票日期：${invoice.invoice_date}
客户名称：${invoice.customer_name}
客户经理：${invoice.sales_manager}

${invoice.electronic_invoice_file_name 
  ? `📎 电子发票已上传：${invoice.electronic_invoice_file_name}${downloadLink}\n\n请登录系统下载电子发票并发送给客户。` 
  : '⚠️ 电子发票尚未上传，请财务人员尽快上传。'}`;
}

/**
 * 生成收款通知内容
 */
function generatePaymentNotificationContent(payment: Payment, invoice: Invoice): string {
  const projectCodes = invoice.invoice_items && invoice.invoice_items.length > 0
    ? invoice.invoice_items.map(item => item.project_code).join('、')
    : invoice.project_code || '未知';

  const statusText = payment.match_status === 'completed' 
    ? '已完全收款 ✅' 
    : payment.match_status === 'partial'
    ? '部分收款 ⚠️'
    : '未匹配 ❌';

  return `💰 收款已到账

项目编号：${projectCodes}
发票号码：${invoice.invoice_no || payment.invoice_no || '未知'}
收款金额：¥${payment.payment_amount.toLocaleString()}
收款日期：${payment.payment_date}
收款方式：${payment.payment_method || '未知'}

匹配状态：${statusText}
${payment.matched_amount > 0 ? `已匹配金额：¥${payment.matched_amount.toLocaleString()}` : ''}`;
}

// ============= Mock 通知服务 =============

const mockNotificationService = {
  /**
   * 发送开票通知（Mock模式）
   */
  sendInvoiceCreatedNotification: async (
    invoice: Invoice,
    options?: NotificationOptions
  ): Promise<void> => {
    const content = generateInvoiceNotificationContent(invoice);
    const recipient = options?.recipient || invoice.sales_manager || '商务人员';
    const channels = options?.channels || ['feishu', 'system'];

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📨 [Mock] 开票通知');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`发票ID：${invoice.id}`);
    console.log(`发票号：${invoice.invoice_no}`);
    console.log(`接收人：${recipient}`);
    console.log(`通知渠道：${channels.join('、')}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(content);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 提示：当前为Mock模式，消息未实际发送。如需实际发送，请配置飞书App ID和Secret，并设置 VITE_API_MODE=real');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 在Mock模式下，如果配置了飞书，也可以尝试发送（但会记录为Mock）
    // 这样可以在开发环境中测试飞书集成
    if (channels.includes('feishu')) {
      try {
        // 自动识别接收人类型
        const recipientType = recipient.includes('@') ? 'email' : 
                             recipient.startsWith('ou_') ? 'user_id' : 
                             'name';
        await sendFeishuMessage(recipient, content, {
          recipientType: recipientType as 'name' | 'email' | 'user_id',
        });
      } catch (error) {
        console.warn('[通知服务] Mock模式下飞书消息发送失败（这是正常的）:', error);
      }
    }
  },

  /**
   * 发送收款通知（Mock模式）
   */
  sendPaymentReceivedNotification: async (
    payment: Payment,
    invoice: Invoice,
    options?: NotificationOptions
  ): Promise<void> => {
    const content = generatePaymentNotificationContent(payment, invoice);
    const recipient = options?.recipient || invoice.sales_manager || '商务人员';
    const channels = options?.channels || ['feishu', 'system'];

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📨 [Mock] 收款通知');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`接收人：${recipient}`);
    console.log(`通知渠道：${channels.join('、')}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(content);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 在Mock模式下，如果配置了飞书，也可以尝试发送（但会记录为Mock）
    if (channels.includes('feishu')) {
      try {
        await sendFeishuMessage(recipient, content, {
          recipientType: 'name', // 默认按用户名查找
        });
      } catch (error) {
        console.warn('[通知服务] Mock模式下飞书消息发送失败（这是正常的）:', error);
      }
    }
  },
};

// ============= 真实通知服务 =============

const realNotificationService = {
  /**
   * 发送开票通知（真实模式）
   */
  sendInvoiceCreatedNotification: async (
    invoice: Invoice,
    options?: NotificationOptions
  ): Promise<boolean> => {
    try {
      const recipient = options?.recipient || invoice.sales_manager || '商务人员';
      const channels = options?.channels || ['feishu', 'system'];
      const content = generateInvoiceNotificationContent(invoice);

      // real 模式下飞书通知优先走后端（智能开发助手发消息），避免前端凭证与白名单问题
      let feishuSent = false;
      if (channels.includes('feishu')) {
        try {
          const res = await apiClient.post<{ code: number; msg?: string; data?: { sent: boolean; error_code?: string; error_detail?: string } }>(
            '/finance/notifications/invoice-created',
            {
              invoice_id: invoice.id,
              recipient,
              channels,
              content,
              electronic_invoice_file: invoice.electronic_invoice_file,
              electronic_invoice_file_name: invoice.electronic_invoice_file_name,
            }
          );
          // 后端返回格式: { data: { code, msg, data: { sent, error_code? } } } 或直接 body
          const body = (res as any)?.data ?? res;
          const sent = body?.data?.sent === true;
          if (sent) {
            feishuSent = true;
            console.log('[通知服务] 飞书消息已发送（后端·智能开发助手）:', { invoice_id: invoice.id, recipient });
          } else {
            const errCode = body?.data?.error_code || body?.error_code;
            const errDetail = body?.data?.error_detail || body?.error_detail;
            console.warn('[通知服务] 后端未发送成功', errCode ? `(原因: ${errCode})` : '', errDetail ? ` 飞书返回: ${errDetail}` : '', '，尝试前端飞书API');
            const fallbackOk = await sendFeishuMessage(recipient, content, { recipientType: 'name' });
            if (fallbackOk) feishuSent = true;
          }
        } catch (backendError) {
          const errMsg = backendError instanceof Error ? backendError.message : String(backendError);
          console.warn('[通知服务] 后端通知接口失败，尝试前端飞书API:', errMsg);
          try {
            const success = await sendFeishuMessage(recipient, content, { recipientType: 'name' });
            if (success) feishuSent = true;
          } catch (_) {
            console.error('[通知服务] 飞书通知发送失败，请确认后端已配置 FEISHU_APP_ID_DEV_ASSISTANT 并已启动');
          }
        }
      }

      if (feishuSent) {
        console.log('[通知服务] 开票通知已发送:', { invoice_id: invoice.id, recipient, channels });
      } else if (channels.includes('feishu')) {
        console.warn('[通知服务] 开票通知未成功发送到飞书，请检查后端日志或接收人「' + recipient + '」是否可解析为飞书用户');
      }
      return feishuSent;
    } catch (error) {
      console.error('[通知服务] 发送开票通知失败:', error);
      return false;
    }
  },

  /**
   * 发送收款通知（真实模式）
   */
  sendPaymentReceivedNotification: async (
    payment: Payment,
    invoice: Invoice,
    options?: NotificationOptions
  ): Promise<void> => {
    try {
      const recipient = options?.recipient || invoice.sales_manager || '商务人员';
      const channels = options?.channels || ['feishu', 'system'];
      const content = generatePaymentNotificationContent(payment, invoice);

      // 优先尝试直接调用飞书API（如果配置了）
      if (channels.includes('feishu')) {
        try {
          // 自动识别接收人类型（sendFeishuMessage内部也会自动识别，但这里明确传递可以提高准确性）
          const recipientType = recipient.includes('@') ? 'email' : 
                               recipient.startsWith('ou_') ? 'user_id' : 
                               'name';
          const success = await sendFeishuMessage(recipient, content, {
            recipientType: recipientType as 'name' | 'email' | 'user_id',
          });
          if (success) {
            console.log('[通知服务] 飞书消息已发送:', { payment_id: payment.id, recipient });
          } else {
            console.warn('[通知服务] 飞书消息发送失败，尝试后端API');
            // 如果飞书发送失败，尝试后端API
            throw new Error('Feishu message failed, fallback to backend API');
          }
        } catch (error) {
          // 如果直接调用飞书失败，尝试后端API
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn('[通知服务] 直接调用飞书API失败，使用后端API:', errorMessage);
          
          // 检查是否是IP白名单错误
          if (errorMessage.includes('denied by app setting') || errorMessage.includes('ip')) {
            console.warn('[通知服务] ⚠️ 检测到IP白名单限制，尝试通过后端API发送（后端服务器IP应在白名单中）');
          }
          
          try {
            await apiClient.post('/finance/notifications/payment-received', {
              payment_id: payment.id,
              invoice_id: invoice.id,
              recipient,
              channels,
              content,
            });
          } catch (backendError) {
            console.error('[通知服务] ❌ 后端API也失败:', backendError);
            console.error('[通知服务] 提示：如果后端服务器未运行，请：');
            console.error('  1. 启动后端服务器，或');
            console.error('  2. 在飞书开放平台添加当前IP到白名单，或');
            console.error('  3. 使用Mock模式测试（VITE_API_MODE=mock）');
            // 不抛出错误，避免影响收款流程
          }
        }
      } else {
        // 如果没有飞书渠道，直接调用后端API
        await apiClient.post('/finance/notifications/payment-received', {
          payment_id: payment.id,
          invoice_id: invoice.id,
          recipient,
          channels,
          content,
        });
      }

      console.log('[通知服务] 收款通知已发送:', { payment_id: payment.id, recipient, channels });
    } catch (error) {
      console.error('[通知服务] 发送收款通知失败:', error);
      // 不抛出错误，避免影响收款记录流程
    }
  },
};

// ============= 统一导出 =============

/**
 * 发送开票通知
 * @returns 是否成功发送到飞书（real 模式下为后端/前端飞书发送结果，mock 为 true）
 */
export async function sendInvoiceCreatedNotification(
  invoice: Invoice,
  options?: NotificationOptions
): Promise<boolean> {
  try {
    const apiMode = getApiMode();
    console.log('[通知服务] 开始发送开票通知，API模式:', apiMode);
    
    if (apiMode === 'real') {
      return await realNotificationService.sendInvoiceCreatedNotification(invoice, options);
    }
    await mockNotificationService.sendInvoiceCreatedNotification(invoice, options);
    return true;
  } catch (error) {
    console.error('[通知服务] 发送开票通知时发生异常:', error);
    return false;
  }
}

/**
 * 发送收款通知
 */
export async function sendPaymentReceivedNotification(
  payment: Payment,
  invoice: Invoice,
  options?: NotificationOptions
): Promise<void> {
  const apiMode = getApiMode();
  
  if (apiMode === 'real') {
    await realNotificationService.sendPaymentReceivedNotification(payment, invoice, options);
  } else {
    await mockNotificationService.sendPaymentReceivedNotification(payment, invoice, options);
  }
}

/**
 * 生成催款通知内容
 */
function generateOverdueReminderContent(reminder: any): string {
  return `🔔 催款提醒

发票号码：${reminder.invoice_no}
客户名称：${reminder.customer_name}
项目编号：${reminder.project_code}
开票日期：${reminder.invoice_date}
应到账日期：${reminder.expected_payment_date}
逾期天数：${reminder.overdue_days} 天

未收款金额：¥${reminder.unpaid_amount.toLocaleString()}
发票总金额：¥${reminder.invoice_amount.toLocaleString()}
已收款金额：¥${reminder.paid_amount.toLocaleString()}

请及时跟进收款进度。`;
}

/**
 * 发送催款通知（Mock模式）
 */
const mockOverdueReminderService = {
  sendOverdueReminder: async (
    reminder: any,
    options?: NotificationOptions
  ): Promise<void> => {
    const content = generateOverdueReminderContent(reminder);
    const recipient = options?.recipient || reminder.sales_manager || '商务人员';
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📨 [Mock] 催款通知');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`接收人：${recipient}`);
    console.log(`通知渠道：feishu、system`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(content);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  },
};

/**
 * 发送催款通知（真实模式）
 */
const realOverdueReminderService = {
  sendOverdueReminder: async (
    reminder: any,
    options?: NotificationOptions
  ): Promise<void> => {
    try {
      const recipient = options?.recipient || reminder.sales_manager || '商务人员';
      const channels = options?.channels || ['feishu', 'system'];
      const content = generateOverdueReminderContent(reminder);

      // 优先尝试直接调用飞书API（如果配置了）
      if (channels.includes('feishu')) {
        try {
          const recipientType = recipient.includes('@') ? 'email' : 
                               recipient.startsWith('ou_') ? 'user_id' : 
                               'name';
          const success = await sendFeishuMessage(recipient, content, {
            recipientType: recipientType as 'name' | 'email' | 'user_id',
          });
          if (success) {
            console.log('[通知服务] 飞书催款消息已发送:', { reminder_id: reminder.id, recipient });
          } else {
            console.warn('[通知服务] 飞书消息发送失败，尝试后端API');
            throw new Error('Feishu message failed, fallback to backend API');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn('[通知服务] 直接调用飞书API失败，使用后端API:', errorMessage);
          
          if (errorMessage.includes('denied by app setting') || errorMessage.includes('ip')) {
            console.warn('[通知服务] ⚠️ 检测到IP白名单限制，尝试通过后端API发送');
          }
          
          try {
            await apiClient.post('/finance/notifications/overdue-reminder', {
              reminder_id: reminder.id,
              invoice_id: reminder.invoice_id,
              recipient,
              channels,
              content,
            });
          } catch (backendError) {
            console.error('[通知服务] ❌ 后端API也失败:', backendError);
            // 不抛出错误，避免影响催款流程
          }
        }
      } else {
        await apiClient.post('/finance/notifications/overdue-reminder', {
          reminder_id: reminder.id,
          invoice_id: reminder.invoice_id,
          recipient,
          channels,
          content,
        });
      }

      console.log('[通知服务] 催款通知已发送:', { reminder_id: reminder.id, recipient, channels });
    } catch (error) {
      console.error('[通知服务] 发送催款通知失败:', error);
      // 不抛出错误，避免影响催款流程
    }
  },
};

/**
 * 发送催款通知
 */
export async function sendOverdueReminder(
  reminder: any,
  options?: NotificationOptions
): Promise<void> {
  try {
    const apiMode = getApiMode();
    
    if (apiMode === 'real') {
      await realOverdueReminderService.sendOverdueReminder(reminder, options);
    } else {
      await mockOverdueReminderService.sendOverdueReminder(reminder, options);
    }
  } catch (error) {
    console.error('[通知服务] 发送催款通知时发生异常:', error);
    // 不抛出错误，避免影响业务流程
  }
}
