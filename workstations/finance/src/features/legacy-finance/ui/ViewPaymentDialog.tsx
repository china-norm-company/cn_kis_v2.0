/**
 * 查看收款详情对话框
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import type { Payment } from "@/entities/finance/payment-domain";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

const STATUS_LABEL: Record<Payment["match_status"], string> = {
  pending: "待匹配",
  matched: "已匹配",
  partial: "部分匹配",
  completed: "已完成",
};

interface ViewPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: Payment | null;
}

export function ViewPaymentDialog({ open, onOpenChange, payment }: ViewPaymentDialogProps) {
  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>收款详情</span>
            <Badge>{STATUS_LABEL[payment.match_status]}</Badge>
          </DialogTitle>
          <DialogDescription>收款金额: ¥{payment.payment_amount.toLocaleString()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">到账日期</label>
              <p className="mt-1">
                {payment.payment_date
                  ? format(new Date(payment.payment_date), "yyyy-MM-dd", { locale: zhCN })
                  : "-"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">到账金额</label>
              <p className="mt-1">¥{payment.payment_amount.toLocaleString()}</p>
            </div>
            {payment.project_code && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">项目编号</label>
                <p className="mt-1">{payment.project_code}</p>
              </div>
            )}
            {payment.invoice_no && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">关联发票</label>
                <p className="mt-1">{payment.invoice_no}</p>
              </div>
            )}
            {payment.customer_name && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">客户名称</label>
                <p className="mt-1">{payment.customer_name}</p>
              </div>
            )}
            {payment.sales_manager && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">客户经理</label>
                <p className="mt-1">{payment.sales_manager}</p>
              </div>
            )}
            {payment.payment_method && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">付款方式</label>
                <p className="mt-1">{payment.payment_method}</p>
              </div>
            )}
            {payment.bank_account && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">收款账户</label>
                <p className="mt-1">{payment.bank_account}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-muted-foreground">已匹配金额</label>
              <p className="mt-1 text-green-600">
                ¥{payment.matched_amount.toLocaleString()}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">剩余金额</label>
              <p className="mt-1 text-orange-600">
                ¥{payment.remaining_amount.toLocaleString()}
              </p>
            </div>
            {payment.remark && (
              <div className="col-span-2">
                <label className="text-sm font-medium text-muted-foreground">备注</label>
                <p className="mt-1">{payment.remark}</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
