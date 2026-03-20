/**
 * 资源管理 API 模块
 *
 * 对应后端：/api/v1/resource/
 * 管理人机料法环五维资源
 */
import { api } from '../client'
import type {
  ResourceCategory,
  ResourceItem,
  ActivityTemplate,
  ActivityBOM,
  CalibrationRecord,
} from '../types'

export const resourceApi = {
  // ===== 资源类别 =====

  /** 资源类别列表 */
  listCategories(params?: { resource_type?: string; parent_id?: number; keyword?: string }) {
    return api.get<ResourceCategory[]>('/resource/categories', { params })
  },

  /** 资源类别树 */
  getCategoryTree(resourceType?: string) {
    return api.get('/resource/categories/tree', { params: { resource_type: resourceType } })
  },

  /** 创建资源类别 */
  createCategory(data: {
    name: string; code: string; resource_type: string;
    parent_id?: number; description?: string
  }) {
    return api.post<ResourceCategory>('/resource/categories/create', data)
  },

  // ===== 资源实例 =====

  /** 资源实例列表 */
  listItems(params?: {
    category_id?: number; status?: string; keyword?: string;
    page?: number; page_size?: number
  }) {
    return api.get<{ items: ResourceItem[]; total: number; page: number; page_size: number }>(
      '/resource/items', { params },
    )
  },

  /** 资源实例详情 */
  getItem(id: number) {
    return api.get<ResourceItem>(`/resource/items/${id}`)
  },

  /** 创建资源实例 */
  createItem(data: {
    name: string; code: string; category_id: number; status?: string;
    location?: string; manufacturer?: string; model_number?: string; serial_number?: string
  }) {
    return api.post<ResourceItem>('/resource/items/create', data)
  },

  // ===== 活动模板 =====

  /** 活动模板列表 */
  listTemplates(params?: {
    keyword?: string; sop_id?: number; is_active?: boolean;
    page?: number; page_size?: number
  }) {
    return api.get<{ items: ActivityTemplate[]; total: number; page: number; page_size: number }>(
      '/resource/templates', { params },
    )
  },

  /** 活动模板详情（含 BOM） */
  getTemplate(id: number) {
    return api.get<ActivityTemplate>(`/resource/templates/${id}`)
  },

  /** 创建活动模板 */
  createTemplate(data: {
    name: string; code: string; description?: string; duration?: number;
    sop_id?: number; crf_template_id?: number; qualification_requirements?: Array<{ name: string; level: string }>
  }) {
    return api.post<ActivityTemplate>('/resource/templates/create', data)
  },

  // ===== 活动 BOM =====

  /** BOM 列表 */
  listBOM(templateId: number) {
    return api.get<ActivityBOM[]>(`/resource/templates/${templateId}/bom`)
  },

  /** 添加 BOM */
  addBOM(templateId: number, data: {
    resource_category_id: number; quantity?: number; is_mandatory?: boolean; notes?: string
  }) {
    return api.post<ActivityBOM>(`/resource/templates/${templateId}/bom/create`, data)
  },

  /** 删除 BOM */
  removeBOM(bomId: number) {
    return api.delete(`/resource/bom/${bomId}`)
  },

  // ===== 设备校准 =====

  /** 记录校准 */
  addCalibration(data: {
    equipment_id: number; calibration_date: string; next_due_date: string;
    calibrator?: string; certificate_no?: string; result?: string; notes?: string
  }) {
    return api.post<CalibrationRecord>('/resource/equipment/calibrations/create', data)
  },

  /** 校准记录 */
  listCalibrations(equipmentId: number) {
    return api.get<{ items: CalibrationRecord[] }>(`/resource/equipment/${equipmentId}/calibrations`)
  },

  /** 校准有效性检查 */
  checkCalibration(equipmentId: number) {
    return api.get<{ is_valid: boolean; days_remaining: number | null; next_due_date: string | null }>(
      `/resource/equipment/${equipmentId}/check-calibration`,
    )
  },

  // ===== 场地环境 =====

  /** 记录环境数据 */
  createEnvLog(data: {
    venue_id: number; recorded_at: string; temperature?: number; humidity?: number
  }) {
    return api.post('/resource/venue/environment-logs/create', data)
  },

  /** 环境记录列表 */
  listEnvLogs(venueId: number) {
    return api.get(`/resource/venue/${venueId}/environment-logs`)
  },

  /** 人机料法环状态概览 */
  statusOverview() {
    return api.get<import('../types').ResourceStatusOverview>('/resource/status-overview')
  },
}
