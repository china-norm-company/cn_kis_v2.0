/**
 * 工单管理页 - 项目清单、项目执行概览
 */
import { useState } from 'react'
import { Tabs } from '@cn-kis/ui-kit'
import { WorkOrderTab } from './workorder/WorkOrderTab'
import { ProjectExecutionOverview } from './workorder/ProjectExecutionOverview'

export default function WorkOrderPage() {
  const [activeTab, setActiveTab] = useState('project-list')

  const tabItems = [
    { key: 'project-list', value: 'project-list', label: '项目清单' },
    { key: 'execution-overview', value: 'execution-overview', label: '项目执行概览' },
  ]

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-800">工单管理</h1>
      </div>
      <Tabs tabs={tabItems} value={activeTab} onChange={setActiveTab} />
      <div className="mt-4">
        {activeTab === 'project-list' && <WorkOrderTab />}
        {activeTab === 'execution-overview' && <ProjectExecutionOverview />}
      </div>
    </div>
  )
}
