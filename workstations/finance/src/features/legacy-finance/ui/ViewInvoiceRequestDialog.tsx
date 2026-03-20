/**
 * 查看开票申请详情对话框
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { InvoiceRequest } from "@/entities/finance/invoice-request-domain";
import { ProcessInvoiceRequestDialog } from "./ProcessInvoiceRequestDialog";
import { useState } from "react";

const STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  processing: "处理中",
  completed: "已完成",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "default",
  processing: "secondary",
  completed: "outline",
  cancelled: "destructive",
};

const INVOICE_TYPE_LABEL: Record<string, string> = {
  vat_special: "增值税专用发票",
  proforma: "形式发票",
};

const AMOUNT_TYPE_LABEL: Record<string, string> = {
  inclusive_of_tax: "含税",
  exclusive_of_tax: "不含税（已按税率折算为含税）",
};

interface ViewInvoiceRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: InvoiceRequest | null;
}

export function ViewInvoiceRequestDialog({
  open,
  onOpenChange,
  request,
}: ViewInvoiceRequestDialogProps) {
  const [processDialogOpen, setProcessDialogOpen] = useState(false);

  if (!request) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>开票申请详情</DialogTitle>
            <DialogDescription>
              申请编号: {request.id}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">申请日期</label>
                <p className="mt-1">
                  {request.request_date
                    ? format(new Date(request.request_date), "yyyy-MM-dd", { locale: zhCN })
                    : "-"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">状态</label>
                <div className="mt-1">
                  <Badge variant={STATUS_COLOR[request.status]}>
                    {STATUS_LABEL[request.status]}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">客户名称</label>
                <p className="mt-1">{request.customer_name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">发票类型</label>
                <p className="mt-1">{INVOICE_TYPE_LABEL[request.invoice_type ?? "vat_special"] ?? request.invoice_type ?? "增值税专用发票"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">金额类型</label>
                <p className="mt-1">{AMOUNT_TYPE_LABEL[request.amount_type ?? "inclusive_of_tax"] ?? request.amount_type ?? "含税"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">税率</label>
                <p className="mt-1">{(request.tax_rate != null ? Number(request.tax_rate) * 100 : 6).toFixed(0)}%</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">申请人</label>
                <p className="mt-1">{request.request_by}</p>
              </div>
              {request.po && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">PO号</label>
                  <p className="mt-1">{request.po}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-muted-foreground">总金额（含税）</label>
                <p className="mt-1 font-medium">¥{request.total_amount.toLocaleString()}</p>
              </div>
            </div>

            {/* 开票明细（展示均为含税金额） */}
            <div>
              <label className="text-sm font-medium text-muted-foreground">开票明细</label>
              <div className="mt-2 border rounded-lg">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium">项目编号</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">金额（含税）</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">服务内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.items?.map((item, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-4 py-2">{item.project_code}</td>
                        <td className="px-4 py-2">¥{(item.amount_inclusive_of_tax ?? item.amount).toLocaleString()}</td>
                        <td className="px-4 py-2">{item.service_content}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 备注 */}
            {request.notes && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">备注</label>
                <p className="mt-1 text-sm">{request.notes}</p>
              </div>
            )}

            {/* 处理信息 */}
            {request.processed_by && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">处理人</label>
                  <p className="mt-1">{request.processed_by}</p>
                </div>
                {request.processed_at && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">处理时间</label>
                    <p className="mt-1">
                      {format(new Date(request.processed_at), "yyyy-MM-dd HH:mm", { locale: zhCN })}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 操作按钮 */}
            {request.status === 'pending' && (
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button onClick={() => setProcessDialogOpen(true)}>
                  处理申请
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ProcessInvoiceRequestDialog
        open={processDialogOpen}
        onOpenChange={setProcessDialogOpen}
        request={request}
        onSuccess={() => {
          setProcessDialogOpen(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
