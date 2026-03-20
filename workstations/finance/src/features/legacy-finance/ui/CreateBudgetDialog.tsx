/**
 * 创建项目预算对话框
 */

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useCreateBudget } from "../model/useBudgets";
import { Plus, Trash2 } from "lucide-react";
import type { ExpenseType } from "@/entities/finance/domain";

const expenseTypes: ExpenseType[] = ['受试者礼金', '耗材购买', '兼职费用', '招募费用', '其他'];

const budgetItemSchema = z.object({
  item_name: z.string().min(1, "预算项名称不能为空"),
  item_type: z.enum(['受试者礼金', '耗材购买', '兼职费用', '招募费用', '其他']),
  budget_amount: z.number().min(0.01, "预算金额必须大于0"),
});

const createBudgetSchema = z.object({
  project_code: z.string().min(1, "项目编号不能为空"),
  project_name: z.string().optional(),
  customer_name: z.string().optional(),
  sales_manager: z.string().optional(),
  budget_total: z.number().min(0.01, "预算总额必须大于0"),
  budget_items: z.array(budgetItemSchema).min(1, "至少需要一个预算项"),
  project_start_date: z.string().min(1, "项目开始日期不能为空"),
  project_end_date: z.string().min(1, "项目结束日期不能为空"),
  sample_count: z.number().optional(),
  business_sector: z.string().optional(),
});

type CreateBudgetFormValues = z.infer<typeof createBudgetSchema>;

interface CreateBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateBudgetDialog({ open, onOpenChange, onSuccess }: CreateBudgetDialogProps) {
  const createMutation = useCreateBudget();

  const form = useForm<CreateBudgetFormValues>({
    resolver: zodResolver(createBudgetSchema),
    defaultValues: {
      budget_items: [{ item_name: "", item_type: "受试者礼金", budget_amount: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "budget_items",
  });

  // 监听预算项变化，自动计算总额
  const budgetItems = form.watch("budget_items");
  const totalAmount = budgetItems.reduce((sum, item) => sum + (item.budget_amount || 0), 0);
  form.setValue("budget_total", totalAmount);

  const onSubmit = async (values: CreateBudgetFormValues) => {
    try {
      await createMutation.mutateAsync(values as any);
      form.reset();
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      // 错误已在 mutation 中处理
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增项目预算</DialogTitle>
          <DialogDescription>
            录入项目预算信息，包括预算总额和预算明细
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="project_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>项目编号 *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="如：C191914" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="project_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>项目名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="项目名称" />
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
                    <FormLabel>客户名称</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="客户名称" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sales_manager"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>客户经理</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="客户经理" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="project_start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>项目开始日期 *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="project_end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>项目结束日期 *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 预算明细 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel>预算明细 *</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ item_name: "", item_type: "受试者礼金", budget_amount: 0 })}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  添加预算项
                </Button>
              </div>

              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start p-3 border rounded-lg">
                  <FormField
                    control={form.control}
                    name={`budget_items.${index}.item_name`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input {...field} placeholder="预算项名称" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`budget_items.${index}.item_type`}
                    render={({ field }) => (
                      <FormItem className="w-32">
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {expenseTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`budget_items.${index}.budget_amount`}
                    render={({ field }) => (
                      <FormItem className="w-32">
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            placeholder="金额"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <div className="flex justify-end pt-2 border-t">
                <div className="text-sm font-medium">
                  预算总额：¥{totalAmount.toLocaleString()}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
