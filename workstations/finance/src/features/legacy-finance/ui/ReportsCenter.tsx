/**
 * 报表中心
 * 职责：显示周报、月报、项目报表
 */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { useWeeklyReport, useMonthlyReport } from "../model/useReports";
import { Calendar, Download, FileText } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

export function ReportsCenter() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="weekly" className="space-y-4">
        <TabsList>
          <TabsTrigger value="weekly">周报</TabsTrigger>
          <TabsTrigger value="monthly">月报</TabsTrigger>
          <TabsTrigger value="project">项目报表</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly" className="space-y-4">
          <WeeklyReportView />
        </TabsContent>

        <TabsContent value="monthly" className="space-y-4">
          <MonthlyReportView />
        </TabsContent>

        <TabsContent value="project" className="space-y-4">
          <div className="text-center py-12 text-muted-foreground">
            项目报表功能开发中...
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * 周报视图
 */
function WeeklyReportView() {
  const { data: report, isLoading, error } = useWeeklyReport();
  
  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">加载中...</div>;
  }
  
  if (error) {
    return <div className="text-center py-12 text-red-500">加载失败</div>;
  }
  
  if (!report) {
    return <div className="text-center py-12 text-muted-foreground">暂无数据</div>;
  }
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>周报统计</CardTitle>
              <CardDescription>
                {format(new Date(report.week_start), "yyyy年MM月dd日", { locale: zhCN })} - 
                {format(new Date(report.week_end), "yyyy年MM月dd日", { locale: zhCN })}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              导出Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 统计卡片 */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">开票数量</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.invoice_count}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  金额：¥{report.invoice_amount.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">收款数量</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.payment_count}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  金额：¥{report.payment_amount.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">逾期发票</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{report.overdue_count}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  金额：¥{report.overdue_amount.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">收款率</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {report.invoice_amount > 0 
                    ? ((report.payment_amount / report.invoice_amount) * 100).toFixed(1)
                    : 0}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  本周收款/开票
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 开票明细 */}
          <div>
            <h3 className="text-lg font-semibold mb-3">开票明细</h3>
            <div className="border rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left text-sm font-medium">发票号</th>
                    <th className="p-2 text-left text-sm font-medium">开票日期</th>
                    <th className="p-2 text-left text-sm font-medium">客户名称</th>
                    <th className="p-2 text-left text-sm font-medium">项目编号</th>
                    <th className="p-2 text-right text-sm font-medium">金额</th>
                  </tr>
                </thead>
                <tbody>
                  {report.invoice_list.length > 0 ? (
                    report.invoice_list.map((inv, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 text-sm">{inv.invoice_no}</td>
                        <td className="p-2 text-sm">{inv.invoice_date}</td>
                        <td className="p-2 text-sm">{inv.customer_name}</td>
                        <td className="p-2 text-sm">{inv.project_code}</td>
                        <td className="p-2 text-sm text-right">¥{inv.amount.toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-muted-foreground">
                        暂无开票记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 收款明细 */}
          <div>
            <h3 className="text-lg font-semibold mb-3">收款明细</h3>
            <div className="border rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left text-sm font-medium">收款日期</th>
                    <th className="p-2 text-left text-sm font-medium">客户名称</th>
                    <th className="p-2 text-left text-sm font-medium">项目编号</th>
                    <th className="p-2 text-left text-sm font-medium">发票号</th>
                    <th className="p-2 text-right text-sm font-medium">金额</th>
                  </tr>
                </thead>
                <tbody>
                  {report.payment_list.length > 0 ? (
                    report.payment_list.map((pay, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 text-sm">{pay.payment_date}</td>
                        <td className="p-2 text-sm">{pay.customer_name}</td>
                        <td className="p-2 text-sm">{pay.project_code}</td>
                        <td className="p-2 text-sm">{pay.invoice_no || '-'}</td>
                        <td className="p-2 text-sm text-right">¥{pay.amount.toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-muted-foreground">
                        暂无收款记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 月报视图
 */
function MonthlyReportView() {
  const now = new Date();
  const { data: report, isLoading, error } = useMonthlyReport(now.getFullYear(), now.getMonth() + 1);
  
  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">加载中...</div>;
  }
  
  if (error) {
    return <div className="text-center py-12 text-red-500">加载失败</div>;
  }
  
  if (!report) {
    return <div className="text-center py-12 text-muted-foreground">暂无数据</div>;
  }
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>月报统计</CardTitle>
              <CardDescription>
                {report.year}年{report.month}月
              </CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              导出Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 统计卡片 */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">开票数量</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.invoice_count}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  金额：¥{report.invoice_amount.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">收款数量</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.payment_count}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  金额：¥{report.payment_amount.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">逾期发票</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{report.overdue_count}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  金额：¥{report.overdue_amount.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">收款率</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {report.invoice_amount > 0 
                    ? ((report.payment_amount / report.invoice_amount) * 100).toFixed(1)
                    : 0}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  本月收款/开票
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 按周统计 */}
          <div>
            <h3 className="text-lg font-semibold mb-3">按周统计</h3>
            <div className="border rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-left text-sm font-medium">周期</th>
                    <th className="p-2 text-right text-sm font-medium">开票数量</th>
                    <th className="p-2 text-right text-sm font-medium">开票金额</th>
                    <th className="p-2 text-right text-sm font-medium">收款数量</th>
                    <th className="p-2 text-right text-sm font-medium">收款金额</th>
                  </tr>
                </thead>
                <tbody>
                  {report.weekly_breakdown.length > 0 ? (
                    report.weekly_breakdown.map((week, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 text-sm">
                          {format(new Date(week.week_start), "MM/dd", { locale: zhCN })} - 
                          {format(new Date(week.week_end), "MM/dd", { locale: zhCN })}
                        </td>
                        <td className="p-2 text-sm text-right">{week.invoice_count}</td>
                        <td className="p-2 text-sm text-right">¥{week.invoice_amount.toLocaleString()}</td>
                        <td className="p-2 text-sm text-right">{week.payment_count}</td>
                        <td className="p-2 text-sm text-right">¥{week.payment_amount.toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-muted-foreground">
                        暂无数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
