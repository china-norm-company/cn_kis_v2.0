/**
 * 客户列表组件
 * 职责：显示客户列表，支持筛选、搜索、分页、CRUD操作
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCustomers, useDeleteCustomer } from "../model/useCustomers";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Search, Plus, Edit, Trash2, Eye, Upload } from "lucide-react";
import { CreateCustomerDialog } from "./CreateCustomerDialog";
import { ImportCustomersDialog } from "./ImportCustomersDialog";
import { EditCustomerDialog } from "./EditCustomerDialog";
import { ViewCustomerDialog } from "./ViewCustomerDialog";
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

interface CustomerListProps {
  onCustomerSelect?: (customer: any) => void;
}

export function CustomerList({ onCustomerSelect }: CustomerListProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [isActiveFilter, setIsActiveFilter] = useState<boolean | undefined>(undefined);
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<number | null>(null);

  const { data, isLoading, error } = useCustomers({
    page,
    page_size: pageSize,
    keyword: searchTerm || undefined,
    is_active: isActiveFilter,
  });

  const deleteMutation = useDeleteCustomer();
  const queryClient = useQueryClient();

  const handleView = (customer: any) => {
    setSelectedCustomer(customer);
    setViewDialogOpen(true);
    if (onCustomerSelect) {
      onCustomerSelect(customer);
    }
  };

  const handleEdit = (customer: any) => {
    setSelectedCustomer(customer);
    setEditDialogOpen(true);
  };

  const handleDelete = (customerId: number) => {
    setCustomerToDelete(customerId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (customerToDelete) {
      deleteMutation.mutate(customerToDelete, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setCustomerToDelete(null);
        },
      });
    }
  };

  const customers = data?.customers || [];
  const totalPages = data?.total_pages || 0;
  const totalRecords = data?.total_records || 0;

  // 分页处理
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
          <select
            value={isActiveFilter === undefined ? "all" : isActiveFilter ? "active" : "inactive"}
            onChange={(e) => {
              const value = e.target.value;
              setIsActiveFilter(value === "all" ? undefined : value === "active");
            }}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">全部状态</option>
            <option value="active">启用</option>
            <option value="inactive">禁用</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            批量导入
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            新建客户
          </Button>
        </div>
      </div>

      {/* 客户列表 */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>客户编号</TableHead>
              <TableHead>客户名称</TableHead>
              <TableHead>简称</TableHead>
              <TableHead>账期</TableHead>
              <TableHead>账期描述</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">
                  加载中...
                </TableCell>
              </TableRow>
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  暂无客户数据
                </TableCell>
              </TableRow>
            ) : (
              customers.map((customer: any) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.customer_code || "-"}</TableCell>
                  <TableCell className="font-medium">{customer.customer_name}</TableCell>
                  <TableCell>{customer.short_name || "-"}</TableCell>
                  <TableCell>{customer.payment_term_days}天</TableCell>
                  <TableCell>{customer.payment_term_description || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={customer.is_active ? "default" : "secondary"}>
                      {customer.is_active ? "启用" : "禁用"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {customer.created_at
                      ? format(new Date(customer.created_at), "yyyy-MM-dd", { locale: zhCN })
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleView(customer)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(customer)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(customer.id)}
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              上一页
            </Button>
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
      <CreateCustomerDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
      <ImportCustomersDialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          setImportDialogOpen(open);
          if (!open) {
            // 导入完成后刷新列表
            queryClient.invalidateQueries({ queryKey: ["finance-customers"] });
          }
        }}
      />
      <EditCustomerDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        customer={selectedCustomer}
      />
      <ViewCustomerDialog
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        customer={selectedCustomer}
      />
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除该客户吗？此操作不可恢复。
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
