/**
 * 发票列表组件
 * 职责：显示发票列表，支持筛选、搜索、分页；按时间维度汇总开票/收款
 */

import { useState, useMemo } from "react";
import { useInvoices } from "../model/useInvoices";
import { invoicesApi } from "../api/invoicesApi";
import type { InvoiceStatus } from "@/entities/finance/domain";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Search, Plus, Edit, Trash2, Eye, Upload, DollarSign, Download } from "lucide-react";
import { downloadInvoiceFile } from "@/shared/services/fileStorage";
import { downloadXlsx } from "@/shared/lib/exportXlsx";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { EditInvoiceDialog } from "./EditInvoiceDialog";
import { ViewInvoiceDialog } from "./ViewInvoiceDialog";
import { ImportInvoicesDialog } from "./ImportInvoicesDialog";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { useDeleteInvoice } from "../model/useInvoices";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { TimeRangeSelect } from "@/shared/ui/time-range-select";
import { getStartEndForPeriod, type DateRangePeriod } from "@/shared/lib/dateRange";
import { useFeishuContext } from "@cn-kis/feishu-sdk";
import { FINANCE_PERMS } from "@/shared/lib/financePermissions";

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "草稿",
  issued: "已开票",
  paid: "已收款",
  partial: "部分收款",
  overdue: "逾期",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<InvoiceStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  issued: "default",
  paid: "default",
  partial: "secondary",
  overdue: "destructive",
  cancelled: "outline",
};

interface InvoiceListProps {
  onInvoiceSelect?: (invoice: any) => void;
}

