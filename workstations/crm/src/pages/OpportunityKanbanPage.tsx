import { useQuery } from '@tanstack/react-query'
import { Card } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { useNavigate, useLocation } from 'react-router-dom'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Kanban } from 'lucide-react'
import { FALLBACK_SALES_STAGE_OPTIONS } from '../constants/opportunityFormFallback'
import { opportunityStageLabel } from '../constants/opportunityStages'

const KANBAN_STAGE_ORDER = FALLBACK_SALES_STAGE_OPTIONS.map((o) => o.value)
const KNOWN_STAGES = new Set(KANBAN_STAGE_ORDER)

interface Opportunity {
  id: number
  code?: string
  title: string
  client_name: string
  stage: string
  estimated_amount: number | string
  sales_amount_total?: string
  probability: number
  owner: string
  commercial_owner_name?: string
  business_segment?: string
  research_group?: string
  demand_name?: string
  [key: string]: unknown
}

function money(v: unknown) {
  if (v === undefined || v === null || v === '') return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return `¥${n.toLocaleString()}`
}

export function OpportunityKanbanPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const fromPath = location.pathname + location.search

  const { data } = useQuery({
    queryKey: ['crm', 'opportunities', 'list', 'kanban'],
    queryFn: () =>
      api.get<{ items: Opportunity[]; total: number }>('/crm/opportunities/list', {
        params: { page: 1, page_size: 200 },
      }),
  })

  const items = data?.data?.items ?? []
  const byStage: Record<string, Opportunity[]> = {}
  for (const s of KANBAN_STAGE_ORDER) {
    byStage[s] = []
  }
  byStage.other = []

  for (const o of items) {
    const s = KNOWN_STAGES.has(o.stage) ? o.stage : 'other'
    byStage[s].push(o)
  }

  const columns = [...KANBAN_STAGE_ORDER, ...(byStage.other.length > 0 ? ['other'] : [])]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Kanban className="h-8 w-8 text-blue-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">商机看板</h1>
          <p className="text-sm text-slate-500">按商机阶段查看；卡片含关键字段，点击查看完整信息</p>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((stage) => {
          const list = byStage[stage] ?? []
          const title =
            stage === 'other' ? '其他阶段' : opportunityStageLabel(stage)
          return (
            <div
              key={stage}
              className="w-80 flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
            >
              <div className="border-b border-slate-200 bg-white px-4 py-3">
                <h3 className="font-semibold text-slate-800">
                  {title}
                  <span className="ml-2 text-sm font-normal text-slate-500">({list.length})</span>
                </h3>
              </div>
              <div className="max-h-[calc(100vh-280px)] space-y-2 overflow-y-auto p-3">
                {list.map((opp) => {
                  const ownerName = opp.commercial_owner_name || opp.owner || '—'
                  return (
                    <Card
                      key={opp.id}
                      variant="bordered"
                      className="p-3 transition-all hover:border-blue-300 hover:shadow-sm"
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() =>
                          navigate(`/opportunities/${opp.id}`, { state: { from: fromPath } })
                        }
                      >
                        {opp.code ? (
                          <div className="text-[11px] font-medium text-slate-500">{opp.code}</div>
                        ) : null}
                        <div className="text-sm font-medium leading-snug text-slate-800">{opp.title}</div>
                        <div className="mt-1 text-xs text-slate-500">{opp.client_name}</div>
                        {opp.demand_name ? (
                          <div className="mt-1 line-clamp-2 text-xs text-slate-600">需求：{opp.demand_name}</div>
                        ) : null}
                        <div className="mt-2 space-y-0.5 text-[11px] text-slate-600">
                          <div>
                            <span className="text-slate-400">业务板块</span>{' '}
                            {opp.business_segment || '—'}
                          </div>
                          <div>
                            <span className="text-slate-400">研究组</span> {opp.research_group || '—'}
                          </div>
                          <div>
                            <span className="text-slate-400">商机阶段</span>{' '}
                            {opportunityStageLabel(opp.stage)}
                          </div>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                            <span>
                              <span className="text-slate-400">预估</span> {money(opp.estimated_amount)}
                            </span>
                            <span>
                              <span className="text-slate-400">销售额</span> {money(opp.sales_amount_total)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">商务负责人</span> {ownerName}
                          </div>
                        </div>
                      </button>
                      <div className="mt-2 flex justify-end gap-1.5 border-t border-slate-100 pt-2">
                        <button
                          type="button"
                          className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          onClick={() =>
                            navigate(`/opportunities/${opp.id}`, { state: { from: fromPath } })
                          }
                        >
                          查看
                        </button>
                        <PermissionGuard permission="crm.opportunity.update">
                          <button
                            type="button"
                            className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700"
                            onClick={() =>
                              navigate(`/opportunities/${opp.id}/edit`, { state: { from: fromPath } })
                            }
                          >
                            编辑
                          </button>
                        </PermissionGuard>
                      </div>
                    </Card>
                  )
                })}
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
