/**
 * 批量导入发票对话框
 * 支持从Excel/CSV导入发票数据
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { useToast } from "@/shared/ui/use-toast";
import { Upload, FileText, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useCreateInvoice } from "../model/useInvoices";
import type { CreateInvoiceRequest } from "../api/invoicesApi";

interface ImportInvoicesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type ImportStep = "upload" | "preview" | "importing" | "success";

interface ParsedInvoice {
  invoice_no: string;
  invoice_date: string;
  customer_name: string;
  invoice_content: string;
  invoice_currency?: string;
  invoice_amount_tax_included?: number;
  revenue_amount: number;
  invoice_type: "专票" | "普票" | "全电专票" | "全电普票";
  company_name: string;
  project_code: string;
  po?: string;
  payment_term?: number;
  sales_manager: string;
  payment_date?: string;
  payment_amount?: number;
  rowIndex: number; // 原始行号
  errors?: string[]; // 验证错误
}

export function ImportInvoicesDialog({ open, onOpenChange, onSuccess }: ImportInvoicesDialogProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [parsedData, setParsedData] = useState<ParsedInvoice[]>([]);
  const [fileName, setFileName] = useState("");
  const { toast } = useToast();
  const createMutation = useCreateInvoice();

  // 解析CSV文件（兼容 UTF-8 BOM、\r\n 换行）
  const parseCSV = (text: string): ParsedInvoice[] => {
    // 去掉 UTF-8 BOM（Excel 另存为 CSV 常带 BOM，导致首列表头无法匹配）
    const raw = text.startsWith("\uFEFF") ? text.slice(1) : text;
    const lines = raw.split(/\r\n|\r|\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    if (lines.length < 2) {
      throw new Error("CSV文件至少需要包含表头和数据行");
    }

    // 解析表头（去掉 BOM 和引号，统一空格）
    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").replace(/"/g, "").replace(/\uFEFF/g, ""));
    
    // 字段映射（支持多种可能的列名）
    const fieldMap: Record<string, string> = {
      "发票号码": "invoice_no",
      "发票号": "invoice_no",
      "开票日期": "invoice_date",
      "日期": "invoice_date",
      "客户名称": "customer_name",
      "客户": "customer_name",
      "开票内容": "invoice_content",
      "内容": "invoice_content",
      "开票币种": "invoice_currency",
      "币种": "invoice_currency",
      "开票金额（含税）": "invoice_amount_tax_included",
      "开票金额": "invoice_amount_tax_included",
      "收入金额": "revenue_amount",
      "金额": "revenue_amount",
      "项目编号": "project_code",
      "项目号": "project_code",
      "PO": "po",
      "PO号": "po",
      "客户经理": "sales_manager",
      "经理": "sales_manager",
      "发票类型": "invoice_type",
      "类型": "invoice_type",
      "我司名称": "company_name",
      "公司名称": "company_name",
      "到账日期": "payment_date",
      "到账金额": "payment_amount",
      "账期": "payment_term",
    };

    const invoices: ParsedInvoice[] = [];
    const errors: Record<number, string[]> = {};

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, "").replace(/""/g, '"'));
      const invoice: Partial<ParsedInvoice> = { rowIndex: i + 1 };

      headers.forEach((header, index) => {
        const normalizedHeader = header.replace(/\uFEFF/g, "").trim();
        const field = fieldMap[normalizedHeader];
        if (field && values[index]) {
          const value = values[index].trim();
          
          // 类型转换
          if (field === "revenue_amount" || field === "invoice_amount_tax_included" || field === "payment_amount") {
            invoice[field] = parseFloat(value) || 0;
          } else if (field === "payment_term") {
            invoice[field] = parseInt(value) || undefined;
          } else {
            invoice[field] = value;
          }
        }
      });

      // 验证必填字段
      const validationErrors: string[] = [];
      if (!invoice.invoice_no) validationErrors.push("发票号码不能为空");
      if (!invoice.invoice_date) validationErrors.push("开票日期不能为空");
      if (!invoice.customer_name) validationErrors.push("客户名称不能为空");
      if (!invoice.project_code) validationErrors.push("项目编号不能为空");
      if (!invoice.revenue_amount || invoice.revenue_amount <= 0) validationErrors.push("收入金额必须大于0");
      if (!invoice.sales_manager) validationErrors.push("客户经理不能为空");
      if (!invoice.invoice_type) {
        // 尝试从其他字段推断
        invoice.invoice_type = "专票"; // 默认值
      }
      if (!invoice.company_name) {
        invoice.company_name = "复硕咨询"; // 默认值
      }

      if (validationErrors.length > 0) {
        errors[i + 1] = validationErrors;
      }

      invoices.push(invoice as ParsedInvoice);
    }

    // 将错误信息附加到数据中
    invoices.forEach((inv) => {
      if (errors[inv.rowIndex]) {
        inv.errors = errors[inv.rowIndex];
      }
    });

    return invoices;
  };

  // 处理文件上传
  const handleFileUpload = (file: File) => {
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
      toast({
        title: "格式错误",
        description: "请上传 .csv 或 .xlsx 文件",
        variant: "destructive",
      });
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event: ProgressEvent<FileReader>) => {
      try {
        const text = (event.target?.result as string) || "";
        const data = parseCSV(text);
        
        if (data.length === 0) {
          toast({
            title: "文件为空",
            description: "CSV文件中没有有效数据",
            variant: "destructive",
          });
          return;
        }

        setParsedData(data);
        setStep("preview");
      } catch (error) {
        toast({
          title: "解析失败",
          description: error instanceof Error ? error.message : "无法解析文件",
          variant: "destructive",
        });
      }
    };

    if (file.name.endsWith(".csv")) {
      reader.readAsText(file, "UTF-8");
    } else {
      // Excel文件需要先转换为CSV
      toast({
        title: "提示",
        description: "请将Excel文件另存为CSV格式后重新上传",
        variant: "default",
      });
    }
  };

  // 批量导入
  const handleImport = async () => {
    const validData = parsedData.filter((item) => !item.errors || item.errors.length === 0);
    
    if (validData.length === 0) {
      toast({
        title: "导入失败",
        description: "没有有效的数据可以导入",
        variant: "destructive",
      });
      return;
    }

    setStep("importing");

    let successCount = 0;
    let failCount = 0;

    for (const item of validData) {
      try {
        const request: CreateInvoiceRequest = {
          invoice_no: item.invoice_no,
          invoice_date: item.invoice_date,
          customer_name: item.customer_name,
          invoice_content: item.invoice_content,
          invoice_currency: item.invoice_currency,
          invoice_amount_tax_included: item.invoice_amount_tax_included,
          revenue_amount: item.revenue_amount,
          invoice_type: item.invoice_type as import('@/entities/finance/domain').InvoiceType,
          company_name: item.company_name,
          project_code: item.project_code,
          po: item.po,
          payment_term: item.payment_term,
          sales_manager: item.sales_manager,
        };

        await createMutation.mutateAsync(request);
        successCount++;
      } catch (error) {
        console.error(`导入第 ${item.rowIndex} 行失败:`, error);
        failCount++;
      }
    }

    setStep("success");
    
    toast({
      title: "导入完成",
      description: `成功导入 ${successCount} 条，失败 ${failCount} 条`,
    });

    setTimeout(() => {
      onSuccess?.();
      handleClose();
    }, 2000);
  };

  const handleClose = () => {
    setStep("upload");
    setParsedData([]);
    setFileName("");
    onOpenChange(false);
  };

  const validCount = parsedData.filter((item) => !item.errors || item.errors.length === 0).length;
  const errorCount = parsedData.length - validCount;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>批量导入发票</DialogTitle>
          <DialogDescription>
            支持从CSV文件批量导入发票数据。请确保CSV文件包含：发票号码、开票日期、客户名称、项目编号、收入金额等字段。
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <Label htmlFor="file-upload" className="cursor-pointer">
                <span className="text-primary font-medium">点击上传文件</span>
                <span className="text-muted-foreground"> 或拖拽文件到此处</span>
              </Label>
              <Input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
              <p className="text-sm text-muted-foreground mt-2">
                支持 CSV、Excel 格式（建议使用CSV格式）
              </p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            {validCount === 0 && errorCount > 0 && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                <p className="font-medium">未识别到有效发票数据</p>
                <p className="mt-1">
                  请确认上传的是<strong>发票数据</strong> CSV，表头包含：<strong>发票号码、开票日期、客户名称、项目编号、收入金额、客户经理</strong> 等列。
                  若文件为「客户管理」等非发票表格，请到「客户管理」标签页导入，或另存为带上述列的发票 CSV 后再导入。
                </p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">文件: {fileName}</p>
                <p className="text-sm text-muted-foreground">
                  共 {parsedData.length} 条数据，有效 {validCount} 条，错误 {errorCount} 条
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant={validCount > 0 ? "default" : "destructive"}>
                  {validCount} 条有效
                </Badge>
                {errorCount > 0 && (
                  <Badge variant="destructive">{errorCount} 条错误</Badge>
                )}
              </div>
            </div>

            <div className="border rounded-lg max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>行号</TableHead>
                    <TableHead>发票号码</TableHead>
                    <TableHead>开票日期</TableHead>
                    <TableHead>客户名称</TableHead>
                    <TableHead>项目编号</TableHead>
                    <TableHead>收入金额</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 50).map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.rowIndex}</TableCell>
                      <TableCell>{item.invoice_no || "-"}</TableCell>
                      <TableCell>{item.invoice_date || "-"}</TableCell>
                      <TableCell>{item.customer_name || "-"}</TableCell>
                      <TableCell>{item.project_code || "-"}</TableCell>
                      <TableCell>
                        {item.revenue_amount ? `¥${item.revenue_amount.toLocaleString()}` : "-"}
                      </TableCell>
                      <TableCell>
                        {item.errors && item.errors.length > 0 ? (
                          <div className="flex items-center gap-1 text-destructive">
                            <XCircle className="h-4 w-4" />
                            <span className="text-xs">{item.errors[0]}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-xs">有效</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {parsedData.length > 50 && (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  仅显示前50条，共 {parsedData.length} 条数据
                </p>
              )}
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">正在导入数据...</p>
            <p className="text-sm text-muted-foreground mt-2">请稍候，不要关闭窗口</p>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="h-12 w-12 text-green-600 mb-4" />
            <p className="text-lg font-medium">导入成功！</p>
            <p className="text-sm text-muted-foreground mt-2">窗口将在2秒后自动关闭</p>
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                取消
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("upload")}>
                重新上传
              </Button>
              <Button onClick={handleImport} disabled={validCount === 0}>
                导入 {validCount} 条有效数据
              </Button>
            </>
          )}
          {step === "importing" && (
            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              导入中...
            </Button>
          )}
          {step === "success" && (
            <Button onClick={handleClose}>完成</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
