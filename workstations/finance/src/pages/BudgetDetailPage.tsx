import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Card, Badge, Button } from '@cn-kis/ui-kit'
import { ArrowLeft, PiggyBank, Calculator, FileText } from 'lucide-react'

interface Budget {
  id: number
  budget_no: string
  budget_name: string
  status: 'draft' | 'pending' | 'approved' | 'executing' | 'completed' | 'rejected'
  protocol_id?: number
  total_cost: string | number
  actual_cost: string | number
  budget_year?: string | number
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'error' | 'warning' }> = {
  draft: { label: '草稿', variant: 'default' },
  pending: { label: '待审批', variant: 'warning' },
  approved: { label: '已审批', variant: 'primary' },
  executing: { label: '执行中', variant: 'success' },
  completed: { label: '已完成', variant: 'success' },
  rejected: { label: '已拒绝', variant: 'error' },
}

function formatAmount(val: string | number | null | undefined): string {
  if (val == null || val === '') return '-'
  const n = typeof val === 'string' ? Number(val) : val
  return `¥${n.toLocaleString()}`
}

export function BudgetDetailPage() {
  const { budgetId } = useParams<{ budgetId: string }>()
  const navigate = useNavigate()
  const id = Number(budgetId)

  const { data, isLoading } = useQuery({
    queryKey: ['budget', 'detail', id],
    queryFn: () => api.get<Budget>(`/finance/budgets/${id}`),
    enabled: !!id,
  })

  const budget = data?.data
  const statusInfo = budget ? statusMap[budget.status] ?? { label: String(budget.status), variant: 'default' as const } : null

  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
    )
  }

  if (!budget) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/budgets')}>
          返回
        </Button>
        <Card>
          <div className="p-8 text-center text-slate-500">预算不存在</div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/budgets')}
            className="p-2 hover:bg-slate-100 rounded-lg"
            aria-label="返回预算列表"
          >
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-slate-800">预算详情</h2>
            <p className="text-sm text-slate-500 mt-0.5">{budget.budget_no}</p>
          </div>
        </div>
      </div>

      <Card>
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">基本信息</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoItem icon={<FileText className="w-4 h-4 text-slate-400" />} label="预算编号" value={budget.budget_no} />
            <InfoItem icon={<PiggyBank className="w-4 h-4 text-slate-400" />} label="预算名称" value={budget.budget_name || '-'} />
            <InfoItem icon={<Calculator className="w-4 h-4 text-slate-400" />} label="状态" value={<Badge variant={statusInfo!.variant}>{statusInfo!.label}</Badge>} />
            <InfoItem label="协议ID" value={budget.protocol_id != null ? String(budget.protocol_id) : '-'} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-500">预算总额</p>
              <p className="mt-0.5 text-lg font-semibold text-slate-800">{formatAmount(budget.total_cost)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">实际成本</p>
              <p className="mt-0.5 text-lg font-semibold text-slate-800">{formatAmount(budget.actual_cost)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">预算年度</p>
              <p className="mt-0.5 text-sm text-slate-700">{budget.budget_year ?? '-'}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

function InfoItem({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      {icon && <div className="mt-0.5">{icon}</div>}
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <div className="mt-0.5 text-sm font-medium text-slate-800">{value}</div>
      </div>
    </div>
  )
}
