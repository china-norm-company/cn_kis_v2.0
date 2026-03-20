/**
 * 方案准备工作流 API 模块
 *
 * 对应后端：/api/v1/proposal/
 */
import { api } from '../client'
import type { ApiListResponse } from '../types'

export interface Proposal {
  id: number
  title: string
  opportunity_id: number | null
  opportunity_title: string
  protocol_id: number | null
  client_id: number | null
  client_name: string
  status: 'drafting' | 'internal_review' | 'client_review' | 'revision' | 'finalized'
  description: string
  product_category: string
  test_methods: string[] | null
  sample_size_estimate: number | null
  estimated_duration_days: number | null
  estimated_amount: string | null
  created_by_id: number | null
  create_time: string
  update_time: string
}

export interface ProposalVersion {
  id: number
  proposal_id: number
  version_number: string
  change_summary: string
  file_path: string
  feishu_doc_token: string
  created_by_id: number | null
  create_time: string
}

export interface ProposalChecklist {
  item_name: string
  is_completed: boolean
  completed_by_id: number | null
  completed_at: string | null
  notes: string
}

export interface CommunicationLog {
  id: number
  client_id: number | null
  client_name: string
  proposal_id: number | null
  proposal_title: string
  opportunity_id: number | null
  protocol_id: number | null
  comm_type: string
  subject: string
  summary: string
  participants: string[] | null
  occurred_at: string
  created_by_id: number | null
  create_time: string
}

export interface Meeting {
  id: number
  title: string
  meeting_type: string
  protocol_id: number | null
  scheduled_date: string
  duration_minutes: number
  location: string
  participants: unknown[]
  status: string
  create_time: string
}

export interface ProposalCreateIn {
  title: string
  client_id?: number
  opportunity_id?: number
  description?: string
  product_category?: string
  test_methods?: string[]
  sample_size_estimate?: number
  estimated_duration_days?: number
  estimated_amount?: number
}

export const proposalApi = {
  /** 创建方案 */
  create(data: ProposalCreateIn) {
    return api.post<Proposal>('/proposal/create', data)
  },

  /** 从商机创建方案 */
  createFromOpportunity(opportunityId: number) {
    return api.post<Proposal>('/proposal/create-from-opportunity', { opportunity_id: opportunityId })
  },

  /** 方案列表 */
  list(params?: { status?: string; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<Proposal>['data']>('/proposal/list', { params })
  },

  /** 方案详情 */
  get(id: number) {
    return api.get<Proposal>(`/proposal/${id}`)
  },

  /** 更新方案 */
  update(id: number, data: Partial<ProposalCreateIn>) {
    return api.put(`/proposal/${id}/update`, data)
  },

  /** 删除方案 */
  delete(id: number) {
    return api.delete(`/proposal/${id}`)
  },

  /** 创建方案版本 */
  createVersion(proposalId: number, data: {
    version_number: string; change_summary?: string;
    file_path?: string; feishu_doc_token?: string
  }) {
    return api.post<ProposalVersion>(`/proposal/${proposalId}/versions/create`, data)
  },

  /** 方案版本列表 */
  listVersions(proposalId: number) {
    return api.get<ProposalVersion[]>(`/proposal/${proposalId}/versions`)
  },

  /** 更新准备清单 */
  updateChecklist(proposalId: number, data: {
    item_name: string; is_completed: boolean; notes?: string
  }) {
    return api.post(`/proposal/${proposalId}/checklist/update`, data)
  },

  /** 准备清单状态 */
  getChecklist(proposalId: number) {
    return api.get<ProposalChecklist[]>(`/proposal/${proposalId}/checklist`)
  },

  /** 提交审查 */
  submitReview(proposalId: number, reviewType: 'internal' | 'client') {
    return api.post<Proposal>(`/proposal/${proposalId}/submit-review`, { review_type: reviewType })
  },

  /** 定稿（自动创建协议） */
  finalize(proposalId: number) {
    return api.post<Proposal>(`/proposal/${proposalId}/finalize`)
  },

  /** 添加沟通记录 */
  addCommunication(data: {
    comm_type: string; subject: string; summary?: string;
    client_id?: number; proposal_id?: number; opportunity_id?: number;
    protocol_id?: number; participants?: string[]; occurred_at?: string
  }) {
    return api.post<CommunicationLog>('/proposal/communications/create', data)
  },

  /** 沟通记录列表 */
  listCommunications(params?: {
    client_id?: number; proposal_id?: number; page?: number; page_size?: number
  }) {
    return api.get<ApiListResponse<CommunicationLog>['data']>('/proposal/communications/list', { params })
  },

  /** 创建会议 */
  createMeeting(data: {
    title: string; meeting_type?: string; protocol_id?: number;
    scheduled_date: string; duration_minutes?: number;
    location?: string; participants?: unknown[]
  }) {
    return api.post<{ id: number }>('/proposal/meetings/create', data)
  },

  /** 会议列表 */
  listMeetings(params?: { protocol_id?: number; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<Meeting>['data']>('/proposal/meetings/list', { params })
  },

  /** 添加会议纪要 */
  addMinutes(meetingId: number, content: string) {
    return api.post(`/proposal/meetings/${meetingId}/minutes`, { content })
  },

  /** 添加会议待办 */
  addActionItem(meetingId: number, data: {
    description: string; assignee_name?: string; due_date?: string
  }) {
    return api.post(`/proposal/meetings/${meetingId}/action-items`, data)
  },
}
