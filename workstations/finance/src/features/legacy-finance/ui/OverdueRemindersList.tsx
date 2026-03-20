/**
 * 催款提醒列表
 * 职责：显示逾期收款列表，支持批量发送催款通知
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Checkbox } from "@/shared/ui/checkbox";
import { useOverdueReminders, useSendReminder, useSendBatchReminders } from "../model/useOverdueReminders";
import { AlertTriangle, Send, Download } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useToast } from "@/shared/ui/use-toast";

export function OverdueRemindersList() {
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [customerFilter, setCustomerFilter] = useState("");
  const [salesManagerFilter, setSalesManagerFilter] = useState("");
  
  const { data, isLoading, error } = useOverdueReminders({
    page,
    page_size: 20,
    customer_name: customerFilter || undefined,
    sales_manager: salesManagerFilter || undefined,
  });
  
  const sendReminderMutation = useSendReminder();
  const sendBatchRemindersMutation = useSendBatchReminders();
  const { toast } = useToast();
  
  const handleSelectAll = (checked: boolean) => {
    if (checked && data) {
      setSelectedIds(data.reminders.map(r => r.id));
    } else {
      setSelectedIds([]);
    }
  };
  
  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter(i => i !== id));
    }
  };
  
  const handleSendBatch = async () => {
    if (selectedIds.length === 0) {
      toast({
        title: "请选择要发送的提醒",
        variant: "destructive",
      });
      return;
    }
    
    await sendBatchRemindersMutation.mutateAsync(selectedIds);
    setSelectedIds([]);
  };
  
  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">加载中...</div>;
  }
  
  if (error) {
    return <div className="text-center py-12 text-red-500">加载失败</div>;
  }
  
  if (!data || data.reminders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>催款提醒</CardTitle>
          <CardDescription>暂无逾期收款</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                催款提醒
              </CardTitle>
              <CardDescription>
                共 {data.total_records} 条逾期记录
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.length > 0 && (
                <Button
                  onClick={handleSendBatch}
                  disabled={sendBatchRemindersMutation.isPending}
                  size="sm"
                >
                  <Send className="h-4 w-4 mr-2" />
                  批量发送 ({selectedIds.length})
                </Button>
              )}
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                导出Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 筛选条件 */}
          <div className="flex gap-2">
            <Input
              placeholder="搜索客户名称"
              value={customerFilter}
              onChange={(e) => {
                setCustomerFilter(e.target.value);
                setPage(1);
              }}
              className="max-w-xs"
            />
            <Input
              placeholder="搜索客户经理"
              value={salesManagerFilter}
              onChange={(e) => {
                setSalesManagerFilter(e.target.value);
                setPage(1);
              }}
              className="max-w-xs"
            />
          </div>
          
          {/* 列表 */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedIds.length === data.reminders.length && data.reminders.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>发票号</TableHead>
                  <TableHead>客户名称</TableHead>
                  <TableHead>项目编号</TableHead>
                  <TableHead>客户经理</TableHead>
                  <TableHead>开票日期</TableHead>
                  <TableHead>应到账日期</TableHead>
                  <TableHead>逾期天数</TableHead>
                  <TableHead className="text-right">未收款金额</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.reminders.map((reminder) => (
                  <TableRow key={reminder.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(reminder.id)}
                        onCheckedChange={(checked) => handleSelectOne(reminder.id, checked as boolean)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{reminder.invoice_no}</TableCell>
                    <TableCell>{reminder.customer_name}</TableCell>
                    <TableCell>{reminder.project_code}</TableCell>
                    <TableCell>{reminder.sales_manager}</TableCell>
                    <TableCell>{reminder.invoice_date}</TableCell>
                    <TableCell>{reminder.expected_payment_date}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">
                        {reminder.overdue_days} 天
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-orange-600">
                      ¥{reminder.unpaid_amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        {reminder.last_reminder_date && (
                          <div className="text-xs text-muted-foreground">
                            已发送 {reminder.reminder_count} 次
                            {(() => {
                              const today = new Date().toISOString().split('T')[0];
                              const lastSendDate = reminder.last_reminder_date;
                              if (lastSendDate === today) {
                                return '（今日已发送）';
                              }
                              return `（最后：${format(new Date(lastSendDate), 'MM-dd', { locale: zhCN })}）`;
                            })()}
                          </div>
                        )}
                        {(() => {
                          const today = new Date().toISOString().split('T')[0];
                          const hasSentToday = reminder.last_reminder_date === today;
                          
                          return (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (hasSentToday) {
                                  toast({
                                    title: "提示",
                                    description: "今天已发送过催款通知，请明天再试",
                                    variant: "default",
                                  });
                                  return;
                                }
                                sendReminderMutation.mutate(reminder.id);
                              }}
                              disabled={sendReminderMutation.isPending || hasSentToday}
                            >
                              <Send className="h-4 w-4 mr-1" />
                              {hasSentToday ? '今日已发送' : '发送'}
                            </Button>
                          );
                        })()}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          {/* 分页 */}
          {data.total_pages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                第 {data.current_page} / {data.total_pages} 页，共 {data.total_records} 条
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(data.total_pages, p + 1))}
                  disabled={page === data.total_pages}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
