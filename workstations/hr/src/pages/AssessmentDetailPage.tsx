import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Badge, Button } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { ArrowLeft } from 'lucide-react'

interface AssessmentDetail {
  id: number
  staff_name: string
  staff_id: number
  position: string
  period: string
  scores: Record<string, number>
  overall: string
  status: 'pending' | 'in_progress' | 'completed'
  assessor: string
  comments?: string
}

const SCORE_KEYS = [
  '临床试验知识',
  '方案执行能力',
  '数据管理能力',
  '沟通协调能力',
  '质量合规意识',
]

const overallMap: Record<string, { variant: 'success' | 'primary' | 'warning' | 'error' }> = {
  优秀: { variant: 'success' },
  良好: { variant: 'primary' },
  合格: { variant: 'warning' },
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' }> = {
  pending: { label: '未开始', variant: 'default' },
  in_progress: { label: '评估中', variant: 'primary' },
  completed: { label: '已完成', variant: 'success' },
}

function getScoreColor(score: number): string {
  if (score >= 4) return 'bg-emerald-500'
  if (score >= 3) return 'bg-blue-500'
  if (score >= 2) return 'bg-amber-500'
  return 'bg-red-500'
}

export function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['assessment-detail', id],
    queryFn: () => api.get<AssessmentDetail>(`/hr/assessments/${id}`),
    enabled: !!id,
  })

  const a = data?.data

  if (isLoading || !a) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> 返回
          </Button>
        </div>
        <div className="text-slate-500">加载中...</div>
      </div>
    )
  }

  const statusInfo = statusMap[a.status] ?? { label: a.status, variant: 'default' as const }
  const overallInfo = overallMap[a.overall] ?? { variant: 'error' as const }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <h1 className="text-2xl font-bold text-slate-800">
          {a.staff_name} - {a.period}
        </h1>
      </div>

      <Card>
        <div className="p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">评估概要</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-slate-400">评估人：</span>
              <span className="text-slate-700">{a.assessor || '-'}</span>
            </div>
            <div>
              <span className="text-slate-400">综合评价：</span>
              <Badge variant={overallInfo.variant}>{a.overall || '-'}</Badge>
            </div>
            <div>
              <span className="text-slate-400">状态：</span>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">能力评分</h2>
          <div className="space-y-4">
            {SCORE_KEYS.map((key) => {
              const score = a.scores?.[key] ?? 0
              const pct = (score / 4) * 100
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-600">{key}</span>
                    <span className="text-sm font-medium text-slate-800">{score}/4</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getScoreColor(score)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {a.comments && (
        <Card>
          <div className="p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">评估意见</h2>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{a.comments}</p>
          </div>
        </Card>
      )}
    </div>
  )
}
