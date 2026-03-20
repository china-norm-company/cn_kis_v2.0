/**
 * 创建收款对话框
 * 支持自动匹配发票
 */

import { useState, useEffect } from "react";
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
import { useCreatePayment, useAutoMatchInvoice } from "../model/usePayments";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { invoicesApi } from "../api/invoicesApi";
import { useToast } from "@/shared/ui/use-toast";

const createPaymentSchema = z.object({
  payment_date: z.string().min(1, "到账日期不能为空"),
  payment_amount: z.number().min(0.01, "到账金额必须大于0"),
  payment_method: z.string().optional(),
  bank_account: z.string().optional(),
  payment_reference: z.string().optional(),
  remark: z.string().optional(),
  project_code: z.string().optional(),
  invoice_id: z.number().optional(),
});

type CreatePaymentFormValues = z.infer<typeof createPaymentSchema>;

interface CreatePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreatePaymentDialog({ open, onOpenChange, onSuccess }: CreatePaymentDialogProps) {
  const createMutation = useCreatePayment();
  const autoMatchMutation = useAutoMatchInvoice();
  const { toast } = useToast();
  const [matchedInvoices, setMatchedInvoices] = useState<Array<{ invoice_no: string; amount: number }>>([]);
  const [isAutoMatching, setIsAutoMatching] = useState(false);

  const form = useForm<CreatePaymentFormValues>({
    resolver: zodResolver(createPaymentSchema),
    defaultValues: {
      payment_method: "银行转账",
    },
  });

  const projectCode = form.watch("project_code");
  const paymentAmount = form.watch("payment_amount");

  // 当输入项目编号和金额后，自动搜索匹配的发票
  const { data: invoicesData } = useQuery({
    queryKey: ["invoices", "forMatching", projectCode],
    queryFn: () => invoicesApi.getInvoices({ project_code: projectCode, status: "issued", page_size: 50 }),
    enabled: !!projectCode && projectCode.length >= 3 && open,
  });

  // 自动匹配发票（预览）
  useEffect(() => {
    if (projectCode && paymentAmount && paymentAmount > 0 && invoicesData?.invoices) {
      setIsAutoMatching(true);
      
      // 查找未收款或部分收款的发票（检查未收款金额）
      const unmatchedInvoices = invoicesData.invoices.filter((inv) => {
        const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
        return unpaidAmount > 0 && (inv.status === "issued" || inv.status === "partial" || inv.status === "draft");
      });
      
      console.log(`[收款预览] 项目编号: ${projectCode}, 找到可匹配发票: ${unmatchedInvoices.length} 张`);
      
      // 按金额匹配（优先匹配金额相近的发票）
      const matches: Array<{ invoice_no: string; amount: number }> = [];
      let remainingAmount = paymentAmount;
      
      for (const invoice of unmatchedInvoices) {
        if (remainingAmount <= 0) break;
        
        const unpaidAmount = invoice.revenue_amount - (invoice.payment_amount || 0);
        if (unpaidAmount > 0) {
          const matchAmount = Math.min(remainingAmount, unpaidAmount);
          matches.push({
            invoice_no: invoice.invoice_no,
            amount: matchAmount,
          });
          remainingAmount -= matchAmount;
        }
      }
      
      setMatchedInvoices(matches);
      setIsAutoMatching(false);
      
      if (matches.length > 0) {
        toast({
          title: "找到匹配的发票",
          description: `系统找到 ${matches.length} 张发票可以匹配，总金额 ¥${matches.reduce((sum, m) => sum + m.amount, 0).toLocaleString()}`,
        });
      }
    } else {
      setMatchedInvoices([]);
    }
  }, [projectCode, paymentAmount, invoicesData, toast]);

  const onSubmit = async (values: CreatePaymentFormValues) => {
    try {
      console.log('[创建收款] 提交数据:', values);
      // 创建收款记录（自动匹配逻辑在 createPayment API 中执行）
      const payment = await createMutation.mutateAsync(values as any);
      console.log('[创建收款] 创建成功，匹配状态:', payment.match_status, '匹配金额:', payment.matched_amount);
      
      if (payment.match_status === 'pending') {
        toast({
          title: "收款已创建",
          description: "未找到匹配的发票，您可以稍后手动匹配",
          variant: "default",
        });
      } else if (payment.match_status === 'completed') {
        toast({
          title: "收款已创建并匹配",
          description: `已自动匹配发票 ${payment.invoice_no}，金额 ¥${payment.matched_amount?.toLocaleString()}`,
          variant: "default",
        });
      } else if (payment.match_status === 'partial') {
        toast({
          title: "收款已创建（部分匹配）",
          description: `已匹配部分发票，匹配金额 ¥${payment.matched_amount?.toLocaleString()}，剩余 ¥${payment.remaining_amount?.toLocaleString()}`,
          variant: "default",
        });
      }
      
      form.reset();
      setMatchedInvoices([]);
      // 延迟关闭，确保数据已保存
      setTimeout(() => {
        onSuccess?.();
        onOpenChange(false);
      }, 500);
    } catch (error) {
      console.error('[创建收款] 创建失败:', error);
      // 错误已在 mutation 中处理
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增收款</DialogTitle>
          <DialogDescription>
            录入收款信息，系统将自动匹配发票并更新发票状态。支持通过项目编号匹配，或仅通过金额匹配。
          </DialogDescription>
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
                        placeholder="0.00"
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
                      <Input
                        {...field}
                        placeholder="输入项目编号，系统将自动匹配发票"
                      />
                    </FormControl>
                    {isAutoMatching && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        正在匹配发票...
                      </p>
                    )}
                    {matchedInvoices.length > 0 && !isAutoMatching && (
                      <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                        <p className="text-xs font-medium text-green-800 mb-1 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          找到 {matchedInvoices.length} 张匹配的发票：
                        </p>
                        <ul className="text-xs text-green-700 space-y-1">
                          {matchedInvoices.map((match, index) => (
                            <li key={index}>
                              • 发票 {match.invoice_no}：¥{match.amount.toLocaleString()}
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-green-600 mt-1">
                          保存后将自动匹配这些发票
                        </p>
                      </div>
                    )}
                    {projectCode && projectCode.length >= 3 && matchedInvoices.length === 0 && !isAutoMatching && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        未找到匹配的发票，可手动指定发票
                      </p>
                    )}
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
                    <FormLabel>收款账户</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="如：中国银行" />
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
                      <Input {...field} placeholder="如：银行流水号" />
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
                      <Textarea {...field} rows={2} placeholder="可选" />
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
                disabled={createMutation.isPending}
              >
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending || autoMatchMutation.isPending}>
                {createMutation.isPending || autoMatchMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {autoMatchMutation.isPending ? "正在匹配发票..." : "创建中..."}
                  </>
                ) : (
                  "创建"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
