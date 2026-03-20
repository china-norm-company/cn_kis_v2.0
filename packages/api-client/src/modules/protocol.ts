/**
 * 协议管理 API 模块
 *
 * 对应后端：/api/v1/protocol/
 */
import { api } from '../client'
import type {
  ApiListResponse,
  Protocol,
  ProtocolCreateIn,
} from '../types'

export const protocolApi = {
  /** 协议列表 */
  list(params?: {
    status?: string
    keyword?: string
    page?: number
    page_size?: number
  }) {
    return api.get<ApiListResponse<Protocol>['data']>('/protocol/list', { params })
  },

  /** 协议详情 */
  get(id: number) {
    return api.get<Protocol>(`/protocol/${id}`)
  },

  /** 创建协议 */
  create(data: ProtocolCreateIn) {
    return api.post<Protocol>('/protocol/create', data)
  },

  /** 上传协议文件 */
  upload(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return api.upload<{ protocol_id: number; file_path: string }>('/protocol/upload', formData)
  },

  /** 触发 AI 解析 */
  triggerParse(protocolId: number) {
    return api.post(`/protocol/${protocolId}/parse`)
  },

  /** 解析日志 */
  getParseLogs(protocolId: number) {
    return api.get(`/protocol/${protocolId}/logs`)
  },
}
