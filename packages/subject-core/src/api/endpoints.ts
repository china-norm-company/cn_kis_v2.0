import type { ApiClient } from './types'

export const SUBJECT_ENDPOINTS = {
  profile: '/my/profile',
  appointments: '/my/appointments',
  questionnaires: '/my/questionnaires',
  results: '/my/results',
  payments: '/my/payments',
  paymentSummary: '/my/payment-summary',
  supportTickets: '/my/support-tickets',
  notifications: '/my/notifications',
  enrollments: '/my/enrollments',
  identityStatus: '/my/identity/status',
  compliance: '/my/compliance',
  identityVerifyStart: '/my/identity/verify/start',
  identityVerifyResult: '/my/identity/verify/result',
  identityVerifyComplete: '/my/identity/verify/complete',
  consents: '/my/consents',
  screeningStatus: '/my/screening-status',
  plans: '/my/public/plans',
  register: '/my/register',
  upcomingVisits: '/my/upcoming-visits',
  schedule: '/my/schedule',
  diary: '/my/diary',
  nps: '/my/nps',
  products: '/my/products',
  productReminders: '/my/products-reminders',
  referrals: '/my/referrals',
  queuePosition: '/my/queue-position',
  visitNodes: '/visit/nodes',
  protocolList: '/protocol/list',
  ecrfTemplates: '/edc/templates',
  ecrfRecords: '/edc/records',
  aiChatAsync: '/agents/chat/async',
} as const

export const AUTH_ENDPOINTS = {
  smsSend: '/auth/sms/send',
  smsVerify: '/auth/sms/verify',
} as const

