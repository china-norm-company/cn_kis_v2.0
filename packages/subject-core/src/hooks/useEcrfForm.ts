import { useMemo, useState } from 'react'
import type { ApiClient } from '../api/types'
import { buildSubjectEndpoints } from '../api/endpoints'
import type { EcrfQuestion } from '../models/questionnaire'
import { validateEcrfForm } from '../crf/validation'

export function useEcrfForm(api: ApiClient, questions: EcrfQuestion[]) {
  const endpoints = useMemo(() => buildSubjectEndpoints(api), [api])
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const setField = (fieldId: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[fieldId]
      return next
    })
  }

  const submit = async (templateId: number, subjectId: number, saveAsDraft = false) => {
    const validation = validateEcrfForm(questions, formData)
    if (!saveAsDraft && validation.length) {
      const fieldMap: Record<string, string> = {}
      validation.forEach((v) => { fieldMap[v.fieldId] = v.message })
      setErrors(fieldMap)
      return { ok: false, message: '请先完成必填项' }
    }
    setSubmitting(true)
    try {
      const payload = {
        template_id: templateId,
        subject_id: subjectId,
        data: formData,
        status: saveAsDraft ? 'draft' : 'submitted',
      }
      const res = await endpoints.createEcrfRecord(payload)
      if (res.code !== 200) return { ok: false, message: res.msg || '保存失败' }
      return { ok: true, message: '提交成功' }
    } catch {
      return { ok: false, message: '提交失败' }
    } finally {
      setSubmitting(false)
    }
  }

  return { formData, errors, submitting, setField, setFormData, submit }
}
