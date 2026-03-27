/**
 * 招募管理 API 模块
 *
 * 对应后端：/api/v1/recruitment/
 */
import { api, getAxiosInstance } from '../client'
import type {
  ApiListResponse,
  RecruitmentPlan,
  RecruitmentPlanCreateIn,
  EligibilityCriteria,
  RecruitmentChannel,
  ChannelEvaluation,
  SubjectRegistration,
  RecruitmentStatistics,
  RecruitTemplateAd,
  RecruitmentAppointmentDocItem,
} from '../types'

export const recruitmentApi = {
  // ========== 招募计划 ==========

  /** 招募计划列表 */
  listPlans(params?: {
    protocol_id?: number
    status?: string
    page?: number
    page_size?: number
  }) {
    return api.get<ApiListResponse<RecruitmentPlan>['data']>('/recruitment/plans', { params })
  },

  /** 招募计划详情 */
  getPlan(planId: number) {
    return api.get<RecruitmentPlan>(`/recruitment/plans/${planId}`)
  },

  /** 创建招募计划 */
  createPlan(data: RecruitmentPlanCreateIn) {
    return api.post<RecruitmentPlan>('/recruitment/plans', data)
  },

  /** 更新招募计划 */
  updatePlan(planId: number, data: Partial<RecruitmentPlanCreateIn>) {
    return api.put<RecruitmentPlan>(`/recruitment/plans/${planId}`, data)
  },

  /** 删除招募计划（仅草稿） */
  deletePlan(planId: number) {
    return api.delete(`/recruitment/plans/${planId}`)
  },

  /** 变更计划状态 */
  transitionPlanStatus(planId: number, status: string) {
    return api.post<{ id: number; status: string }>(`/recruitment/plans/${planId}/status`, { status })
  },

  /** 招募统计 */
  getPlanStatistics(planId: number) {
    return api.get<RecruitmentStatistics>(`/recruitment/plans/${planId}/statistics`)
  },

  /** 招募模板广告（无则创建草稿） */
  getRecruitTemplateAd(planId: number) {
    return api.get<RecruitTemplateAd>(`/recruitment/plans/${planId}/recruit-template-ad`)
  },

  /** 更新招募模板（仅草稿） */
  updateRecruitTemplateAd(
    adId: number,
    data: Partial<{
      title: string
      content: string
      template_project_code: string
      template_project_name: string
      template_sample_requirement: string
      template_visit_date: string | null
      template_honorarium: number | null
      template_liaison_fee?: string | null
    }>,
  ) {
    return api.put<RecruitTemplateAd>(`/recruitment/ads/${adId}/recruit-template`, data)
  },

  submitRecruitTemplateAd(adId: number) {
    return api.post<RecruitTemplateAd>(`/recruitment/ads/${adId}/submit`)
  },

  approveRecruitTemplateAd(adId: number) {
    return api.post<RecruitTemplateAd>(`/recruitment/ads/${adId}/approve`)
  },

  rejectRecruitTemplateAd(adId: number, reason?: string) {
    return api.post<RecruitTemplateAd>(`/recruitment/ads/${adId}/reject`, { reason: reason || '' })
  },

  listAppointmentDocs(planId: number) {
    return api.get<{ items: RecruitmentAppointmentDocItem[] }>(`/recruitment/plans/${planId}/appointment-docs`)
  },

  uploadAppointmentDoc(planId: number, docType: string, file: File) {
    const fd = new FormData()
    fd.append('doc_type', docType)
    fd.append('file', file)
    return api.post<RecruitmentAppointmentDocItem>(`/recruitment/plans/${planId}/appointment-docs`, fd)
  },

  submitAppointmentDocs(planId: number) {
    return api.post<{ appointment_docs_status: string }>(`/recruitment/plans/${planId}/appointment-docs/submit`)
  },

  approveAppointmentDocs(planId: number) {
    return api.post<{ appointment_docs_status: string }>(`/recruitment/plans/${planId}/appointment-docs/approve`)
  },

  rejectAppointmentDocs(planId: number, reason?: string) {
    return api.post<{ appointment_docs_status: string; appointment_docs_reject_reason: string }>(
      `/recruitment/plans/${planId}/appointment-docs/reject`,
      { reason: reason || '' },
    )
  },

  /** 下载预约文档二进制流（需登录；与列表接口共用 axios 鉴权，避免 fetch 与代理不一致） */
  async fetchAppointmentDocBlob(planId: number, docType: string): Promise<Blob> {
    try {
      const res = await getAxiosInstance().get(
        `/recruitment/plans/${planId}/appointment-docs/${encodeURIComponent(docType)}/file`,
        { responseType: 'blob', timeout: 120000 },
      )
      const raw = res.data as Blob
      // axios 的 Blob 常不带 type；原生 fetch().blob() 会带 Content-Type。缺 MIME 时浏览器易按二进制下载而非用 Office 打开
      const hdr = res.headers['content-type']
      const mime = typeof hdr === 'string' ? hdr.split(';')[0].trim() : ''
      if (mime && raw.type !== mime) {
        return new Blob([raw], { type: mime })
      }
      return raw
    } catch (err: unknown) {
      const ax = err as { response?: { data?: Blob; status?: number }; message?: string }
      const blob = ax.response?.data
      if (blob instanceof Blob) {
        try {
          const text = await blob.text()
          const j = JSON.parse(text) as { msg?: string }
          if (j.msg) throw new Error(j.msg)
        } catch (inner) {
          if (inner instanceof SyntaxError) {
            /* 非 JSON 错误体 */
          } else if (inner instanceof Error) {
            throw inner
          }
        }
        const st = ax.response?.status
        throw new Error(st === 403 ? '无权限预览该文件' : st === 404 ? '文件不存在' : `无法打开文件${st != null ? ` (${st})` : ''}`)
      }
      if (err instanceof Error && err.message) throw err
      throw new Error('无法打开文件')
    }
  },

  // ========== 入排标准 ==========

  /** 入排标准列表 */
  listCriteria(planId: number) {
    return api.get<{ items: EligibilityCriteria[] }>(`/recruitment/plans/${planId}/criteria`)
  },

  /** 新增入排标准 */
  addCriteria(planId: number, data: {
    criteria_type: string
    description: string
    sequence?: number
    is_mandatory?: boolean
  }) {
    return api.post<{ id: number }>(`/recruitment/plans/${planId}/criteria`, data)
  },

  // ========== 渠道 ==========

  /** 渠道列表 */
  listChannels(planId: number) {
    return api.get<{ items: RecruitmentChannel[] }>(`/recruitment/plans/${planId}/channels`)
  },

  /** 新增渠道 */
  addChannel(planId: number, data: {
    channel_type: string
    name: string
    description?: string
    contact_person?: string
    contact_phone?: string
  }) {
    return api.post<{ id: number }>(`/recruitment/plans/${planId}/channels`, data)
  },

  /** 渠道效果评估 */
  evaluateChannel(channelId: number) {
    return api.get<ChannelEvaluation>(`/recruitment/channels/${channelId}/evaluate`)
  },

  // ========== 广告 ==========

  /** 创建广告 */
  createAd(planId: number, data: { ad_type: string; title: string; content?: string }) {
    return api.post<{ id: number; status: string }>(`/recruitment/plans/${planId}/ads`, data)
  },

  /** 发布广告 */
  publishAd(adId: number) {
    return api.post<{ id: number; status: string }>(`/recruitment/ads/${adId}/publish`)
  },

  // ========== 报名 ==========

  /** 报名列表 */
  listRegistrations(params?: {
    plan_id?: number
    status?: string
    keyword?: string
    page?: number
    page_size?: number
  }) {
    return api.get<ApiListResponse<SubjectRegistration>['data']>('/recruitment/registrations', { params })
  },

  /** 创建报名 */
  createRegistration(data: {
    plan_id: number
    name: string
    phone: string
    channel_id?: number
    gender?: string
    age?: number
    email?: string
    medical_history?: string
  }) {
    return api.post<{ id: number; registration_no: string }>('/recruitment/registrations', data)
  },

  // ========== 筛选 ==========

  /** 创建筛选 */
  createScreening(regId: number) {
    return api.post<{ id: number; screening_no: string }>(`/recruitment/registrations/${regId}/screening`)
  },

  /** 完成筛选 */
  completeScreening(screeningId: number, data: {
    result: string
    criteria_checks?: Array<{ criteria_id: number; met: boolean; notes: string }>
    vital_signs?: Record<string, unknown>
    lab_results?: Record<string, unknown>
  }) {
    return api.put<{ id: number; result: string }>(`/recruitment/screenings/${screeningId}/complete`, data)
  },

  // ========== 入组 ==========

  /** 创建入组记录 */
  createEnrollmentRecord(regId: number) {
    return api.post<{ id: number; enrollment_no: string }>(`/recruitment/registrations/${regId}/enrollment`)
  },

  /** 确认入组 */
  confirmEnrollment(recordId: number) {
    return api.post<{ id: number; status: string }>(`/recruitment/enrollment-records/${recordId}/confirm`)
  },

  // ========== 退出/脱落 ==========

  /** 报名退出 */
  withdrawRegistration(regId: number, data: { reason: string; notes?: string }) {
    return api.post<{ id: number; status: string }>(`/recruitment/registrations/${regId}/withdraw`, data)
  },

  /** 入组退出 */
  withdrawEnrollment(recordId: number, data: { reason: string; notes?: string }) {
    return api.post<{ id: number; status: string }>(`/recruitment/enrollment-records/${recordId}/withdraw`, data)
  },

  // ========== 进度 ==========

  /** 记录进度快照 */
  recordProgress(planId: number) {
    return api.post<{ record_date: string; completion_rate: string }>(`/recruitment/plans/${planId}/progress`)
  },

  // ========== 问题 ==========

  /** 创建招募问题 */
  createIssue(planId: number, data: {
    title: string
    priority?: string
    issue_type?: string
    description?: string
  }) {
    return api.post<{ id: number }>(`/recruitment/plans/${planId}/issues`, data)
  },

  /** 解决招募问题 */
  resolveIssue(issueId: number, solution: string) {
    return api.put<{ id: number; status: string }>(`/recruitment/issues/${issueId}/resolve`, { solution })
  },

  // ========== 策略 ==========

  /** 创建招募策略 */
  createStrategy(planId: number, data: {
    title: string
    issue_id?: number
    strategy_type?: string
    description?: string
    rationale?: string
    expected_outcome?: string
  }) {
    return api.post<{ id: number }>(`/recruitment/plans/${planId}/strategies`, data)
  },

  /** 批准策略 */
  approveStrategy(strategyId: number) {
    return api.post<{ id: number; status: string }>(`/recruitment/strategies/${strategyId}/approve`)
  },

  // ========== 分析统计 ==========

  /** 招募漏斗 */
  getFunnel(planId: number) {
    return api.get<{
      registered: number; screened: number; enrolled: number; withdrawn: number
      conversion_rates: { registered_to_screened: number; screened_to_enrolled: number; overall: number }
    }>(`/recruitment/plans/${planId}/funnel`)
  },

  /** 招募趋势 */
  getTrends(planId: number, days?: number) {
    const params = days ? `?days=${days}` : ''
    return api.get<{ items: Array<{ date: string; registered: number; screened: number; enrolled: number }> }>(`/recruitment/plans/${planId}/trends${params}`)
  },

  /** 退出分析 */
  getWithdrawalAnalysis(planId: number) {
    return api.get<{
      total_withdrawn: number
      reasons: Array<{ reason: string; count: number; percentage: number }>
    }>(`/recruitment/plans/${planId}/withdrawal-analysis`)
  },

  /** 招募统计 */
  getStatistics(planId: number) {
    return api.get<Record<string, unknown>>(`/recruitment/plans/${planId}/statistics`)
  },

  // ========== 跟进记录 ==========

  /** 跟进记录列表 */
  listContactRecords(regId: number) {
    return api.get<{
      items: Array<{
        id: number; contact_type: string; content: string; result: string
        next_contact_date: string | null; next_contact_plan: string
        contacted_by_id: number | null; notes: string; contact_date: string
      }>
    }>(`/recruitment/registrations/${regId}/contacts`)
  },

  /** 添加跟进记录 */
  createContactRecord(regId: number, data: {
    contact_type: string; content: string; result?: string
    next_contact_date?: string; next_contact_plan?: string; notes?: string
  }) {
    return api.post<{ id: number }>(`/recruitment/registrations/${regId}/contacts`, data)
  },

  // ========== 任务聚合 ==========

  /** 今日任务 */
  getMyTasks() {
    return api.get<{
      pending_contact: { count: number; items: Array<TaskItem> }
      pending_screening: { count: number; items: Array<TaskItem> }
      pending_enrollment: { count: number; items: Array<TaskItem> }
      need_callback: { count: number; items: Array<TaskItem> }
      overdue_followup: { count: number; items: Array<TaskItem> }
    }>('/recruitment/my-tasks')
  },

  // ========== 广告管理（补充） ==========

  /** 广告列表 */
  listAds(planId: number) {
    return api.get<{
      items: Array<{
        id: number; ad_type: string; title: string; content: string
        status: string; published_at: string | null; create_time: string
      }>
    }>(`/recruitment/plans/${planId}/ads`)
  },

  /** 编辑广告 */
  updateAd(adId: number, data: { title?: string; content?: string; ad_type?: string }) {
    return api.put<{ id: number; status: string }>(`/recruitment/ads/${adId}`, data)
  },

  // ========== 渠道分析 ==========

  /** 渠道汇总分析（跨计划） */
  getChannelAnalytics() {
    return api.get<{
      items: Array<{
        id: number; name: string; channel_type: string
        plan_id: number; plan_title: string
        registered_count: number; screened_count: number; enrolled_count: number
        screening_rate: number; enrollment_rate: number; overall_rate: number
        cost: string
      }>
    }>('/recruitment/channel-analytics')
  },
}

export interface TaskItem {
  id: number; registration_no: string; name: string; phone: string
  status: string; create_time: string | null; contacted_at: string | null
}