export function InvoiceList({ onInvoiceSelect }: InvoiceListProps) {
  const { hasPermission } = useFeishuContext();
  const canManageInvoice = hasPermission(FINANCE_PERMS.invoiceCreate);
  const canRecordPayment = hasPermission(FINANCE_PERMS.paymentCreate);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [projectCodeFilter, setProjectCodeFilter] = useState("");
  const [customerNameFilter, setCustomerNameFilter] = useState("");
  const [amountFilter, setAmountFilter] = useState<number | null>(null);
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<number | null>(null);
  const [recordPaymentDialogOpen, setRecordPaymentDialogOpen] = useState(false);
  const [invoiceForPayment, setInvoiceForPayment] = useState<any>(null);
  const [exporting, setExporting] = useState(false);
  /** 导出维度：按发票号（金额=发票金额）| 按项目（金额=项目开票金额） */
  const [exportDimension, setExportDimension] = useState<"by_invoice" | "by_project">("by_invoice");
  const [timePeriod, setTimePeriod] = useState<DateRangePeriod>("year");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const { startDate, endDate } = useMemo(
    () => getStartEndForPeriod(timePeriod, customStart, customEnd),
    [timePeriod, customStart, customEnd]
  );

  const { data: summaryData } = useInvoices({
    page: 1,
    page_size: 99999,
    start_date: startDate,
    end_date: endDate,
  });

  const invoiceSummary = useMemo(() => {
    const list = summaryData?.invoices ?? [];
    const count = list.length;
    const revenueTotal = list.reduce((s, inv) => s + (inv.revenue_amount ?? 0), 0);
    const paidTotal = list.reduce((s, inv) => s + (inv.payment_amount ?? 0), 0);
    return {
      count,
      revenueTotal,
      paidTotal,
      unpaidTotal: revenueTotal - paidTotal,
    };
  }, [summaryData]);

  const { data, isLoading, error, refetch } = useInvoices({
    page,
    page_size: pageSize,
    project_code: projectCodeFilter || undefined,
    customer_name: customerNameFilter || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    revenue_amount: amountFilter || undefined,
    start_date: startDate,
    end_date: endDate,
  });

  const deleteMutation = useDeleteInvoice();

  const handleView = (invoice: any) => {
    setSelectedInvoice(invoice);
    setViewDialogOpen(true);
  };

  const handleEdit = (invoice: any) => {
    setSelectedInvoice(invoice);
    setEditDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    setInvoiceToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleRecordPayment = (invoice: any) => {
    setInvoiceForPayment(invoice);
    setRecordPaymentDialogOpen(true);
  };

  const confirmDelete = () => {
    if (invoiceToDelete) {
      deleteMutation.mutate(invoiceToDelete, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setInvoiceToDelete(null);
        },
      });
    }
  };

  // 导出发票数据（仅 Excel）：按当前筛选导出全部；维度可选「按发票号」或「按项目」
  const handleExport = async () => {
    const totalRecords = data?.total_records ?? 0;
    if (totalRecords === 0) {
      alert("暂无数据可导出");
      return;
    }
    setExporting(true);
    try {
      const pageSize = Math.min(totalRecords, 50000);
      const res = await invoicesApi.getInvoices({
        page: 1,
        page_size: pageSize,
        project_code: projectCodeFilter || undefined,
        customer_name: customerNameFilter || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        revenue_amount: amountFilter || undefined,
      });
      const allInvoices = res?.invoices ?? [];

      const headers = [
        "发票号码",
        "开票日期",
        "客户名称",
        "项目编号",
        "开票内容",
        "开票金额",
        "发票类型",
        "我司名称",
        "PO号",
        "账期（天）",
        "客户经理",
        "开票状态",
        "收款状态",
        "收款金额",
        "收款日期",
        "创建时间",
      ];

      const safeDate = (v: any) => {
        if (!v) return "-";
        try {
          const d = new Date(v);
          return isNaN(d.getTime()) ? "-" : format(d, "yyyy-MM-dd", { locale: zhCN });
        } catch {
          return "-";
        }
      };
      const safeDateTime = (v: any) => {
        if (!v) return "-";
        try {
          const d = new Date(v);
          return isNaN(d.getTime()) ? "-" : format(d, "yyyy-MM-dd HH:mm", { locale: zhCN });
        } catch {
          return "-";
        }
      };

      const rows: (string | number)[][] = [];
      const byInvoice = exportDimension === "by_invoice";

      for (const invoice of allInvoices) {
        const invoiceStatus = STATUS_LABEL[invoice.status] ?? invoice.status ?? "-";
        let paymentStatus = "未收款";
        if (invoice.payment_amount != null) {
          paymentStatus =
            invoice.payment_amount >= (invoice.revenue_amount || 0) ? "已收款" : "部分收款";
        }

        if (byInvoice) {
          // 按发票号：一行一张发票，项目编号用顿号连接，金额=发票金额
          const projectCodes =
            invoice.invoice_items?.length > 0
              ? invoice.invoice_items.map((item: any) => item.project_code ?? "-").join("、")
              : (invoice.project_code ?? "-");
          rows.push([
            invoice.invoice_no ?? "-",
            safeDate(invoice.invoice_date),
            invoice.customer_name ?? "-",
            projectCodes,
            invoice.invoice_content ?? "-",
            invoice.revenue_amount ?? 0,
            invoice.invoice_type ?? "-",
            invoice.company_name ?? "-",
            invoice.po ?? "-",
            invoice.payment_term ?? "-",
            invoice.sales_manager ?? "-",
            invoiceStatus,
            paymentStatus,
            invoice.payment_amount ?? 0,
            safeDate(invoice.payment_date),
            safeDateTime(invoice.created_at),
          ]);
        } else {
          // 按项目：一行一个项目，开票金额=该项目金额，收款金额按项目比例拆分
          const revenueTotal = invoice.revenue_amount ?? 0;
          const paymentTotal = invoice.payment_amount ?? 0;
          const items =
            invoice.invoice_items?.length > 0
              ? invoice.invoice_items.map((item: any) => ({
                  project_code: item.project_code ?? "-",
                  amount: item.amount ?? 0,
                }))
              : [{ project_code: invoice.project_code ?? "-", amount: revenueTotal }];
          for (const item of items) {
            const ratio = revenueTotal > 0 ? item.amount / revenueTotal : 0;
            const paymentForItem = Math.round(paymentTotal * ratio * 100) / 100;
            rows.push([
              invoice.invoice_no ?? "-",
              safeDate(invoice.invoice_date),
              invoice.customer_name ?? "-",
              item.project_code,
              invoice.invoice_content ?? "-",
              item.amount,
              invoice.invoice_type ?? "-",
              invoice.company_name ?? "-",
              invoice.po ?? "-",
              invoice.payment_term ?? "-",
              invoice.sales_manager ?? "-",
              invoiceStatus,
              paymentStatus,
              paymentForItem,
              safeDate(invoice.payment_date),
              safeDateTime(invoice.created_at),
            ]);
          }
        }
      }

      const timestamp = new Date().toISOString().split("T")[0];
      const suffix = byInvoice ? "按发票" : "按项目";
      const filename = `发票管理_${suffix}_${timestamp}`;
      downloadXlsx({ filename, sheetName: "发票管理", headers, rows });
    } catch (error) {
      console.error("导出失败:", error);
      alert("导出失败，请重试");
    } finally {
      setExporting(false);
    }
  };

  const invoices = data?.invoices || [];
  const totalPages = data?.total_pages || 0;
  const totalRecords = data?.total_records || 0;

  // 分页处理
  const buildPageItems = (currentPage: number, totalPages: number): Array<number | "..."> => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const items: Array<number | "..."> = [];
    items.push(1);
    const left = Math.max(2, currentPage - 1);
    const right = Math.min(totalPages - 1, currentPage + 1);
    if (left > 2) items.push("...");
    for (let p = left; p <= right; p++) items.push(p);
    if (right < totalPages - 1) items.push("...");
    items.push(totalPages);
    return items;
  };

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        加载失败: {error instanceof Error ? error.message : "未知错误"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 时间维度 + 汇总 */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <TimeRangeSelect
            period={timePeriod}
            onPeriodChange={setTimePeriod}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-md bg-white border border-slate-200 p-3">
            <div className="text-xs text-slate-500 mb-1">开票张数</div>
            <div className="text-lg font-semibold text-slate-800">{invoiceSummary.count} 张</div>
          </div>
          <div className="rounded-md bg-white border border-slate-200 p-3">
            <div className="text-xs text-slate-500 mb-1">开票金额</div>
            <div className="text-lg font-semibold text-slate-800">¥{invoiceSummary.revenueTotal.toLocaleString()}</div>
          </div>
          <div className="rounded-md bg-white border border-slate-200 p-3">
            <div className="text-xs text-slate-500 mb-1">已收款金额</div>
            <div className="text-lg font-semibold text-slate-800">¥{invoiceSummary.paidTotal.toLocaleString()}</div>
          </div>
          <div className="rounded-md bg-white border border-slate-200 p-3">
            <div className="text-xs text-slate-500 mb-1">待收款金额</div>
            <div className="text-lg font-semibold text-slate-800">¥{invoiceSummary.unpaidTotal.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {!canManageInvoice && (
        <p className="text-xs text-muted-foreground rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          当前为只读查看：可检索与导出；新增、编辑、删除及收款登记由财务人员操作。
        </p>
      )}

      {/* 搜索和筛选栏 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索项目编号、客户名称、金额..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                const term = e.target.value.trim();
                
                // 判断输入类型
                if (term.match(/^C\d+/)) {
                  // 项目编号
                  setProjectCodeFilter(term);
                  setCustomerNameFilter("");
                  setAmountFilter(null);
                } else if (term.match(/^\d+(\.\d+)?$/)) {
                  // 纯数字，可能是金额
                  const amount = parseFloat(term);
                  if (!isNaN(amount) && amount > 0) {
                    setAmountFilter(amount);
                    setProjectCodeFilter("");
                    setCustomerNameFilter("");
                  } else {
                    setAmountFilter(null);
                  }
                } else if (term.length > 0) {
                  // 其他文本，可能是客户名称
                  setCustomerNameFilter(term);
                  setProjectCodeFilter("");
                  setAmountFilter(null);
                } else {
                  // 清空所有筛选
                  setProjectCodeFilter("");
                  setCustomerNameFilter("");
                  setAmountFilter(null);
                }
              }}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as InvoiceStatus | "all")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="发票状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManageInvoice && (
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              批量导入
            </Button>
          )}
          <Select
            value={exportDimension}
            onValueChange={(v) => setExportDimension(v as "by_invoice" | "by_project")}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="by_invoice">按发票号导出（金额=发票金额）</SelectItem>
              <SelectItem value="by_project">按项目导出（开票/收款金额按项目拆分）</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => handleExport()} disabled={exporting}>
            <Download className="mr-2 h-4 w-4" />
            {exporting ? "导出中…" : "导出Excel"}
          </Button>
          {canManageInvoice && (
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              新增发票
            </Button>
          )}
        </div>
      </div>

      {/* 发票列表 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>发票号码</TableHead>
              <TableHead>开票日期</TableHead>
              <TableHead>客户名称</TableHead>
              <TableHead>项目编号</TableHead>
              <TableHead>收入金额</TableHead>
              <TableHead>到账日期</TableHead>
              <TableHead>到账金额</TableHead>
              <TableHead>客户经理</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <span className="ml-2">加载中...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.invoice_no}</TableCell>
                  <TableCell>
                    {invoice.invoice_date
                      ? format(new Date(invoice.invoice_date), "yyyy-MM-dd", { locale: zhCN })
                      : "-"}
                  </TableCell>
                  <TableCell>{invoice.customer_name}</TableCell>
                  <TableCell>
                    {invoice.invoice_items && invoice.invoice_items.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {invoice.invoice_items.map((item: any, idx: number) => (
                          <span key={idx} className="text-sm">
                            {item.project_code}
                            {item.amount && (
                              <span className="text-muted-foreground ml-1">
                                (¥{item.amount.toLocaleString()})
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      invoice.project_code || "-"
                    )}
                  </TableCell>
                  <TableCell>¥{invoice.revenue_amount.toLocaleString()}</TableCell>
                  <TableCell>
                    {invoice.payment_date
                      ? format(new Date(invoice.payment_date), "yyyy-MM-dd", { locale: zhCN })
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {invoice.payment_amount ? (
                      <div className="flex flex-col">
                        <span className="text-green-600">¥{invoice.payment_amount.toLocaleString()}</span>
                        {invoice.payment_amount < invoice.revenue_amount && (
                          <span className="text-xs text-muted-foreground">
                            剩余: ¥{(invoice.revenue_amount - invoice.payment_amount).toLocaleString()}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">未收款</span>
                    )}
                  </TableCell>
                  <TableCell>{invoice.sales_manager}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLOR[invoice.status]}>
                      {STATUS_LABEL[invoice.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleView(invoice)}
                        title="查看详情"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {/* 收款按钮：当发票未完全收款时显示 */}
                      {canRecordPayment &&
                       (invoice.status === 'issued' || invoice.status === 'partial') &&
                       (invoice.revenue_amount - (invoice.payment_amount || 0) > 0) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRecordPayment(invoice)}
                          title="记录收款"
                          className="text-green-600 hover:text-green-700"
                        >
                          <DollarSign className="h-4 w-4" />
                        </Button>
                      )}
                      {canManageInvoice && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(invoice)}
                          title="编辑"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {canManageInvoice && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(invoice.id)}
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            共 {totalRecords} 条记录，第 {page} / {totalPages} 页
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              上一页
            </Button>
            <div className="flex items-center gap-1">
              {buildPageItems(page, totalPages).map((item, index) => (
                <Button
                  key={index}
                  variant={item === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => typeof item === "number" && setPage(item)}
                  disabled={item === "..."}
                >
                  {item}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* 对话框 */}
      <CreateInvoiceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          setCreateDialogOpen(false);
        }}
      />

      <ImportInvoicesDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={() => {
          setImportDialogOpen(false);
          refetch();
        }}
      />

      <EditInvoiceDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        invoice={selectedInvoice}
        onSuccess={() => {
          setEditDialogOpen(false);
          setSelectedInvoice(null);
        }}
      />

      <ViewInvoiceDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        invoice={selectedInvoice}
      />

      {invoiceForPayment && (
        <RecordPaymentDialog
          open={recordPaymentDialogOpen}
          onOpenChange={setRecordPaymentDialogOpen}
          invoice={invoiceForPayment}
          onSuccess={() => {
            setRecordPaymentDialogOpen(false);
            setInvoiceForPayment(null);
            // 刷新列表
            if (refetch) refetch();
          }}
        />
      )}

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这张发票吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
