/**
 * 编辑发票对话框
 * 电子发票未上传时，可在此上传
 */

import { useEffect, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { useUpdateInvoice } from "../model/useInvoices";
import { Loader2, Upload, X } from "lucide-react";
import type { Invoice } from "@/entities/finance/domain";
import { saveInvoiceFile } from "@/shared/services/fileStorage";

// 可选数字：空字符串或 NaN 视为未填，仅上传电子发票时可不填到账金额
const optionalNumber = z
  .union([z.number(), z.literal("")])
  .transform((v) => (v === "" || (typeof v === "number" && Number.isNaN(v)) ? undefined : v))
  .optional();

const editInvoiceSchema = z.object({
  invoice_no: z.string().min(1, "发票号码不能为空"),
  invoice_date: z.string().min(1, "开票日期不能为空"),
  customer_name: z.string().min(1, "客户名称不能为空"),
  invoice_content: z.string().min(1, "开票内容不能为空"),
  invoice_currency: z.string().optional(),
  invoice_amount_tax_included: z.number().optional(),
  revenue_amount: z.number().min(0.01, "收入金额必须大于0"),
  invoice_type: z.enum(["全电专票", "全电普票", "形式发票", "专票", "普票"]),
  company_name: z.string().min(1, "我司名称不能为空"),
  project_code: z.string().min(1, "项目编号不能为空"),
  po: z.string().optional(),
  payment_term: z.number().optional(),
  sales_manager: z.string().min(1, "客户经理不能为空"),
  payment_date: z.string().optional(),
  payment_amount: optionalNumber,
  status: z.enum(["draft", "issued", "paid", "partial", "overdue", "cancelled"]).optional(),
});

type EditInvoiceFormValues = z.infer<typeof editInvoiceSchema>;

interface EditInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  onSuccess?: () => void;
}

