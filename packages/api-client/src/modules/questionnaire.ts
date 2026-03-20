/**
 * 问卷管理 API 模块
 *
 * 对应后端：/api/v1/questionnaire/
 */
import { api } from '../client'

export interface QuestionnaireTemplate {
  id: number
  template_name: string
  category: string
  description: string
  form_definition: Record<string, unknown> | null
  is_active: boolean
  version: number
  create_time: string
}

export interface QuestionnaireAssignment {
  id: number
  template_id: number
  template_name: string
  subject_id: number
  status: string
  due_date: string | null
  completed_at: string | null
  score: string | null
  create_time: string
}

export interface QuestionnaireStatistics {
  total_assignments: number
  completed: number
  completion_rate: number
  overdue: number
  average_score: string | null
}

export const questionnaireApi = {
  listTemplates(params?: { category?: string; is_active?: boolean }) {
    return api.get<{ items: QuestionnaireTemplate[] }>('/questionnaire/templates', { params })
  },

  createTemplate(data: {
    template_name: string
    category?: string
    description?: string
    form_definition?: Record<string, unknown>
  }) {
    return api.post<QuestionnaireTemplate>('/questionnaire/templates', data)
  },

  updateTemplate(id: number, data: Partial<{
    template_name: string
    category: string
    description: string
    form_definition: Record<string, unknown>
    is_active: boolean
  }>) {
    return api.put<QuestionnaireTemplate>(`/questionnaire/templates/${id}`, data)
  },

  deleteTemplate(id: number) {
    return api.delete<{ id: number }>(`/questionnaire/templates/${id}`)
  },

  assignTemplate(templateId: number, data: { subject_ids: number[]; due_date?: string }) {
    return api.post<{ assigned_count: number; ids: number[] }>(`/questionnaire/templates/${templateId}/assign`, data)
  },

  listAssignments(params?: { template_id?: number; subject_id?: number; status?: string }) {
    return api.get<{ items: QuestionnaireAssignment[] }>('/questionnaire/assignments', { params })
  },

  getStatistics(params?: { template_id?: number }) {
    return api.get<QuestionnaireStatistics>('/questionnaire/statistics', { params })
  },
}
