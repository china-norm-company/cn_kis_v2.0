/**
 * 温度异常物料隔离建议 — M4 跨工作台集成
 *
 * 设施台环境监控中，温度异常时展示受影响物料及隔离建议
 */
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { materialApi, qualityApi } from '@cn-kis/api-client'
import { AlertTriangle, Shield, ThermometerSun } from 'lucide-react'

interface MaterialIsolationAlertProps {
  locationCode: string
  currentTemperature: number
  upperLimit: number
  lowerLimit: number
}

export function MaterialIsolationAlert({ locationCode, currentTemperature, upperLimit, lowerLimit }: MaterialIsolationAlertProps) {
  const isExcursion = currentTemperature > upperLimit || currentTemperature < lowerLimit
  const [acknowledged, setAcknowledged] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')

  const { data: inventoryData } = useQuery({
    queryKey: ['material', 'inventory-at-risk', locationCode],
    queryFn: () => materialApi.listInventory({ zone: locationCode }),
    enabled: isExcursion,
  })
  const atRiskItems = (inventoryData as any)?.data?.items ?? []
  const createDeviation = useMutation({
    mutationFn: async () => {
      const title = `环境超标-隔离建议(${locationCode})`
      const content = `温度 ${currentTemperature}°C，允许范围 ${lowerLimit}~${upperLimit}°C。已触发物料隔离建议。`
      return qualityApi.createDeviation({
        title,
        category: '环境偏差',
        severity: 'major',
        description: content,
        source: 'environment_excursion',
        source_workstation: 'facility',
      } as any)
    },
    onSuccess: () => setSubmitMsg('已创建质量偏差记录，请质量台跟进'),
    onError: () => setSubmitMsg('创建偏差记录失败，请稍后重试'),
  })

  if (!isExcursion || acknowledged) return null

  return (
    <div className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-red-800 font-semibold">
        <ThermometerSun className="w-5 h-5" />
        温度异常警报 — 物料隔离建议
      </div>
      <p className="text-sm text-red-700">
        库位 <strong>{locationCode}</strong> 当前温度 <strong>{currentTemperature}°C</strong>，
        超出允许范围 ({lowerLimit}°C ~ {upperLimit}°C)。
        以下物料可能受到影响，建议立即隔离检查：
      </p>
      {atRiskItems.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-red-700 border-b border-red-200">
              <th className="text-left py-1">物料名称</th>
              <th className="text-left py-1">批号</th>
              <th className="text-right py-1">数量</th>
            </tr>
          </thead>
          <tbody>
            {atRiskItems.map((item: any) => (
              <tr key={item.id} className="border-b border-red-100">
                <td className="py-1">{item.material_name || item.name || item.product_name}</td>
                <td className="py-1">{item.batch_number || item.batch_no || '-'}</td>
                <td className="py-1 text-right">{item.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => createDeviation.mutate()}
          disabled={createDeviation.isPending}
          className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 flex items-center gap-1 disabled:opacity-60"
        >
          <Shield className="w-3 h-3" />发起隔离
        </button>
        <button onClick={() => setAcknowledged(true)} className="px-3 py-1.5 border border-red-300 text-red-700 text-xs rounded-lg hover:bg-red-100">
          已知悉
        </button>
      </div>
      {submitMsg && <p className="text-xs text-red-700">{submitMsg}</p>}
    </div>
  )
}
