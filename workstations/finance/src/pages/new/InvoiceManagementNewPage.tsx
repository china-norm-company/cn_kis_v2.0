/**
 * 发票管理 — 标签页按角色显示：商务（开票+只读发票+可传电子件）、财务（全功能）、管理（多看板只读）
 */
import { useEffect, useMemo, useState } from 'react'
import { Tabs } from '@cn-kis/ui-kit'
import { useFeishuContext } from '@cn-kis/feishu-sdk'
import {
  InvoiceRequestList,
  InvoiceList,
  PaymentList,
  OverdueRemindersList,
  CustomerList,
} from '@/features/legacy-finance/ui'
import { FINANCE_PERMS } from '@/shared/lib/financePermissions'

type TabValue = 'invoice-requests' | 'invoices' | 'payments' | 'overdue-reminders' | 'customers'

type TabDef = { value: TabValue; label: string }

export function InvoiceManagementNewPage() {
  const { hasPermission, hasAnyPermission } = useFeishuContext()

  const canInvoiceRead = hasPermission(FINANCE_PERMS.invoiceRead)
  const canInvoiceCreate = hasPermission(FINANCE_PERMS.invoiceCreate)
  const canPaymentRead = hasPermission(FINANCE_PERMS.paymentRead)
  const canReportRead = hasPermission(FINANCE_PERMS.reportRead)
  const canSubmitInvoiceRequest = hasAnyPermission([
    FINANCE_PERMS.invoiceCreate,
    FINANCE_PERMS.invoiceRequestSubmit,
  ])

  const visibleTabs = useMemo((): TabDef[] => {
    const tabs: TabDef[] = []
    if (canInvoiceRead) {
      tabs.push({ value: 'invoice-requests', label: '开票申请' })
    }
    if (canInvoiceRead) {
      tabs.push({ value: 'invoices', label: '发票管理' })
    }
    if (canPaymentRead) {
      tabs.push({ value: 'payments', label: '收款管理' })
    }
    if (canInvoiceRead && canInvoiceCreate) {
      tabs.push({ value: 'overdue-reminders', label: '催款提醒' })
    }
    if (canInvoiceRead && (canInvoiceCreate || canReportRead)) {
      tabs.push({ value: 'customers', label: '客户管理' })
    }
    return tabs
  }, [canInvoiceRead, canInvoiceCreate, canPaymentRead, canReportRead, canSubmitInvoiceRequest])

  const [activeTab, setActiveTab] = useState<TabValue>('invoice-requests')

  useEffect(() => {
    if (visibleTabs.length === 0) return
    if (!visibleTabs.some((t) => t.value === activeTab)) {
      setActiveTab(visibleTabs[0].value)
    }
  }, [visibleTabs, activeTab])

  const roleHint = useMemo(() => {
    if (canInvoiceCreate && hasPermission(FINANCE_PERMS.paymentCreate)) {
      return '当前为财务操作视图：可申请、开票、收款与维护客户。'
    }
    if (canSubmitInvoiceRequest && !canInvoiceCreate) {
      return '当前为商务视图：可申请开票、查看发票台账、下载/上传电子发票；收款与客户维护由财务处理。'
    }
    if (canReportRead && !canInvoiceCreate) {
      return '当前为管理只读视图：可查看发票与收款及分析类客户信息，不可改账务数据。'
    }
    return '请使用上方标签页查看您有权访问的内容。'
  }, [canInvoiceCreate, canReportRead, canSubmitInvoiceRequest, hasPermission])

  if (visibleTabs.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-6 text-sm text-amber-900">
        您暂无发票模块访问权限。如需使用，请联系管理员分配「查看发票」或「提交开票申请」等财务权限。
      </div>
    )
  }

  const tabItemsForUi = visibleTabs.map((t) => ({ value: t.value, label: t.label }))

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">发票管理</h2>
        <p className="text-sm text-slate-500 mt-1">开票申请、发票台账、收款、催款与客户（按权限显示标签页）</p>
        <p className="text-xs text-slate-500 mt-2 max-w-3xl">{roleHint}</p>
      </div>

      <Tabs
        tabs={tabItemsForUi}
        value={activeTab}
        onChange={(key) => setActiveTab(key as TabValue)}
        className="bg-white rounded-t-xl border border-slate-200 border-b-0 px-2 pt-2"
      />

      <div className="bg-white rounded-b-xl border border-slate-200 border-t-0 overflow-hidden -mt-px p-4 min-h-[400px]">
        {activeTab === 'invoice-requests' && <InvoiceRequestList />}
        {activeTab === 'invoices' && <InvoiceList />}
        {activeTab === 'payments' && <PaymentList />}
        {activeTab === 'overdue-reminders' && <OverdueRemindersList />}
        {activeTab === 'customers' && <CustomerList />}
      </div>
    </div>
  )
}
