import { useCallback, useMemo, useState } from 'react'
import type { ApiClient } from '../api/types'
import { buildSubjectEndpoints } from '../api/endpoints'
import { AUTH_LEVEL, type IdentityStatusData } from '../models/identity'

export function useIdentityStatus(api: ApiClient) {
  const endpoints = useMemo(() => buildSubjectEndpoints(api), [api])
  const [status, setStatus] = useState<IdentityStatusData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await endpoints.getMyIdentityStatus()
      if (res.code === 200 && res.data) {
        setStatus(res.data as IdentityStatusData)
      } else {
        setError(res.msg || '认证状态获取失败')
      }
    } catch {
      setError('认证状态获取失败')
    } finally {
      setLoading(false)
    }
  }, [endpoints])

  const isL2 = status?.auth_level === AUTH_LEVEL.IDENTITY_VERIFIED
  return { status, loading, error, isL2, reload }
}
