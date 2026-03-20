import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { facilityApi } from '@cn-kis/api-client'
import { ChevronLeft, AlertTriangle } from 'lucide-react'

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-50 text-blue-700 border-blue-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
}

const SEVERITY_LABELS: Record<string, string> = {
  low: '低', medium: '中', high: '高', critical: '严重',
}

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['incident-detail', id],
    queryFn: () => facilityApi.getIncidentDetail(Number(id)),
    enabled: !!id,
  })

  const incident = (data?.data as any) ?? {}

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-4 h-4" /> 返回
        </button>
        <AlertTriangle className="w-5 h-5 text-amber-600" />
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">不合规事件详情</h1>
        {incident.severity && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${SEVERITY_COLORS[incident.severity] ?? ''}`}>
            {SEVERITY_LABELS[incident.severity] ?? incident.severity}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">加载中...</div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">事件信息</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { label: '事件编号', value: incident.incident_no },
                { label: '事件类型', value: incident.incident_type },
                { label: '发生时间', value: incident.occurred_at },
                { label: '发现人', value: incident.reporter_name },
                { label: '相关场地', value: incident.venue_name },
                { label: '处理状态', value: incident.status },
                { label: '处理人', value: incident.handler_name },
                { label: '处理时间', value: incident.resolved_at },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 font-medium">{label}</span>
                  <span className="text-sm text-slate-800">{value ?? '-'}</span>
                </div>
              ))}
            </div>
          </div>

          {incident.description && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-2">事件描述</h2>
              <p className="text-sm text-slate-700">{incident.description}</p>
            </div>
          )}

          {incident.corrective_action && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-2">纠正措施</h2>
              <p className="text-sm text-slate-700">{incident.corrective_action}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