export function buildSubjectEndpoints(api: ApiClient) {
  return {
    getMyProfile: () => api.get(SUBJECT_ENDPOINTS.profile),
    updateMyProfile: (data: Record<string, unknown>) => api.put(SUBJECT_ENDPOINTS.profile, data),
    getMyAppointments: () => api.get(SUBJECT_ENDPOINTS.appointments),
    createMyAppointment: (data: Record<string, unknown>) => api.post(SUBJECT_ENDPOINTS.appointments, data),
    cancelMyAppointment: (id: number) => api.post(`${SUBJECT_ENDPOINTS.appointments}/${id}/cancel`),
    getMyQuestionnaires: (status?: string) => api.get(status ? `${SUBJECT_ENDPOINTS.questionnaires}?status=${status}` : SUBJECT_ENDPOINTS.questionnaires),
    getMyResults: () => api.get(SUBJECT_ENDPOINTS.results),
    submitMyQuestionnaire: (id: number, data: Record<string, unknown>) => api.post(`${SUBJECT_ENDPOINTS.questionnaires}/${id}/submit`, data),
    getMyPayments: () => api.get(SUBJECT_ENDPOINTS.payments),
    getMyPaymentSummary: () => api.get(SUBJECT_ENDPOINTS.paymentSummary),
    getMySupportTickets: () => api.get(SUBJECT_ENDPOINTS.supportTickets),
    createMySupportTicket: (data: Record<string, unknown>) => api.post(SUBJECT_ENDPOINTS.supportTickets, data),
    getMyNotifications: () => api.get(SUBJECT_ENDPOINTS.notifications),
    markMyNotificationRead: (id: number) => api.post(`${SUBJECT_ENDPOINTS.notifications}/${id}/read`),
    getMyEnrollments: () => api.get(SUBJECT_ENDPOINTS.enrollments),
    getMyIdentityStatus: () => api.get(SUBJECT_ENDPOINTS.identityStatus),
    getMyCompliance: () => api.get(SUBJECT_ENDPOINTS.compliance),
    startIdentityVerify: (provider = 'volcengine_cert') => api.post(SUBJECT_ENDPOINTS.identityVerifyStart, { provider }),
    getIdentityVerifyResult: (verifyId: string) => api.get(`${SUBJECT_ENDPOINTS.identityVerifyResult}?verify_id=${encodeURIComponent(verifyId)}`),
    completeIdentityVerify: (data: Record<string, unknown>) => api.post(SUBJECT_ENDPOINTS.identityVerifyComplete, data),
    getConsentBootstrap: async () => {
      const [identityRes, consentsRes] = await Promise.all([
        api.get(SUBJECT_ENDPOINTS.identityStatus),
        api.get(SUBJECT_ENDPOINTS.consents),
      ])
      if (identityRes.code !== 200) return identityRes
      if (consentsRes.code === 401) return consentsRes
      const identityData = (identityRes.data as { auth_level?: string } | null) || null
      const consentItems = ((consentsRes.data as { items?: Array<Record<string, unknown>> } | null)?.items || [])
        .filter((item) => !item.is_signed && !!item.icf_version_id)
      const projectMap = new Map<string, {
        protocol_code: string
        protocol_title: string
        pending_consent_count: number
        auth_ok_for_signing: boolean
      }>()
      for (const item of consentItems) {
        const protocol_code = typeof item.protocol_code === 'string' ? item.protocol_code : ''
        if (!protocol_code) continue
        const protocol_title = typeof item.protocol_title === 'string' ? item.protocol_title : ''
        const existing = projectMap.get(protocol_code)
        if (existing) {
          existing.pending_consent_count += 1
          continue
        }
        projectMap.set(protocol_code, {
          protocol_code,
          protocol_title,
          pending_consent_count: 1,
          auth_ok_for_signing: identityData?.auth_level === 'identity_verified',
        })
      }
      const projects = Array.from(projectMap.values())
      return {
        code: 200,
        msg: 'OK',
        data: {
          identity_gate_required: identityData?.auth_level !== 'identity_verified',
          total_pending_consent_count: consentItems.length,
          allow_l1_pilot: false,
          pilot_protocol_codes: projects.map((project) => project.protocol_code),
          has_returned_for_resign: consentItems.some((item) => item.staff_audit_status === 'returned'),
          projects,
        },
      }
    },
    devSkipIdentityVerify: () => api.post('/my/identity/dev-skip', {}, { silent: true }),
    getMyConsents: () => api.get(SUBJECT_ENDPOINTS.consents),
    getIcfContent: (id: number) => api.get(`${SUBJECT_ENDPOINTS.consents}/icf/${id}`),
    faceSignConsent: (id: number, data: Record<string, unknown>) => api.post(`${SUBJECT_ENDPOINTS.consents}/${id}/face-sign`, data),
    getMyScreeningStatus: () => api.get(SUBJECT_ENDPOINTS.screeningStatus),
    getAvailablePlans: () => api.get(SUBJECT_ENDPOINTS.plans, undefined, { auth: false, silent: true }),
    getPlanDetail: (id: number) => api.get(`${SUBJECT_ENDPOINTS.plans}/${id}`, undefined, { auth: false, silent: true }),
    registerForPlan: (data: Record<string, unknown>) => api.post(SUBJECT_ENDPOINTS.register, data),
    getMyUpcomingVisits: () => api.get(SUBJECT_ENDPOINTS.upcomingVisits),
    getMySchedule: () => api.get(SUBJECT_ENDPOINTS.schedule),
    /** page_size 放大：避免长周期日记在前端只拉到前 30 天以外的记录；可选 project_id 与列表同源裁剪 diary_period */
    getMyDiary: (projectId?: number) =>
      api.get(SUBJECT_ENDPOINTS.diary, {
        page: 1,
        page_size: 400,
        ...(projectId != null && projectId > 0 ? { project_id: projectId } : {}),
      }),
    /** 日记 2.0：按全链路 project_id 拉取已发布且研究员已确认的配置；不传 project_id 时由后端按入组/项目编号自动匹配 */
    getMyDiaryConfig: (projectId?: number) =>
      api.get(
        `${SUBJECT_ENDPOINTS.diary}/config`,
        projectId != null && projectId > 0 ? { project_id: projectId } : {},
        { silent: true },
      ),
    createMyDiary: (data: Record<string, unknown>) => api.post(SUBJECT_ENDPOINTS.diary, data),
    submitMyNps: (data: Record<string, unknown>) => api.post(SUBJECT_ENDPOINTS.nps, data),
    getMyProducts: (status = 'all') => api.get(`${SUBJECT_ENDPOINTS.products}?status=${status}`),
    getMyProductDetail: (id: number) => api.get(`${SUBJECT_ENDPOINTS.products}/${id}`),
    createMyProductUsage: (id: number, data: Record<string, unknown>) => api.post(`${SUBJECT_ENDPOINTS.products}/${id}/usage`, data),
    createMyProductReturn: (id: number, data: Record<string, unknown>) =>
      api.post(`${SUBJECT_ENDPOINTS.products}/${id}/return`, data, { silent: true }),
    getMyProductReminders: () => api.get(SUBJECT_ENDPOINTS.productReminders),
    getMyReferrals: () => api.get(SUBJECT_ENDPOINTS.referrals),
    getVisitNodes: (planId?: number) => api.get(planId ? `${SUBJECT_ENDPOINTS.visitNodes}?plan_id=${planId}` : SUBJECT_ENDPOINTS.visitNodes),
    getQueuePosition: () => api.get(SUBJECT_ENDPOINTS.queuePosition),
    getProtocolList: () => api.get(SUBJECT_ENDPOINTS.protocolList),
    getEcrfTemplates: (protocolId?: number) => api.get(protocolId ? `${SUBJECT_ENDPOINTS.ecrfTemplates}?protocol_id=${protocolId}` : SUBJECT_ENDPOINTS.ecrfTemplates),
    getEcrfRecords: (params?: Record<string, unknown>) => api.get(SUBJECT_ENDPOINTS.ecrfRecords, params),
    createEcrfRecord: (data: Record<string, unknown>) => api.post(SUBJECT_ENDPOINTS.ecrfRecords, data),
    updateEcrfRecord: (id: number, data: Record<string, unknown>) => api.put(`${SUBJECT_ENDPOINTS.ecrfRecords}/${id}`, data),
    submitEcrfRecord: (id: number) => api.post(`${SUBJECT_ENDPOINTS.ecrfRecords}/${id}/submit`),
    createAgentChatAsync: (data: Record<string, unknown>) => api.post(SUBJECT_ENDPOINTS.aiChatAsync, data),
    getAgentCallStatus: (callId: string) => api.get(`/agents/calls/${encodeURIComponent(callId)}`),
    sendSmsVerifyCode: (data: { phone: string; scene?: string }) => api.post(AUTH_ENDPOINTS.smsSend, data, { auth: false }),
    verifySmsCodeLogin: (data: { phone: string; code: string; scene?: string }) => api.post(AUTH_ENDPOINTS.smsVerify, data, { auth: false }),
    getSampleConfirmUrl: (dispensingId: number, data?: Record<string, unknown>) =>
      api.post(`/my/sample-confirm?dispensing_id=${dispensingId}`, data || {}, { silent: true }),
    getQrcodeImageUrl: (qrData: string) => `/api/v1/qrcode/image?data=${encodeURIComponent(qrData)}`,
  }
}
