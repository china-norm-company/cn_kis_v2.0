/**
 * 查看项目预算对话框
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Badge } from "@/shared/ui/badge";
import { ScrollArea } from "@/shared/ui/scroll-area";
import type { ProjectBudget } from "@/entities/finance/domain";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface ViewBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: ProjectBudget;
}

export function ViewBudgetDialog({ open, onOpenChange, budget }: ViewBudgetDialogProps) {
  const executionRate = budget.budget_execution_rate || 0;
  const isOverBudget = executionRate > 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>项目预算详情</DialogTitle>
          <DialogDescription>查看项目预算的详细信息</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-6">
            {/* 基本信息 */}
            <div className="space-y-3">
              <h3 className="font-medium">基本信息</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">项目编号：</span>
                  <span className="font-medium">{budget.project_code}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">项目名称：</span>
                  <span>{budget.project_name || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">客户名称：</span>
                  <span>{budget.customer_name || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">客户经理：</span>
                  <span>{budget.sales_manager || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">项目时间：</span>
                  <span>
                    {budget.project_start_date && budget.project_end_date
                      ? `${format(new Date(budget.project_start_date), "yyyy-MM-dd", { locale: zhCN })} ~ ${format(new Date(budget.project_end_date), "yyyy-MM-dd", { locale: zhCN })}`
                      : "-"}
                  </span>
                </div>
              </div>
            </div>

            {/* 预算统计 */}
            <div className="space-y-3">
              <h3 className="font-medium">预算统计</h3>
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <div className="text-sm text-muted-foreground">预算总额</div>
                  <div className="text-xl font-bold">¥{budget.budget_total.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">实际支出</div>
                  <div className="text-xl font-bold">¥{(budget.actual_total || 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">执行率</div>
                  <div className="text-xl font-bold">
                    <Badge variant={isOverBudget ? "destructive" : "default"}>
                      {executionRate.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* 预算明细 */}
            <div className="space-y-3">
              <h3 className="font-medium">预算明细</h3>
              <div className="border rounded-lg">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium">预算项名称</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">类型</th>
                      <th className="px-4 py-2 text-right text-sm font-medium">预算金额</th>
                      <th className="px-4 py-2 text-right text-sm font-medium">实际金额</th>
                      <th className="px-4 py-2 text-right text-sm font-medium">剩余金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budget.budget_items.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-4 py-2">{item.item_name}</td>
                        <td className="px-4 py-2">{item.item_type}</td>
                        <td className="px-4 py-2 text-right">¥{item.budget_amount.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">¥{(item.actual_amount || 0).toLocaleString()}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={item.remaining_amount < 0 ? "text-red-600" : ""}>
                            ¥{item.remaining_amount.toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
