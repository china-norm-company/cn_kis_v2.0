/**
 * 项目全链路 API 模块（研究台）
 *
 * 对应后端：/api/v1/projects/
 * 所有请求使用相对路径，base 由应用初始化时 api 客户端统一配置，前端无动态地址拼接。
 */
import { api, getAxiosInstance } from '../client'

export interface ProjectFullLinkProject {
  id: number
  opportunity_no: string
  inquiry_no: string | null
  project_no: string | null
  project_name: string
  business_type: string
  sponsor_no: string | null
  sponsor_name: string | null
  research_institution: string | null
  principal_investigator: string | null
  priority: string
  execution_status: string
  schedule_status: string
  total_samples: number | null
  expected_start_date: string | null
  expected_end_date: string | null
  actual_start_date: string | null
  actual_end_date: string | null
  recruitment_start_date: string | null
  test_start_date: string | null
  test_end_date: string | null
  report_deadline: string | null
  description: string | null
  remark: string | null
  created_by: number | null
  updated_by: number | null
  created_at: string
  updated_at: string
}

export interface ProjectFullLinkProtocol {
  id: number
  project_id: number
  protocol_no: string | null
  protocol_name: string
  protocol_version: string | null
  description: string | null
  file_id: number | null
  file_name?: string | null
  file_url?: string | null
  parsed_data: Record<string, unknown> | null
  parse_error: string | null
  parse_progress?: Record<string, unknown> | null
  parse_logs?: unknown[] | null
  created_by: number | null
  updated_by: number | null
  created_at: string
  updated_at: string
}

export interface ProjectListResponse {
  list: ProjectFullLinkProject[]
  total: number
  page: number
  pageSize: number
  executionStatusCounts: Record<string, number>
  scheduleStatusCounts: Record<string, number>
}

export interface ProtocolListResponse {
  list: ProjectFullLinkProtocol[]
  total: number
  page: number
  pageSize: number
}

export interface ProjectUpdateIn {
  project_name?: string
  business_type?: string
  sponsor_no?: string
  sponsor_name?: string
  research_institution?: string
  principal_investigator?: string
  priority?: string
  execution_status?: string
  schedule_status?: string
  total_samples?: number
  expected_start_date?: string
  expected_end_date?: string
  actual_start_date?: string
  actual_end_date?: string
  recruitment_start_date?: string
  test_start_date?: string
  test_end_date?: string
  report_deadline?: string
  description?: string
  remark?: string
}

export interface ProtocolUpdateIn {
  protocol_name?: string
  protocol_version?: string
  description?: string
  parsed_data?: Record<string, unknown>
  parse_error?: string
  parse_progress?: Record<string, unknown>
  parse_logs?: unknown[]
}

const BASE = '/projects'

export const projectFullLinkApi = {
  /** 项目列表（分页、关键词、执行状态）。请求路径带尾部斜杠以匹配后端 /projects/ */
  list(params?: { keyword?: string; execution_status?: string; page?: number; pageSize?: number }) {
    return api.get<ProjectListResponse>(`${BASE}/`, { params: { ...params, page: params?.page ?? 1, pageSize: params?.pageSize ?? 20 } })
  },

  /** 项目详情 */
  get(id: number) {
    return api.get<ProjectFullLinkProject>(`${BASE}/${id}`)
  },

  /** 更新项目 */
  update(id: number, data: ProjectUpdateIn) {
    return api.put<ProjectFullLinkProject>(`${BASE}/${id}`, data)
  },

  /** 项目下方案列表 */
  listProtocols(projectId: number, params?: { page?: number; pageSize?: number; keyword?: string }) {
    return api.get<ProtocolListResponse>(`${BASE}/${projectId}/protocols`, {
      params: { page: params?.page ?? 1, pageSize: params?.pageSize ?? 20, keyword: params?.keyword },
    })
  },

  /** 方案详情（含 parsed_data） */
  getProtocol(id: number) {
    return api.get<ProjectFullLinkProtocol>(`${BASE}/protocols/${id}`)
  },

  /** 上传方案文件创建方案 */
  createProtocol(
    projectId: number,
    file: File,
    options?: { protocol_name?: string; protocol_version?: string; description?: string }
  ) {
    const formData = new FormData()
    formData.append('file', file)
    if (options?.protocol_name) formData.append('protocol_name', options.protocol_name)
    if (options?.protocol_version) formData.append('protocol_version', options.protocol_version)
    if (options?.description) formData.append('description', options.description)
    return api.upload<{ id: number; protocol_no: string | null; protocol_name: string; created_at: string }>(
      `${BASE}/${projectId}/protocols`,
      formData
    )
  },

  /** 更新方案（含 AI 解析回写） */
  updateProtocol(id: number, data: ProtocolUpdateIn) {
    return api.put<ProjectFullLinkProtocol>(`${BASE}/protocols/${id}`, data)
  },

  /** 删除方案（软删除） */
  deleteProtocol(id: number) {
    return api.delete(`${BASE}/protocols/${id}`)
  },

  /**
   * 按方案 ID 下载方案文件（静态路径：/projects/protocols/{id}/download）
   * 用于 AI 解析等需获取方案文件的场景。
   */
  async downloadProtocolFile(protocolId: number, suggestedName = 'protocol.pdf'): Promise<File> {
    const axios = getAxiosInstance()
    const res = await axios.get<Blob>(`${BASE}/protocols/${protocolId}/download`, { responseType: 'blob' })
    const blob = res.data
    const name =
      (res.headers && (res.headers['content-disposition'] as string)?.match(/filename[*]?=(?:UTF-8'')?["']?([^"'\s]+)["']?/i)?.[1]) ||
      suggestedName
    return new File([blob], name)
  },

  /**
   * 按系统文件 ID 下载（静态路径：/system/files/{id}/download）
   * 当方案关联 file_id 时用于获取文件；若后端无该系统文件服务则可能 404。
   */
  async downloadSystemFile(fileId: number, suggestedName = 'protocol.pdf'): Promise<File> {
    const axios = getAxiosInstance()
    const res = await axios.get<Blob>(`/system/files/${fileId}/download`, { responseType: 'blob' })
    const blob = res.data
    const name =
      (res.headers && (res.headers['content-disposition'] as string)?.match(/filename[*]?=(?:UTF-8'')?["']?([^"'\s]+)["']?/i)?.[1]) ||
      suggestedName
    return new File([blob], name)
  },
}
