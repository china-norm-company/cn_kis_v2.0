/**
 * 调试匹配对话框
 * 帮助用户查看为什么匹配失败
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { invoicesApi } from "../api/invoicesApi";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";

interface DebugMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentAmount: number;
  projectCode?: string;
}

export function DebugMatchDialog({ open, onOpenChange, paymentAmount, projectCode }: DebugMatchDialogProps) {
  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ["invoices", "debug", projectCode],
    queryFn: () => {
      if (projectCode) {
        return invoicesApi.getInvoices({ project_code: projectCode, page_size: 100 });
      }
      return invoicesApi.getInvoices({ page_size: 200 });
    },
    enabled: open,
  });

  const invoices = invoicesData?.invoices || [];
  
  // 筛选可匹配的发票
  const matchableInvoices = invoices.filter(inv => {
    const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
    return unpaidAmount > 0 && (inv.status === "issued" || inv.status === "partial" || inv.status === "draft");
  });

  // 查找完全匹配的发票
  const exactMatch = matchableInvoices.find(inv => {
    const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
    return Math.abs(unpaidAmount - paymentAmount) < 0.01;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>匹配调试信息</DialogTitle>
          <DialogDescription>
            查看为什么收款金额 {paymentAmount.toLocaleString()} 无法匹配发票
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4">
            {/* 统计信息 */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <div className="text-sm text-muted-foreground">总发票数</div>
                <div className="text-2xl font-bold">{invoices.length}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">可匹配发票</div>
                <div className="text-2xl font-bold text-green-600">{matchableInvoices.length}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">完全匹配</div>
                <div className="text-2xl font-bold text-blue-600">{exactMatch ? 1 : 0}</div>
              </div>
            </div>

            {/* 匹配结果 */}
            {exactMatch ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800">找到完全匹配的发票</span>
                </div>
                <div className="text-sm text-green-700">
                  <div>发票号：{exactMatch.invoice_no}</div>
                  <div>项目编号：{exactMatch.project_code}</div>
                  <div>未收款金额：¥{(exactMatch.revenue_amount - (exactMatch.payment_amount || 0)).toLocaleString()}</div>
                  <div>发票状态：{exactMatch.status}</div>
                </div>
              </div>
            ) : matchableInvoices.length > 0 ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <span className="font-medium text-yellow-800">未找到完全匹配，但可以部分匹配</span>
                </div>
                <div className="text-sm text-yellow-700">
                  找到 {matchableInvoices.length} 张可匹配发票，但金额不完全相等
                </div>
              </div>
            ) : (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span className="font-medium text-red-800">未找到可匹配的发票</span>
                </div>
                <div className="text-sm text-red-700 space-y-1">
                  <div>可能的原因：</div>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li>所有发票都已完全收款（status = 'paid'）</li>
                    <li>没有状态为"已开票"的发票</li>
                    <li>发票的未收款金额为 0</li>
                    {projectCode && <li>项目编号 {projectCode} 没有对应的发票</li>}
                  </ul>
                </div>
              </div>
            )}

            {/* 发票列表 */}
            <div>
              <h3 className="font-medium mb-2">可匹配发票列表</h3>
              {matchableInvoices.length === 0 ? (
                <div className="text-sm text-muted-foreground p-4 text-center">
                  没有可匹配的发票
                </div>
              ) : (
                <div className="space-y-2">
                  {matchableInvoices.slice(0, 10).map((inv) => {
                    const unpaidAmount = inv.revenue_amount - (inv.payment_amount || 0);
                    const isExactMatch = Math.abs(unpaidAmount - paymentAmount) < 0.01;
                    return (
                      <div
                        key={inv.id}
                        className={`p-3 border rounded-lg ${
                          isExactMatch ? "bg-green-50 border-green-200" : "bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium">{inv.invoice_no}</div>
                            <div className="text-sm text-muted-foreground">
                              项目：{inv.project_code} | 客户：{inv.customer_name}
                            </div>
                            <div className="text-sm">
                              发票金额：¥{inv.revenue_amount.toLocaleString()} | 
                              已收款：¥{(inv.payment_amount || 0).toLocaleString()} | 
                              未收款：¥{unpaidAmount.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              状态：{inv.status}
                            </div>
                          </div>
                          {isExactMatch && (
                            <div className="ml-4">
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                完全匹配
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {matchableInvoices.length > 10 && (
                    <div className="text-sm text-muted-foreground text-center p-2">
                      还有 {matchableInvoices.length - 10} 张发票未显示
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
