/**
 * 质量合规 API 模块
 *
 * 对应后端：/api/v1/quality/
 */
import { api } from '../client'
import type {
  ApiListResponse,
  Deviation,
  DeviationCreateIn,
  CAPA,
  CAPAActionItem,
  SOP,
} from '../types'

export const qualityApi = {
  // ===== 仪表盘 =====

  /** 质量仪表盘聚合数据 */
  getDashboard() {
    return api.get('/quality/dashboard')
  },

  // ===== 偏差管理 =====

  /** 偏差列表 */
  listDeviations(params?: {
    status?: string; severity?: string; project_id?: number;
    page?: number; page_size?: number
  }) {
    return api.get<ApiListResponse<Deviation>['data']>('/quality/deviations/list', { params })
  },

  /** 偏差详情 */
  getDeviation(id: number) {
    return api.get<Deviation>(`/quality/deviations/${id}`)
  },

  /** 创建偏差 */
  createDeviation(data: DeviationCreateIn) {
    return api.post<Deviation>('/quality/deviations/create', data)
  },

  /** 更新偏差 */
  updateDeviation(id: number, data: Partial<Deviation>) {
    return api.put<Deviation>(`/quality/deviations/${id}`, data)
  },

  /** 删除偏差 */
  deleteDeviation(id: number) {
    return api.delete(`/quality/deviations/${id}`)
  },

  /** 偏差统计 */
  getDeviationStats() {
    return api.get('/quality/deviations/stats')
  },

  /** 变更请求列表（兼容评估台） */
  listChangeRequests(params?: { page?: number; page_size?: number; status?: string }) {
    return api.get<{ items: unknown[]; total: number }>('/quality/change-requests/list', { params })
  },

  /** 推进偏差状态 */
  advanceDeviation(id: number, new_status: string) {
    return api.post<Deviation>(`/quality/deviations/${id}/advance`, { new_status })
  },

  /** SOP 统计 */
  getSOPStats() {
    return api.get('/quality/sops/stats')
  },

  // ===== CAPA 管理 =====

  /** CAPA 列表 */
  listCAPAs(params?: {
    status?: string; deviation_id?: number;
    page?: number; page_size?: number
  }) {
    return api.get<ApiListResponse<CAPA>['data']>('/quality/capas/list', { params })
  },

  /** CAPA 详情 */
  getCAPA(id: number) {
    return api.get<CAPA>(`/quality/capas/${id}`)
  },

  /** 创建 CAPA */
  createCAPA(data: {
    deviation_id: number; type: string; title: string;
    responsible: string; responsible_id?: number; due_date: string
  }) {
    return api.post<CAPA>('/quality/capas/create', data)
  },

  /** 更新 CAPA */
  updateCAPA(id: number, data: Partial<CAPA>) {
    return api.put<CAPA>(`/quality/capas/${id}`, data)
  },

  /** CAPA 有效性验证 */
  verifyCAPA(id: number, data: { verification_note: string; effectiveness: string }) {
    return api.post<CAPA>(`/quality/capas/${id}/verify`, data)
  },

  /** CAPA 统计 */
  getCAPAStats() {
    return api.get('/quality/capas/stats')
  },

  // ===== CAPA 行动项 =====

  /** 创建行动项 */
  createActionItem(capaId: number, data: {
    title: string; responsible_name: string; responsible_id?: number; due_date: string
  }) {
    return api.post<CAPAActionItem>(`/quality/capas/${capaId}/action-items/create`, data)
  },

  /** 行动项列表 */
  listActionItems(capaId: number) {
    return api.get<CAPAActionItem[]>(`/quality/capas/${capaId}/action-items`)
  },

  /** 完成行动项 */
  completeActionItem(id: number, data: { completion_note: string }) {
    return api.post<CAPAActionItem>(`/quality/action-items/${id}/complete`, data)
  },

  // ===== SOP 管理 =====

  /** SOP 列表 */
  listSOPs(params?: {
    status?: string; category?: string; keyword?: string;
    page?: number; page_size?: number
  }) {
    return api.get<ApiListResponse<SOP>['data']>('/quality/sops/list', { params })
  },

  /** SOP 详情 */
  getSOP(id: number) {
    return api.get<SOP>(`/quality/sops/${id}`)
  },

  /** 创建 SOP */
  createSOP(data: {
    code: string; title: string; version: string; category: string;
    owner: string; description?: string; feishu_doc_url?: string
  }) {
    return api.post<SOP>('/quality/sops/create', data)
  },

  /** 更新 SOP */
  updateSOP(id: number, data: Partial<SOP>) {
    return api.put<SOP>(`/quality/sops/${id}`, data)
  },
}
