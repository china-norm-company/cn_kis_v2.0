/**
 * 编辑收款对话框
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
import { Textarea } from "@/shared/ui/textarea";
import { useUpdatePayment } from "../model/usePayments";
import { Loader2 } from "lucide-react";
import type { Payment } from "@/entities/finance/payment-domain";

const editPaymentSchema = z.object({
  payment_date: z.string().min(1, "到账日期不能为空"),
  payment_amount: z.number().min(0.01, "到账金额必须大于0"),
  payment_method: z.string().optional(),
  bank_account: z.string().optional(),
  payment_reference: z.string().optional(),
  remark: z.string().optional(),
  project_code: z.string().optional(),
  invoice_id: z.number().optional(),
});

type EditPaymentFormValues = z.infer<typeof editPaymentSchema>;

interface EditPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment | null;
  onSuccess?: () => void;
}

export function EditPaymentDialog({ open, onOpenChange, payment, onSuccess }: EditPaymentDialogProps) {
  const updateMutation = useUpdatePayment();

  const form = useForm<EditPaymentFormValues>({
    resolver: zodResolver(editPaymentSchema),
  });

  useEffect(() => {
    if (payment) {
      form.reset({
        payment_date: payment.payment_date,
        payment_amount: payment.payment_amount,
        payment_method: payment.payment_method,
        bank_account: payment.bank_account,
        payment_reference: payment.payment_reference,
        remark: payment.remark,
        project_code: payment.project_code,
        invoice_id: payment.invoice_id,
      });
    }
  }, [payment, form]);

  const onSubmit = async (values: EditPaymentFormValues) => {
    if (!payment) return;

    try {
      await updateMutation.mutateAsync({
        id: payment.id,
        ...values,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      // 错误已在 mutation 中处理
    }
  };

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑收款</DialogTitle>
          <DialogDescription>修改收款信息</DialogDescription>
        </DialogHeader>

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
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="project_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>项目编号</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
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
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="remark"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>备注</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={updateMutation.isPending}
              >
                取消
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
