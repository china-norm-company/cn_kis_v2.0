/**
 * 异常上报对话框
 *
 * 浮动按钮 + 模态对话框：
 * - 选择异常类型 → 严重程度 → 详细描述 → 提交
 * - 严重级别（high/critical）自动通知上级
 * - 提交后创建 WorkOrderException 记录
 */
import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { evaluatorApi } from '@cn-kis/api-client'

const EXCEPTION_TYPES = [
  { value: 'technical_issue', label: '技术问题' },
  { value: 'equipment_failure', label: '设备故障' },
  { value: 'environment_issue', label: '环境异常' },
  { value: 'subject_issue', label: '受试者问题' },
  { value: 'quality_issue', label: '质量问题' },
  { value: 'resource_unavailable', label: '资源不可用' },
  { value: 'delay', label: '延迟' },
  { value: 'other', label: '其他' },
]

const SEVERITY_LEVELS = [
  { value: 'low', label: '低', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'medium', label: '中', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'high', label: '高', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'critical', label: '严重', color: 'bg-red-100 text-red-700 border-red-200' },
]

interface ExceptionDialogProps {
  workOrderId: number
  onClose: () => void
  onSuccess?: (result: { exception_id: number; auto_deviation: boolean }) => void
}

export function ExceptionDialog({ workOrderId, onClose, onSuccess }: ExceptionDialogProps) {
  const [type, setType] = useState('technical_issue')
  const [severity, setSeverity] = useState('medium')
  const [description, setDescription] = useState('')
  const [impact, setImpact] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError('请填写异常描述')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await evaluatorApi.reportException(workOrderId, {
        exception_type: type,
        severity,
        description: description.trim(),
        impact_analysis: impact.trim(),
      }) as any
      const data = res?.data
      if (data?.exception_id) {
        onSuccess?.({ exception_id: data.exception_id, auto_deviation: data.auto_deviation ?? false })
      }
      onClose()
    } catch (e) {
      setError('上报失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center gap-3 p-5 border-b border-slate-200">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-800">上报异常</h3>
            <p className="text-xs text-slate-400">WO#{workOrderId}</p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* 异常类型 */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">异常类型</label>
            <div className="grid grid-cols-2 gap-2">
              {EXCEPTION_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                    type === t.value
                      ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 严重程度 */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">严重程度</label>
            <div className="flex gap-2">
              {SEVERITY_LEVELS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSeverity(s.value)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    severity === s.value ? s.color : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {(severity === 'high' || severity === 'critical') && (
              <p className="text-xs text-amber-600 mt-1.5">
                {severity === 'critical' ? '严重异常将自动创建偏差记录并通知质量部门' : '高级别异常将自动通知上级'}
              </p>
            )}
          </div>

          {/* 异常描述 */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              异常描述 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); setError('') }}
              rows={4}
              placeholder="请详细描述异常情况：发生了什么？在哪个步骤？影响范围..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 影响分析（选填） */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">
              影响分析 <span className="text-slate-400 font-normal">(选填)</span>
            </label>
            <textarea
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
              rows={2}
              placeholder="对工单执行、数据质量、受试者安全的潜在影响..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 p-5 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!description.trim() || submitting}
            className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? '提交中...' : '确认上报'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 异常上报浮动按钮
 * 放置在页面右下角，始终可见
 */
export function ExceptionFloatingButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-red-600 text-white rounded-full shadow-lg hover:bg-red-700 transition-all hover:scale-105 flex items-center justify-center"
      title="上报异常"
    >
      <AlertTriangle className="w-6 h-6" />
    </button>
  )
}
