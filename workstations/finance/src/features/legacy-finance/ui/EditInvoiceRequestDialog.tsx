/**
 * 编辑开票申请对话框（仅未处理/处理中状态可编辑）
 */

import { useState, useEffect } from "react";
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
import { Textarea } from "@/shared/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { useUpdateInvoiceRequest } from "../model/useInvoiceRequests";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/shared/ui/use-toast";
import { useCustomers } from "../model/useCustomers";
import type { InvoiceRequest, UpdateInvoiceRequestRequest } from "@/entities/finance/invoice-request-domain";

const INVOICE_TYPE_OPTIONS = [
  { value: "full_elec_special", label: "全电专票" },
  { value: "full_elec_normal", label: "全电普票" },
  { value: "proforma", label: "形式发票" },
] as const;

const AMOUNT_TYPE_OPTIONS = [
  { value: "inclusive_of_tax", label: "含税" },
  { value: "exclusive_of_tax", label: "不含税（按税率折算含税）" },
] as const;

const editSchema = z.object({
  request_date: z.string().min(1, "申请日期不能为空"),
  customer_name: z.string().min(1, "客户名称不能为空"),
  invoice_type: z.enum(["full_elec_special", "full_elec_normal", "proforma"]).default("full_elec_special"),
  amount_type: z.enum(["exclusive_of_tax", "inclusive_of_tax"]).default("inclusive_of_tax"),
  tax_rate: z.number().min(0).max(1).default(0.06),
  request_by: z.string().min(1, "申请人不能为空"),
  items: z
    .array(
      z.object({
        project_code: z.string().min(1, "项目编号不能为空"),
        amount: z.number().min(0.01, "金额必须大于0"),
        service_content: z.string().min(1, "服务内容不能为空"),
      })
    )
    .min(1, "至少需要一个项目")
    .max(20, "最多20个项目"),
  po: z.string().optional(),
  notes: z.string().optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

interface EditInvoiceRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: InvoiceRequest | null;
  onSuccess?: () => void;
}

export function EditInvoiceRequestDialog({
  open,
  onOpenChange,
  request,
  onSuccess,
}: EditInvoiceRequestDialogProps) {
  const updateMutation = useUpdateInvoiceRequest();
  const { toast } = useToast();
  const [customerSearchKeyword, setCustomerSearchKeyword] = useState("");
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      request_date: "",
      customer_name: "",
      invoice_type: "full_elec_special",
      amount_type: "inclusive_of_tax",
      tax_rate: 0.06,
      request_by: "",
      items: [{ project_code: "", amount: 0, service_content: "" }],
      po: "",
      notes: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const customerName = form.watch("customer_name");
  const searchKeyword = customerSearchKeyword || customerName || "";
  const { data: customersData } = useCustomers({
    keyword: searchKeyword.length > 0 ? searchKeyword : undefined,
    page_size: 10,
  });
  const customers = customersData?.customers || [];

  useEffect(() => {
    if (open && request) {
      form.reset({
        request_date: request.request_date?.slice(0, 10) ?? "",
        customer_name: request.customer_name ?? "",
        invoice_type: request.invoice_type ?? "full_elec_special",
        amount_type: request.amount_type ?? "inclusive_of_tax",
        tax_rate: request.tax_rate ?? 0.06,
        request_by: request.request_by ?? "",
        items:
          request.items?.length > 0
            ? request.items.map((it) => ({
                project_code: it.project_code ?? "",
                amount: it.amount ?? 0,
                service_content: it.service_content ?? "",
              }))
            : [{ project_code: "", amount: 0, service_content: "" }],
        po: request.po ?? "",
        notes: request.notes ?? "",
      });
      setCustomerSearchKeyword("");
      setShowCustomerSuggestions(false);
    }
  }, [open, request, form]);

  const onSubmit = async (values: EditFormValues) => {
    if (!request?.id) return;
    try {
      await updateMutation.mutateAsync({
        id: request.id,
        request_date: values.request_date,
        customer_name: values.customer_name,
        invoice_type: values.invoice_type,
        amount_type: values.amount_type,
        tax_rate: values.tax_rate,
        request_by: values.request_by,
        items: values.items as UpdateInvoiceRequestRequest["items"],
        po: values.po,
        notes: values.notes,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch {
      // 错误已在 mutation 中处理
    }
  };

  const amountType = form.watch("amount_type") ?? "inclusive_of_tax";
  const taxRate = form.watch("tax_rate") ?? 0.06;
  const totalAmount = (form.watch("items") ?? []).reduce((sum, item) => {
    const am = item.amount || 0;
    return sum + (amountType === "inclusive_of_tax" ? am : am * (1 + taxRate));
  }, 0);
  const totalAmountRounded = Math.round(totalAmount * 100) / 100;

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>修改开票申请</DialogTitle>
          <DialogDescription>
            仅未处理/处理中状态可修改，支持修改申请日期、客户、明细等
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="request_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>申请日期 *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="request_by"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>申请人 *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="申请人" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="customer_name"
              render={({ field }) => (
                <FormItem className="relative">
                  <FormLabel>客户名称 *</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        {...field}
                        placeholder="请输入或搜索客户名称"
                        onChange={(e) => {
                          field.onChange(e);
                          setCustomerSearchKeyword(e.target.value);
                          setShowCustomerSuggestions(e.target.value.length > 0);
                        }}
                        onFocus={() => field.value && setShowCustomerSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowCustomerSuggestions(false), 200)}
                      />
                      {showCustomerSuggestions && customers.length > 0 && (
                        <div
                          className="absolute left-0 top-full z-[100] mt-1 w-full rounded-md border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/50 max-h-60 overflow-auto"
                          role="listbox"
                          aria-label="客户名称建议"
                        >
                          {customers.map((c) => (
                            <div
                              key={c.id}
                              role="option"
                              className="cursor-pointer px-3 py-2 text-sm text-slate-900 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                field.onChange(c.customer_name);
                                setCustomerSearchKeyword("");
                                setShowCustomerSuggestions(false);
                              }}
                            >
                              <div className="font-medium">{c.customer_name}</div>
                              {c.customer_code && (
                                <div className="text-xs text-slate-500">{c.customer_code}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
                  <FormLabel>发票类型</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="请选择发票类型" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {INVOICE_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>金额类型</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="请选择金额类型" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {AMOUNT_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
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
                name="tax_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>税率（如 6% 填 0.06）</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        max={1}
                        value={field.value}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0.06)}
                        placeholder="0.06"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="po"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PO号</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="如有PO号，请输入" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel>开票明细 *（最多20个项目）</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (fields.length < 20) append({ project_code: "", amount: 0, service_content: "" });
                    else toast({ title: "提示", description: "最多只能添加20个项目" });
                  }}
                  disabled={fields.length >= 20}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  添加项目
                </Button>
              </div>
              <div className="space-y-3 border rounded-lg p-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                    <FormField
                      control={form.control}
                      name={`items.${index}.project_code`}
                      render={({ field: f }) => (
                        <FormItem className="col-span-3">
                          <FormControl>
                            <Input {...f} placeholder="项目编号" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.amount`}
                      render={({ field: f }) => {
                        const am = f.value || 0;
                        const inc = amountType === "inclusive_of_tax" ? am : Math.round(am * (1 + taxRate) * 100) / 100;
                        return (
                          <FormItem className="col-span-3">
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                {...f}
                                value={f.value}
                                onChange={(e) => f.onChange(parseFloat(e.target.value) || 0)}
                                placeholder={amountType === "exclusive_of_tax" ? "不含税金额" : "含税金额"}
                              />
                            </FormControl>
                            {amountType === "exclusive_of_tax" && am > 0 && (
                              <p className="text-xs text-muted-foreground">含税: ¥{inc.toLocaleString()}</p>
                            )}
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.service_content`}
                      render={({ field: f }) => (
                        <FormItem className="col-span-5">
                          <FormControl>
                            <Input {...f} placeholder="服务内容" />
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
                      className="col-span-1"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="text-right text-sm font-medium">总金额（含税）: ¥{totalAmountRounded.toLocaleString()}</div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>备注</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="其他说明" rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
