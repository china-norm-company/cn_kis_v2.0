import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Microscope, Play, CheckCircle, Plus, AlertCircle } from 'lucide-react'
import { evaluatorApi } from '@cn-kis/api-client'

interface InstrumentDetectionPanelProps {
  workOrderId: number
  resources?: { resource_category_name: string; resource_item_name?: string; resource_item_id?: number }[]
}

export function InstrumentDetectionPanel({ workOrderId, resources = [] }: InstrumentDetectionPanelProps) {
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [detectionName, setDetectionName] = useState('')
  const [detectionMethod, setDetectionMethod] = useState('')
  const [selectedEquipment, setSelectedEquipment] = useState<number | undefined>()

  const [qcPassed, setQcPassed] = useState<boolean | null>(null)
  const [qcNotes, setQcNotes] = useState('')

  const equipmentResources = resources.filter(r => r.resource_category_name === '仪器')

  const { data: detectionsRes, refetch } = useQuery({
    queryKey: ['evaluator', 'detections', workOrderId],
    queryFn: () => evaluatorApi.createDetection(workOrderId, { detection_name: '__list__' }).catch(() => ({ data: { items: [] } })),
    enabled: false,
  })

  const createMutation = useMutation({
    mutationFn: () => evaluatorApi.createDetection(workOrderId, {
      equipment_id: selectedEquipment,
      detection_name: detectionName,
      detection_method: detectionMethod,
    }),
    onSuccess: () => {
      setShowCreateForm(false)
      setDetectionName('')
      setDetectionMethod('')
      queryClient.invalidateQueries({ queryKey: ['evaluator', 'detections', workOrderId] })
    },
  })

  const startMutation = useMutation({
    mutationFn: (id: number) => evaluatorApi.startDetection(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['evaluator', 'detections', workOrderId] }),
  })

  const completeMutation = useMutation({
    mutationFn: (id: number) => evaluatorApi.completeDetection(id, {
      qc_passed: qcPassed ?? undefined,
      qc_notes: qcNotes,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['evaluator', 'detections', workOrderId] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Microscope className="w-4 h-4 text-indigo-500" />
          仪器检测管理
        </h4>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700"
        >
          <Plus className="w-3 h-3" />新建检测
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-slate-50 rounded-lg p-4 space-y-3 border border-slate-200">
          <div>
            <label className="text-xs text-slate-500 block mb-1">检测名称</label>
            <input
              type="text"
              value={detectionName}
              onChange={(e) => setDetectionName(e.target.value)}
              placeholder="例如：皮肤含水量检测"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">检测方法</label>
            <input
              type="text"
              value={detectionMethod}
              onChange={(e) => setDetectionMethod(e.target.value)}
              placeholder="例如：Corneometer 探头法"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          {equipmentResources.length > 0 && (
            <div>
              <label className="text-xs text-slate-500 block mb-1">选择设备</label>
              <select
                value={selectedEquipment ?? ''}
                onChange={(e) => setSelectedEquipment(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                <option value="">请选择设备</option>
                {equipmentResources.map((r, i) => (
                  <option key={i} value={r.resource_item_id}>{r.resource_item_name ?? `设备 ${i + 1}`}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={!detectionName.trim() || createMutation.isPending}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {createMutation.isPending ? '创建中...' : '创建检测'}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <h5 className="text-sm font-medium text-indigo-700 mb-2">QC 判定</h5>
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => setQcPassed(true)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium ${
              qcPassed === true ? 'bg-green-100 text-green-700 ring-2 ring-green-300' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            <CheckCircle className="w-4 h-4" />通过
          </button>
          <button
            onClick={() => setQcPassed(false)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium ${
              qcPassed === false ? 'bg-red-100 text-red-700 ring-2 ring-red-300' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            <AlertCircle className="w-4 h-4" />不通过
          </button>
        </div>
        <textarea
          value={qcNotes}
          onChange={(e) => setQcNotes(e.target.value)}
          rows={2}
          placeholder="QC 备注..."
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
        />
      </div>
    </div>
  )
}
