import { useCallback, useMemo, useState } from 'react'
import type { ApiClient } from '../api/types'
import { buildSubjectEndpoints } from '../api/endpoints'
import type { MyDiaryEntryItem, MyDiaryListDiaryPeriod } from '../models/diary'

export function useDiaryList(api: ApiClient, projectId = 0) {
  const endpoints = useMemo(() => buildSubjectEndpoints(api), [api])
  const [items, setItems] = useState<MyDiaryEntryItem[]>([])
  const [diaryPeriod, setDiaryPeriod] = useState<MyDiaryListDiaryPeriod | null>(null)
  const [retrospectiveDaysMax, setRetrospectiveDaysMax] = useState(7)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await endpoints.getMyDiary(projectId > 0 ? projectId : undefined)
      if (res.code !== 200) {
        setItems([])
        setDiaryPeriod(null)
        setRetrospectiveDaysMax(7)
        const msg = typeof res.msg === 'string' && res.msg.trim() ? res.msg.trim() : '日记加载失败'
        setError(msg)
        return
      }
      const data = res.data as {
        items?: MyDiaryEntryItem[]
        diary_period?: MyDiaryListDiaryPeriod | null
        retrospective_days_max?: number
      }
      setItems(Array.isArray(data?.items) ? data.items : [])
      const dp = data?.diary_period
      if (dp && typeof dp === 'object' && (dp.start || dp.end)) {
        setDiaryPeriod(dp)
      } else {
        setDiaryPeriod(null)
      }
      const rm = data?.retrospective_days_max
      if (typeof rm === 'number' && !Number.isNaN(rm)) {
        setRetrospectiveDaysMax(Math.max(0, Math.min(366, Math.floor(rm))))
      } else {
        setRetrospectiveDaysMax(7)
      }
    } catch {
      setItems([])
      setDiaryPeriod(null)
      setRetrospectiveDaysMax(7)
      setError('日记加载失败')
    } finally {
      setLoading(false)
    }
  }, [endpoints, projectId])

  return { items, diaryPeriod, retrospectiveDaysMax, loading, error, reload, setItems }
}