export function EditInvoiceDialog({ open, onOpenChange, invoice, onSuccess }: EditInvoiceDialogProps) {
  const updateMutation = useUpdateInvoice();
  const [electronicInvoiceFile, setElectronicInvoiceFile] = useState<File | null>(null);
  const [electronicInvoiceFileName, setElectronicInvoiceFileName] = useState("");

  const form = useForm<EditInvoiceFormValues>({
    resolver: zodResolver(editInvoiceSchema),
  });

  // 将日期字符串转换为 yyyy-MM-dd 格式（HTML5 date input 需要）
  const normalizeDate = (dateStr?: string): string | undefined => {
    if (!dateStr) return undefined;
    // 如果已经是 yyyy-MM-dd 格式，直接返回
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    // 如果是 yyyy/M/d 或 yyyy/M/dd 格式，转换为 yyyy-MM-dd
    const match = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (match) {
      const [, year, month, day] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    // 尝试解析其他格式
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      console.warn('[编辑发票] 日期格式转换失败:', dateStr, e);
    }
    return dateStr; // 如果无法转换，返回原值
  };

  useEffect(() => {
    if (invoice) {
      setElectronicInvoiceFile(null);
      setElectronicInvoiceFileName("");
      form.reset({
        invoice_no: invoice.invoice_no,
        invoice_date: normalizeDate(invoice.invoice_date) || invoice.invoice_date,
        customer_name: invoice.customer_name,
        invoice_content: invoice.invoice_content,
        invoice_currency: invoice.invoice_currency,
        invoice_amount_tax_included: invoice.invoice_amount_tax_included,
        revenue_amount: invoice.revenue_amount,
        invoice_type: (["全电专票", "全电普票", "形式发票"].includes(invoice.invoice_type)
          ? invoice.invoice_type
          : (invoice.invoice_type === "普票" || invoice.invoice_type === "全电普票" ? "全电普票" : invoice.invoice_type === "形式发票" ? "形式发票" : "全电专票")),
        company_name: invoice.company_name,
        project_code: invoice.project_code,
        po: invoice.po,
        payment_term: invoice.payment_term,
        sales_manager: invoice.sales_manager,
        payment_date: normalizeDate(invoice.payment_date),
        payment_amount: invoice.payment_amount,
        status: invoice.status,
      });
    }
  }, [invoice, form]);

  const onSubmit = async (values: EditInvoiceFormValues) => {
    console.log('[编辑发票] ✅✅✅ onSubmit 被调用');
    console.log('[编辑发票] 表单值:', values);
    console.log('[编辑发票] sales_manager:', values.sales_manager);
    
    if (!invoice) {
      console.error('[编辑发票] ❌ 发票对象为空');
      return;
    }

    try {
      // 如果修改了收款金额或收款日期，自动计算状态
      let calculatedStatus = values.status || invoice.status;
      if (values.payment_amount !== undefined || values.payment_date !== undefined) {
        const paymentAmount = values.payment_amount ?? invoice.payment_amount ?? 0;
        const revenueAmount = values.revenue_amount ?? invoice.revenue_amount;
        
        if (paymentAmount >= revenueAmount) {
          calculatedStatus = 'paid';
        } else if (paymentAmount > 0) {
          calculatedStatus = 'partial';
        } else if (values.payment_date) {
          // 如果设置了收款日期但没有收款金额，保持原状态或设为已开票
          calculatedStatus = invoice.status === 'draft' ? 'issued' : invoice.status;
        }
      }

      console.log('[编辑发票] 准备更新发票:', {
        invoice_id: invoice.id,
        sales_manager: values.sales_manager,
        calculatedStatus: calculatedStatus,
      });
      
      let electronicInvoiceFileId: string | undefined;
      let electronicInvoiceFileNameValue: string | undefined;
      if (electronicInvoiceFile) {
        try {
          electronicInvoiceFileId = await saveInvoiceFile(invoice.id, electronicInvoiceFile);
          electronicInvoiceFileNameValue = electronicInvoiceFile.name;
        } catch (err) {
          console.error("[编辑发票] 保存电子发票文件失败:", err);
          alert(`电子发票上传失败：${err instanceof Error ? err.message : "未知错误"}。其他修改已保存，请稍后重试上传。`);
        }
      }

      const payload: Record<string, unknown> = {
        id: invoice.id,
        ...values,
        status: calculatedStatus,
      };
      if (electronicInvoiceFileId && electronicInvoiceFileNameValue) {
        payload.electronic_invoice_file = electronicInvoiceFileId;
        payload.electronic_invoice_file_name = electronicInvoiceFileNameValue;
      }
      // 不提交 undefined/空，避免后端或序列化问题；仅上传电子发票时可不填到账金额
      if (payload.payment_amount === undefined || payload.payment_amount === "") {
        delete payload.payment_amount;
      }
      if (payload.payment_date === undefined || payload.payment_date === "") {
        delete payload.payment_date;
      }

      const result = await updateMutation.mutateAsync(
        payload as unknown as Parameters<typeof updateMutation.mutateAsync>[0],
      );
      
      console.log('[编辑发票] ✅ 发票更新成功:', {
        invoice_id: result.id,
        sales_manager: result.sales_manager,
      });
      
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('[编辑发票] ❌ 更新失败:', error);
      // 错误已在 mutation 中处理
      throw error; // 重新抛出错误，让 mutation 处理
    }
  };
  
  // 直接使用 form.handleSubmit，不需要自定义 handleFormSubmit
  // React Hook Form 会自动处理 preventDefault

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑发票</DialogTitle>
          <DialogDescription>修改发票信息</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form 
            onSubmit={(e) => {
              console.log('[编辑发票] 表单 onSubmit 事件触发');
              console.log('[编辑发票] 表单验证状态:', form.formState);
              console.log('[编辑发票] 表单错误:', form.formState.errors);
              e.preventDefault();
              const submitHandler = form.handleSubmit(
                onSubmit,
                (errors) => {
                  console.error('[编辑发票] ❌ 表单验证失败:', errors);
                  console.error('[编辑发票] 验证错误详情:', JSON.stringify(errors, null, 2));
                }
              );
              submitHandler(e);
            }} 
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="invoice_no"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>发票号码 *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoice_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>开票日期 *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoice_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>发票类型 *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="选择发票类型" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="全电专票">全电专票</SelectItem>
                        <SelectItem value="全电普票">全电普票</SelectItem>
                        <SelectItem value="形式发票">形式发票</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>客户名称 *</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormLabel>项目编号 *</FormLabel>
                    <FormControl>
                      <Input {...field} />
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
                    <FormLabel>客户经理 *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="revenue_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>收入金额 *</FormLabel>
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
                name="payment_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>到账日期</FormLabel>
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
                    <FormLabel>到账金额</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoice_content"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>开票内容 *</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 电子发票未上传时显示上传区域 */}
            {!invoice.electronic_invoice_file && !invoice.electronic_invoice_file_name && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <FormLabel className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  电子发票
                </FormLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setElectronicInvoiceFile(file);
                        setElectronicInvoiceFileName(file.name);
                      }
                    }}
                    className="max-w-xs"
                  />
                  {electronicInvoiceFileName && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="truncate max-w-[200px]">{electronicInvoiceFileName}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setElectronicInvoiceFile(null);
                          setElectronicInvoiceFileName("");
                        }}
                        title="取消选择"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  支持 PDF、JPG、PNG 格式，选择后点击「保存」一并上传
                </p>
              </div>
            )}

            {invoice.electronic_invoice_file_name && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <FormLabel className="text-slate-600">电子发票</FormLabel>
                <p className="text-sm mt-1">已上传：{invoice.electronic_invoice_file_name}</p>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={updateMutation.isPending}
              >
                取消
              </Button>
              <Button 
                type="submit" 
                disabled={updateMutation.isPending}
              >
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
