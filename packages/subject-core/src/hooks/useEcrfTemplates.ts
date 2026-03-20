import { useCallback, useMemo, useState } from 'react'
import type { ApiClient } from '../api/types'
import { buildSubjectEndpoints } from '../api/endpoints'
import type { EcrfTemplate } from '../models/questionnaire'

export function useEcrfTemplates(api: ApiClient) {
  const endpoints = useMemo(() => buildSubjectEndpoints(api), [api])
  const [templates, setTemplates] = useState<EcrfTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadTemplates = useCallback(async (protocolId?: number) => {
    setLoading(true)
    setError('')
    try {
      const res = await endpoints.getEcrfTemplates(protocolId)
      setTemplates((res.data as { items?: EcrfTemplate[] })?.items || [])
    } catch {
      setError('模板加载失败')
    } finally {
      setLoading(false)
    }
  }, [endpoints])

  return { templates, loading, error, loadTemplates }
}
