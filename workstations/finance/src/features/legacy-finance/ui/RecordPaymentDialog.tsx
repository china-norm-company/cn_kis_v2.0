/**
 * 记录收款对话框（从发票管理触发）
 * 职责：针对特定发票记录收款，自动创建收款记录并更新发票状态
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/ui/form";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { useCreatePayment } from "../model/usePayments";
import { useUpdateInvoice } from "../model/useInvoices";
import { useToast } from "@/shared/ui/use-toast";
import type { Invoice } from "@/entities/finance/domain";

const recordPaymentSchema = z.object({
  payment_date: z.string().min(1, "到账日期不能为空"),
  payment_amount: z.number().min(0.01, "到账金额必须大于0"),
  payment_method: z.string().optional(),
  bank_account: z.string().optional(),
  payment_reference: z.string().optional(),
  remark: z.string().optional(),
});

type RecordPaymentFormValues = z.infer<typeof recordPaymentSchema>;

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
  onSuccess?: () => void;
}

export function RecordPaymentDialog({ open, onOpenChange, invoice, onSuccess }: RecordPaymentDialogProps) {
  const createPaymentMutation = useCreatePayment();
  const updateInvoiceMutation = useUpdateInvoice();
  const { toast } = useToast();

  const unpaidAmount = invoice.revenue_amount - (invoice.payment_amount || 0);

  const form = useForm<RecordPaymentFormValues>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      payment_method: "银行转账",
      payment_amount: unpaidAmount, // 默认填入未收款金额
    },
  });

  // 当对话框打开时，重置表单并设置默认值
  useEffect(() => {
    if (open) {
      form.reset({
        payment_date: new Date().toISOString().split('T')[0], // 默认今天
        payment_amount: unpaidAmount,
        payment_method: "银行转账",
        bank_account: "",
        payment_reference: "",
        remark: "",
      });
    }
  }, [open, unpaidAmount, form]);

  const onSubmit = async (values: RecordPaymentFormValues) => {
    try {
      // 计算新的收款金额
      const newPaymentAmount = (invoice.payment_amount || 0) + values.payment_amount;
      const isFullyPaid = newPaymentAmount >= invoice.revenue_amount;
      const newStatus = isFullyPaid ? 'paid' : 'partial';

      // 1. 更新发票状态
      await updateInvoiceMutation.mutateAsync({
        id: invoice.id,
        payment_date: values.payment_date,
        payment_amount: newPaymentAmount,
        status: newStatus,
      });

      // 1.5. 重新获取更新后的发票信息（确保获取到最新的 sales_manager 等字段）
      // 直接从存储中读取，避免 React Query 缓存问题
      const { getInvoicesStore } = await import("../api/invoicesStorage");
      const allInvoices = getInvoicesStore();
      let updatedInvoice = allInvoices.find(inv => inv.id === invoice.id);
      
      if (!updatedInvoice) {
        // 如果直接从存储中找不到，再尝试通过 API 获取
        const { invoicesApi } = await import("../api/invoicesApi");
        updatedInvoice = await invoicesApi.getInvoiceById(invoice.id);
      }
      
      if (!updatedInvoice) {
        throw new Error('无法获取更新后的发票信息');
      }
      
      console.log('[记录收款] 获取到的更新后发票信息:', {
        invoice_id: updatedInvoice.id,
        sales_manager: updatedInvoice.sales_manager,
        payment_amount: updatedInvoice.payment_amount,
      });

      // 2. 创建收款记录（同步客户信息和发票号，使用更新后的发票信息）
      // 注意：收款通知会在 paymentsApi.createPayment 中自动发送，这里不需要重复发送
      const payment = await createPaymentMutation.mutateAsync({
        payment_date: values.payment_date,
        payment_amount: values.payment_amount,
        payment_method: values.payment_method,
        bank_account: values.bank_account,
        payment_reference: values.payment_reference,
        remark: values.remark || `发票 ${updatedInvoice.invoice_no} 的收款`,
        project_code: updatedInvoice.project_code,
        invoice_id: updatedInvoice.id, // 直接关联发票
        invoice_no: updatedInvoice.invoice_no, // 直接传递发票号，确保匹配
        customer_name: updatedInvoice.customer_name, // 同步客户名称（使用更新后的）
        sales_manager: updatedInvoice.sales_manager, // 同步客户经理（使用更新后的）
      });

      toast({
        title: "收款成功",
        description: isFullyPaid 
          ? `发票 ${invoice.invoice_no} 已完全收款，已自动通知商务人员`
          : `发票 ${invoice.invoice_no} 已部分收款，剩余 ¥${(invoice.revenue_amount - newPaymentAmount).toLocaleString()}，已自动通知商务人员`,
        variant: "default",
      });

      form.reset();
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('[记录收款] 失败:', error);
      // 错误已在 mutation 中处理
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>记录收款</DialogTitle>
          <DialogDescription>
            为发票 {invoice.invoice_no} 记录收款信息
          </DialogDescription>
        </DialogHeader>

        {/* 发票信息摘要 */}
        <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">发票金额：</span>
            <span className="font-medium">¥{invoice.revenue_amount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">已收款：</span>
            <span className="font-medium">¥{(invoice.payment_amount || 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">未收款：</span>
            <span className="font-medium text-orange-600">¥{unpaidAmount.toLocaleString()}</span>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="payment_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>到账日期 *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payment_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>到账金额 *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                    </FormControl>
                    <FormMessage />
                    {field.value > unpaidAmount && (
                      <p className="text-xs text-orange-600">
                        收款金额超过未收款金额，将按未收款金额处理
                      </p>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payment_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>付款方式</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="如：银行转账" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bank_account"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>银行账户</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="银行账户" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payment_reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>付款参考号</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="付款参考号" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="remark"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>备注</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="备注信息" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button 
                type="submit" 
                disabled={createPaymentMutation.isPending || updateInvoiceMutation.isPending}
              >
                {createPaymentMutation.isPending || updateInvoiceMutation.isPending ? "保存中..." : "确认收款"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
