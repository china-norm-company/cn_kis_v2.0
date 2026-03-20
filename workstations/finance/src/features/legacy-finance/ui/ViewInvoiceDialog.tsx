/**
 * 查看发票详情对话框
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
import type { Invoice } from "@/entities/finance/domain";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Download } from "lucide-react";
import { downloadInvoiceFile } from "@/shared/services/fileStorage";

const STATUS_LABEL: Record<Invoice["status"], string> = {
  draft: "草稿",
  issued: "已开票",
  paid: "已收款",
  partial: "部分收款",
  overdue: "逾期",
  cancelled: "已取消",
};

interface ViewInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
}

export function ViewInvoiceDialog({ open, onOpenChange, invoice }: ViewInvoiceDialogProps) {
  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>发票详情</span>
            <Badge>{STATUS_LABEL[invoice.status]}</Badge>
          </DialogTitle>
          <DialogDescription>发票编号: {invoice.invoice_no}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">发票号码</label>
              <p className="mt-1">{invoice.invoice_no}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">开票日期</label>
              <p className="mt-1">
                {invoice.invoice_date
                  ? format(new Date(invoice.invoice_date), "yyyy-MM-dd", { locale: zhCN })
                  : "-"}
              </p>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-muted-foreground">客户名称</label>
              <p className="mt-1">{invoice.customer_name}</p>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-muted-foreground">项目编号</label>
              {invoice.invoice_items && invoice.invoice_items.length > 0 ? (
                <div className="mt-1 space-y-1">
                  {invoice.invoice_items.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{item.project_code}</span>
                      {item.amount && (
                        <span className="text-muted-foreground">
                          (¥{item.amount.toLocaleString()})
                        </span>
                      )}
                      {item.service_content && (
                        <span className="text-muted-foreground text-xs">
                          - {item.service_content}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1">{invoice.project_code || "-"}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">客户经理</label>
              <p className="mt-1">{invoice.sales_manager}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">收入金额</label>
              <p className="mt-1">¥{invoice.revenue_amount.toLocaleString()}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">开票金额（含税）</label>
              <p className="mt-1">
                {invoice.invoice_amount_tax_included
                  ? `¥${invoice.invoice_amount_tax_included.toLocaleString()}`
                  : "-"}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">发票类型</label>
              <p className="mt-1">{invoice.invoice_type}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">我司名称</label>
              <p className="mt-1">{invoice.company_name}</p>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-muted-foreground">开票内容</label>
              <p className="mt-1">{invoice.invoice_content}</p>
            </div>
            {invoice.payment_date && (
              <>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">到账日期</label>
                  <p className="mt-1">
                    {format(new Date(invoice.payment_date), "yyyy-MM-dd", { locale: zhCN })}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">到账金额</label>
                  <p className="mt-1">
                    {invoice.payment_amount ? `¥${invoice.payment_amount.toLocaleString()}` : "-"}
                  </p>
                </div>
              </>
            )}
            {invoice.payment_term && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">账期</label>
                <p className="mt-1">{invoice.payment_term} 天</p>
              </div>
            )}
            {invoice.expected_payment_date && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">应到账时间</label>
                <p className="mt-1">
                  {format(new Date(invoice.expected_payment_date), "yyyy-MM-dd", { locale: zhCN })}
                </p>
              </div>
            )}
            {invoice.electronic_invoice_file_name && (
              <div className="col-span-2">
                <label className="text-sm font-medium text-muted-foreground">电子发票</label>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-sm text-primary hover:underline"
                    onClick={async () => {
                      if (!invoice.electronic_invoice_file) {
                        alert("电子发票文件不存在，可能文件未正确保存");
                        return;
                      }
                      try {
                        await downloadInvoiceFile(
                          invoice.electronic_invoice_file,
                          invoice.electronic_invoice_file_name!
                        );
                      } catch (error) {
                        console.error("下载电子发票失败:", error);
                        alert("下载失败：" + (error instanceof Error ? error.message : "请稍后重试"));
                      }
                    }}
                    title="点击下载电子发票"
                  >
                    <Download className="mr-2 h-4 w-4 inline" />
                    {invoice.electronic_invoice_file_name}
                  </Button>
                  {!invoice.electronic_invoice_file && (
                    <span className="text-xs text-muted-foreground">(文件未保存)</span>
                  )}
                  {invoice.electronic_invoice_uploaded_at && (
                    <span className="text-xs text-muted-foreground">
                      上传于 {format(new Date(invoice.electronic_invoice_uploaded_at), "yyyy-MM-dd HH:mm", { locale: zhCN })}
                    </span>
                  )}
                </div>
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
