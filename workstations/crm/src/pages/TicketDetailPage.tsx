import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, Badge, Button } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { ArrowLeft } from 'lucide-react'

const PRIORITY_VARIANTS: Record<string, 'error' | 'warning' | 'default'> = {
  high: 'error',
  medium: 'warning',
  low: 'default',
}

const STATUS_VARIANTS: Record<string, 'default' | 'primary' | 'success'> = {
  pending: 'default',
  processing: 'primary',
  resolved: 'success',
  closed: 'success',
}

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['crm', 'ticket', id],
    queryFn: () =>
      api.get<{
        id: number
        code: string
        title: string
        client_name: string
        category: string
        priority: string
        status: string
        assignee: string
        description: string
        created_at: string
        resolved_at: string
      }>(`/crm/tickets/${id}`),
    enabled: !!id,
  })

  const ticket = data?.data
  if (!ticket) return <div className="p-6 text-center text-sm text-slate-400">加载中...</div>

  const priorityVariant = PRIORITY_VARIANTS[ticket.priority] ?? 'default'
  const statusVariant = STATUS_VARIANTS[ticket.status] ?? 'default'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          返回
        </Button>
        <h1 className="text-2xl font-bold text-slate-800">{ticket.title}</h1>
      </div>

      <Card className="p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs text-slate-500">工单编号</span>
            <p className="font-medium text-slate-800">{ticket.code}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">客户</span>
            <p className="font-medium text-slate-800">{ticket.client_name ?? '-'}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">分类</span>
            <p className="font-medium text-slate-800">{ticket.category ?? '-'}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">优先级</span>
            <p className="mt-1">
              <Badge variant={priorityVariant}>{ticket.priority ?? '-'}</Badge>
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">状态</span>
            <p className="mt-1">
              <Badge variant={statusVariant}>{ticket.status ?? '-'}</Badge>
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-500">处理人</span>
            <p className="font-medium text-slate-800">{ticket.assignee ?? '-'}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">创建时间</span>
            <p className="font-medium text-slate-800">{ticket.created_at ?? '-'}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">解决时间</span>
            <p className="font-medium text-slate-800">{ticket.resolved_at ?? '-'}</p>
          </div>
        </div>
      </Card>

      <Card title="描述" className="p-5">
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.description ?? '-'}</p>
      </Card>
    </div>
  )
}
