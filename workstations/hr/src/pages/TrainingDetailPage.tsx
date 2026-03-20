import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Badge, Button } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { ArrowLeft } from 'lucide-react'

interface TrainingDetail {
  id: number
  course_name: string
  category: string
  trainer: string
  start_date: string
  end_date: string
  hours: number
  status: 'scheduled' | 'in_progress' | 'completed' | 'overdue'
  score: string | number | null
  description?: string
  trainee_name: string
  trainee_id: number
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'error' }> = {
  scheduled: { label: '已排期', variant: 'default' },
  in_progress: { label: '进行中', variant: 'primary' },
  completed: { label: '已完成', variant: 'success' },
  overdue: { label: '已逾期', variant: 'error' },
}

export function TrainingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['training-detail', id],
    queryFn: () => api.get<TrainingDetail>(`/hr/trainings/${id}`),
    enabled: !!id,
  })

  const t = data?.data

  if (isLoading || !t) {
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

  const statusInfo = statusMap[t.status] ?? { label: t.status, variant: 'default' as const }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <h1 className="text-2xl font-bold text-slate-800">{t.course_name}</h1>
      </div>

      <Card>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-slate-500">类别</div>
              <div className="font-medium text-slate-800">{t.category || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">讲师</div>
              <div className="font-medium text-slate-800">{t.trainer || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">开始日期</div>
              <div className="font-medium text-slate-800">{t.start_date || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">结束日期</div>
              <div className="font-medium text-slate-800">{t.end_date || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">学时</div>
              <div className="font-medium text-slate-800">{t.hours ?? '-'}h</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">状态</div>
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </div>
            <div>
              <div className="text-xs text-slate-500">考核分</div>
              <div className="font-medium text-slate-800">{t.score ?? '-'}</div>
            </div>
          </div>
        </div>
      </Card>

      {t.description && (
        <Card>
          <div className="p-4">
            <div className="text-sm font-medium text-slate-700 mb-2">课程说明</div>
            <div className="text-sm text-slate-600 whitespace-pre-wrap">{t.description}</div>
          </div>
        </Card>
      )}
    </div>
  )
}
