/**
 * 样品发放 - 从 KIS 实验室管理-样品发放迁移
 * 工单管理、样品管理、工单执行
 */
import { useState } from 'react'
import { Tabs } from '@cn-kis/ui-kit'
import { ClipboardList, PackageOpen, PlayCircle } from 'lucide-react'
import { WorkOrderTab } from './sample-distribution/WorkOrderTab'
import { SampleRequestTab } from './sample-distribution/SampleRequestTab'
import { ExecutionTab } from './sample-distribution/ExecutionTab'

export function SampleDistributionPage() {
  const [activeTab, setActiveTab] = useState('work-order')

  const tabItems = [
    { key: 'work-order', value: 'work-order', label: '工单管理', icon: <ClipboardList className="h-3.5 w-3.5" /> },
    { key: 'sample-request', value: 'sample-request', label: '样品管理', icon: <PackageOpen className="h-3.5 w-3.5" /> },
    { key: 'execution', value: 'execution', label: '工单执行', icon: <PlayCircle className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-800">样品发放</h1>
        <p className="mt-1 text-sm text-slate-500">试验现场样品发放与使用管理</p>
      </div>

      <Tabs
        tabs={tabItems}
        value={activeTab}
        onChange={setActiveTab}
        className="space-y-4"
      />
      <div className="mt-4">
        {activeTab === 'work-order' && <WorkOrderTab />}
        {activeTab === 'sample-request' && <SampleRequestTab />}
        {activeTab === 'execution' && <ExecutionTab />}
      </div>
    </div>
  )
}
