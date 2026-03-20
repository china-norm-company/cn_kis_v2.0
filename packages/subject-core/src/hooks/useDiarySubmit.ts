import { useMemo, useState } from 'react'
import type { ApiClient } from '../api/types'
import { buildSubjectEndpoints } from '../api/endpoints'

export function useDiarySubmit(api: ApiClient) {
  const endpoints = useMemo(() => buildSubjectEndpoints(api), [api])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (data: {
    mood?: string
    symptoms?: string
    medication_taken?: boolean
    notes?: string
  }) => {
    setSubmitting(true)
    setError('')
    try {
      const res = await endpoints.createMyDiary(data)
      if (res.code !== 200) {
        throw new Error(res.msg || '提交失败')
      }
      return true
    } catch (e) {
      setError('日记提交失败')
      return false
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting, error }
}
