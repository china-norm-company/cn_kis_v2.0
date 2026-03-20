/**
 * 批量导入客户对话框
 * 支持从CSV/Excel文件导入客户信息
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Upload, FileText, X, CheckCircle2, AlertCircle } from "lucide-react";
import { useCreateCustomer } from "../model/useCustomers";
import { useToast } from "@/shared/ui/use-toast";
import * as XLSX from "xlsx";

interface ImportCustomersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CustomerRow {
  customer_code?: string;
  customer_name: string;
  short_name?: string;
  payment_term_days: number;
  payment_term_description?: string;
  remark?: string;
  is_active?: boolean;
}

export function ImportCustomersDialog({ open, onOpenChange }: ImportCustomersDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<CustomerRow[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const createMutation = useCreateCustomer();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // 标准列名映射
  const standardColumns = {
    customer_code: "客户编号",
    customer_name: "客户名称",
    short_name: "客户简称",
    payment_term_days: "账期（天）",
    payment_term_description: "账期描述",
    remark: "备注",
    is_active: "状态",
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setPreviewData([]);
    setHeaderMapping({});
    setImportResult(null);

    try {
      const data = await parseFile(selectedFile);
      if (data.length === 0) {
        toast({
          title: "文件解析失败",
          description: "文件中没有找到数据",
          variant: "destructive",
        });
        return;
      }

      // 自动识别列名映射
      const firstRow = data[0];
      const detectedMapping: Record<string, string> = {};
      
      Object.keys(standardColumns).forEach((key) => {
        const standardName = standardColumns[key as keyof typeof standardColumns];
        // 尝试匹配中文列名
        const matchedKey = Object.keys(firstRow).find(
          (k) => k === standardName || k.includes(standardName) || standardName.includes(k)
        );
        if (matchedKey) {
          detectedMapping[matchedKey] = key;
        }
      });

      setHeaderMapping(detectedMapping);
      setPreviewData(data.slice(0, 10) as any); // 只预览前10行
    } catch (error) {
      console.error("文件解析失败:", error);
      toast({
        title: "文件解析失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    }
  };

  const parseFile = async (file: File): Promise<Record<string, any>[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          resolve(jsonData);
        } catch (error) {
          reject(new Error("文件格式错误，请确保是有效的Excel或CSV文件"));
        }
      };
      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleImport = async () => {
    if (!file || previewData.length === 0) {
      toast({
        title: "请先选择文件",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setImportResult(null);

    try {
      // 重新解析完整文件
      const allData = await parseFile(file);
      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < allData.length; i++) {
        const row = allData[i];
        try {
          // 映射数据
          const customerData: CustomerRow = {
            customer_code: getMappedValue(row, "customer_code"),
            customer_name: getMappedValue(row, "customer_name") || "",
            short_name: getMappedValue(row, "short_name"),
            payment_term_days: parseFloat(getMappedValue(row, "payment_term_days") || "30") || 30,
            payment_term_description: getMappedValue(row, "payment_term_description"),
            remark: getMappedValue(row, "remark"),
            is_active: parseActiveStatus(getMappedValue(row, "is_active")),
          };

          // 验证必填字段
          if (!customerData.customer_name) {
            throw new Error(`第${i + 2}行：客户名称不能为空`);
          }

          // 创建客户
          await createMutation.mutateAsync(customerData);
          successCount++;
        } catch (error) {
          failedCount++;
          const errorMsg = error instanceof Error ? error.message : "未知错误";
          errors.push(`第${i + 2}行：${errorMsg}`);
          if (errors.length <= 10) {
            // 只保留前10个错误
          }
        }
      }

      setImportResult({
        success: successCount,
        failed: failedCount,
        errors: errors.slice(0, 10),
      });

      if (successCount > 0) {
        queryClient.invalidateQueries({ queryKey: ["finance-customers"] });
        toast({
          title: "导入完成",
          description: `成功导入 ${successCount} 条客户记录${failedCount > 0 ? `，失败 ${failedCount} 条` : ""}`,
        });
      }

      if (failedCount > 0 && successCount === 0) {
        toast({
          title: "导入失败",
          description: `所有记录导入失败，请检查数据格式`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("导入失败:", error);
      toast({
        title: "导入失败",
        description: error instanceof Error ? error.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getMappedValue = (row: Record<string, any>, key: string): string | undefined => {
    // 先尝试使用映射的列名
    const mappedKey = Object.keys(headerMapping).find((k) => headerMapping[k] === key);
    if (mappedKey && row[mappedKey] !== undefined) {
      return String(row[mappedKey]).trim() || undefined;
    }
    // 如果没有映射，尝试直接使用标准列名
    const standardName = standardColumns[key as keyof typeof standardColumns];
    if (row[standardName] !== undefined) {
      return String(row[standardName]).trim() || undefined;
    }
    // 最后尝试使用key本身
    if (row[key] !== undefined) {
      return String(row[key]).trim() || undefined;
    }
    return undefined;
  };

  const parseActiveStatus = (value?: string): boolean => {
    if (!value) return true;
    const lower = value.toLowerCase().trim();
    return lower === "启用" || lower === "active" || lower === "1" || lower === "true" || lower === "是";
  };

  const handleClose = () => {
    setFile(null);
    setPreviewData([]);
    setHeaderMapping({});
    setImportResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>批量导入客户</DialogTitle>
          <DialogDescription>
            支持导入Excel (.xlsx, .xls) 或CSV文件。文件应包含以下列：客户编号（可选，不填则自动生成）、客户名称、客户简称（可选）、账期（天）、账期描述（可选）、备注（可选）、状态（可选，默认启用）。注意：客户编号可以重复，同一客户的不同公司可使用相同编号。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 文件选择 */}
          <div className="space-y-2">
            <Label>选择文件</Label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="flex-1"
              />
              {file && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{file.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFile(null);
                      setPreviewData([]);
                      setHeaderMapping({});
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* 列名映射提示 */}
          {Object.keys(headerMapping).length > 0 && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium mb-2">已识别的列名映射：</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(headerMapping).map(([fileCol, standardCol]) => (
                  <div key={fileCol} className="flex items-center gap-2">
                    <span className="text-muted-foreground">{fileCol}</span>
                    <span>→</span>
                    <span className="font-medium">{standardColumns[standardCol as keyof typeof standardColumns]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 数据预览 */}
          {previewData.length > 0 && (
            <div className="space-y-2">
              <Label>数据预览（前10行）</Label>
              <div className="rounded-md border max-h-64 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">客户编号</th>
                      <th className="p-2 text-left">客户名称</th>
                      <th className="p-2 text-left">客户简称</th>
                      <th className="p-2 text-left">账期（天）</th>
                      <th className="p-2 text-left">账期描述</th>
                      <th className="p-2 text-left">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2">{row.customer_code || "-"}</td>
                        <td className="p-2">{row.customer_name || "-"}</td>
                        <td className="p-2">{row.short_name || "-"}</td>
                        <td className="p-2">{row.payment_term_days || "-"}</td>
                        <td className="p-2">{row.payment_term_description || "-"}</td>
                        <td className="p-2">{row.is_active !== false ? "启用" : "禁用"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 导入结果 */}
          {importResult && (
            <div className="rounded-md border p-4 space-y-2">
              <div className="flex items-center gap-2">
                {importResult.failed === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                )}
                <span className="font-medium">
                  导入完成：成功 {importResult.success} 条，失败 {importResult.failed} 条
                </span>
              </div>
              {importResult.errors.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-1">错误详情（前10条）：</p>
                  <ul className="list-disc list-inside space-y-1">
                    {importResult.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            取消
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || previewData.length === 0 || isProcessing}
          >
            {isProcessing ? "导入中..." : "开始导入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
