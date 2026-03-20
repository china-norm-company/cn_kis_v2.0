/**
 * 创建客户对话框
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
import { useCreateCustomer } from "../model/useCustomers";

const createCustomerSchema = z.object({
  customer_code: z.string().optional(),
  customer_name: z.string().min(1, "客户名称不能为空"),
  short_name: z.string().optional(),
  payment_term_days: z.number().min(0, "账期必须大于等于0"),
  payment_term_description: z.string().optional(),
  remark: z.string().optional(),
  is_active: z.boolean().default(true),
});

type CreateCustomerFormValues = z.infer<typeof createCustomerSchema>;

interface CreateCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCustomerDialog({ open, onOpenChange }: CreateCustomerDialogProps) {
  const createMutation = useCreateCustomer();

  const form = useForm<CreateCustomerFormValues>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      is_active: true,
      payment_term_days: 30,
    },
  });

  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [open, form]);

  const onSubmit = async (values: CreateCustomerFormValues) => {
    try {
      await createMutation.mutateAsync(values as any);
      onOpenChange(false);
    } catch (error) {
      // 错误已在 mutation 中处理
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>新建客户</DialogTitle>
          <DialogDescription>添加新的客户信息，包括客户名称和账期。注意：客户编号不要求唯一，同一客户的不同公司可以使用相同的客户编号。</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
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
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "创建中..." : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
