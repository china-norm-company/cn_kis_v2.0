/**
 * 开票申请列表
 * 支持按时间维度（本月/本季/本年/自定义）汇总：总申请、已处理、待处理
 */

import { useState, useMemo } from "react";
import { useInvoiceRequests } from "../model/useInvoiceRequests";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { Plus, Search, Eye, Download, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { CreateInvoiceRequestDialog } from "./CreateInvoiceRequestDialog";
import { EditInvoiceRequestDialog } from "./EditInvoiceRequestDialog";
import { ViewInvoiceRequestDialog } from "./ViewInvoiceRequestDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
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
import { TimeRangeSelect } from "@/shared/ui/time-range-select";
import { getStartEndForPeriod, type DateRangePeriod } from "@/shared/lib/dateRange";
import { downloadXlsx } from "@/shared/lib/exportXlsx";
import { invoiceRequestsApi } from "../api/invoiceRequestsApi";
import { useDeleteInvoiceRequest } from "../model/useInvoiceRequests";
import type { InvoiceRequestStatus } from "@/entities/finance/invoice-request-domain";
import type { InvoiceRequest } from "@/entities/finance/invoice-request-domain";

const STATUS_LABEL: Record<InvoiceRequestStatus, string> = {
  pending: "待处理",
  processing: "处理中",
  completed: "已完成",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<InvoiceRequestStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "default",
  processing: "secondary",
  completed: "outline",
  cancelled: "destructive",
};

export function InvoiceRequestList() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvoiceRequestStatus | "all">("all");
  const [timePeriod, setTimePeriod] = useState<DateRangePeriod>("year");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<InvoiceRequest | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<InvoiceRequest | null>(null);
  const [exporting, setExporting] = useState(false);
  const deleteMutation = useDeleteInvoiceRequest();

  const { startDate, endDate } = useMemo(
    () => getStartEndForPeriod(timePeriod, customStart, customEnd),
    [timePeriod, customStart, customEnd]
  );

  const { data: summaryData } = useInvoiceRequests({
    page: 1,
    page_size: 99999,
    start_date: startDate,
    end_date: endDate,
  });

  const summary = useMemo(() => {
    const list = summaryData?.requests ?? [];
    const totalCount = list.length;
    const totalAmount = list.reduce((s, r) => s + (r.total_amount ?? 0), 0);
    const processed = list.filter((r) => r.status === "completed");
    const pending = list.filter((r) => r.status === "pending" || r.status === "processing");
    return {
      totalCount,
      totalAmount,
      processedCount: processed.length,
      processedAmount: processed.reduce((s, r) => s + (r.total_amount ?? 0), 0),
      pendingCount: pending.length,
      pendingAmount: pending.reduce((s, r) => s + (r.total_amount ?? 0), 0),
    };
  }, [summaryData]);

  const { data, isLoading, error } = useInvoiceRequests({
    page,
    page_size: pageSize,
    status: statusFilter !== "all" ? statusFilter : undefined,
    customer_name: searchTerm || undefined,
    start_date: startDate,
    end_date: endDate,
  });

  const requests = data?.requests || [];
  const totalPages = data?.total_pages || 0;
  const totalRecords = data?.total_records ?? summary.totalCount ?? 0;

  const handleExport = async () => {
    if (totalRecords === 0) {
      alert("暂无数据可导出");
      return;
    }
    setExporting(true);
    try {
      const pageSize = Math.min(totalRecords, 50000);
      const res = await invoiceRequestsApi.getInvoiceRequests({
        page: 1,
        page_size: pageSize,
        status: statusFilter !== "all" ? statusFilter : undefined,
        customer_name: searchTerm || undefined,
        start_date: startDate,
        end_date: endDate,
      });
      const all = res?.requests ?? [];
      const headers = ["申请日期", "客户名称", "项目编号", "项目数量", "总金额", "申请人", "状态", "PO号", "备注", "创建时间"];
      const rows = all.map((r: any) => {
        const projectCodes = r.items?.length > 0
          ? r.items.map((it: any) => it.project_code ?? "-").join("、")
          : "-";
        return [
          r.request_date ? format(new Date(r.request_date), "yyyy-MM-dd", { locale: zhCN }) : "-",
          r.customer_name ?? "-",
          projectCodes,
          r.items?.length ?? 0,
          r.total_amount ?? 0,
          r.request_by ?? "-",
          STATUS_LABEL[r.status] ?? r.status ?? "-",
          r.po ?? "-",
          r.notes ?? "-",
          r.created_at ? format(new Date(r.created_at), "yyyy-MM-dd HH:mm", { locale: zhCN }) : "-",
        ];
      });
      const timestamp = new Date().toISOString().split("T")[0];
      downloadXlsx({
        filename: `开票申请_导出_${timestamp}`,
        sheetName: "开票申请",
        headers,
        rows,
      });
    } catch (err) {
      console.error("导出失败:", err);
      alert("导出失败，请重试");
    } finally {
      setExporting(false);
    }
  };

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="rounded-md bg-white border border-slate-200 p-3">
            <div className="text-xs text-slate-500 mb-1">总申请</div>
            <div className="text-lg font-semibold text-slate-800">{summary.totalCount} 个</div>
            <div className="text-sm text-slate-600">¥{summary.totalAmount.toLocaleString()}</div>
          </div>
          <div className="rounded-md bg-white border border-slate-200 p-3">
            <div className="text-xs text-slate-500 mb-1">已处理</div>
            <div className="text-lg font-semibold text-slate-800">{summary.processedCount} 个</div>
            <div className="text-sm text-slate-600">¥{summary.processedAmount.toLocaleString()}</div>
          </div>
          <div className="rounded-md bg-white border border-slate-200 p-3">
            <div className="text-xs text-slate-500 mb-1">待处理</div>
            <div className="text-lg font-semibold text-slate-800">{summary.pendingCount} 个</div>
            <div className="text-sm text-slate-600">¥{summary.pendingAmount.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* 搜索和筛选栏 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索客户名称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as InvoiceRequestStatus | "all")}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="状态筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">待处理</SelectItem>
              <SelectItem value="processing">处理中</SelectItem>
              <SelectItem value="completed">已完成</SelectItem>
              <SelectItem value="cancelled">已取消</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleExport()} disabled={exporting}>
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "导出中…" : "导出Excel"}
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            提交开票申请
          </Button>
        </div>
      </div>

      {/* 申请列表 */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>申请日期</TableHead>
              <TableHead>客户名称</TableHead>
              <TableHead>项目数量</TableHead>
              <TableHead>总金额（含税）</TableHead>
              <TableHead>申请人</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <span className="ml-2">加载中...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    {request.request_date
                      ? format(new Date(request.request_date), "yyyy-MM-dd", { locale: zhCN })
                      : "-"}
                  </TableCell>
                  <TableCell className="font-medium">{request.customer_name}</TableCell>
                  <TableCell>{request.items?.length || 0} 个</TableCell>
                  <TableCell className="font-medium">
                    ¥{request.total_amount.toLocaleString()}
                  </TableCell>
                  <TableCell>{request.request_by}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLOR[request.status]}>
                      {STATUS_LABEL[request.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request);
                          setViewDialogOpen(true);
                        }}
                        title="查看"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {(request.status === "pending" || request.status === "processing") && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(request);
                              setEditDialogOpen(true);
                            }}
                            title="修改"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRequestToDelete(request);
                              setDeleteDialogOpen(true);
                            }}
                            title="删除"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
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
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            下一页
          </Button>
        </div>
      )}

      {/* 对话框 */}
      <CreateInvoiceRequestDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          setCreateDialogOpen(false);
        }}
      />
      <EditInvoiceRequestDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        request={selectedRequest}
        onSuccess={() => setEditDialogOpen(false)}
      />
      <ViewInvoiceRequestDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        request={selectedRequest}
      />
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除该开票申请吗？删除后不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (requestToDelete?.id) {
                  await deleteMutation.mutateAsync(requestToDelete.id);
                  setRequestToDelete(null);
                  setDeleteDialogOpen(false);
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
