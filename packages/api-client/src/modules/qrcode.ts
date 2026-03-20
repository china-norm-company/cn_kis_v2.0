/**
 * 二维码管理 API 模块
 *
 * 对应后端：/api/v1/qrcode/
 */
import { api } from '../client'
import type { ApiListResponse } from '../types'

export interface QRCodeRecord {
  id: number
  entity_type: 'subject' | 'station' | 'sample' | 'asset' | 'workorder'
  entity_id: number
  qr_data: string
  qr_hash: string
  label: string
  is_active: boolean
  create_time: string
  entity_detail?: Record<string, unknown>
  today_work_orders?: Array<{ id: number; title: string; status: string; enrollment_id: number }>
}

export type SmartResolveAction =
  | 'checkin'
  | 'checkout'
  | 'jump_to_workorder'
  | 'show_workorder_list'
  | 'show_profile'
  | 'station_checkin'
  | 'record_ae'
  | 'record_dropout'
  | 'stipend_pay'
  | 'asset_use'
  | 'sample_collect'
  | 'material_issue'
  | 'unknown'

export interface SmartResolveResult {
  entity: QRCodeRecord
  recommended_action: SmartResolveAction
  action_data: Record<string, unknown>
  alternative_actions: SmartResolveAction[]
}

/** checkout 动作的 action_data 结构 */
export interface CheckoutActionData {
  subject_id: number
  checkin_id: number
}

/** checkin 动作的 action_data 结构 */
export interface CheckinActionData {
  subject_id: number
}

/** stipend_pay 动作的 action_data 结构 */
export interface StipendPayActionData {
  subject_id: number
}

export interface SmartResolveParams {
  qr_hash: string
  workstation: string
  scanner_role?: string
}

export interface ScanAuditLog {
  id: number
  qr_record_id: number | null
  entity_type: string | null
  entity_id: number | null
  scanner_id: number | null
  workstation: string
  action: string
  scan_time: string
  ip_address: string | null
}

export const qrcodeApi = {
  /** 生成二维码 */
  generate(data: { entity_type: string; entity_id: number }) {
    return api.post<QRCodeRecord>('/qrcode/generate', data)
  },

  /** 解析二维码（基础解析，返回实体信息） */
  resolve(qrHash: string) {
    return api.post<QRCodeRecord>('/qrcode/resolve', { qr_hash: qrHash })
  },

  /** 情境感知解析（推荐使用）：根据当前工作台自动返回推荐动作 */
  smartResolve(params: SmartResolveParams | string, workstation?: string) {
    const body: SmartResolveParams = typeof params === 'string'
      ? { qr_hash: params, workstation: workstation ?? '' }
      : params
    return api.post<SmartResolveResult>('/qrcode/smart-resolve', body)
  },

  /** 批量生成 */
  batchGenerate(data: { entity_type: string; entity_ids: number[] }) {
    return api.post<QRCodeRecord[]>('/qrcode/batch-generate', data)
  },

  /** 二维码列表 */
  list(params?: { entity_type?: string; page?: number; page_size?: number; is_active?: boolean }) {
    return api.get<ApiListResponse<QRCodeRecord>['data']>('/qrcode/list', { params })
  },

  /** 停用二维码 */
  deactivate(recordId: number) {
    return api.post<QRCodeRecord>(`/qrcode/deactivate/${recordId}`)
  },

  /** 启用二维码 */
  reactivate(recordId: number) {
    return api.post<QRCodeRecord>(`/qrcode/reactivate/${recordId}`)
  },

  /** 重置二维码 */
  regenerate(recordId: number) {
    return api.post<QRCodeRecord>('/qrcode/regenerate', { record_id: recordId })
  },

  /** 生成场所码 */
  generateStation(stationId: number, label: string) {
    return api.post<QRCodeRecord>('/qrcode/station/generate', { station_id: stationId, label })
  },

  /** 场所码列表 */
  listStations() {
    return api.get<QRCodeRecord[]>('/qrcode/station/list')
  },

  /** 扫码审计日志 */
  scanLogs(params?: {
    qr_record_id?: number
    scanner_id?: number
    workstation?: string
    page?: number
    page_size?: number
  }) {
    return api.get<ApiListResponse<ScanAuditLog>['data']>('/qrcode/scan-logs', { params })
  },
}
