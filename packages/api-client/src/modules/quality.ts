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
  ProtocolCreateIn,
} from '../types'

/** 单条监察计划（可多条） */
export interface SupervisionPlanEntry {
  /** 服务端生成；有值表示已提交锁定，仅可追加新行 */
  entry_id?: string
  visit_phase: string
  /** YYYY-MM-DD */
  planned_date: string | null
  content: string
  supervisor: string
}

/** 单条监察记录（可多条、可追加） */
export interface SupervisionActualEntry {
  entry_id?: string
  visit_phase: string
  /** ISO 日期或 datetime-local，如 YYYY-MM-DD / YYYY-MM-DDTHH:mm */
  supervision_at: string | null
  content: string
  conclusion: string
}

/** 项目监察列表行 */
export interface ProjectSupervisionItem {
  protocol_id: number
  project_code: string
  project_title: string
  protocol_status: string
  execution_start_date: string | null
  execution_end_date: string | null
  group_label: string
  backup_label: string
  visits_label: string
  period_label: string
  researcher_label: string
  sample_size_label: string
  plan_content: string
  plan_submitted_at: string | null
  actual_content: string
  actual_submitted_at: string | null
  supervision_status: 'pending_plan' | 'abnormal' | 'pending_execution' | 'completed'
  supervision_status_label: string
  record_summary: string
  plan_preview: string
  actual_preview: string
}

/** 项目监察详情（含完整正文） */
export interface ProjectSupervisionDetail extends ProjectSupervisionItem {
  plan_content_full: string
  actual_content_full: string
  /** 结构化监察计划；旧数据可能仅 plan_content_full 有正文 */
  plan_entries?: SupervisionPlanEntry[]
}

/** 与当前列表筛选（年月、关键词）一致的监察数量聚合 */
export interface ProjectSupervisionListStats {
  /** 已提交监察计划、尚未提交实际监察 */
  pending_supervision: number
  /** 已提交实际监察 */
  supervised: number
  /** 监察计划与实际均未提交（无监察记录） */
  no_supervision_record: number
}

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

  // ===== 项目监察 =====

  /** 项目监察 / 项目管理列表（list_mode=management 为仅维周项目） */
  listProjectSupervision(params?: {
    year_month?: string
    keyword?: string
    /** 研究员姓名等 */
    researcher_keyword?: string
    /** supervision | management */
    list_mode?: string
    page?: number
    page_size?: number
  }) {
    return api.get<{
      items: ProjectSupervisionItem[]
      total: number
      page: number
      page_size: number
      stats: ProjectSupervisionListStats
      list_mode?: string
    }>('/quality/project-supervision/list', { params })
  },

  /** 项目监察详情（弹窗预填） */
  getProjectSupervision(protocolId: number) {
    return api.get<ProjectSupervisionDetail>(`/quality/project-supervision/${protocolId}`)
  },

  /**
   * 项目监察：创建协议（与维周执行台同源数据）
   * 需 quality.deviation.create；无需 protocol.protocol.create。
   */
  createProtocolForSupervision(data: ProtocolCreateIn) {
    return api.post<{ id: number; title: string; status: string }>(
      '/quality/project-supervision/create-protocol',
      data,
    )
  },

  /** 提交监察计划（多条：访视阶段、计划日期、内容、监察人） */
  submitSupervisionPlan(protocolId: number, plan_entries: SupervisionPlanEntry[]) {
    return api.post<ProjectSupervisionDetail>(`/quality/project-supervision/${protocolId}/submit-plan`, {
      plan_entries: plan_entries.map((e) => ({
        ...(e.entry_id ? { entry_id: e.entry_id } : {}),
        visit_phase: e.visit_phase,
        planned_date: (e.planned_date || '').slice(0, 10),
        content: e.content,
        supervisor: e.supervisor,
      })),
    })
  },

  /** 提交监察记录（多条；已带 entry_id 的行不可改，仅可追加） */
  submitSupervisionActual(protocolId: number, actual_entries: SupervisionActualEntry[]) {
    return api.post<ProjectSupervisionDetail>(`/quality/project-supervision/${protocolId}/submit-actual`, {
      actual_entries: actual_entries.map((e) => ({
        ...(e.entry_id ? { entry_id: e.entry_id } : {}),
        visit_phase: e.visit_phase,
        supervision_at: (e.supervision_at || '').trim(),
        content: e.content,
        conclusion: e.conclusion,
      })),
    })
  },
}
