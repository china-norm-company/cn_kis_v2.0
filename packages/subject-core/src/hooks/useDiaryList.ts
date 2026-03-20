import { useCallback, useMemo, useState } from 'react'
import type { ApiClient } from '../api/types'
import { buildSubjectEndpoints } from '../api/endpoints'
import type { MyDiaryEntryItem } from '../models/diary'

export function useDiaryList(api: ApiClient) {
  const endpoints = useMemo(() => buildSubjectEndpoints(api), [api])
  const [items, setItems] = useState<MyDiaryEntryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await endpoints.getMyDiary()
      setItems((res.data as { items?: MyDiaryEntryItem[] })?.items || [])
    } catch {
      setError('日记加载失败')
    } finally {
      setLoading(false)
    }
  }, [endpoints])

  return { items, loading, error, reload, setItems }
}
