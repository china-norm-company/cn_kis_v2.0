/**
 * 受试者管理 API 模块
 *
 * 对应后端：/api/v1/subject/
 */
import { api } from '../client'
import type {
  ApiListResponse,
  Subject,
  SubjectCreateIn,
  Enrollment,
  EnrollIn,
} from '../types'

export const subjectApi = {
  /** 受试者列表 */
  list(params?: {
    status?: string
    keyword?: string
    search?: string
    page?: number
    page_size?: number
  }) {
    return api.get<ApiListResponse<Subject>['data']>('/subject/list', { params })
  },

  /** 受试者详情 */
  get(id: number) {
    return api.get<Subject>(`/subject/${id}`)
  },

  /** 创建受试者 */
  create(data: SubjectCreateIn) {
    return api.post<Subject>('/subject/create', data)
  },

  /** 更新受试者 */
  update(id: number, data: Partial<SubjectCreateIn>) {
    return api.put<Subject>(`/subject/${id}/update`, data)
  },

  /** 删除受试者（软删除） */
  delete(id: number) {
    return api.post(`/subject/${id}/delete`)
  },

  /** 入组列表 */
  listEnrollments(params?: {
    protocol_id?: number
    subject_id?: number
    status?: string
    page?: number
    page_size?: number
  }) {
    return api.get<ApiListResponse<Enrollment>['data']>('/subject/enrollments', { params })
  },

  /** 受试者入组 */
  enroll(data: EnrollIn) {
    return api.post<Enrollment>('/subject/enroll', data)
  },

  /** 受试者状态统计 */
  stats() {
    return api.get<Record<string, number>>('/subject/stats')
  },

  /** 入组统计（按项目） */
  enrollmentStats(params?: { protocol_id?: number }) {
    return api.get<Record<string, number>>('/subject/enrollment-stats', { params })
  },

  /** 入组记录列表（带受试者和协议信息） */
  enrollmentsDetail(params?: {
    protocol_id?: number
    status?: string
    page?: number
    page_size?: number
  }) {
    return api.get<ApiListResponse<Enrollment>['data']>('/subject/enrollments-detail', { params })
  },
}
