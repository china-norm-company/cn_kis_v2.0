import { useCallback, useMemo, useState } from 'react'
import type { ApiClient } from '../api/types'
import { buildSubjectEndpoints } from '../api/endpoints'
import type { MyScheduleItem, MyUpcomingVisitItem, VisitNodeItem } from '../models/visit'

export function useVisitData(api: ApiClient, planId?: number) {
  const endpoints = useMemo(() => buildSubjectEndpoints(api), [api])
  const [visitNodes, setVisitNodes] = useState<VisitNodeItem[]>([])
  const [upcoming, setUpcoming] = useState<MyUpcomingVisitItem[]>([])
  const [schedule, setSchedule] = useState<MyScheduleItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [visitRes, upcomingRes, scheduleRes] = await Promise.all([
        endpoints.getVisitNodes(planId),
        endpoints.getMyUpcomingVisits(),
        endpoints.getMySchedule(),
      ])
      setVisitNodes((visitRes.data as { items?: VisitNodeItem[] })?.items || [])
      setUpcoming((upcomingRes.data as { items?: MyUpcomingVisitItem[] })?.items || [])
      setSchedule((scheduleRes.data as { items?: MyScheduleItem[] })?.items || [])
    } catch {
      setError('访视数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [endpoints, planId])

  return { visitNodes, upcoming, schedule, loading, error, reload }
}
