/**
 * 审计日志 API 模块
 *
 * 对应后端：/api/v1/audit/
 * 符合 GCP / 21 CFR Part 11 标准
 */
import { api } from '../client'
import type { ApiListResponse, AuditLog } from '../types'

export const auditApi = {
  /** 审计日志查询 */
  list(params?: {
    resource_type?: string
    resource_id?: string
    account_id?: number
    account_name?: string
    action?: string
    project_id?: number
    start_time?: string
    end_time?: string
    page?: number
    page_size?: number
  }) {
    return api.get<ApiListResponse<AuditLog>['data']>('/audit/logs', { params })
  },

  /** 导出审计日志（返回所有筛选后的日志，前端可转为 CSV/JSON） */
  export(params?: {
    resource_type?: string
    resource_id?: string
    account_id?: number
    account_name?: string
    action?: string
    project_id?: number
    start_time?: string
    end_time?: string
  }) {
    return api.get<{ items: AuditLog[] }>('/audit/logs/export', { params })
  },

  /** 审计日志详情 */
  get(id: number) {
    return api.get<AuditLog>(`/audit/logs/${id}`)
  },
}
