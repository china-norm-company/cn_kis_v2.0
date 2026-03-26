/**
 * B2: 方案准备 - 看板列表
 *
 * 看板视图：按阶段分列展示方案卡片
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Badge, Button, Empty } from '@cn-kis/ui-kit'
import type { BadgeVariant } from '@cn-kis/ui-kit'
import { Link } from 'react-router-dom'
import {
  Plus, FileText, Building2, FlaskConical,
  DollarSign, CheckSquare, Layers,
} from 'lucide-react'

interface Proposal {
  id: number
  title: string
  client_name: string
  product_category: string
  stage: string
  status?: string
  estimated_amount: number | null
  version_count: number
  checklist_total: number
  checklist_done: number
  create_time: string
  update_time: string
}

const STAGES: { key: string; label: string; color: string; headerBg: string }[] = [
  { key: 'drafting', label: '起草中', color: 'border-slate-300', headerBg: 'bg-slate-100 text-slate-700' },
  { key: 'internal_review', label: '内部审核', color: 'border-blue-300', headerBg: 'bg-blue-50 text-blue-700' },
  { key: 'client_review', label: '客户审阅', color: 'border-amber-300', headerBg: 'bg-amber-50 text-amber-700' },
  { key: 'revision', label: '修订中', color: 'border-purple-300', headerBg: 'bg-purple-50 text-purple-700' },
  { key: 'finalized', label: '已定稿', color: 'border-green-300', headerBg: 'bg-green-50 text-green-700' },
]

function formatAmount(value: number | null): string {
  if (value == null) return '-'
  if (value >= 10000) return `¥${(value / 10000).toFixed(1)}万`
  return `¥${value.toLocaleString()}`
}

export default function ProposalListPage() {
  const { data: listRes, isLoading } = useQuery({
    queryKey: ['proposal', 'list'],
    queryFn: () => api.get<{ items: Proposal[] }>('/proposal/list'),
  })

  // api.get() 已返回 res.data，即后端 body：{ code, msg, data: { items, total, ... } }，列表在 data.items
  const proposals = (listRes as { data?: { items?: Proposal[] } } | undefined)?.data?.items ?? []

  const groupedByStage = STAGES.map((stage) => ({
    ...stage,
    items: proposals.filter((p) => p.stage === stage.key),
  }))

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">方案准备</h2>
          <p className="mt-1 text-sm text-slate-500">
            按阶段查看和管理方案卡片，点击进入详情
          </p>
        </div>
        <Link to="/proposals/create">
          <Button icon={<Plus className="w-4 h-4" />}>
            创建方案
          </Button>
        </Link>
      </div>

      {/* 看板视图 */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-slate-400">加载中...</div>
      ) : proposals.length === 0 ? (
        <Empty
          icon={<FileText className="w-16 h-16" />}
          title="暂无方案"
          description="点击右上角创建第一个方案"
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4" data-section="proposal-board">
          {groupedByStage.map((stage) => (
            <div
              key={stage.key}
              className={`flex-shrink-0 w-72 rounded-xl border ${stage.color} bg-white`}
            >
              {/* 列头 */}
              <div className={`px-4 py-2.5 rounded-t-xl ${stage.headerBg} flex items-center justify-between`}>
                <span className="text-sm font-semibold">{stage.label}</span>
                <span className="text-xs font-medium opacity-60">{stage.items.length}</span>
              </div>

              {/* 卡片列表 */}
              <div className="p-2 space-y-2 min-h-[120px]">
                {stage.items.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">暂无方案</div>
                ) : (
                  stage.items.map((proposal) => {
                    const checkPct = proposal.checklist_total > 0
                      ? Math.round((proposal.checklist_done / proposal.checklist_total) * 100)
                      : 0

                    return (
                      <Link
                        key={proposal.id}
                        to={`/proposals/${proposal.id}`}
                        className="block p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:shadow-sm transition bg-white group"
                      >
                        {/* 标题 */}
                        <h4 className="text-sm font-medium text-slate-800 group-hover:text-blue-600 line-clamp-2">
                          {proposal.title}
                        </h4>

                        {/* 客户 + 产品 */}
                        <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {proposal.client_name || '-'}
                          </span>
                          <span className="flex items-center gap-1">
                            <FlaskConical className="w-3 h-3" />
                            {proposal.product_category || '-'}
                          </span>
                        </div>

                        {/* 金额 + 版本 */}
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-slate-600">
                            <DollarSign className="w-3 h-3" />
                            {formatAmount(proposal.estimated_amount)}
                          </span>
                          <span className="flex items-center gap-1 text-slate-400">
                            <Layers className="w-3 h-3" />
                            v{proposal.version_count}
                          </span>
                        </div>

                        {/* 检查清单进度 */}
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                            <span className="flex items-center gap-1">
                              <CheckSquare className="w-3 h-3" />
                              清单
                            </span>
                            <span>{proposal.checklist_done}/{proposal.checklist_total}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                checkPct === 100 ? 'bg-green-500' : checkPct > 50 ? 'bg-blue-500' : 'bg-amber-400'
                              }`}
                              style={{ width: `${checkPct}%` }}
                            />
                          </div>
                        </div>
                      </Link>
                    )
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
