import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, Button } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { ArrowLeft, Brain, ThumbsUp, AlertTriangle, Lightbulb, TrendingUp } from 'lucide-react'

export function ClientInsightPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: clientRes } = useQuery({
    queryKey: ['crm', 'client', id],
    queryFn: () => api.get<{ name: string; [key: string]: unknown }>(`/crm/clients/${id}`),
    enabled: !!id,
  })

  const { data: insightRes } = useQuery({
    queryKey: ['crm', 'client', id, 'insight'],
    queryFn: () =>
      api.get<{
        summary: string
        strengths: string[]
        risks: string[]
        recommendations: string[]
      }>(`/crm/clients/${id}/insight`),
    enabled: !!id,
  })

  const { data: crossSellRes } = useQuery({
    queryKey: ['crm', 'client', id, 'cross-sell'],
    queryFn: () =>
      api.get<{
        opportunities: Array<{ title: string; description: string; estimated_value: number | string }>
      }>(`/crm/clients/${id}/cross-sell`),
    enabled: !!id,
  })

  const clientName = clientRes?.data?.name ?? '客户'
  const insight = insightRes?.data
  const crossSell = crossSellRes?.data

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          返回
        </Button>
        <h1 className="text-2xl font-bold text-slate-800">{clientName} - AI洞察</h1>
      </div>

      {insight?.summary && (
        <Card title="洞察摘要" className="p-5">
          <div className="flex gap-3">
            <Brain className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-slate-700 leading-relaxed">{insight.summary}</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-6">
        <Card title="优势" className="p-5">
          <div className="flex gap-3">
            <ThumbsUp className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <ul className="space-y-2">
              {(insight?.strengths ?? []).map((s, i) => (
                <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="text-green-500">•</span>
                  <span>{s}</span>
                </li>
              ))}
              {(insight?.strengths ?? []).length === 0 && (
                <li className="text-sm text-slate-400">暂无数据</li>
              )}
            </ul>
          </div>
        </Card>

        <Card title="风险" className="p-5">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <ul className="space-y-2">
              {(insight?.risks ?? []).map((r, i) => (
                <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  <span>{r}</span>
                </li>
              ))}
              {(insight?.risks ?? []).length === 0 && (
                <li className="text-sm text-slate-400">暂无数据</li>
              )}
            </ul>
          </div>
        </Card>
      </div>

      {insight?.recommendations && insight.recommendations.length > 0 && (
        <Card title="建议" className="p-5">
          <div className="flex gap-3">
            <Lightbulb className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <ol className="space-y-2 list-decimal list-inside text-sm text-slate-700">
              {insight.recommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ol>
          </div>
        </Card>
      )}

      {crossSell?.opportunities && crossSell.opportunities.length > 0 && (
        <Card title="交叉销售机会" className="p-5">
          <div className="flex gap-3">
            <TrendingUp className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 grid gap-3 sm:grid-cols-2">
              {crossSell.opportunities.map((opp, i) => (
                <Card key={i} variant="bordered" className="p-4">
                  <div className="font-medium text-slate-800">{opp.title}</div>
                  {opp.description && (
                    <p className="text-xs text-slate-500 mt-1">{opp.description}</p>
                  )}
                  <div className="text-sm text-amber-600 font-medium mt-2">
                    预估价值: ¥{Number(opp.estimated_value ?? 0).toLocaleString()}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
