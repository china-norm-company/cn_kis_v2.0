/**
 * 处理开票申请对话框（财务人员）
 * 从开票申请创建发票
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
import { useUpdateInvoiceRequest } from "../model/useInvoiceRequests";
import { useCreateInvoice } from "../model/useInvoices";
import type { InvoiceRequest } from "@/entities/finance/invoice-request-domain";
import { CreateInvoiceDialog } from "./CreateInvoiceDialog";
import { useToast } from "@/shared/ui/use-toast";

interface ProcessInvoiceRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: InvoiceRequest | null;
  onSuccess?: () => void;
}

export function ProcessInvoiceRequestDialog({
  open,
  onOpenChange,
  request,
  onSuccess,
}: ProcessInvoiceRequestDialogProps) {
  const [createInvoiceDialogOpen, setCreateInvoiceDialogOpen] = useState(false);
  const updateRequestMutation = useUpdateInvoiceRequest();
  const createInvoiceMutation = useCreateInvoice();
  const { toast } = useToast();

  if (!request) return null;

  const handleCreateInvoice = () => {
    setCreateInvoiceDialogOpen(true);
  };

  const handleInvoiceCreated = async (invoice: any) => {
    if (!invoice || !invoice.id) {
      console.error('[处理申请] 发票创建失败，无法获取发票ID');
      return;
    }

    // 更新开票申请状态
    try {
      const currentUser = JSON.parse(localStorage.getItem('chinanorm_auth_user') || '{}');
      const processedBy = currentUser.username || currentUser.name || '财务人员';

      await updateRequestMutation.mutateAsync({
        id: request.id,
        status: 'completed',
        invoice_ids: [...(request.invoice_ids || []), invoice.id],
        processed_by: processedBy,
      });

      toast({
        title: "处理成功",
        description: "开票申请已标记为已完成",
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('[处理申请] 更新申请状态失败:', error);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>处理开票申请</DialogTitle>
            <DialogDescription>
              申请编号: {request.id} | 客户: {request.customer_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">处理步骤：</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>在诺诺APP中开票（手动）</li>
                <li>点击"创建发票"按钮，系统会自动填充申请信息</li>
                <li>填写发票号码，上传电子发票</li>
                <li>保存后，申请状态自动更新为"已完成"</li>
              </ol>
            </div>

            <div className="border rounded-lg p-4 bg-muted/50">
              <p className="text-sm font-medium mb-2">申请信息预览：</p>
              <div className="space-y-1 text-sm">
                <p>客户名称: {request.customer_name}</p>
                <p>项目数量: {request.items?.length || 0} 个</p>
                <p>总金额: ¥{request.total_amount.toLocaleString()}</p>
                {request.po && <p>PO号: {request.po}</p>}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleCreateInvoice}>
              创建发票
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateInvoiceDialog
        open={createInvoiceDialogOpen}
        onOpenChange={setCreateInvoiceDialogOpen}
        invoiceRequest={request} // 传递开票申请，用于自动填充
        onSuccess={async (invoice) => {
          if (invoice) {
            await handleInvoiceCreated(invoice);
          }
          setCreateInvoiceDialogOpen(false);
        }}
      />
    </>
  );
}
