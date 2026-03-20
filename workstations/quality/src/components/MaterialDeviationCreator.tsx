/**
 * 物料偏差创建器 — M4 跨工作台集成
 *
 * 从物料问题快速创建质量偏差，连接怀瑾·质量台
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { qualityApi } from '@cn-kis/api-client'
import { AlertTriangle, FileWarning } from 'lucide-react'

interface MaterialDeviationCreatorProps {
  materialType: 'sample' | 'consumable' | 'product'
  materialName: string
  materialCode: string
  issueDescription?: string
  onCreated?: (deviationId: number) => void
  onCancel?: () => void
}

const MATERIAL_DEVIATION_TYPES = [
  { value: 'temperature_excursion', label: '温度偏差' },
  { value: 'quantity_discrepancy', label: '数量差异' },
  { value: 'packaging_damage', label: '包装破损' },
  { value: 'expiry_issue', label: '效期问题' },
  { value: 'label_error', label: '标签错误' },
  { value: 'contamination', label: '污染' },
  { value: 'storage_violation', label: '储存违规' },
  { value: 'other', label: '其他' },
]

export function MaterialDeviationCreator({
  materialType,
  materialName,
  materialCode,
  issueDescription,
  onCreated,
  onCancel,
}: MaterialDeviationCreatorProps) {
  const [title, setTitle] = useState(`物料偏差 - ${materialName} (${materialCode})`)
  const [description, setDescription] = useState(issueDescription || '')
  const [severity, setSeverity] = useState<'minor' | 'major' | 'critical'>('minor')
  const [category, setCategory] = useState('material')
  const [subCategory, setSubCategory] = useState('temperature_excursion')

  const createMutation = useMutation({
    mutationFn: (data: {
      title: string
      category: string
      severity: string
      description?: string
      reported_at: string
      project: string
      project_id?: number
    }) => qualityApi.createDeviation(data),
    onSuccess: (res: any) => {
      const id = res?.data?.id ?? res?.id
      if (id) onCreated?.(id)
    },
  })

  const handleCreate = () => {
    createMutation.mutate({
      title,
      category: 'material',
      severity,
      description: `${description}\n\n关联物料：${materialName} (${materialCode}) - ${materialType === 'sample' ? '样品' : materialType === 'consumable' ? '耗材' : '产品'}\n偏差类型：${MATERIAL_DEVIATION_TYPES.find(t => t.value === subCategory)?.label ?? subCategory}`,
      reported_at: new Date().toISOString().slice(0, 10),
      project: materialCode,
    })
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
        <FileWarning className="w-5 h-5 text-amber-600" />创建物料偏差
      </h3>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        <strong>关联物料：</strong>{materialName} ({materialCode}) - {materialType === 'sample' ? '样品' : materialType === 'consumable' ? '耗材' : '产品'}
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="deviation-title" className="text-sm font-medium text-slate-700">偏差标题</label>
          <input id="deviation-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" aria-label="偏差标题" />
        </div>
        <div>
          <label htmlFor="deviation-type" className="text-sm font-medium text-slate-700">偏差类型</label>
          <select id="deviation-type" value={subCategory} onChange={(e) => setSubCategory(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" aria-label="偏差类型">
            {MATERIAL_DEVIATION_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="deviation-severity" className="text-sm font-medium text-slate-700">严重程度</label>
          <select id="deviation-severity" value={severity} onChange={(e) => setSeverity(e.target.value as 'minor' | 'major' | 'critical')}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" aria-label="严重程度">
            <option value="minor">轻微</option>
            <option value="major">重大</option>
            <option value="critical">严重</option>
          </select>
        </div>
        <div>
          <label htmlFor="deviation-desc" className="text-sm font-medium text-slate-700">偏差描述</label>
          <textarea id="deviation-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" aria-label="偏差描述" />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && <button onClick={onCancel} className="px-4 py-2 text-sm border border-slate-300 rounded-lg">取消</button>}
        <button
          onClick={handleCreate}
          disabled={!title || createMutation.isPending}
          className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4" />创建偏差
        </button>
      </div>
    </div>
  )
}
