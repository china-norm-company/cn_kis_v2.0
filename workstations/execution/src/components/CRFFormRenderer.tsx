/**
 * CRF 动态表单渲染器
 *
 * 根据 CRFTemplate 的 JSON Schema（questions 数组）动态渲染表单字段。
 * 支持 8 种字段类型：text / number / select / radio / checkbox / date / textarea / scale
 *
 * 功能：
 * - 草稿自动保存（每 30 秒或字段失焦）
 * - 必填字段校验
 * - 服务端验证错误高亮
 * - 三次测量自动计算平均值
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { edcApi } from '@cn-kis/api-client'
import type { CRFTemplate, CRFQuestion, CRFValidationResult } from '@cn-kis/api-client'
import { Badge } from '@cn-kis/ui-kit'
import { Save, Send, AlertCircle, CheckCircle } from 'lucide-react'

interface CRFFormRendererProps {
  template: CRFTemplate
  workOrderId: number
  existingRecordId?: number
  existingData?: Record<string, unknown>
  onSaved?: (recordId: number) => void
  onSubmitted?: (recordId: number) => void
  readOnly?: boolean
}

export default function CRFFormRenderer({
  template,
  workOrderId,
  existingRecordId,
  existingData,
  onSaved,
  onSubmitted,
  readOnly = false,
}: CRFFormRendererProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(existingData || {})
  const [recordId, setRecordId] = useState<number | undefined>(existingRecordId)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [serverErrors, setServerErrors] = useState<CRFValidationResult[]>([])
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [submitted, setSubmitted] = useState(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedData = useRef<string>('')

  const questions = template.schema?.questions || []

  // Auto-save every 30 seconds
  useEffect(() => {
    if (readOnly || submitted) return

    autoSaveTimer.current = setInterval(() => {
      const currentJson = JSON.stringify(formData)
      if (currentJson !== lastSavedData.current && Object.keys(formData).length > 0) {
        handleSaveDraft()
      }
    }, 30000)

    return () => {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current)
    }
  }, [formData, readOnly, submitted])

  const saveMutation = useMutation({
    mutationFn: async () => {
      setSaveStatus('saving')
      if (recordId) {
        return edcApi.updateRecord(recordId, formData)
      } else {
        return edcApi.createRecord({
          template_id: template.id,
          work_order_id: workOrderId,
          data: formData,
        })
      }
    },
    onSuccess: (res) => {
      setSaveStatus('saved')
      lastSavedData.current = JSON.stringify(formData)
      const newId = (res.data as any)?.id || recordId
      if (newId && !recordId) setRecordId(newId)
      onSaved?.(newId!)
      setTimeout(() => setSaveStatus('idle'), 2000)
    },
    onError: () => {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)
    },
  })

  const submitMutation = useMutation({
    mutationFn: async () => {
      // Save first if needed
      if (!recordId) {
        const res = await edcApi.createRecord({
          template_id: template.id,
          work_order_id: workOrderId,
          data: formData,
        })
        const newId = (res.data as any)?.id
        if (newId) {
          setRecordId(newId)
          await edcApi.submitRecord(newId)
          return edcApi.validateRecord(newId)
        }
      } else {
        await edcApi.updateRecord(recordId, formData)
        await edcApi.submitRecord(recordId)
        return edcApi.validateRecord(recordId)
      }
    },
    onSuccess: (res) => {
      const errors = (res?.data || []) as CRFValidationResult[]
      setServerErrors(errors)
      if (errors.filter((e) => e.severity === 'error').length === 0) {
        setSubmitted(true)
        onSubmitted?.(recordId!)
      }
    },
  })

  const handleSaveDraft = useCallback(() => {
    if (readOnly) return
    saveMutation.mutate()
  }, [formData, recordId, readOnly])

  const handleFieldChange = (questionId: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [questionId]: value }))
    // Clear error for this field
    setValidationErrors((prev) => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
  }

  const handleSubmit = () => {
    // Client-side validation
    const errors: Record<string, string> = {}
    questions.forEach((q) => {
      if (q.required) {
        const val = formData[q.id]
        if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
          errors[q.id] = '此项为必填'
        }
      }
    })
    setValidationErrors(errors)
    if (Object.keys(errors).length > 0) return

    submitMutation.mutate()
  }

  const allRequiredFilled = questions
    .filter((q) => q.required)
    .every((q) => {
      const val = formData[q.id]
      return val !== undefined && val !== null && val !== '' && !(Array.isArray(val) && val.length === 0)
    })

  const getServerError = (fieldId: string) =>
    serverErrors.find((e) => e.field_name === fieldId && e.severity === 'error')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-800">
            {template.schema?.title || template.name}
          </h3>
          {template.schema?.description && (
            <p className="text-sm text-slate-500 mt-1">{template.schema.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Save className="w-3 h-3 animate-pulse" /> 保存中...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> 已保存
            </span>
          )}
          {submitted && <Badge variant="success">已提交</Badge>}
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-5">
        {questions.map((question) => (
          <QuestionField
            key={question.id}
            question={question}
            value={formData[question.id]}
            onChange={(val) => handleFieldChange(question.id, val)}
            error={validationErrors[question.id]}
            serverError={getServerError(question.id)}
            readOnly={readOnly || submitted}
            allFormData={formData}
            onFieldChange={handleFieldChange}
          />
        ))}
      </div>

      {/* Actions */}
      {!readOnly && !submitted && (
        <div className="flex items-center justify-between pt-4 border-t">
          <button
            onClick={handleSaveDraft}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            保存草稿
          </button>
          <button
            onClick={handleSubmit}
            disabled={!allRequiredFilled || submitMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            {submitMutation.isPending ? '提交中...' : '提交'}
          </button>
        </div>
      )}

      {/* Server validation errors */}
      {serverErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700 text-sm font-medium mb-2">
            <AlertCircle className="w-4 h-4" />
            数据验证发现以下问题
          </div>
          <ul className="text-xs text-red-600 space-y-1 ml-6 list-disc">
            {serverErrors.map((e, i) => (
              <li key={i}>{e.field_name}: {e.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 字段渲染组件
// ============================================================================
interface QuestionFieldProps {
  question: CRFQuestion
  value: unknown
  onChange: (value: unknown) => void
  error?: string
  serverError?: CRFValidationResult
  readOnly: boolean
  allFormData: Record<string, unknown>
  onFieldChange: (id: string, val: unknown) => void
}

function QuestionField({
  question, value, onChange, error, serverError, readOnly,
  allFormData, onFieldChange,
}: QuestionFieldProps) {
  const hasError = !!error || !!serverError
  const errorMsg = error || serverError?.message

  // Handle repeat + auto_average
  const repeatCount = question.repeat || 1
  const isRepeated = repeatCount > 1

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">
        {question.title}
        {question.required && <span className="text-red-500 ml-1">*</span>}
        {question.unit && <span className="text-xs text-slate-400 ml-2">({question.unit})</span>}
      </label>

      {/* Repeated number fields (e.g., 3 measurements + auto average) */}
      {isRepeated && question.type === 'number' ? (
        <RepeatedNumberField
          question={question}
          allFormData={allFormData}
          onFieldChange={onFieldChange}
          readOnly={readOnly}
          hasError={hasError}
        />
      ) : (
        <>
          {question.type === 'text' && (
            <input
              type="text"
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={question.placeholder || '请输入'}
              disabled={readOnly}
              className={`w-full px-3 py-2 border rounded-lg text-sm ${
                hasError ? 'border-red-300 bg-red-50' : 'border-slate-200'
              } disabled:bg-slate-50 disabled:text-slate-400`}
            />
          )}

          {question.type === 'number' && (
            <input
              type="number"
              value={value !== undefined && value !== null ? String(value) : ''}
              onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
              placeholder={question.placeholder || '请输入数值'}
              min={question.min}
              max={question.max}
              step={question.step || 'any'}
              disabled={readOnly}
              className={`w-full px-3 py-2 border rounded-lg text-sm ${
                hasError ? 'border-red-300 bg-red-50' : 'border-slate-200'
              } disabled:bg-slate-50 disabled:text-slate-400`}
            />
          )}

          {question.type === 'textarea' && (
            <textarea
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={question.placeholder || '请输入'}
              rows={3}
              disabled={readOnly}
              className={`w-full px-3 py-2 border rounded-lg text-sm ${
                hasError ? 'border-red-300 bg-red-50' : 'border-slate-200'
              } disabled:bg-slate-50 disabled:text-slate-400`}
            />
          )}

          {question.type === 'date' && (
            <input
              type="date"
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value)}
              disabled={readOnly}
              className={`w-full px-3 py-2 border rounded-lg text-sm ${
                hasError ? 'border-red-300 bg-red-50' : 'border-slate-200'
              } disabled:bg-slate-50 disabled:text-slate-400`}
            />
          )}

          {question.type === 'select' && question.options && (
            <select
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value)}
              disabled={readOnly}
              className={`w-full px-3 py-2 border rounded-lg text-sm ${
                hasError ? 'border-red-300 bg-red-50' : 'border-slate-200'
              } disabled:bg-slate-50 disabled:text-slate-400`}
            >
              <option value="">请选择</option>
              {question.options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          {question.type === 'radio' && question.options && (
            <div className="flex flex-wrap gap-3">
              {question.options.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={question.id}
                    value={opt.value}
                    checked={value === opt.value}
                    onChange={() => onChange(opt.value)}
                    disabled={readOnly}
                    className="accent-primary-600"
                  />
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </div>
          )}

          {question.type === 'checkbox' && question.options && (
            <div className="flex flex-wrap gap-3">
              {question.options.map((opt) => {
                const checked = Array.isArray(value) && value.includes(opt.value)
                return (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      value={opt.value}
                      checked={checked}
                      onChange={() => {
                        const arr = Array.isArray(value) ? [...value] : []
                        if (checked) {
                          onChange(arr.filter((v) => v !== opt.value))
                        } else {
                          onChange([...arr, opt.value])
                        }
                      }}
                      disabled={readOnly}
                      className="accent-primary-600"
                    />
                    <span className="text-sm text-slate-700">{opt.label}</span>
                  </label>
                )
              })}
            </div>
          )}

          {question.type === 'scale' && (
            <ScaleField
              question={question}
              value={value as number}
              onChange={onChange}
              readOnly={readOnly}
              hasError={hasError}
            />
          )}

          {question.type === 'image-upload' && (
            <div className="text-xs text-slate-400 py-4 border border-dashed border-slate-300 rounded-lg text-center">
              图片上传功能（Phase 4.5 实现）
            </div>
          )}
        </>
      )}

      {errorMsg && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {errorMsg}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// Scale (VAS/NRS) 字段
// ============================================================================
function ScaleField({
  question, value, onChange, readOnly, hasError,
}: {
  question: CRFQuestion; value: number; onChange: (v: unknown) => void;
  readOnly: boolean; hasError: boolean
}) {
  const min = question.min ?? 0
  const max = question.max ?? 10
  const step = question.step ?? 1
  const current = value ?? min

  return (
    <div className="space-y-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={readOnly}
        className="w-full accent-primary-600"
      />
      <div className="flex justify-between text-xs text-slate-400">
        <span>{min}</span>
        <span className="text-sm font-medium text-primary-600">{current}</span>
        <span>{max}</span>
      </div>
    </div>
  )
}

// ============================================================================
// Repeated number field (e.g., 3 measurements + auto average)
// ============================================================================
function RepeatedNumberField({
  question, allFormData, onFieldChange, readOnly, hasError,
}: {
  question: CRFQuestion
  allFormData: Record<string, unknown>
  onFieldChange: (id: string, val: unknown) => void
  readOnly: boolean
  hasError: boolean
}) {
  const count = question.repeat || 3
  const values: (number | '')[] = []
  for (let i = 0; i < count; i++) {
    const key = `${question.id}_${i + 1}`
    const v = allFormData[key]
    values.push(v !== undefined && v !== null ? Number(v) : '')
  }

  const validValues = values.filter((v): v is number => v !== '' && !isNaN(v))
  const average = validValues.length > 0
    ? (validValues.reduce((a, b) => a + b, 0) / validValues.length)
    : null

  // Auto-update average
  useEffect(() => {
    if (question.auto_average !== false && average !== null) {
      onFieldChange(question.id, Math.round(average * 100) / 100)
    }
  }, [average])

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {values.map((val, i) => (
          <div key={i}>
            <label className="text-xs text-slate-400 mb-1 block">第{i + 1}次</label>
            <input
              type="number"
              value={val}
              onChange={(e) => {
                const key = `${question.id}_${i + 1}`
                onFieldChange(key, e.target.value ? Number(e.target.value) : '')
              }}
              min={question.min}
              max={question.max}
              step={question.step || 'any'}
              disabled={readOnly}
              className={`w-full px-3 py-2 border rounded-lg text-sm ${
                hasError ? 'border-red-300 bg-red-50' : 'border-slate-200'
              } disabled:bg-slate-50`}
            />
          </div>
        ))}
      </div>
      {average !== null && (
        <div className="text-sm text-slate-600">
          平均值: <span className="font-semibold text-primary-600">{average.toFixed(2)}</span>
          {question.unit && <span className="text-xs text-slate-400 ml-1">{question.unit}</span>}
        </div>
      )}
    </div>
  )
}
