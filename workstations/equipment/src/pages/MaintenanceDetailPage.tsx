import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { equipmentApi } from '@cn-kis/api-client'
import { ChevronLeft, Wrench } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  completed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-slate-50 text-slate-600 border-slate-200',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理', in_progress: '进行中', completed: '已完成', cancelled: '已取消',
}

export function MaintenanceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['maintenance-detail', id],
    queryFn: () => equipmentApi.getMaintenance(Number(id)),
    enabled: !!id,
  })

  const maint = (data?.data as any) ?? {}

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-4 h-4" /> 返回
        </button>
        <Wrench className="w-5 h-5 text-amber-600" />
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">维护工单详情</h1>
        {maint.status && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[maint.status] ?? ''}`}>
            {STATUS_LABELS[maint.status] ?? maint.status}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">加载中...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { label: '工单编号', value: maint.order_no },
              { label: '设备编号', value: maint.equipment_code },
              { label: '维护类型', value: maint.maintenance_type },
              { label: '计划日期', value: maint.scheduled_date },
              { label: '实际完成日期', value: maint.completed_date },
              { label: '维护人员', value: maint.technician_name },
              { label: '费用', value: maint.cost != null ? `¥${maint.cost}` : null },
              { label: '维护结果', value: maint.result },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">{label}</span>
                <span className="text-sm text-slate-800">{value ?? '-'}</span>
              </div>
            ))}
          </div>
          {maint.description && (
            <div className="border-t border-slate-100 pt-4">
              <span className="text-xs text-slate-500 font-medium">维护描述</span>
              <p className="mt-1 text-sm text-slate-700">{maint.description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
