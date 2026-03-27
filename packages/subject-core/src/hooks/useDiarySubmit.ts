import { useMemo, useState } from 'react'
import type { ApiClient } from '../api/types'
import { buildSubjectEndpoints } from '../api/endpoints'

export type DiarySubmitResult = { ok: true } | { ok: false; msg: string }

export function useDiarySubmit(api: ApiClient) {
  const endpoints = useMemo(() => buildSubjectEndpoints(api), [api])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (data: {
    mood?: string
    symptoms?: string
    medication_taken?: boolean
    symptom_severity?: string
    symptom_onset?: string
    symptom_duration?: string
    notes?: string
    entry_date?: string
  }): Promise<DiarySubmitResult> => {
    setSubmitting(true)
    setError('')
    try {
      const res = await endpoints.createMyDiary(data)
      if (res.code !== 200) {
        const msg = typeof res.msg === 'string' && res.msg.trim() ? res.msg.trim() : '提交失败'
        setError(msg)
        return { ok: false, msg }
      }
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : '日记提交失败'
      setError(msg)
      return { ok: false, msg }
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting, error }
}
