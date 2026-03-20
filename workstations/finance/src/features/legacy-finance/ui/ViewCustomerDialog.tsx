/**
 * 查看客户详情对话框
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
import type { FinanceCustomer } from "@/entities/finance/customer-domain";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface ViewCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: FinanceCustomer | null;
}

export function ViewCustomerDialog({ open, onOpenChange, customer }: ViewCustomerDialogProps) {
  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>客户详情</DialogTitle>
          <DialogDescription>查看客户详细信息</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">客户编号</label>
              <p className="mt-1 text-sm font-medium">{customer.customer_code || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">客户完整名称</label>
              <p className="mt-1 text-sm">{customer.customer_name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">客户简称</label>
              <p className="mt-1 text-sm">{customer.short_name || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">账期（天）</label>
              <p className="mt-1 text-sm">{customer.payment_term_days}天</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">账期描述</label>
              <p className="mt-1 text-sm">{customer.payment_term_description || "-"}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">状态</label>
              <div className="mt-1">
                <Badge variant={customer.is_active ? "default" : "secondary"}>
                  {customer.is_active ? "启用" : "禁用"}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">创建时间</label>
              <p className="mt-1 text-sm">
                {customer.created_at
                  ? format(new Date(customer.created_at), "yyyy-MM-dd HH:mm", { locale: zhCN })
                  : "-"}
              </p>
            </div>
            {customer.remark && (
              <div className="col-span-2">
                <label className="text-sm font-medium text-muted-foreground">备注</label>
                <p className="mt-1 text-sm whitespace-pre-wrap">{customer.remark}</p>
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
