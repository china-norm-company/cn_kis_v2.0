import { useQuery } from '@tanstack/react-query'
import { Card } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { useNavigate } from 'react-router-dom'
import { Kanban } from 'lucide-react'

const STAGES = ['initial_contact', 'requirement', 'quotation', 'negotiation', 'contract', 'won'] as const

const STAGE_LABELS: Record<string, string> = {
  initial_contact: '初步接触',
  requirement: '需求确认',
  quotation: '报价中',
  negotiation: '谈判中',
  contract: '签约中',
  won: '已成交',
}

interface Opportunity {
  id: number
  title: string
  client_name: string
  stage: string
  estimated_amount: number | string
  probability: number
  owner: string
  [key: string]: unknown
}

export function OpportunityKanbanPage() {
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['crm', 'opportunities', 'list', 'kanban'],
    queryFn: () =>
      api.get<{ items: Opportunity[]; total: number }>('/crm/opportunities/list', {
        params: { page: 1, page_size: 100 },
      }),
  })

  const items = data?.data?.items ?? []
  const byStage = STAGES.reduce<Record<string, Opportunity[]>>((acc, s) => {
    acc[s] = items.filter((o) => o.stage === s)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Kanban className="w-8 h-8 text-blue-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">商机看板</h1>
          <p className="text-sm text-slate-500">按阶段查看商机，点击卡片进入详情</p>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const list = byStage[stage] ?? []
          return (
            <div
              key={stage}
              className="flex-shrink-0 w-72 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden"
            >
              <div className="px-4 py-3 bg-white border-b border-slate-200">
                <h3 className="font-semibold text-slate-800">
                  {STAGE_LABELS[stage] ?? stage}
                  <span className="ml-2 text-sm font-normal text-slate-500">({list.length})</span>
                </h3>
              </div>
              <div className="p-3 space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                {list.map((opp) => (
                  <Card
                    key={opp.id}
                    variant="bordered"
                    className="p-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
                    onClick={() => navigate(`/opportunities/${opp.id}`)}
                  >
                    <div className="font-medium text-slate-800 text-sm">{opp.title}</div>
                    <div className="text-xs text-slate-500 mt-1">{opp.client_name}</div>
                    <div className="flex justify-between items-center mt-2 text-xs">
                      <span className="text-amber-600 font-medium">
                        ¥{Number(opp.estimated_amount ?? 0).toLocaleString()}
                      </span>
                      <span className="text-slate-500">{opp.probability}% · {opp.owner ?? '-'}</span>
                    </div>
                  </Card>
                ))}
                {list.length === 0 && (
                  <div className="py-8 text-center text-sm text-slate-400">暂无商机</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
