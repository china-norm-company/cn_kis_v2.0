/**
 * 发票管理 — 单页内用标签页切换 5 个模块：开票申请、发票管理、收款管理、催款提醒、客户管理
 */
import { useState } from 'react'
import { Tabs } from '@cn-kis/ui-kit'
import {
  InvoiceRequestList,
  InvoiceList,
  PaymentList,
  OverdueRemindersList,
  CustomerList,
} from '@/features/legacy-finance/ui'

const TAB_ITEMS = [
  { value: 'invoice-requests', label: '开票申请' },
  { value: 'invoices', label: '发票管理' },
  { value: 'payments', label: '收款管理' },
  { value: 'overdue-reminders', label: '催款提醒' },
  { value: 'customers', label: '客户管理' },
]

type TabValue = (typeof TAB_ITEMS)[number]['value']

export function InvoiceManagementNewPage() {
  const [activeTab, setActiveTab] = useState<TabValue>('invoice-requests')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">发票管理</h2>
        <p className="text-sm text-slate-500 mt-1">开票申请、发票管理、收款管理、催款提醒、客户管理</p>
      </div>

      <Tabs
        tabs={TAB_ITEMS}
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
