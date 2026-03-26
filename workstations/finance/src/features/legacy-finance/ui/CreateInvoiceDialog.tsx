/**
 * 创建发票对话框
 */

import { useState, useEffect } from "react";
import { getApiMode } from "@/shared/config/env";
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
import { Upload, X } from "lucide-react";
import { useCreateInvoice } from "../model/useInvoices";
import { Loader2, Search, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { projectsApi } from "../api/projectsApiStub";
import { customersApi } from "../api/customersApi";
import { findCustomerByName } from "../api/customersStorage";
import { useToast } from "@/shared/ui/use-toast";
import { useFindCustomerByName } from "../model/useCustomers";
import { saveInvoiceFile } from "@/shared/services/fileStorage";

const createInvoiceSchema = z.object({
  invoice_no: z.string().min(1, "发票号码不能为空"),
  invoice_date: z.string().min(1, "开票日期不能为空"),
  customer_name: z.string().min(1, "客户名称不能为空"),
  invoice_content: z.string().min(1, "开票内容不能为空"),
  invoice_currency: z.string().optional(),
  invoice_amount_tax_included: z.number().optional(),
  revenue_amount: z.number().min(0.01, "收入金额必须大于0"),
  invoice_type: z.enum(["全电专票", "全电普票", "形式发票"]),
  company_name: z.string().min(1, "我司名称不能为空"),
  project_code: z.string().min(1, "项目编号不能为空"),
  project_id: z.number().optional(),
  po: z.string().optional(),
  payment_term: z.number().optional(),
  sales_manager: z.string().min(1, "客户经理不能为空"),
  invoice_percentage: z.number().optional(), // 发票金额占项目总金额的比例（如 50 表示 50%）
  invoice_items: z.array(z.object({
    project_code: z.string(),
    project_id: z.number().optional(),
    amount: z.number(),
    service_content: z.string().optional(),
  })).optional(), // 发票明细（支持多个项目，最多20个）
});

type CreateInvoiceFormValues = z.infer<typeof createInvoiceSchema>;

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (invoice?: any) => void;
  invoiceRequest?: any; // 开票申请（用于自动填充）
}

