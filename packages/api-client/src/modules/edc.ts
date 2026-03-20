/**
 * EDC 数据采集 API 模块
 *
 * 对应后端：/api/v1/edc/
 */
import { api } from '../client'
import type {
  ApiListResponse,
  CRFTemplate,
  CRFRecord,
  CRFRecordCreateIn,
  CRFValidationResult,
  SDVProgress,
  DataQuery,
} from '../types'

export const edcApi = {
  // ===== CRF 模板 =====

  /** 模板列表 */
  listTemplates(params?: { is_active?: boolean; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<CRFTemplate>['data']>('/edc/templates', { params })
  },

  /** 模板详情 */
  getTemplate(id: number) {
    return api.get<CRFTemplate>(`/edc/templates/${id}`)
  },

  /** 导出模板 */
  exportTemplate(id: number) {
    return api.get<Record<string, unknown>>(`/edc/templates/${id}/export`)
  },

  /** 导入模板 */
  importTemplate(data: { name: string; schema: Record<string, unknown>; version?: string }) {
    return api.post<CRFTemplate>('/edc/templates/import', data)
  },

  /** CRF 智能推荐 */
  recommendTemplates(activityTemplateId: number) {
    return api.get<CRFTemplate[]>(`/edc/templates/recommend/${activityTemplateId}`)
  },

  // ===== CRF 记录 =====

  /** 记录列表 */
  listRecords(params?: {
    template_id?: number
    work_order_id?: number
    status?: string
    page?: number
    page_size?: number
  }) {
    return api.get<ApiListResponse<CRFRecord>['data']>('/edc/records', { params })
  },

  /** 创建 CRF 记录 */
  createRecord(data: CRFRecordCreateIn) {
    return api.post<CRFRecord>('/edc/records/create', data)
  },

  /** 更新 CRF 记录数据 */
  updateRecord(id: number, data: Record<string, unknown>) {
    return api.put<CRFRecord>(`/edc/records/${id}`, { data })
  },

  /** 提交 CRF 记录 */
  submitRecord(id: number) {
    return api.post<CRFRecord>(`/edc/records/${id}/submit`)
  },

  /** 核实 CRF 记录 */
  verifyRecord(id: number) {
    return api.post<CRFRecord>(`/edc/records/${id}/verify`)
  },

  /** 锁定 CRF 记录 */
  lockRecord(id: number) {
    return api.post<CRFRecord>(`/edc/records/${id}/lock`)
  },

  // ===== 数据验证 =====

  /** 创建验证规则 */
  createValidationRule(data: {
    template_id: number
    field_name: string
    rule_type: string
    rule_config: Record<string, unknown>
    error_message?: string
  }) {
    return api.post('/edc/validation-rules/create', data)
  },

  /** 获取模板验证规则 */
  getValidationRules(templateId: number) {
    return api.get(`/edc/templates/${templateId}/validation-rules`)
  },

  /** 执行记录验证 */
  validateRecord(recordId: number) {
    return api.post<CRFValidationResult[]>(`/edc/records/${recordId}/validate`)
  },

  // ===== SDV =====

  /** 初始化 SDV */
  initSDV(recordId: number) {
    return api.post(`/edc/records/${recordId}/sdv/init`)
  },

  /** SDV 核查字段 */
  verifySDV(recordId: number, data: { field_name: string; notes?: string }) {
    return api.post(`/edc/records/${recordId}/sdv/verify`, data)
  },

  /** SDV 进度 */
  getSDVProgress(recordId: number) {
    return api.get<SDVProgress>(`/edc/records/${recordId}/sdv/progress`)
  },

  // ===== 数据质疑 =====

  /** 质疑列表 */
  listQueries(params?: { crf_record_id?: number; status?: string }) {
    return api.get<DataQuery[]>('/edc/queries/list', { params })
  },

  /** 创建质疑 */
  createQuery(data: { crf_record_id: number; field_name: string; query_text: string }) {
    return api.post<DataQuery>('/edc/queries/create', data)
  },

  /** 回复质疑 */
  answerQuery(id: number, data: { answer_text: string }) {
    return api.post<DataQuery>(`/edc/queries/${id}/answer`, data)
  },

  /** 关闭质疑 */
  closeQuery(id: number, data: { close_reason: string }) {
    return api.post<DataQuery>(`/edc/queries/${id}/close`, data)
  },
}
