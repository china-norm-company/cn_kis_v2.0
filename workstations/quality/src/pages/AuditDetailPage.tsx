import { useQuery } from '@tanstack/react-query'
import { Card, Badge, Button } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

interface QualityAudit {
  id: number
  code: string
  title: string
  audit_type: string
  scope: string
  auditor: string
  auditor_org: string
  planned_date: string
  actual_date: string | null
  status: string
  summary: string
  create_time: string
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'primary' | 'warning' | 'success' }> = {
  planned: { label: '计划中', variant: 'default' },
  in_progress: { label: '执行中', variant: 'warning' },
  completed: { label: '已完成', variant: 'primary' },
  closed: { label: '已关闭', variant: 'success' },
}

const AUDIT_TYPE_MAP: Record<string, string> = {
  internal: '内部审计',
  external: '外部审计',
  client: '客户审计',
  inspection: '飞行检查',
}

export function AuditDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data, isLoading, error } = useQuery({
    queryKey: ['quality', 'audits', 'detail', id],
    queryFn: () => api.get<QualityAudit>(`/quality/audits/${id}`),
    enabled: !!id,
  })

  const audit = data?.data

  if (isLoading) return <div className="text-sm text-slate-400 p-6">加载中...</div>
  if (error || !audit) return <div className="text-sm text-slate-500 p-6">加载失败或审计不存在</div>

  const statusInfo = STATUS_MAP[audit.status] ?? { label: audit.status, variant: 'default' as const }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center gap-3">
        <Button className="min-h-11" variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/audit-management')}>
          返回
        </Button>
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">审计详情</h1>
      </div>

      <Card className="p-4 md:p-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          <div>
            <p className="text-sm text-slate-500">审计编号</p>
            <p className="font-medium text-slate-800">{audit.code}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">审计名称</p>
            <p className="font-medium text-slate-800">{audit.title}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">类型</p>
            <p className="font-medium text-slate-800">{AUDIT_TYPE_MAP[audit.audit_type] ?? audit.audit_type}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">状态</p>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <div>
            <p className="text-sm text-slate-500">审计员</p>
            <p className="font-medium text-slate-800">{audit.auditor}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">审计员组织</p>
            <p className="font-medium text-slate-800">{audit.auditor_org}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">计划日期</p>
            <p className="font-medium text-slate-800">{audit.planned_date}</p>
          </div>
          <div>
            <p className="text-sm text-slate-500">实际日期</p>
            <p className="font-medium text-slate-800">{audit.actual_date ?? '-'}</p>
          </div>
        </div>
        {audit.scope && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-sm text-slate-500 mb-1">审计范围</p>
            <p className="text-slate-800 whitespace-pre-wrap">{audit.scope}</p>
          </div>
        )}
        {audit.summary && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-sm text-slate-500 mb-1">审计摘要</p>
            <p className="text-slate-800 whitespace-pre-wrap">{audit.summary}</p>
          </div>
        )}
      </Card>
    </div>
  )
}
