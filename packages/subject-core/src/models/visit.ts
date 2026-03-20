export interface VisitNodeItem {
  id: number
  name: string
  baseline_day?: number
  window_before?: number
  window_after?: number
  status?: string
  order?: number
}

export interface MyUpcomingVisitItem {
  id: number
  date: string
  time: string | null
  purpose: string
  status: string
}

export interface MyScheduleItem {
  id: number
  title: string
  status: string
  visit_name: string
  activity_name: string
  scheduled_date: string | null
  start_time: string | null
}
