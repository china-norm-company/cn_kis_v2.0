/**
 * 仪器检测数据录入表单
 *
 * 根据检测方法模板动态渲染：
 * - 支持数值输入（带单位和范围校验）
 * - 多点测量模式（如 5 个部位各测 3 次取平均）
 * - 自动计算平均值、标准差
 * - 超出正常范围时显示警告
 */
import { useState, useMemo } from 'react'
import { AlertTriangle, Calculator, Check } from 'lucide-react'

interface MeasurementPoint {
  name: string
  code: string
  repeat: number
}

interface NormalRange {
  min?: number
  max?: number
  unit?: string
  notes?: string
}

interface DetectionFormProps {
  detectionName: string
  measurementPoints?: MeasurementPoint[]
  normalRange?: NormalRange
  onSubmit: (data: DetectionResultData) => void
  isSubmitting?: boolean
}

export interface DetectionResultData {
  measurements: Record<string, number[]>
  averages: Record<string, number>
  overall_average: number
  overall_std: number
  out_of_range: string[]
  raw_data: Record<string, unknown>
}

export function DetectionForm({
  detectionName,
  measurementPoints = [],
  normalRange = {},
  onSubmit,
  isSubmitting,
}: DetectionFormProps) {
  // Default measurement points if none provided
  const points: MeasurementPoint[] = measurementPoints.length > 0 ? measurementPoints : [
    { name: '左颊', code: 'L_CHEEK', repeat: 3 },
    { name: '右颊', code: 'R_CHEEK', repeat: 3 },
    { name: '额头', code: 'FOREHEAD', repeat: 3 },
    { name: '下颏', code: 'CHIN', repeat: 3 },
  ]

  const [values, setValues] = useState<Record<string, number[]>>(() => {
    const init: Record<string, number[]> = {}
    for (const p of points) {
      init[p.code] = Array(p.repeat).fill(NaN)
    }
    return init
  })

  const unit = normalRange.unit ?? 'AU'
  const rangeMin = normalRange.min
  const rangeMax = normalRange.max

  const handleValueChange = (code: string, idx: number, val: string) => {
    setValues((prev) => {
      const arr = [...(prev[code] ?? [])]
      arr[idx] = val === '' ? NaN : parseFloat(val)
      return { ...prev, [code]: arr }
    })
  }

  // Compute statistics
  const stats = useMemo(() => {
    const averages: Record<string, number> = {}
    const outOfRange: string[] = []
    const allValues: number[] = []

    for (const p of points) {
      const vals = (values[p.code] ?? []).filter((v) => !isNaN(v))
      if (vals.length > 0) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length
        averages[p.code] = Math.round(avg * 100) / 100
        allValues.push(...vals)

        if (rangeMin != null && avg < rangeMin) outOfRange.push(p.name)
        if (rangeMax != null && avg > rangeMax) outOfRange.push(p.name)
      }
    }

    const overallAvg = allValues.length > 0
      ? allValues.reduce((a, b) => a + b, 0) / allValues.length
      : 0
    const overallStd = allValues.length > 1
      ? Math.sqrt(allValues.reduce((sum, v) => sum + (v - overallAvg) ** 2, 0) / (allValues.length - 1))
      : 0

    return {
      averages,
      overallAvg: Math.round(overallAvg * 100) / 100,
      overallStd: Math.round(overallStd * 100) / 100,
      outOfRange,
    }
  }, [values, points, rangeMin, rangeMax])

  const allFilled = points.every((p) =>
    (values[p.code] ?? []).every((v) => !isNaN(v))
  )

  const handleSubmit = () => {
    if (!allFilled) return
    onSubmit({
      measurements: values,
      averages: stats.averages,
      overall_average: stats.overallAvg,
      overall_std: stats.overallStd,
      out_of_range: stats.outOfRange,
      raw_data: { values, normal_range: normalRange },
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">{detectionName} 数据录入</h4>
        {normalRange.min != null && normalRange.max != null && (
          <span className="text-xs text-slate-400">
            正常范围: {normalRange.min} - {normalRange.max} {unit}
          </span>
        )}
      </div>

      {/* 测量点表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-2 text-slate-500 font-medium">测量部位</th>
              {Array.from({ length: Math.max(...points.map((p) => p.repeat)) }).map((_, i) => (
                <th key={i} className="text-center py-2 px-2 text-slate-500 font-medium">
                  第 {i + 1} 次
                </th>
              ))}
              <th className="text-center py-2 px-2 text-slate-500 font-medium">平均值</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => {
              const avg = stats.averages[p.code]
              const isOOR = stats.outOfRange.includes(p.name)
              return (
                <tr key={p.code} className="border-b border-slate-100">
                  <td className="py-2 px-2 text-slate-700 font-medium">{p.name}</td>
                  {Array.from({ length: p.repeat }).map((_, i) => (
                    <td key={i} className="py-2 px-2">
                      <input
                        type="number"
                        step="0.01"
                        value={isNaN(values[p.code]?.[i]) ? '' : values[p.code][i]}
                        onChange={(e) => handleValueChange(p.code, i, e.target.value)}
                        className="w-20 px-2 py-1 border border-slate-200 rounded text-center text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="--"
                      />
                    </td>
                  ))}
                  <td className="py-2 px-2 text-center">
                    <span className={`font-mono font-medium ${isOOR ? 'text-red-600' : 'text-slate-700'}`}>
                      {avg != null ? `${avg} ${unit}` : '--'}
                    </span>
                    {isOOR && <AlertTriangle className="w-3.5 h-3.5 text-red-500 inline ml-1" />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 超范围警告 */}
      {stats.outOfRange.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-red-700">检测值超出正常范围</p>
            <p className="text-red-600 text-xs mt-0.5">
              超范围部位：{stats.outOfRange.join('、')}
              {normalRange.notes && <span className="ml-1">({normalRange.notes})</span>}
            </p>
          </div>
        </div>
      )}

      {/* 统计汇总 */}
      <div className="flex items-center gap-6 p-3 bg-slate-50 rounded-lg">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500">总平均值:</span>
          <span className="text-sm font-mono font-medium text-slate-700">{stats.overallAvg} {unit}</span>
        </div>
        <div>
          <span className="text-xs text-slate-500">标准差:</span>
          <span className="text-sm font-mono font-medium text-slate-700 ml-1">{stats.overallStd}</span>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!allFilled || isSubmitting}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        <Check className="w-4 h-4" />
        {isSubmitting ? '提交中...' : '提交检测数据'}
      </button>
    </div>
  )
}
