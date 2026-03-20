import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, Badge, Button } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { ArrowLeft, Check, Circle } from 'lucide-react'

const STAGES = [
  'initial_contact',
  'requirement',
  'quotation',
  'negotiation',
  'contract',
  'won',
  'lost',
] as const

const STAGE_LABELS: Record<string, string> = {
  initial_contact: '初步接触',
  requirement: '需求确认',
  quotation: '报价中',
  negotiation: '谈判中',
  contract: '签约中',
  won: '已成交',
  lost: '已流失',
}

export function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['crm', 'opportunity', id],
    queryFn: () =>
      api.get<{
        id: number
        title: string
        client_name: string
        client_id: number
        stage: string
        estimated_amount: number
        probability: number
        owner: string
        expected_close_date: string
        created_at: string
        description: string
        notes: string
      }>(`/crm/opportunities/${id}`),
    enabled: !!id,
  })

  const opp = data?.data
  if (!opp) return <div className="p-6 text-center text-sm text-slate-400">加载中...</div>

  const currentIdx = STAGES.indexOf(opp.stage as (typeof STAGES)[number])
  const isPast = (idx: number) => currentIdx >= 0 && idx <= currentIdx
  const isCurrent = (idx: number) => idx === currentIdx

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          返回
        </Button>
        <h1 className="text-2xl font-bold text-slate-800">{opp.title}</h1>
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-slate-500">客户</span>
            <p className="font-medium text-slate-800">{opp.client_name}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">阶段</span>
            <p className="mt-1">
              <Badge variant={opp.stage === 'won' ? 'success' : opp.stage === 'lost' ? 'error' : 'primary'}>
                {STAGE_LABELS[opp.stage] ?? opp.stage}
              </Badge>
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">预估金额</span>
            <p className="font-medium text-slate-800">
              ¥{Number(opp.estimated_amount ?? 0).toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">成交概率</span>
            <p className="font-medium text-slate-800">{opp.probability ?? 0}%</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">负责人</span>
            <p className="font-medium text-slate-800">{opp.owner ?? '-'}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">预计成交日期</span>
            <p className="font-medium text-slate-800">{opp.expected_close_date ?? '-'}</p>
          </div>
        </div>
      </Card>

      <Card title="阶段进度" className="p-5">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {STAGES.map((stage, idx) => (
            <div key={stage} className="flex items-center flex-shrink-0">
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                  isCurrent(idx)
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : isPast(idx)
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-slate-50 text-slate-400'
                }`}
              >
                {isPast(idx) && !isCurrent(idx) ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Circle className="w-4 h-4" />
                )}
                <span className="text-sm whitespace-nowrap">{STAGE_LABELS[stage] ?? stage}</span>
              </div>
              {idx < STAGES.length - 1 && (
                <div className="w-4 h-0.5 bg-slate-200 mx-0.5 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </Card>

      {opp.notes && (
        <Card title="备注" className="p-5">
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{opp.notes}</p>
        </Card>
      )}
    </div>
  )
}
