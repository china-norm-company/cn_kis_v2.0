import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { equipmentApi } from '@cn-kis/api-client'
import { ChevronLeft, Monitor } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  idle: 'bg-slate-50 text-slate-600 border-slate-200',
  maintenance: 'bg-amber-50 text-amber-700 border-amber-200',
  retired: 'bg-red-50 text-red-600 border-red-200',
}

const STATUS_LABELS: Record<string, string> = {
  active: '在用', idle: '闲置', maintenance: '维修中', retired: '已报废',
}

export function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['equipment-detail', id],
    queryFn: () => equipmentApi.getLedgerDetail(Number(id)),
    enabled: !!id,
  })

  const equip = (data?.data as any) ?? {}

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ChevronLeft className="w-4 h-4" /> 返回
        </button>
        <Monitor className="w-5 h-5 text-blue-600" />
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">设备详情</h1>
        {equip.status && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[equip.status] ?? ''}`}>
            {STATUS_LABELS[equip.status] ?? equip.status}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">加载中...</div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">基本信息</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { label: '设备编号', value: equip.equipment_code ?? equip.code },
                { label: '设备名称', value: equip.name },
                { label: '型号', value: equip.model ?? equip.model_number },
                { label: '制造商', value: equip.manufacturer },
                { label: '序列号', value: equip.serial_no ?? equip.serial_number },
                { label: '购置日期', value: equip.purchase_date },
                { label: '存放位置', value: equip.location },
                { label: '负责人', value: equip.responsible_person },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500 font-medium">{label}</span>
                  <span className="text-sm text-slate-800">{value ?? '-'}</span>
                </div>
              ))}
            </div>
          </div>

          {equip.recent_calibrations && equip.recent_calibrations.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-4">近期校准记录</h2>
              <div className="space-y-2">
                {equip.recent_calibrations.map((cal: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-sm py-2 border-b border-slate-100 last:border-0">
                    <span className="text-slate-600">{cal.calibration_date}</span>
                    <span className="text-slate-500">{cal.calibration_type}</span>
                    <span className="text-slate-800">{cal.result ?? '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
