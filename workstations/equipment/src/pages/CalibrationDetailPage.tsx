import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { equipmentApi } from '@cn-kis/api-client'
import { ChevronLeft, Gauge } from 'lucide-react'

export function CalibrationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['calibration-detail', id],
    queryFn: () => equipmentApi.getCalibration(Number(id)),
    enabled: !!id,
  })

  const cal = (data?.data as any) ?? {}

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-4 h-4" /> 返回
        </button>
        <Gauge className="w-5 h-5 text-blue-600" />
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">校准详情</h1>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">加载中...</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { label: '设备编号', value: cal.equipment_code },
              { label: '校准类型', value: cal.calibration_type },
              { label: '校准日期', value: cal.calibration_date },
              { label: '下次校准日期', value: cal.next_calibration_date },
              { label: '校准机构', value: cal.calibrator },
              { label: '证书编号', value: cal.certificate_no },
              { label: '结果', value: cal.result },
              { label: '状态', value: cal.status },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-1">
                <span className="text-xs text-slate-500 font-medium">{label}</span>
                <span className="text-sm text-slate-800">{value ?? '-'}</span>
              </div>
            ))}
          </div>
          {cal.notes && (
            <div className="border-t border-slate-100 pt-4">
              <span className="text-xs text-slate-500 font-medium">备注</span>
              <p className="mt-1 text-sm text-slate-700">{cal.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
