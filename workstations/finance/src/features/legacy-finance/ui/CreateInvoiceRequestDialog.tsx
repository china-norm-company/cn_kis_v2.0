/**
 * 创建开票申请对话框
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
import { useCreateInvoiceRequest } from "../model/useInvoiceRequests";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/shared/ui/use-toast";
import { useCustomers } from "../model/useCustomers";
import { useFeishuContext } from "@cn-kis/feishu-sdk";

const INVOICE_TYPE_OPTIONS = [
  { value: "full_elec_special", label: "全电专票" },
  { value: "full_elec_normal", label: "全电普票" },
  { value: "proforma", label: "形式发票" },
] as const;

const AMOUNT_TYPE_OPTIONS = [
  { value: "inclusive_of_tax", label: "含税（客户确认的金额即为含税金额）" },
  { value: "exclusive_of_tax", label: "不含税（需按税率折算为含税，票面与展示均为含税）" },
] as const;

const createInvoiceRequestSchema = z.object({
  request_date: z.string().min(1, "申请日期不能为空"),
  customer_name: z.string().min(1, "客户名称不能为空"),
  invoice_type: z.enum(["full_elec_special", "full_elec_normal", "proforma"]).default("full_elec_special"),
  amount_type: z.enum(["exclusive_of_tax", "inclusive_of_tax"]).default("inclusive_of_tax"),
  tax_rate: z.number().min(0).max(1).default(0.06),
  request_by: z.string().min(1, "申请人不能为空"),
  items: z.array(
    z.object({
      project_code: z.string().min(1, "项目编号不能为空"),
      amount: z.number().min(0.01, "金额必须大于0"),
      service_content: z.string().min(1, "服务内容不能为空"),
    })
  ).min(1, "至少需要一个项目").max(20, "最多20个项目"),
  po: z.string().optional(),
  notes: z.string().optional(),
});

type CreateInvoiceRequestFormValues = z.infer<typeof createInvoiceRequestSchema>;

interface CreateInvoiceRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateInvoiceRequestDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateInvoiceRequestDialogProps) {
  const createMutation = useCreateInvoiceRequest();
  const { toast } = useToast();
  const { user: feishuUser } = useFeishuContext();
  const [customerSearchKeyword, setCustomerSearchKeyword] = useState("");
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

  const defaultRequestBy =
    feishuUser?.name ??
    (() => {
      try {
        const currentUser = JSON.parse(localStorage.getItem("chinanorm_auth_user") || "{}");
        return currentUser.username || currentUser.name || "商务人员";
      } catch {
        return "商务人员";
      }
    })();

  const todayLocal = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const form = useForm<CreateInvoiceRequestFormValues>({
    resolver: zodResolver(createInvoiceRequestSchema),
    defaultValues: {
      request_date: todayLocal,
      customer_name: "",
      invoice_type: "full_elec_special",
      amount_type: "inclusive_of_tax",
      tax_rate: 0.06,
      request_by: defaultRequestBy,
      items: [{ project_code: "", amount: 0, service_content: "" }],
      po: "",
      notes: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // 搜索客户（用于客户名称自动完成）
  const customerName = form.watch("customer_name");
  const searchKeyword = customerSearchKeyword || customerName || "";
  const { data: customersData, isLoading: isLoadingCustomers } = useCustomers({
    keyword: searchKeyword.length > 0 ? searchKeyword : undefined, // 只在有输入时搜索
    page_size: 10,
  });

  const customers = customersData?.customers || [];
  
  // 当对话框打开时，重置搜索状态并填充默认申请人
  useEffect(() => {
    if (open) {
      setCustomerSearchKeyword("");
      setShowCustomerSuggestions(false);
      const d = new Date();
      form.reset({
        request_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        customer_name: "",
        invoice_type: "full_elec_special",
        amount_type: "inclusive_of_tax",
        tax_rate: 0.06,
        request_by: defaultRequestBy,
        items: [{ project_code: "", amount: 0, service_content: "" }],
        po: "",
        notes: "",
      });
    }
  }, [open, defaultRequestBy]);

  const onSubmit = async (values: CreateInvoiceRequestFormValues) => {
    try {
      await createMutation.mutateAsync({
        request_date: values.request_date,
        customer_name: values.customer_name,
        invoice_type: values.invoice_type,
        amount_type: values.amount_type,
        tax_rate: values.tax_rate,
        items: values.items as any,
        po: values.po,
        request_by: values.request_by,
        notes: values.notes,
      });

      form.reset();
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      // 错误已在 mutation 中处理
    }
  };

  const amountType = form.watch("amount_type") ?? "inclusive_of_tax";
  const taxRate = form.watch("tax_rate") ?? 0.06;
  const items = form.watch("items") ?? [];
  const totalAmountInclusive = items.reduce((sum, item) => {
    const am = item.amount || 0;
    const inc = amountType === "inclusive_of_tax" ? am : am * (1 + taxRate);
    return sum + inc;
  }, 0);
  const totalAmount = Math.round(totalAmountInclusive * 100) / 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>提交开票申请</DialogTitle>
          <DialogDescription>
            填写开票申请信息，支持多个项目编号（最多20个）
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
                      <Input {...field} placeholder="默认当前登录用户，可修改" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                          onFocus={() => {
                            if (field.value) {
                              setShowCustomerSuggestions(true);
                            }
                          }}
                          onBlur={() => {
                            setTimeout(() => setShowCustomerSuggestions(false), 200);
                          }}
                        />
                        {showCustomerSuggestions && customers.length > 0 && (
                          <div
                            className="absolute left-0 top-full z-[100] mt-1 w-full rounded-md border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/50 max-h-60 overflow-auto"
                            role="listbox"
                            aria-label="客户名称建议"
                          >
                            {customers.map((customer) => (
                              <div
                                key={customer.id}
                                role="option"
                                className="cursor-pointer px-3 py-2 text-sm text-slate-900 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  field.onChange(customer.customer_name);
                                  setCustomerSearchKeyword("");
                                  setShowCustomerSuggestions(false);
                                }}
                              >
                                <div className="font-medium">{customer.customer_name}</div>
                                {customer.customer_code && (
                                  <div className="text-xs text-slate-500">
                                    {customer.customer_code}
                                  </div>
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
            </div>

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
                        {...field}
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

            {/* 项目明细列表 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FormLabel>开票明细 *（最多20个项目）</FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (fields.length < 20) {
                      append({ project_code: "", amount: 0, service_content: "" });
                    } else {
                      toast({
                        title: "提示",
                        description: "最多只能添加20个项目",
                        variant: "default",
                      });
                    }
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
                      render={({ field }) => (
                        <FormItem className="col-span-3">
                          <FormControl>
                            <Input {...field} placeholder="项目编号" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.amount`}
                      render={({ field }) => {
                        const am = field.value || 0;
                        const inc = amountType === "inclusive_of_tax" ? am : Math.round(am * (1 + taxRate) * 100) / 100;
                        return (
                          <FormItem className="col-span-3">
                            <FormLabel className="sr-only">金额{amountType === "exclusive_of_tax" ? "（不含税）" : "（含税）"}</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                {...field}
                                value={field.value}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
                      render={({ field }) => (
                        <FormItem className="col-span-5">
                          <FormControl>
                            <Input {...field} placeholder="服务内容" />
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

              <div className="text-right text-sm font-medium">
                总金额（含税）: ¥{totalAmount.toLocaleString()}
              </div>
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>备注</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="其他说明信息" rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "提交中..." : "提交申请"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
