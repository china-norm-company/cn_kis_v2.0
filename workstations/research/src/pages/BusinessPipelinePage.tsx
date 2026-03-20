/**
 * 商务管线页面
 *
 * 商务漏斗视图 + 项目商务卡片列表（可操作） + 回款预警
 */
import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@cn-kis/api-client'
import { StatCard, Badge, Empty, Button } from '@cn-kis/ui-kit'
import { Plus, Bell } from 'lucide-react'
import { BusinessFunnel, FUNNEL_STAGES } from '../components/BusinessFunnel'
import { ProjectBusinessCard } from '../components/ProjectBusinessCard'
import type { ProjectBusinessData } from '../components/ProjectBusinessCard'
import { QuickQuoteModal } from '../components/QuickQuoteModal'
import { QuickOpportunityModal } from '../components/QuickOpportunityModal'
import { ContractDetailDrawer } from '../components/ContractDetailDrawer'
import { CreateInvoiceModal } from '../components/CreateInvoiceModal'

type ModalState =
  | { type: 'none' }
  | { type: 'quote' }
  | { type: 'opportunity' }
  | { type: 'contract'; project: ProjectBusinessData }
  | { type: 'invoice'; project: ProjectBusinessData }

export default function BusinessPipelinePage() {
  const [modal, setModal] = useState<ModalState>({ type: 'none' })

  const { data: pipelineRes, isLoading } = useQuery({
    queryKey: ['dashboard', 'business-pipeline'],
    queryFn: () => dashboardApi.getBusinessPipeline(),
    staleTime: 60_000,
  })

  const pipeline = pipelineRes?.data
  const funnel = pipeline?.funnel
  const projects = pipeline?.projects ?? []

  const closeModal = useCallback(() => setModal({ type: 'none' }), [])

  const handleRemindPayment = useCallback((project: ProjectBusinessData) => {
    // 未来对接飞书消息提醒，当前给用户反馈
    alert(`已向财务发送催回款提醒：${project.project_title}`)
  }, [])

  const funnelActions: Record<string, { label: string; onClick: () => void } | undefined> = {
    opportunities: { label: '新建商机', onClick: () => setModal({ type: 'opportunity' }) },
    quotes: { label: '新建报价', onClick: () => setModal({ type: 'quote' }) },
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 md:text-xl">商务管线</h2>
        <p className="mt-1 text-sm text-slate-500">商机 → 报价 → 合同 → 回款全链路追踪</p>
      </div>

      {/* Funnel Stats with action buttons */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {FUNNEL_STAGES.map((stage) => {
          const data = funnel?.[stage.key] ?? { count: 0, amount: 0 }
          const action = funnelActions[stage.key]
          return (
            <div key={stage.key} className="flex flex-col">
              <StatCard
                title={stage.label}
                value={`${data.count} 项`}
                icon={<stage.icon className="w-5 h-5" />}
                color={stage.key === 'opportunities' ? 'blue' : stage.key === 'quotes' ? 'purple' : stage.key === 'contracts' ? 'green' : 'amber'}
              />
              {action && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={action.onClick}
                  className="mt-1 !text-xs !gap-1 self-center min-h-11"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {action.label}
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <BusinessFunnel funnel={funnel} isLoading={isLoading} />

      {/* Project Business Cards */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">项目商务状态</h3>
          <div className="flex items-center gap-2">
            {projects.filter((p: any) => p.overdue).length > 0 && (
              <Badge variant="error">
                <Bell className="w-3 h-3 mr-1" />
                {projects.filter((p: any) => p.overdue).length} 个待回款
              </Badge>
            )}
          </div>
        </div>

        {projects.length === 0 ? (
          <Empty description="暂无项目商务数据" />
        ) : (
          <div className="space-y-3">
            {projects.map((project: any) => (
              <ProjectBusinessCard
                key={project.project_id}
                project={project}
                onViewContract={(p) => setModal({ type: 'contract', project: p })}
                onCreateInvoice={(p) => setModal({ type: 'invoice', project: p })}
                onRemindPayment={handleRemindPayment}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <QuickQuoteModal
        isOpen={modal.type === 'quote'}
        onClose={closeModal}
      />
      <QuickOpportunityModal
        isOpen={modal.type === 'opportunity'}
        onClose={closeModal}
      />
      <ContractDetailDrawer
        isOpen={modal.type === 'contract'}
        onClose={closeModal}
        client={modal.type === 'contract' ? modal.project.project_title : undefined}
      />
      <CreateInvoiceModal
        isOpen={modal.type === 'invoice'}
        onClose={closeModal}
        client={modal.type === 'invoice' ? modal.project.project_title : ''}
        projectTitle={modal.type === 'invoice' ? modal.project.project_title : ''}
      />
    </div>
  )
}
