/**
 * 收款列表组件
 * 职责：显示收款列表，支持筛选、搜索、自动匹配发票；按时间维度汇总
 */

import { useState, useMemo } from "react";
import { usePayments, useDeletePayment, useAutoMatchInvoice } from "../model/usePayments";
import type { PaymentStatus } from "@/entities/finance/payment-domain";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Search, Plus, Edit, Trash2, Eye, Link2, CheckCircle2 } from "lucide-react";
import { CreatePaymentDialog } from "./CreatePaymentDialog";
import { EditPaymentDialog } from "./EditPaymentDialog";
import { ViewPaymentDialog } from "./ViewPaymentDialog";
import { DebugMatchDialog } from "./DebugMatchDialog";
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
import { useToast } from "@/shared/ui/use-toast";
import { TimeRangeSelect } from "@/shared/ui/time-range-select";
import { getStartEndForPeriod, type DateRangePeriod } from "@/shared/lib/dateRange";

const STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "待匹配",
  matched: "已匹配",
  partial: "部分匹配",
  completed: "已完成",
};

const STATUS_COLOR: Record<PaymentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  matched: "default",
  partial: "secondary",
  completed: "default",
};

interface PaymentListProps {
  onPaymentSelect?: (payment: any) => void;
}

export function PaymentList({ onPaymentSelect }: PaymentListProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "all">("all");
  const [projectCodeFilter, setProjectCodeFilter] = useState("");
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<number | null>(null);
  const [debugDialogOpen, setDebugDialogOpen] = useState(false);
  const [debugPayment, setDebugPayment] = useState<any>(null);
  const [timePeriod, setTimePeriod] = useState<DateRangePeriod>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const { startDate, endDate } = useMemo(
    () => getStartEndForPeriod(timePeriod, customStart, customEnd),
    [timePeriod, customStart, customEnd]
  );

  const { data: summaryData } = usePayments({
    page: 1,
    page_size: 99999,
    start_date: startDate,
    end_date: endDate,
  });

  const paymentSummary = useMemo(() => {
    const list = summaryData?.payments ?? [];
    const count = list.length;
    const amountTotal = list.reduce((s, p) => s + (p.payment_amount ?? 0), 0);
    const matched = list.filter((p) => p.match_status === "completed" || p.match_status === "matched" || p.match_status === "partial");
    const matchedAmount = list.reduce((s, p) => s + (p.matched_amount ?? 0), 0);
    const pending = list.filter((p) => p.match_status === "pending");
    const remainingAmount = list.reduce((s, p) => s + (p.remaining_amount ?? p.payment_amount ?? 0), 0);
    return {
      count,
      amountTotal,
      matchedCount: matched.length,
      matchedAmount,
      pendingCount: pending.length,
      remainingAmount,
    };
  }, [summaryData]);

  const { data, isLoading, error, refetch } = usePayments({
    page,
    page_size: pageSize,
    project_code: projectCodeFilter || undefined,
    match_status: statusFilter !== "all" ? statusFilter : undefined,
    start_date: startDate,
    end_date: endDate,
  });

  const deleteMutation = useDeletePayment();
  const autoMatchMutation = useAutoMatchInvoice();
  const { toast } = useToast();

  const handleView = (payment: any) => {
    setSelectedPayment(payment);
    setViewDialogOpen(true);
  };

  const handleEdit = (payment: any) => {
    setSelectedPayment(payment);
    setEditDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    setPaymentToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleAutoMatch = (payment: any) => {
    console.log('[自动匹配] 点击自动匹配按钮:', {
      payment_id: payment.id,
      project_code: payment.project_code,
      current_status: payment.match_status,
      remaining_amount: payment.remaining_amount,
    });
    
    if (!payment.project_code) {
      toast({
        title: "无法匹配",
        description: "该收款记录没有项目编号，无法自动匹配",
        variant: "destructive",
      });
      return;
    }
    
    autoMatchMutation.mutate({
      paymentId: payment.id,
      projectCode: payment.project_code,
    }, {
      onSuccess: (data) => {
        console.log('[自动匹配] 匹配成功:', data);
        refetch();
      },
      onError: (error) => {
        console.error('[自动匹配] 匹配失败:', error);
      }
    });
  };

  const handleDebugMatch = (payment: any) => {
    setDebugPayment(payment);
    setDebugDialogOpen(true);
  };

  const confirmDelete = () => {
    if (paymentToDelete) {
      deleteMutation.mutate(paymentToDelete, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setPaymentToDelete(null);
        },
      });
    }
  };

  const payments = data?.payments || [];
  const totalPages = data?.total_pages || 0;
  const totalRecords = data?.total_records || 0;

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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="rounded-md bg-white border border-slate-200 p-3">
            <div className="text-xs text-slate-500 mb-1">收款笔数 / 总金额</div>
            <div className="text-lg font-semibold text-slate-800">{paymentSummary.count} 笔</div>
            <div className="text-sm text-slate-600">¥{paymentSummary.amountTotal.toLocaleString()}</div>
          </div>
          <div className="rounded-md bg-white border border-slate-200 p-3">
            <div className="text-xs text-slate-500 mb-1">已匹配</div>
            <div className="text-lg font-semibold text-slate-800">{paymentSummary.matchedCount} 笔</div>
            <div className="text-sm text-slate-600">¥{paymentSummary.matchedAmount.toLocaleString()}</div>
          </div>
          <div className="rounded-md bg-white border border-slate-200 p-3">
            <div className="text-xs text-slate-500 mb-1">待匹配</div>
            <div className="text-lg font-semibold text-slate-800">{paymentSummary.pendingCount} 笔</div>
            <div className="text-sm text-slate-600">¥{paymentSummary.remainingAmount.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* 搜索和筛选栏 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索项目编号、客户名称..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                const term = e.target.value;
                if (term.match(/^C\d+/)) {
                  setProjectCodeFilter(term);
                } else {
                  setProjectCodeFilter("");
                }
              }}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as PaymentStatus | "all")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="匹配状态" />
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
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          新增收款
        </Button>
      </div>

      {/* 收款列表 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>到账日期</TableHead>
              <TableHead>到账金额</TableHead>
              <TableHead>项目编号</TableHead>
              <TableHead>关联发票</TableHead>
              <TableHead>客户名称</TableHead>
              <TableHead>匹配状态</TableHead>
              <TableHead>已匹配金额</TableHead>
              <TableHead>剩余金额</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <span className="ml-2">加载中...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    {payment.payment_date
                      ? format(new Date(payment.payment_date), "yyyy-MM-dd", { locale: zhCN })
                      : "-"}
                  </TableCell>
                  <TableCell className="font-medium">
                    ¥{payment.payment_amount.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {payment.project_codes && payment.project_codes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {payment.project_codes.map((code, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    ) : payment.project_code ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
                        {payment.project_code}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {payment.invoice_no ? (
                      <span className="text-primary">{payment.invoice_no}</span>
                    ) : (
                      <span className="text-muted-foreground">未匹配</span>
                    )}
                  </TableCell>
                  <TableCell>{payment.customer_name || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLOR[payment.match_status]}>
                      {STATUS_LABEL[payment.match_status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {payment.matched_amount > 0 ? (
                      <span className="text-green-600">
                        ¥{payment.matched_amount.toLocaleString()}
                      </span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    {payment.remaining_amount !== undefined && payment.remaining_amount > 0 ? (
                      <span className="text-orange-600">
                        ¥{payment.remaining_amount.toLocaleString()}
                      </span>
                    ) : payment.match_status === 'completed' ? (
                      <span className="text-green-600">已全部匹配</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleView(payment)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {(payment.match_status === 'pending' || payment.match_status === 'partial') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAutoMatch(payment)}
                          disabled={autoMatchMutation.isPending}
                          title="自动匹配发票"
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(payment)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(payment.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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
      <CreatePaymentDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          setCreateDialogOpen(false);
          // 刷新列表
          setTimeout(() => {
            refetch();
          }, 300);
        }}
      />

      <EditPaymentDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        payment={selectedPayment}
        onSuccess={() => {
          setEditDialogOpen(false);
          setSelectedPayment(null);
        }}
      />

      <ViewPaymentDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        payment={selectedPayment}
      />
      
      {debugPayment && (
        <DebugMatchDialog
          open={debugDialogOpen}
          onOpenChange={setDebugDialogOpen}
          paymentAmount={debugPayment.payment_amount}
          projectCode={debugPayment.project_code}
        />
      )}

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这条收款记录吗？此操作不可恢复。
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
