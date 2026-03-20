/**
 * 分步操作引导组件
 *
 * 垂直步骤条布局，支持：
 * - 逐步高亮，当前步骤展开
 * - 每步：步骤说明 → 开始按钮 → 数据录入区 → 完成按钮
 * - 不允许跳步（除非标记为"跳过"并填写原因）
 * - 步骤完成后显示绿色勾号和实际耗时
 * - 计时显示
 */
import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, Clock, Play, SkipForward, ChevronDown, ChevronRight } from 'lucide-react'
import type { ExperimentStep } from '@cn-kis/api-client'

interface StepGuideProps {
  steps: ExperimentStep[]
  onStartStep: (stepId: number) => void
  onCompleteStep: (stepId: number, data?: { execution_data?: Record<string, unknown>; result?: string }) => void
  onSkipStep: (stepId: number, reason: string) => void
  isStarting?: boolean
  isCompleting?: boolean
  renderStepContent?: (step: ExperimentStep) => React.ReactNode
}

export function StepGuide({
  steps, onStartStep, onCompleteStep, onSkipStep,
  isStarting, isCompleting, renderStepContent,
}: StepGuideProps) {
  const [expandedStepId, setExpandedStepId] = useState<number | null>(null)
  const [skipReason, setSkipReason] = useState('')
  const [showSkipDialog, setShowSkipDialog] = useState<number | null>(null)

  // Auto-expand current step
  useEffect(() => {
    const current = steps.find((s) => s.status === 'in_progress')
    if (current) setExpandedStepId(current.id)
  }, [steps])

  return (
    <div className="space-y-2">
      {steps.map((step, idx) => {
        const isCurrent = step.status === 'in_progress'
        const isDone = step.status === 'completed' || step.status === 'skipped'
        const isFailed = step.status === 'failed'
        const isPending = step.status === 'pending'
        const canStart = isPending && (idx === 0 || ['completed', 'skipped'].includes(steps[idx - 1]?.status))
        const isExpanded = expandedStepId === step.id

        return (
          <div key={step.id} className="relative">
            {/* 连接线 */}
            {idx < steps.length - 1 && (
              <div className={`absolute left-4 top-12 bottom-0 w-0.5 ${isDone ? 'bg-green-200' : 'bg-slate-200'}`} />
            )}

            <div className={`rounded-lg border transition-colors ${
              isCurrent ? 'border-indigo-300 bg-indigo-50/50 shadow-sm' :
              isDone ? 'border-green-200 bg-green-50/30' :
              isFailed ? 'border-red-200 bg-red-50/30' :
              'border-slate-200 bg-white'
            }`}>
              {/* 步骤头部 */}
              <button
                onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                className="w-full flex items-center gap-3 p-3 text-left"
              >
                {/* 步骤序号 */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  isDone ? 'bg-green-100 text-green-700' :
                  isCurrent ? 'bg-indigo-100 text-indigo-700 animate-pulse' :
                  isFailed ? 'bg-red-100 text-red-700' :
                  'bg-slate-100 text-slate-400'
                }`}>
                  {isDone ? <CheckCircle className="w-4 h-4" /> : step.step_number}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${
                      isDone ? 'text-green-700' :
                      isCurrent ? 'text-indigo-700' :
                      'text-slate-700'
                    }`}>
                      {step.step_name}
                    </p>
                    {step.status === 'skipped' && (
                      <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">已跳过</span>
                    )}
                  </div>
                  {step.estimated_duration_minutes > 0 && (
                    <span className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />预计 {step.estimated_duration_minutes} 分钟
                      {isDone && step.actual_duration_minutes != null && (
                        <span className="text-green-600 ml-2">实际 {step.actual_duration_minutes} 分钟</span>
                      )}
                    </span>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2 shrink-0">
                  {canStart && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onStartStep(step.id) }}
                      disabled={isStarting}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />开始
                    </button>
                  )}
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>
              </button>

              {/* 展开内容 */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-0 ml-11 border-t border-slate-100 mt-0">
                  {/* 步骤描述 */}
                  {step.step_description && (
                    <p className="text-sm text-slate-500 py-3">{step.step_description}</p>
                  )}

                  {/* 自定义步骤内容（如数据录入） */}
                  {renderStepContent && isCurrent && (
                    <div className="py-3 border-t border-slate-100">
                      {renderStepContent(step)}
                    </div>
                  )}

                  {/* 当前步骤计时器 */}
                  {isCurrent && step.started_at && (
                    <StepTimer startedAt={step.started_at} />
                  )}

                  {/* 完成 / 跳过按钮 */}
                  {isCurrent && (
                    <div className="flex gap-2 pt-3 border-t border-slate-100 mt-3">
                      <button
                        onClick={() => onCompleteStep(step.id)}
                        disabled={isCompleting}
                        className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />完成此步骤
                      </button>
                      <button
                        onClick={() => setShowSkipDialog(step.id)}
                        className="flex items-center gap-1 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50"
                      >
                        <SkipForward className="w-4 h-4" />跳过
                      </button>
                    </div>
                  )}

                  {/* 已跳过原因 */}
                  {step.status === 'skipped' && step.skip_reason && (
                    <div className="mt-2 p-2 bg-amber-50 rounded text-xs text-amber-700">
                      跳过原因：{step.skip_reason}
                    </div>
                  )}

                  {/* 执行结果 */}
                  {isDone && step.result && (
                    <div className="mt-2 p-2 bg-green-50 rounded text-xs text-green-700">
                      执行结果：{step.result}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 跳过原因对话框 */}
            {showSkipDialog === step.id && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                <div className="bg-white rounded-xl shadow-xl w-[400px] p-6 space-y-4">
                  <h3 className="text-lg font-semibold text-slate-800">跳过步骤</h3>
                  <p className="text-sm text-slate-500">跳过步骤需填写原因，该记录将被审计追踪。</p>
                  <textarea
                    value={skipReason}
                    onChange={(e) => setSkipReason(e.target.value)}
                    rows={3}
                    placeholder="请填写跳过此步骤的原因..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => { setShowSkipDialog(null); setSkipReason('') }}
                      className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => {
                        onSkipStep(step.id, skipReason)
                        setShowSkipDialog(null)
                        setSkipReason('')
                      }}
                      disabled={!skipReason.trim()}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                    >
                      确认跳过
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 步骤计时器 */
function StepTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startTime = new Date(startedAt).getTime()
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  return (
    <div className="flex items-center gap-2 text-sm text-indigo-600 py-2">
      <Clock className="w-4 h-4" />
      <span className="font-mono">{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</span>
      <span className="text-xs text-slate-400">已用时</span>
    </div>
  )
}
