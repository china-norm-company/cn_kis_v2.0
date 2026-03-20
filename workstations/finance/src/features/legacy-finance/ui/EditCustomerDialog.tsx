/**
 * 编辑客户对话框
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
import { useUpdateCustomer } from "../model/useCustomers";
import type { FinanceCustomer } from "@/entities/finance/customer-domain";

const editCustomerSchema = z.object({
  customer_code: z.string().min(1, "客户编号不能为空"),
  customer_name: z.string().min(1, "客户名称不能为空"),
  short_name: z.string().optional(),
  payment_term_days: z.number().min(0, "账期必须大于等于0"),
  payment_term_description: z.string().optional(),
  remark: z.string().optional(),
  is_active: z.boolean().default(true),
});

type EditCustomerFormValues = z.infer<typeof editCustomerSchema>;

interface EditCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: FinanceCustomer | null;
}

export function EditCustomerDialog({ open, onOpenChange, customer }: EditCustomerDialogProps) {
  const updateMutation = useUpdateCustomer();

  const form = useForm<EditCustomerFormValues>({
    resolver: zodResolver(editCustomerSchema),
    defaultValues: {
      customer_name: "",
      short_name: "",
      payment_term_days: 30,
      payment_term_description: "",
      remark: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (customer && open) {
      form.reset({
        customer_code: customer.customer_code,
        customer_name: customer.customer_name,
        short_name: customer.short_name || "",
        payment_term_days: customer.payment_term_days,
        payment_term_description: customer.payment_term_description || "",
        remark: customer.remark || "",
        is_active: customer.is_active,
      });
    }
  }, [customer, open, form]);

  const onSubmit = async (values: EditCustomerFormValues) => {
    if (!customer) return;
    try {
      await updateMutation.mutateAsync({
        id: customer.id,
        ...values,
      });
      onOpenChange(false);
    } catch (error) {
      // 错误已在 mutation 中处理
    }
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑客户</DialogTitle>
          <DialogDescription>修改客户信息</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>客户编号 *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="如：CUST001" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>客户完整名称 *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="请输入客户完整名称" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="short_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>客户简称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="请输入客户简称（可选）" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payment_term_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>账期（天） *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        placeholder="如：30、60、90"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payment_term_description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>账期描述</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="如：月结30天、月结60天" />
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
                      <Textarea {...field} placeholder="请输入备注信息（可选）" rows={3} />
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
              >
                取消
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "更新中..." : "更新"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
