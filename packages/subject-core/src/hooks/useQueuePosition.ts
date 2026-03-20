import { useCallback, useMemo, useState } from 'react'
import type { ApiClient } from '../api/types'
import { buildSubjectEndpoints } from '../api/endpoints'

export interface QueuePositionData {
  queue_no?: string
  waiting_count?: number
  estimated_minutes?: number
  [key: string]: unknown
}

export function useQueuePosition(api: ApiClient) {
  const endpoints = useMemo(() => buildSubjectEndpoints(api), [api])
  const [position, setPosition] = useState<QueuePositionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await endpoints.getQueuePosition()
      if (res.code === 200) {
        setPosition((res.data as QueuePositionData) || null)
      } else {
        setError(res.msg || '排队信息获取失败')
      }
    } catch {
      setError('排队信息获取失败')
    } finally {
      setLoading(false)
    }
  }, [endpoints])

  return { position, loading, error, reload }
}
