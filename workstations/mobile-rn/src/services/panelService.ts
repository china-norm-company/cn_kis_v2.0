/**
 * Panel 管理与智能推荐服务（P3.1）
 *
 * 功能：
 * 1. 受试者档案管理（肤质、过敏史、偏好）
 * 2. 根据档案智能匹配项目并推送推荐
 * 3. 推荐准确率验证：推荐项目入排标准与档案不矛盾
 */
import type { ApiClient } from '@cn-kis/subject-core'

export type SkinType = 'dry' | 'oily' | 'combination' | 'normal' | 'sensitive'
export type AllergyType = 'fragrance' | 'dye' | 'preservative' | 'metal' | 'latex' | 'drug' | 'other'

export interface SubjectProfile {
  subject_id: number
  skin_type?: SkinType
  allergy_history: AllergyType[]
  medical_history: string[]
  preferences: string[]
  participation_preference: 'frequent' | 'occasional' | 'rare'
  notification_enabled: boolean
}

export interface ProjectRecommendation {
  project_id: number
  project_name: string
  study_type: string
  compensation: number
  match_score: number
  match_reasons: string[]
  exclusion_warnings: string[]
  enroll_deadline: string | null
  is_expired: boolean
}

/**
 * 获取受试者个人档案
 */
export async function getSubjectProfile(
  apiClient: ApiClient,
  subjectId: number,
): Promise<SubjectProfile | null> {
  try {
    const res = await apiClient.get<SubjectProfile>(`/subject/${subjectId}/profile`)
    if (res.code === 200 && res.data) {
      return res.data as SubjectProfile
    }
    return null
  } catch {
    return null
  }
}

/**
 * 更新受试者个人档案
 */
export async function updateSubjectProfile(
  apiClient: ApiClient,
  subjectId: number,
  profile: Partial<SubjectProfile>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiClient.post(`/subject/${subjectId}/profile`, profile)
    if ((res as { code?: number }).code === 200) {
      return { success: true }
    }
    return { success: false, error: (res as { msg?: string }).msg || '保存失败' }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

/**
 * 获取智能推荐项目列表
 */
export async function getRecommendedProjects(
  apiClient: ApiClient,
): Promise<ProjectRecommendation[]> {
  try {
    const res = await apiClient.get<ProjectRecommendation[]>('/my/recommended-projects')
    if ((res as { code?: number }).code === 200 && Array.isArray((res as { data?: unknown }).data)) {
      return (res as { data: ProjectRecommendation[] }).data
    }
    return []
  } catch {
    return []
  }
}

export const SKIN_TYPE_LABELS: Record<SkinType, string> = {
  dry: '干性',
  oily: '油性',
  combination: '混合性',
  normal: '中性',
  sensitive: '敏感性',
}

export const ALLERGY_LABELS: Record<AllergyType, string> = {
  fragrance: '香精/香料',
  dye: '染料',
  preservative: '防腐剂',
  metal: '金属（如镍）',
  latex: '乳胶',
  drug: '药物',
  other: '其他',
}
