/**
 * 结项管理 API 模块
 *
 * 对应后端：/api/v1/closeout/
 */
import { api } from '../client'
import type { ApiListResponse } from '../types'

export interface ProjectCloseout {
  id: number
  protocol_id: number
  protocol_title: string
  status: 'initiated' | 'checking' | 'review' | 'archived'
  initiated_by_id: number | null
  initiated_at: string | null
  archived_at: string | null
  notes: string
  create_time: string
  update_time: string
}

export interface CloseoutChecklist {
  id: number
  group: string
  item_code: string
  item_description: string
  is_auto_check: boolean
  auto_check_passed: boolean | null
  is_manually_confirmed: boolean
  confirmed_by_id: number | null
  confirmed_at: string | null
  notes: string
}

export interface ProjectRetrospective {
  id: number
  closeout_id: number
  what_went_well: string[]
  what_to_improve: string[]
  action_items: string[]
  lessons_learned: string[]
  created_by_id: number | null
  create_time: string
  update_time: string
}

export interface ClientAcceptance {
  id: number
  closeout_id: number
  client_id: number | null
  client_name: string
  deliverables: Array<Record<string, unknown>>
  acceptance_status: 'pending' | 'accepted' | 'rejected'
  signed_at: string | null
  signed_by: string
  notes: string
  create_time: string
  update_time: string
}

export interface CloseoutDetail extends ProjectCloseout {
  checklists: CloseoutChecklist[]
  retrospectives: ProjectRetrospective[]
  acceptances: ClientAcceptance[]
}

export const closeoutApi = {
  /** 发起结项 */
  initiate(data: { protocol_id: number; notes?: string }) {
    return api.post<ProjectCloseout>('/closeout/initiate', data)
  },

  /** 结项列表 */
  list(params?: { status?: string; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<ProjectCloseout>['data']>('/closeout/list', { params })
  },

  /** 结项详情 */
  get(id: number) {
    return api.get<CloseoutDetail>(`/closeout/${id}`)
  },

  /** 触发自动检查 */
  autoCheck(id: number) {
    return api.post<{ checked: number; passed: number; failed: number }>(`/closeout/${id}/auto-check`)
  },

  /** 手动确认检查项 */
  confirmChecklist(closeoutId: number, itemId: number, notes?: string) {
    return api.post<CloseoutChecklist>(`/closeout/${closeoutId}/checklist/${itemId}/confirm`, { notes })
  },

  /** 创建复盘 */
  createRetrospective(closeoutId: number, data: {
    what_went_well: string[]; what_to_improve: string[];
    action_items: string[]; lessons_learned: string[]
  }) {
    return api.post<ProjectRetrospective>(`/closeout/${closeoutId}/retrospective`, data)
  },

  /** 更新客户验收 */
  updateAcceptance(closeoutId: number, data: {
    client_id?: number; deliverables?: Array<Record<string, unknown>>;
    acceptance_status?: string; signed_by?: string; notes?: string
  }) {
    return api.post<ClientAcceptance>(`/closeout/${closeoutId}/acceptance`, data)
  },

  /** 归档项目 */
  archive(closeoutId: number) {
    return api.post(`/closeout/${closeoutId}/archive`)
  },
}
