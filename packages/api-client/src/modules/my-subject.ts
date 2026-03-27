/**
 * 受试者自助 C 端 /my/*（小程序 JWT）
 *
 * 对应后端：/api/v1/my/
 */
import { api } from '../client'

/** 附录 A 项目块（projects_ordered 含 is_primary） */
export type MyHomeDashboardProject = {
  project_code: string
  project_name: string
  visit_point: string
  appointment_id: number | null
  enrollment_status: string
  sc_number: string
  sc_display: string
  queue_checkin_today: 'none' | 'checked_in' | 'checked_out'
  enrollment_id: number | null
  protocol_id: number | null
  is_primary?: boolean
}

export type MyHomeDashboardData = {
  as_of_date: string
  display_name: string
  display_name_source: string
  primary_project: Omit<MyHomeDashboardProject, 'is_primary'> | null
  other_projects: Array<Omit<MyHomeDashboardProject, 'is_primary'>>
  projects_ordered: Array<MyHomeDashboardProject & { is_primary: boolean }>
}

export const mySubjectApi = {
  /** 首页聚合（附录 A） */
  getHomeDashboard(params?: { date?: string }) {
    return api.get<MyHomeDashboardData>('/my/home-dashboard', {
      params: params?.date ? { date: params.date } : undefined,
    })
  },
}
