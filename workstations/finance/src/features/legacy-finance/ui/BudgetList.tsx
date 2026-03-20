/**
 * 项目预算列表组件
 */

import { useState } from "react";
import { useBudgets, useDeleteBudget } from "../model/useBudgets";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Search, Plus, Edit, Trash2, Eye } from "lucide-react";
import { CreateBudgetDialog } from "./CreateBudgetDialog";
import { EditBudgetDialog } from "./EditBudgetDialog";
import { ViewBudgetDialog } from "./ViewBudgetDialog";
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

export function BudgetList() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [projectCodeFilter, setProjectCodeFilter] = useState("");
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [budgetToDelete, setBudgetToDelete] = useState<number | null>(null);

  const { data, isLoading, error, refetch } = useBudgets({
    page,
    page_size: pageSize,
    project_code: projectCodeFilter || undefined,
  });

  const deleteMutation = useDeleteBudget();

  const handleView = (budget: any) => {
    setSelectedBudget(budget);
    setViewDialogOpen(true);
  };

  const handleEdit = (budget: any) => {
    setSelectedBudget(budget);
    setEditDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    setBudgetToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (budgetToDelete) {
      deleteMutation.mutate(budgetToDelete, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setBudgetToDelete(null);
        },
      });
    }
  };

  const budgets = data?.budgets || [];
  const totalPages = data?.total_pages || 0;
  const totalRecords = data?.total_records || 0;

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        加载失败: {error instanceof Error ? error.message : "未知错误"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 搜索和操作栏 */}
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
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          新增预算
        </Button>
      </div>

      {/* 预算列表 */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>项目编号</TableHead>
              <TableHead>项目名称</TableHead>
              <TableHead>客户名称</TableHead>
              <TableHead>预算总额</TableHead>
              <TableHead>实际支出</TableHead>
              <TableHead>执行率</TableHead>
              <TableHead>项目时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : budgets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              budgets.map((budget) => {
                const executionRate = budget.budget_execution_rate || 0;
                const isOverBudget = executionRate > 100;
                const isWarning = executionRate > 80 && executionRate <= 100;
                
                return (
                  <TableRow key={budget.id}>
                    <TableCell className="font-medium">{budget.project_code}</TableCell>
                    <TableCell>{budget.project_name || "-"}</TableCell>
                    <TableCell>{budget.customer_name || "-"}</TableCell>
                    <TableCell>¥{budget.budget_total.toLocaleString()}</TableCell>
                    <TableCell>¥{(budget.actual_total || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={isOverBudget ? "destructive" : isWarning ? "secondary" : "default"}
                      >
                        {executionRate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {budget.project_start_date && budget.project_end_date ? (
                        <span className="text-sm">
                          {format(new Date(budget.project_start_date), "yyyy-MM-dd", { locale: zhCN })} ~{" "}
                          {format(new Date(budget.project_end_date), "yyyy-MM-dd", { locale: zhCN })}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleView(budget)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(budget)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(budget.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
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
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* 对话框 */}
      <CreateBudgetDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          refetch();
        }}
      />
      
      {selectedBudget && (
        <>
          <ViewBudgetDialog
            open={viewDialogOpen}
            onOpenChange={setViewDialogOpen}
            budget={selectedBudget}
          />
          <EditBudgetDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            budget={selectedBudget}
            onSuccess={() => {
              refetch();
            }}
          />
        </>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这个项目预算吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