export function CreateInvoiceDialog({ open, onOpenChange, onSuccess, invoiceRequest }: CreateInvoiceDialogProps) {
  const createMutation = useCreateInvoice();
  const { toast } = useToast();
  const [electronicInvoiceFile, setElectronicInvoiceFile] = useState<File | null>(null);
  const [electronicInvoiceFileName, setElectronicInvoiceFileName] = useState<string>("");

  const form = useForm<CreateInvoiceFormValues>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      invoice_no: "",
      invoice_date: "",
      customer_name: "",
      invoice_content: "",
      invoice_currency: "CNY",
      invoice_amount_tax_included: undefined,
      revenue_amount: 0,
      invoice_type: "全电专票",
      company_name: "复硕正态",
      project_code: "",
      project_id: undefined,
      po: "",
      payment_term: undefined,
      sales_manager: "",
      invoice_percentage: undefined,
      invoice_items: undefined,
    },
  });

  const projectCode = form.watch("project_code");
  const customerName = form.watch("customer_name");
  const [isSearchingProject, setIsSearchingProject] = useState(false);
  
  // 根据客户名称查找客户信息（用于自动填充账期）
  const { data: financeCustomer } = useFindCustomerByName(customerName || "");

  // 获取项目详情（当输入项目编号时，延迟搜索）
  const { data: projectDetail, isLoading: isLoadingProject } = useQuery({
    queryKey: ["project", "byCode", projectCode],
    queryFn: async () => {
      if (!projectCode || projectCode.length < 3) return null;
      
      setIsSearchingProject(true);
      try {
        // 提取纯项目编号（去掉百分比部分，如 "C191914-50%" -> "C191914"）
        const cleanProjectCode = projectCode.split('-')[0].trim();
        
        // 提取百分比（如果有，如 "C191914-50%" -> 50）
        const percentageMatch = projectCode.match(/-(\d+(?:\.\d+)?)%/);
        const percentage = percentageMatch ? parseFloat(percentageMatch[1]) : undefined;
        
        // 如果有百分比，保存到表单中
        if (percentage !== undefined) {
          form.setValue("invoice_percentage", percentage);
        }
        
        // 更新项目编号为纯编号（不含百分比）
        if (cleanProjectCode !== projectCode) {
          form.setValue("project_code", cleanProjectCode);
        }
        
        // 搜索项目（使用纯项目编号）
        const result = await projectsApi.listFull({ keyword: cleanProjectCode, pageSize: 10 });
        const list = (result as any)?.projects ?? (result as any)?.data ?? [];
        if (!Array.isArray(list) || list.length === 0) return null;
        // 尝试精确匹配项目编号
        const project = list.find(
          (p: { project_no?: string; opportunity_no?: string }) =>
            p.project_no === cleanProjectCode ||
            p.opportunity_no === cleanProjectCode ||
            (p.project_no && cleanProjectCode.includes(p.project_no)) ||
            (p.opportunity_no && cleanProjectCode.includes(p.opportunity_no))
        );
        return project || list[0] || null;
      } catch (error) {
        console.error("搜索项目失败:", error);
        return null;
      } finally {
        setIsSearchingProject(false);
      }
    },
    enabled: !!projectCode && projectCode.length >= 3 && open,
    staleTime: 30000, // 30秒内不重新搜索
  });

  // 获取客户信息（当项目有sponsor_no时）
  const { data: customerData } = useQuery({
    queryKey: ["customer", "bySponsorNo", projectDetail?.sponsor_no],
    queryFn: async () => {
      if (!projectDetail?.sponsor_no) return null;
      
      try {
        const result = await (customersApi as any).list({ keyword: projectDetail.sponsor_no });
        // 优先匹配客户编号，否则返回第一个结果
        return result.find(c => c.extended_attributes?.customer_no === projectDetail.sponsor_no) || result[0] || null;
      } catch (error) {
        // 在mock模式下可能会失败，静默处理
        console.warn("获取客户信息失败:", error);
        return null;
      }
    },
    enabled: !!projectDetail?.sponsor_no && open,
    retry: false,
  });

  // 当客户管理中有该客户时，自动填充账期（从客户管理导入）
  useEffect(() => {
    if (financeCustomer != null && typeof financeCustomer.payment_term_days === "number") {
      const currentPaymentTerm = form.getValues("payment_term");
      // 只有当账期为空或未设置时才自动填充，避免覆盖用户手动输入（含 0 也视为有效账期）
      if (currentPaymentTerm === undefined || currentPaymentTerm === null || (currentPaymentTerm as unknown) === "") {
        form.setValue("payment_term", financeCustomer.payment_term_days);
      }
    }
  }, [financeCustomer, form]);

  // 当开票申请或项目信息加载完成后，自动填充表单
  useEffect(() => {
    if (open) {
      let filledFields: string[] = [];

      // 优先使用开票申请的信息
      if (invoiceRequest) {
        form.setValue("customer_name", invoiceRequest.customer_name);
        filledFields.push("客户名称");
        // 客户经理默认使用开票申请的申请人
        if (invoiceRequest.request_by) {
          form.setValue("sales_manager", invoiceRequest.request_by);
          filledFields.push("客户经理");
        }
        // 从客户管理（与列表同源 storage）按客户名称查找并填充账期
        if (invoiceRequest.customer_name) {
          const customer = findCustomerByName(invoiceRequest.customer_name);
          if (customer != null && typeof customer.payment_term_days === "number") {
            form.setValue("payment_term", customer.payment_term_days);
            console.log("[创建发票] 从客户管理自动填充账期:", customer.payment_term_days);
          }
        }
        
        if (invoiceRequest.po) {
          form.setValue("po", invoiceRequest.po);
        }
        
        // 如果有多个项目，使用第一个项目作为主项目编号（兼容字段）
        if (invoiceRequest.items && invoiceRequest.items.length > 0) {
          form.setValue("project_code", invoiceRequest.items[0].project_code);
          form.setValue("invoice_content", invoiceRequest.items[0].service_content || "");
          form.setValue("revenue_amount", invoiceRequest.total_amount);
          filledFields.push("项目编号", "开票内容", "金额");
          
          // 构建 invoice_items（无论数量多少都构建，确保数据完整）
          if (invoiceRequest.items.length > 0) {
            const invoiceItems = invoiceRequest.items.map(item => ({
              project_code: item.project_code,
              amount: item.amount,
              service_content: item.service_content || "",
            }));
            form.setValue("invoice_items", invoiceItems);
            console.log('[创建发票] 已设置 invoice_items:', invoiceItems.length, '个项目');
          }
        }
        
        toast({
          title: "已自动填充开票申请信息",
          description: `已填充：${filledFields.join("、")}`,
          duration: 2000,
        });
      } else if (projectDetail) {
        // 从项目信息填充（原有逻辑）
        if (projectDetail.sponsor_name) {
          form.setValue("customer_name", projectDetail.sponsor_name);
          filledFields.push("客户名称");
        } else if (customerData?.name) {
          form.setValue("customer_name", customerData.name);
          filledFields.push("客户名称");
          
          // 尝试从客户管理模块查找账期（异步，不阻塞）
          import("../api/customersApi").then(m => 
            m.customersApi.findCustomerByName(customerData.name)
          ).then(financeCustomer => {
            if (financeCustomer && financeCustomer.payment_term_days) {
              form.setValue("payment_term", financeCustomer.payment_term_days);
              filledFields.push("账期（从客户管理自动填充）");
            }
          }).catch(error => {
            console.warn("查找客户账期失败:", error);
          });
        }

        if (customerData?.extended_attributes?.business_owner?.[0]) {
          form.setValue("sales_manager", customerData.extended_attributes.business_owner[0]);
          filledFields.push("客户经理");
        }

        if (projectDetail.id) {
          form.setValue("project_id", projectDetail.id);
        }

        if (filledFields.length > 0) {
          toast({
            title: "自动填充成功",
            description: `已自动填充：${filledFields.join("、")}`,
            duration: 2000,
          });
        }
      }
    }
  }, [invoiceRequest, projectDetail, customerData, open, form, toast]);

  const onSubmit = async (values: CreateInvoiceFormValues) => {
    try {
      // 如果有开票申请，需要处理多个项目编号
      let invoiceItems;
      if (invoiceRequest && invoiceRequest.items && invoiceRequest.items.length > 0) {
        // 从开票申请生成发票明细（支持多个项目）
        invoiceItems = invoiceRequest.items.map((item: any) => ({
          project_code: item.project_code,
          amount: item.amount,
          service_content: item.service_content || "",
        }));
      } else if (values.invoice_items && values.invoice_items.length > 0) {
        // 如果表单中有 invoice_items（从开票申请自动填充的多个项目）
        invoiceItems = values.invoice_items;
      } else if (values.project_code) {
        // 单个项目（兼容旧数据）
        invoiceItems = [{
          project_code: values.project_code,
          amount: values.revenue_amount,
          service_content: values.invoice_content,
        }];
      } else {
        // 确保 invoiceItems 不为 undefined
        invoiceItems = [{
          project_code: values.project_code || "未知",
          amount: values.revenue_amount,
          service_content: values.invoice_content,
        }];
      }

      // 处理电子发票文件
      let electronicInvoiceFileUrl: string | undefined;
      let electronicInvoiceFileNameValue: string | undefined;
      
      // 先创建发票（不包含文件）
      let invoice = await createMutation.mutateAsync({
        ...values,
        invoice_items: invoiceItems,
        invoice_request_id: invoiceRequest?.id,
        electronic_invoice_file_name: electronicInvoiceFile ? electronicInvoiceFile.name : undefined,
      } as any);
      
      // 如果有电子发票文件，保存文件并更新发票记录
      if (electronicInvoiceFile) {
        electronicInvoiceFileNameValue = electronicInvoiceFile.name;
        
        // 无论是Mock模式还是Real模式，都先保存到本地存储（因为后端可能还没实现文件上传）
        // 这样可以确保文件能够正常下载
        try {
          console.log('[创建发票] 开始保存电子发票文件:', {
            invoice_id: invoice.id,
            file_name: electronicInvoiceFile.name,
            file_size: electronicInvoiceFile.size,
            api_mode: getApiMode(),
          });
          
          const fileId = await saveInvoiceFile(invoice.id, electronicInvoiceFile);
          electronicInvoiceFileUrl = fileId;
          
          console.log('[创建发票] 文件已保存，文件ID:', fileId);
          
          // 更新发票记录，添加文件ID
          // 使用更新API确保数据同步
          const { invoicesApi } = await import("../api/invoicesApi");
          const updatedInvoice = await invoicesApi.updateInvoice({
            id: invoice.id,
            electronic_invoice_file: fileId,
            electronic_invoice_file_name: electronicInvoiceFileNameValue,
          });
          
          console.log('[创建发票] 发票记录已更新:', {
            invoice_id: invoice.id,
            file_id: fileId,
            file_name: electronicInvoiceFileNameValue,
            updated_electronic_invoice_file: updatedInvoice.electronic_invoice_file,
          });
          
          // 验证更新是否成功
          console.log('[创建发票] 验证更新结果:', {
            expected_file_id: fileId,
            actual_file_id: updatedInvoice.electronic_invoice_file,
            match: updatedInvoice.electronic_invoice_file === fileId,
          });
          
          if (!updatedInvoice.electronic_invoice_file || updatedInvoice.electronic_invoice_file !== fileId) {
            console.error('[创建发票] ⚠️ 发票更新后文件ID不匹配:', {
              expected: fileId,
              actual: updatedInvoice.electronic_invoice_file,
              invoice_data: updatedInvoice,
            });
            
            // 尝试再次更新
            console.log('[创建发票] 尝试再次更新发票记录...');
            const retryUpdated = await invoicesApi.updateInvoice({
              id: invoice.id,
              electronic_invoice_file: fileId,
              electronic_invoice_file_name: electronicInvoiceFileNameValue,
            });
            
            if (!retryUpdated.electronic_invoice_file || retryUpdated.electronic_invoice_file !== fileId) {
              throw new Error('发票记录更新失败，文件ID未正确保存（重试后仍然失败）');
            } else {
              console.log('[创建发票] ✅ 重试更新成功');
              invoice = retryUpdated; // 使用更新后的发票数据
            }
          } else {
            invoice = updatedInvoice; // 使用更新后的发票数据
          }
          
          // 等待一下确保数据已保存
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error("[创建发票] 保存电子发票文件失败:", error);
          // 显示错误提示，但不阻止发票创建
          alert(`电子发票文件保存失败：${error instanceof Error ? error.message : '未知错误'}。发票已创建，但电子发票文件未保存，请稍后重新上传。`);
        }
      }
      
      // 等待文件保存完成（如果有文件）
      if (electronicInvoiceFile && getApiMode() !== 'real') {
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // 重新获取最新的发票数据（包含文件ID）
        try {
          const { invoicesApi } = await import("../api/invoicesApi");
          const latestInvoice = await invoicesApi.getInvoiceById(invoice.id);
          if (latestInvoice && latestInvoice.electronic_invoice_file) {
            console.log('[创建发票] 获取最新发票数据成功，文件ID:', latestInvoice.electronic_invoice_file);
            invoice = latestInvoice; // 使用更新后的发票数据
          }
        } catch (error) {
          console.warn('[创建发票] 获取最新发票数据失败:', error);
        }
      }
      
      form.reset();
      setElectronicInvoiceFile(null);
      setElectronicInvoiceFileName("");
      onSuccess?.(invoice);
      onOpenChange(false);
    } catch (error) {
      // 错误已在 mutation 中处理
    }
  };

  // 关闭对话框时重置状态
  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增发票</DialogTitle>
          <DialogDescription>填写发票信息，所有带*的字段为必填项</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="invoice_no"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>发票号码 *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="请输入发票号码" />
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
                name="customer_name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>客户名称 *</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="请输入客户名称" 
                        onChange={(e) => {
                          field.onChange(e);
                          // 当客户名称改变时，自动填充账期（通过 useFindCustomerByName hook 自动处理）
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                    {financeCustomer && financeCustomer.payment_term_days && (
                      <p className="text-xs text-muted-foreground">
                        已自动填充账期：{financeCustomer.payment_term_description || `${financeCustomer.payment_term_days}天`}
                      </p>
                    )}
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
                      <div className="relative">
                        <Input
                          {...field}
                          placeholder="输入项目编号，系统将自动填充相关信息"
                          onChange={(e) => {
                            field.onChange(e);
                          }}
                        />
                        {isLoadingProject && (
                          <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        {projectDetail && !isLoadingProject && (
                          <CheckCircle2 className="absolute right-2 top-2.5 h-4 w-4 text-green-600" />
                        )}
                      </div>
                    </FormControl>
                    {projectDetail && (
                      <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        已找到项目：{projectDetail.project_name || projectDetail.project_no || projectDetail.opportunity_no}，已自动填充客户信息
                      </p>
                    )}
                    {projectCode && projectCode.length >= 3 && !projectDetail && !isLoadingProject && (
                      <p className="text-xs text-muted-foreground mt-1">
                        未找到匹配的项目，请检查项目编号或手动填写
                      </p>
                    )}
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
                      <Input {...field} placeholder="请输入客户经理" />
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                name="company_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>我司名称 *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="如：复硕正态" />
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
                        placeholder="0.00"
                      />
                    </FormControl>
                    <p className="text-xs text-slate-500">用于内部统计与收款匹配，必填</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoice_amount_tax_included"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>开票金额（含税）</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                        placeholder="0.00"
                      />
                    </FormControl>
                    <p className="text-xs text-slate-500">选填，票面含税金额；与收入金额可相同或不同（如价税分离时）</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoice_currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>开票币种</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="如：CNY" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="po"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PO号</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="可选" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="payment_term"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>账期（天）</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                        placeholder="如：30"
                      />
                    </FormControl>
                    <p className="text-xs text-slate-500">客户在客户管理中有维护账期时，会按客户名称自动带出</p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invoice_percentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>发票金额比例（%）</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                        placeholder="如：50（表示50%）"
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      此发票金额占项目总金额的百分比
                    </p>
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
                      <Textarea {...field} placeholder="如：测试服务费" rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 电子发票上传 */}
            <div className="space-y-2">
              <FormLabel>电子发票</FormLabel>
              <div className="flex items-center gap-2">
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
                  className="flex-1"
                />
                {electronicInvoiceFileName && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{electronicInvoiceFileName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setElectronicInvoiceFile(null);
                        setElectronicInvoiceFileName("");
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                支持上传PDF、JPG、PNG格式的电子发票文件
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={createMutation.isPending}
              >
                取消
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                创建
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
