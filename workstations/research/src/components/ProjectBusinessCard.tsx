/**
 * 项目商务卡片组件
 *
 * 展示单个项目的合同额/开票/回款/应收余额及回款进度
 * 支持操作按钮：查看合同、创建发票、催回款
 */
import { Badge, Button } from '@cn-kis/ui-kit'
import { AlertTriangle, FileText, Receipt, Bell } from 'lucide-react'
import { formatAmount } from './BusinessFunnel'

export interface ProjectBusinessData {
  project_id: number
  project_title: string
  project_code: string
  contract_amount: number
  invoiced: number
  received: number
  outstanding: number
  collection_rate: number
  overdue: boolean
}

interface ProjectBusinessCardProps {
  project: ProjectBusinessData
  onViewContract?: (project: ProjectBusinessData) => void
  onCreateInvoice?: (project: ProjectBusinessData) => void
  onRemindPayment?: (project: ProjectBusinessData) => void
}

export function ProjectBusinessCard({
  project,
  onViewContract,
  onCreateInvoice,
  onRemindPayment,
}: ProjectBusinessCardProps) {
  return (
    <div
      className={`p-4 rounded-lg border transition ${
        project.overdue ? 'border-red-200 bg-red-50/30' : 'border-slate-100 hover:border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800">{project.project_title}</span>
          {project.project_code && <span className="text-xs text-slate-400">{project.project_code}</span>}
        </div>
        <div className="flex items-center gap-2">
          {project.overdue && (
            <Badge variant="error" size="sm">
              <AlertTriangle className="w-3 h-3 mr-0.5" />
              待回款
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-slate-500">合同额</span>
          <div className="mt-0.5 font-semibold text-slate-700">{formatAmount(project.contract_amount)}</div>
        </div>
        <div>
          <span className="text-slate-500">已开票</span>
          <div className="mt-0.5 font-semibold text-slate-700">{formatAmount(project.invoiced)}</div>
        </div>
        <div>
          <span className="text-slate-500">已回款</span>
          <div className="mt-0.5 font-semibold text-green-600">{formatAmount(project.received)}</div>
        </div>
        <div>
          <span className="text-slate-500">应收余额</span>
          <div className={`mt-0.5 font-semibold ${project.outstanding > 0 ? 'text-red-600' : 'text-slate-700'}`}>
            {formatAmount(project.outstanding)}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
          <span>回款率</span>
          <span>{project.collection_rate}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${
              project.collection_rate >= 80 ? 'bg-green-500' : project.collection_rate >= 50 ? 'bg-blue-500' : 'bg-amber-500'
            }`}
            style={{ width: `${Math.min(project.collection_rate, 100)}%` }}
          />
        </div>
      </div>

      {/* 操作按钮组 */}
      <div className="mt-3 flex items-center gap-2 pt-3 border-t border-slate-100">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onViewContract?.(project)}
          className="!text-xs !gap-1"
        >
          <FileText className="w-3.5 h-3.5" />
          查看合同
        </Button>
        {project.contract_amount > 0 && project.invoiced < project.contract_amount && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCreateInvoice?.(project)}
            className="!text-xs !gap-1"
          >
            <Receipt className="w-3.5 h-3.5" />
            创建发票
          </Button>
        )}
        {project.overdue && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemindPayment?.(project)}
            className="!text-xs !gap-1 !text-red-600 hover:!bg-red-50"
          >
            <Bell className="w-3.5 h-3.5" />
            催回款
          </Button>
        )}
      </div>
    </div>
  )
}
