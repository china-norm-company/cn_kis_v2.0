/**
 * 协议管理 API 模块
 *
 * 对应后端：/api/v1/protocol/
 */
import { api, getAxiosInstance } from '../client'
import type {
  ApiListResponse,
  ApiResponse,
  Protocol,
  ProtocolBasicUpdateIn,
  ProtocolCreateIn,
  ScreeningDay,
} from '../types'

/** ICF 版本（知情管理，签署节点） */
export interface ICFVersion {
  id: number
  protocol_id: number
  version: string
  node_title?: string
  display_order?: number
  file_path?: string
  content?: string
  is_active: boolean
  required_reading_duration_seconds?: number
  create_time: string
  update_time: string
  /** 是否至少完整保存过一次本节点小程序签署规则 */
  mini_sign_rules_saved?: boolean
  /** 已保存的规则快照（未保存时可能为空对象，编辑时以协议级兜底合并） */
  mini_sign_rules?: Partial<MiniSignRules> & Record<string, unknown>
}

/** 签署记录（知情管理） */
export interface ConsentRecord {
  id: number
  subject_id: number
  subject_no: string
  subject_name: string
  /** 手机号（默认脱敏展示：132****1234） */
  phone?: string
  /** 身份证号（默认脱敏展示：310110********3920） */
  id_card?: string
  /** 接待台队列同步的筛选号（如 SC001） */
  sc_number?: string
  /** 拼音首字母 */
  name_pinyin_initials?: string
  /** 待签署为 -；已签署：勾选题为任一则否否则是，或知情测验未通过为否 */
  signing_result?: string
  /** 数据类型：正式（小程序等）| 测试（执行台二维码核验测试 H5 扫码签署，signature_data.signing_kind=test） */
  signing_type?: string
  icf_version_id: number
  icf_version: string
  node_title?: string
  is_signed: boolean
  signed_at: string | null
  /** 受试者实名认证通过时间（L2），与签署节点无关 */
  auth_verified_at?: string | null
  investigator_signed_at?: string | null
  investigator_sign_staff_name?: string
  /** 现场筛选计划中与当前展示日对应的 signing_staff_name（与筛选单日或本条签署/创建日对齐） */
  screening_signing_staff?: string
  require_dual_sign?: boolean
  receipt_no: string
  receipt_pdf_path: string | null
  receipt_pdf_url: string | null
  create_time: string
  /** 待签署 / 已签署 / 退回重签中 / 已通过审核 */
  consent_status_label?: string
  /** pending_review | approved | returned */
  staff_audit_status?: string
  /** 知情联调同一次提交批次（多节点合并展示用） */
  witness_dev_batch_id?: string | null
  /** group_by=subject 时：该受试者本协议下全部知情节点 id，顺序与配置 display_order 一致（审核预览按此顺序） */
  consent_ids?: number[]
  /** 后端按受试者合并行 */
  group_by_subject?: boolean
}

/** 执行台：签署记录预览（知情正文 + 签署摘要） */
export interface ConsentPreviewData {
  subject_no: string
  subject_name: string
  /** 占位符 {{ICF_PROTOCOL_CODE}} / {{ICF_PROTOCOL_TITLE}} 等 */
  protocol_code?: string
  protocol_title?: string
  icf_version: string
  node_title: string
  icf_content_html: string
  is_signed: boolean
  signed_at: string | null
  receipt_no: string
  signing_result: string
  consent_status_label: string
  staff_audit_status: string
  signature_summary: Record<string, unknown>
  /** 节点小程序规则摘要，供前端叠加「已选是/否」与签署元数据 */
  mini_sign_rules_preview?: {
    enable_checkbox_recognition: boolean
    supplemental_collect_labels?: string[]
    collect_other_information?: boolean
    enable_subject_signature?: boolean
    /** 0=不要求签名；1/2=正文占位符 {{ICF_SUBJECT_SIG_*}} 数量 */
    subject_signature_times?: number
    /** 工作人员正文内嵌签名 {{ICF_STAFF_SIG_*}} */
    enable_staff_signature?: boolean
    staff_signature_times?: number
    enable_auto_sign_date?: boolean
  }
}

/** 签署统计（知情管理）；与列表一致按受试者合并行计数（多节点一行） */
export interface ConsentStats {
  /** 汇总「签署状态」为已签署或已通过审核的行数 */
  total: number
  /** 同 total，用于副文案「已签」 */
  signed_count: number
  /** 汇总「签署状态」为待签署的行数 */
  pending_count: number
  /** 至少签署 1 份的受试者数（去重，文档维度） */
  unique_subjects_signed?: number
  /** 已全部签署的受试者数（多 ICF 时有效） */
  subjects_all_signed?: number
  icf_count?: number
  /** 汇总「签署结果」为否的行数（规则同列表「签署结果」列） */
  signed_result_no_count?: number
  /** 汇总「签署状态」为退回重签中的行数 */
  returned_resign_row_count?: number
}

/** 按现场粗筛/到场日（PreScreeningRecord.pre_screening_date）拆分的批次进度 */
export interface ScreeningBatchConsent {
  /** ISO 日期 YYYY-MM-DD */
  screening_date: string
  cohort_subject_count: number
  /** 该批次受试者在本协议下已有 SubjectConsent 行数 */
  total: number
  signed_count: number
  pending_count: number
  icf_count: number
  /** cohort_subject_count × icf_count，用于判断尚未生成签署任务 */
  expected_consent_rows: number
  /** 来自知情配置「计划现场日」且当日尚无粗筛/筛选受试者映射时为 true */
  is_planned_placeholder?: boolean
  /** 该批次为测试筛选计划日（与正式筛选区分展示） */
  is_test_screening?: boolean
  /** 列表「合计」展示用：已签文档分子；分母来自目标筛选量×ICF 份数（必有值） */
  progress_signed?: number
  progress_total?: number
  pending_progress?: number
}

/** 协议知情概览（知情管理项目列表） */
export interface ProtocolConsentOverview {
  id: number
  code: string
  title: string
  create_time?: string
  consent_display_order?: number
  icf_count: number
  /** 知情配置状态：未发布含待认证授权/已授权待测试/已测试待开始；发布后同名字段表示尚未进入筛选窗口 */
  config_status:
    | '待配置'
    | '配置中'
    | '待认证授权'
    | '已授权待测试'
    | '已测试待开始'
    /** @deprecated 旧名「核验测试中」，保留兼容 */
    | '核验测试中'
    /** @deprecated 旧名，保留兼容 */
    | '待测试'
    /** @deprecated 已发布态旧值「待开始」，已并入「已测试待开始」 */
    | '待开始'
    | '进行中'
    | '已结束'
  total: number
  signed_count: number
  pending_count: number
  require_dual_sign?: boolean
  /** 已完成身份核验的工作人员数（与 dual_sign_staffs 及 WitnessStaff 同步） */
  verified_staff_count?: number
  /** 配置的见证工作人员总数（双签名单人数） */
  dual_sign_staff_total?: number
  /** 无需核验 | 待核验 | 核验中 | 核验完成（启用双签时） */
  staff_verification_status?: '无需核验' | '待核验' | '核验中' | '核验完成'
  mini_app_ready?: boolean
  /** 知情配置负责人（治理台账号 ID） */
  consent_config_account_id?: number | null
  /** 知情配置负责人显示名 */
  consent_config_display_name?: string | null
  /** 项目级「知情签署工作人员」姓名（须为双签名单中的姓名；列表展示优先于现场日汇总） */
  consent_signing_staff_name?: string | null
  /** 最近一次「授权核验测试」所选工作人员姓名（与 consent_settings 同步） */
  consent_verify_test_staff_name?: string | null
  /** 各现场筛选日到场的受试者批次及签署进度 */
  screening_batches?: ScreeningBatchConsent[]
  screening_batch_count?: number
  earliest_screening_date?: string | null
  latest_screening_date?: string | null
  /** screening=粗筛/正式筛选；consent_activity_fallback=无现场数据时按首条知情记录创建日拆分；none=无分日数据 */
  screening_batch_source?: 'screening' | 'consent_activity_fallback' | 'none' | 'planned_config'
  /** 协议知情配置中登记的计划现场日（最多 4 天），供列表展示 */
  planned_screening_dates?: string[]
  /** 现场筛选日期 + 目标量，与知情配置一致 */
  screening_schedule?: ScreeningDay[]
  /** 如 2026-03-18(10) | 2026-03-20(12) */
  screening_schedule_summary?: string
  /** 知情是否已发布（列表「筛选」弹窗内现场计划是否可编辑） */
  consent_launched?: boolean
  /** 协议知情相关配置等最后更新时间（与列表「最后更新时间」列一致） */
  consent_last_update_at?: string | null
  /** 核验测试扫码落地页完整 URL（微信扫一扫打开纯 H5 验证页，不跳转小程序；非可扫码测试态时仍可扫，落地页会提示不可测试） */
  consent_test_scan_url?: string
}

export interface DualSignStaff {
  staff_id?: string
  name: string
  id_card_no?: string
  email?: string
  phone?: string
  identity_verified: boolean
}

/** 单签署节点小程序签署规则（不含现场筛选计划） */
export interface MiniSignRules {
  require_face_verify: boolean
  require_dual_sign: boolean
  require_comprehension_quiz: boolean
  /** 默认 true；为 false 时不强制协议级最短阅读时长（仍可能与节点 required_reading_duration_seconds 取较大值） */
  enable_min_reading_duration?: boolean
  min_reading_duration_seconds: number
  dual_sign_staffs: DualSignStaff[]
  collect_id_card?: boolean
  collect_screening_number?: boolean
  collect_initials?: boolean
  /** 是否采集受试者姓名 */
  collect_subject_name?: boolean
  collect_other_information?: boolean
  /** 补充说明类采集的自定义标签（非空则小程序展示对应输入；与 collect_other_information 二选一或并存） */
  supplemental_collect_labels?: string[]
  /** 执行台：是否启用「勾选框识别」签署预览能力，默认 false */
  enable_checkbox_recognition?: boolean
  /** 启用工作人员签名（默认不勾选）；勾选后可配置 1/2 次 */
  enable_staff_signature?: boolean
  staff_signature_times?: 1 | 2
  enable_subject_signature?: boolean
  subject_signature_times?: 1 | 2
  enable_guardian_signature?: boolean
  guardian_parent_count?: 1 | 2
  guardian_signature_times?: 1 | 2
  /** 启用后签署记录中的签署时间为签署当日日期（YYYY-MM-DD），由服务端/小程序在签署时填入 */
  enable_auto_sign_date?: boolean
}

/** 双签工作人员档案（与治理台账号关联，见 role_labels） */
export interface WitnessStaffRecord {
  id: number
  account_id: number | null
  name: string
  gender: string
  id_card_no: string
  phone: string
  email: string
  priority: number
  /** 治理台全局角色中文名，如 系统管理员、CRC协调员 */
  role_labels?: string[]
  face_order_id: string
  face_verified_at: string | null
  signature_file: string
  signature_at: string | null
  identity_verified: boolean
  update_time: string | null
  create_time: string | null
}

/** 双签：单人在本协议+签署节点下的核验阶段（与执行台列表徽章一致） */
export type DualSignStaffVerificationStatus =
  | 'pending_email'
  | 'pending_verify'
  | 'verifying'
  | 'verified'

/** 项目授权邮件链路：签名授权（同意/拒绝）进度 */
export type WitnessSignatureAuthStatus =
  | 'none'
  | 'pending_face'
  | 'pending_decision'
  | 'agreed'
  | 'refused'

export interface ConsentSettings {
  require_face_verify: boolean
  require_dual_sign: boolean
  require_comprehension_quiz: boolean
  /** 默认 true */
  enable_min_reading_duration?: boolean
  min_reading_duration_seconds: number
  dual_sign_staffs: DualSignStaff[]
  consent_launched?: boolean
  consent_locked_at?: string | null
  collect_id_card?: boolean
  collect_screening_number?: boolean
  collect_initials?: boolean
  collect_subject_name?: boolean
  /** 是否允许在签署页填写「其他补充说明」（对应文档「如有其他信息，可在此添加」等） */
  collect_other_information?: boolean
  /** 执行台「勾选框识别」配置的自定义补充采集项标签 */
  supplemental_collect_labels?: string[]
  /** 执行台：是否启用勾选框识别预览，默认 false */
  enable_checkbox_recognition?: boolean
  enable_staff_signature?: boolean
  staff_signature_times?: 1 | 2
  enable_subject_signature?: boolean
  subject_signature_times?: 1 | 2
  enable_guardian_signature?: boolean
  guardian_parent_count?: 1 | 2
  guardian_signature_times?: 1 | 2
  /** 启用自动签署日期：与节点小程序规则一致，存 consent_settings */
  enable_auto_sign_date?: boolean
  /** 计划现场筛选日 YYYY-MM-DD，最多 4 条（存于 protocol.parsed_data.consent_settings） */
  planned_screening_dates?: string[]
  /** 现场筛选计划：日期 + 目标筛选人数（优先于 planned_screening_dates） */
  screening_schedule?: ScreeningDay[]
  /** 项目级知情签署工作人员（须为 dual_sign_staffs 中的姓名） */
  consent_signing_staff_name?: string
  /** 最近一次从列表「授权核验测试」发起双签授权邮件所选工作人员姓名（用于列表标记） */
  consent_verify_test_staff_name?: string
  /** 邮件「签名授权」已同意后由服务端写入；列表展示「已授权待测试」 */
  consent_verify_signature_authorized?: boolean
}

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

  /** 更新项目名称/编号（编号非空时全局唯一） */
  updateBasic(id: number, data: ProtocolBasicUpdateIn) {
    return api.put<Protocol>(`/protocol/${id}`, data)
  },

  /** 创建协议 */
  create(data: ProtocolCreateIn) {
    return api.post<Protocol>('/protocol/create', data)
  },

  /** 批量导入项目（CSV/Excel，列：项目名称、项目编号，均必填） */
  async batchImport(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const res = await api.upload<{ created: number; failed: Array<{ row: number; error: string }> }>(
      '/protocol/batch-import',
      formData,
    )
    return res
  },

  /** 上传文件直接创建协议（知情管理，支持多份） */
  async uploadCreate(file: File, title?: string) {
    const formData = new FormData()
    formData.append('file', file)
    if (title) formData.append('title', title)
    const res = await api.upload<Protocol>('/protocol/upload-create', formData)
    return res
  },

  /** 调整知情管理协议展示顺序 */
  reorderConsent(idOrder: number[]) {
    return api.post('/protocol/reorder-consent', { id_order: idOrder })
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

  // ---------- 知情管理（执行台） ----------
  /** 知情配置负责人候选（治理台全局角色 QA质量管理） */
  listConsentConfigAssignees() {
    return api.get<{ items: Array<{ id: number; display_name: string; username: string; email: string }> }>(
      '/protocol/consent-config-assignees',
    )
  },

  /** 协议知情概览（项目列表含配置状态与签署统计） */
  getConsentOverview(params?: {
    page?: number
    page_size?: number
    keyword?: string
    config_status?: string
    date_start?: string
    date_end?: string
    /** 列表定位：返回该协议所在分页的 items，且 data.page 为所在页码 */
    focus_protocol_id?: number
  }) {
    return api.get<{ items: ProtocolConsentOverview[]; total: number; page: number; page_size: number }>(
      '/protocol/consent-overview',
      {
        params: { page: 1, page_size: 10, ...params },
        // 知情概览会聚合签署统计/现场批次，慢库或大数据量下可能超过默认 30s。
        timeout: 120000,
      },
    )
  },

  /** 导出知情管理项目列表为 Excel */
  async exportConsentOverview(params?: { keyword?: string; config_status?: string; date_start?: string; date_end?: string }): Promise<Blob> {
    const data = await api.get('/protocol/consent-overview/export', {
      params,
      responseType: 'blob',
    })
    return data as unknown as Blob
  },

  /** ICF 版本列表 */
  listIcfVersions(protocolId: number) {
    return api.get<{ items: ICFVersion[] }>(`/protocol/${protocolId}/icf-versions`)
  },

  /** 获取知情配置模式与全局配置 */
  getConsentConfigScope() {
    return api.get<{ config_mode: 'global' | 'per_protocol'; global_settings: ConsentSettings }>(
      '/protocol/consent-config/scope',
    )
  },

  /** 更新知情配置模式（已废弃全局模式；服务端会拒绝 config_mode=global） */
  updateConsentConfigScope(data: {
    config_mode?: 'global' | 'per_protocol'
    global_settings?: Partial<ConsentSettings>
  }) {
    return api.put<{ config_mode: string; global_settings: ConsentSettings }>(
      '/protocol/consent-config/scope',
      data,
    )
  },

  /** 获取知情配置中心设置 */
  getConsentSettings(protocolId: number) {
    return api.get<ConsentSettings>(`/protocol/${protocolId}/consent-settings`)
  },

  /** 更新知情配置中心设置 */
  updateConsentSettings(protocolId: number, data: ConsentSettings) {
    return api.put<ConsentSettings>(`/protocol/${protocolId}/consent-settings`, data)
  },

  /** 发布/取消发布知情（统一控制，发布后禁止编辑节点与配置） */
  consentLaunch(protocolId: number, launched: boolean) {
    return api.post<ConsentSettings>(`/protocol/${protocolId}/consent-launch`, { launched })
  },

  /** 签署统计 */
  getConsentStats(protocolId: number) {
    return api.get<ConsentStats>(`/protocol/${protocolId}/consents/stats`)
  },

  /** 上传文件创建签署节点（文件名自动解析为节点标题，可传 node_title 覆盖） */
  uploadIcfVersion(protocolId: number, file: File, nodeTitle?: string) {
    const form = new FormData()
    form.append('file', file)
    if (nodeTitle != null && nodeTitle.trim()) {
      form.append('node_title', nodeTitle.trim())
    }
    // 使用 post 而非 upload，让 axios 自动设置 multipart boundary，避免 Content-Type 错误导致服务端解析失败
    return api.post<ApiResponse<{ id: number; version: string; node_title: string; file_path: string; is_active: boolean; create_time: string }>>(
      `/protocol/${protocolId}/icf-versions/upload`,
      form,
    )
  },

  /** 创建 ICF 版本（签署节点，表单方式，无文件时用） */
  createIcfVersion(protocolId: number, data: { version: string; content?: string; file_path?: string; is_active?: boolean; required_reading_duration_seconds?: number; node_title?: string }) {
    return api.post<ApiResponse<{ id: number; version: string; is_active: boolean; create_time: string }>>(
      `/protocol/${protocolId}/icf-versions`,
      data,
    )
  },

  /** 调整 ICF 签署顺序 */
  reorderIcfVersions(protocolId: number, idOrder: number[]) {
    return api.post(`/protocol/${protocolId}/icf-versions/reorder`, { id_order: idOrder })
  },

  /** 更新 ICF 版本 */
  updateIcfVersion(protocolId: number, icfId: number, data: { version?: string; content?: string; is_active?: boolean; required_reading_duration_seconds?: number; node_title?: string }) {
    return api.put<ApiResponse<{ id: number; version: string; is_active: boolean; update_time: string }>>(
      `/protocol/${protocolId}/icf-versions/${icfId}`,
      data,
    )
  },

  /** 删除签署节点（ICF 版本） */
  deleteIcfVersion(protocolId: number, icfId: number) {
    return api.delete<ApiResponse<{ id: number }>>(`/protocol/${protocolId}/icf-versions/${icfId}`)
  },

  /** 保存单签署节点小程序签署规则（每节点独立） */
  updateIcfMiniSignRules(protocolId: number, icfId: number, data: MiniSignRules) {
    return api.put<{
      id: number
      mini_sign_rules_saved: boolean
      mini_sign_rules: Record<string, unknown>
    }>(`/protocol/${protocolId}/icf-versions/${icfId}/mini-sign-rules`, data)
  },

  /** 获取签署节点上传文件的二进制流（需登录，用于内嵌 PDF 预览） */
  async fetchIcfVersionFileBlob(protocolId: number, icfId: number): Promise<Blob> {
    const res = await getAxiosInstance().get(`/protocol/${protocolId}/icf-versions/${icfId}/file`, {
      responseType: 'blob',
      timeout: 180000,
    })
    return res.data as Blob
  },

  /** 内嵌预览：PDF / HTML；.docx 走快速通道，旧版 .doc 可能需 LibreOffice，故放宽超时 */
  async fetchIcfVersionPreviewBlob(protocolId: number, icfId: number): Promise<Blob> {
    const res = await getAxiosInstance().get(`/protocol/${protocolId}/icf-versions/${icfId}/preview`, {
      responseType: 'blob',
      timeout: 180000,
    })
    return res.data as Blob
  },

  /** 签署记录列表（分页、排序） */
  listConsents(
    protocolId: number,
    params?: {
      status?: 'all' | 'signed' | 'pending' | 'result_no'
      icf_version_id?: number
      /** YYYY-MM-DD，按签署日或未签时的创建日筛选 */
      date_from?: string
      date_to?: string
      /** 关键字：受试者编号、姓名、SC号、回执号、节点标题等子串匹配 */
      search?: string
      page?: number
      page_size?: number
      /** 与后端 CONSENT_LIST_SORT_FIELDS 一致，如 signed_at、subject_no */
      sort?: string
      order?: 'asc' | 'desc'
      /** subject：按受试者合并多节点为一行 */
      group_by?: 'subject'
    },
  ) {
    return api.get<{
      items: ConsentRecord[]
      total: number
      page: number
      page_size: number
      group_by?: 'subject' | null
    }>(`/protocol/${protocolId}/consents`, { params })
  },

  /** 执行台：签署内容预览 */
  getConsentPreview(protocolId: number, consentId: number) {
    return api.get<ConsentPreviewData>(`/protocol/${protocolId}/consents/${consentId}/preview`)
  },

  /** 执行台：退回重签（可选 body.reason，供小程序展示） */
  staffReturnConsent(protocolId: number, consentId: number, body?: { reason?: string }) {
    return api.post<{
      consent_id: number
      is_signed: boolean
      staff_audit_status: string
      consent_status_label: string
    }>(`/protocol/${protocolId}/consents/${consentId}/staff-return`, body ?? {})
  },

  /** 执行台：工作人员审核通过 */
  staffApproveConsent(protocolId: number, consentId: number) {
    return api.post<{
      consent_id: number
      is_signed: boolean
      staff_audit_status: string
      consent_status_label: string
    }>(`/protocol/${protocolId}/consents/${consentId}/staff-approve`)
  },

  /** 执行台：软删除签署记录 */
  softDeleteConsent(protocolId: number, consentId: number) {
    return api.delete<ApiResponse<{ consent_id: number }>>(`/protocol/${protocolId}/consents/${consentId}`)
  },

  /** 执行台：见证签署（双签） */
  investigatorSignConsent(
    protocolId: number,
    consentId: number,
    data: { staff_id?: string; staff_name: string; staff_phone?: string; staff_email?: string },
  ) {
    return api.post<{ consent_id: number; investigator_signed_at: string; investigator_sign_staff_name: string; status: string }>(
      `/protocol/${protocolId}/consents/${consentId}/investigator-sign`,
      data,
    )
  },

  /** 导出受试者基础信息 Excel（SC号、姓名、手机号、身份证号；按受试者去重；返回 blob） */
  async exportConsents(
    protocolId: number,
    params?: {
      status?: 'all' | 'signed' | 'pending' | 'result_no'
      icf_version_id?: number
      date_from?: string
      date_to?: string
      search?: string
    },
  ): Promise<Blob> {
    const data = await api.get(`/protocol/${protocolId}/consents/export`, {
      params,
      responseType: 'blob',
    })
    return data as unknown as Blob
  },

  /** 批量导出知情签署回执 PDF（ZIP：每人一子文件夹，与当前筛选一致） */
  async exportConsentPdfs(
    protocolId: number,
    params?: {
      status?: 'all' | 'signed' | 'pending' | 'result_no'
      icf_version_id?: number
      date_from?: string
      date_to?: string
      search?: string
    },
  ): Promise<Blob> {
    const data = await api.get(`/protocol/${protocolId}/consents/export-pdf`, {
      params,
      responseType: 'blob',
    })
    return data as unknown as Blob
  },

  /**
   * 软删除协议（is_deleted 打标，列表不再展示；非物理删除，可后台恢复）
   */
  softDeleteProtocol(id: number) {
    return api.delete<ApiResponse<{ id: number }>>(`/protocol/${id}`)
  },

  /** 双签工作人员列表 */
  listWitnessStaff(params?: {
    search?: string
    page?: number
    page_size?: number
    /** 深链定位：服务端计算该档案所在分页并返回 data.page */
    focus_witness_staff_id?: number
  }) {
    return api.get<{ items: WitnessStaffRecord[]; total: number; page: number; page_size: number }>(
      '/protocol/witness-staff/list',
      { params },
    )
  },

  /** 具备 QA质量管理 全局角色的治理台账号（用于建档） */
  listWitnessEligibleAccounts(params?: {
    search?: string
    page?: number
    page_size?: number
    only_without_profile?: boolean
  }) {
    return api.get<{
      items: Array<{
        id: number
        username: string
        display_name: string
        email: string
        phone: string
        role_labels: string[]
      }>
      total: number
      page: number
      page_size: number
    }>('/protocol/witness-staff/eligible-accounts', { params })
  },

  /** 按治理台账号批量同步姓名/邮箱到双签档案（手机号由人脸核验等环节回写，不同步治理台） */
  syncWitnessStaffFromAccounts() {
    return api.post<ApiResponse<{ synced: number; skipped_no_email: number }>>(
      '/protocol/witness-staff/sync-from-accounts',
    )
  },

  createWitnessStaff(data: { account_id: number }) {
    return api.post<ApiResponse<WitnessStaffRecord>>('/protocol/witness-staff', data)
  },

  /** 双签工作人员（无治理台账号）；身份证与手机号可在人脸核验环节补全 */
  createWitnessStaffPartTime(data: {
    name: string
    email: string
    phone?: string
    id_card_no?: string
    gender?: string
  }) {
    return api.post<ApiResponse<WitnessStaffRecord>>('/protocol/witness-staff/part-time', data)
  },

  updateWitnessStaff(
    staffId: number,
    data: Partial<{ name: string; email: string; gender: string; id_card_no: string; phone: string; priority: number }>,
  ) {
    return api.put<ApiResponse<WitnessStaffRecord>>(`/protocol/witness-staff/${staffId}`, data)
  },

  deleteWitnessStaff(staffId: number) {
    return api.delete<ApiResponse<null>>(`/protocol/witness-staff/${staffId}`)
  },

  /** 知情配置：提交双签身份验证（向工作人员发邮件） */
  requestDualSignAuth(
    protocolId: number,
    data: { witness_staff_id: number; icf_version_id: number; notify_email?: string },
  ) {
    return api.post<ApiResponse<{ notify_email: string }>>(`/protocol/${protocolId}/dual-sign-auth-request`, data)
  },

  /**
   * 双签名单每人核验阶段（待发邮件 / 待核验 / 核验中 / 已核验）。
   * 传入 staffIds 可与页面「已选顺序」一致；不传则仅按已保存的协议级双签名单计算。
   */
  getDualSignStaffStatus(protocolId: number, icfVersionId: number, staffIds?: number[]) {
    return api.get<
      ApiResponse<{
        items: Array<{
          witness_staff_id: number
          status: DualSignStaffVerificationStatus
          signature_auth_status?: WitnessSignatureAuthStatus
          test_signing_completed?: boolean
        }>
      }>
    >(`/protocol/${protocolId}/dual-sign-staff-status`, {
      params: {
        icf_version_id: icfVersionId,
        ...(staffIds?.length ? { staff_ids: staffIds.join(',') } : {}),
      },
    })
  },

  /** 清空本协议已保存双签名单中全员档案核验状态（未发布）；重做须重发邮件并走火山人脸 H5 */
  resetDualSignVerification(protocolId: number) {
    return api.post<ApiResponse<{ cleared_staff: number; staff_ids: number[] }>>(
      `/protocol/${protocolId}/dual-sign-verification-reset`,
    )
  },

  /** 工作人员列表：发起身份验证邮件 */
  sendWitnessStaffAuthEmail(
    staffId: number,
    data: { protocol_id: number; icf_version_id: number; notify_email?: string },
  ) {
    return api.post<ApiResponse<{ notify_email: string }>>(`/protocol/witness-staff/${staffId}/send-auth-email`, data)
  },

  /** 双签名单「核验」：档案人脸+手写签名登记邮件（不绑定协议） */
  sendWitnessStaffProfileVerifyEmail(staffId: number, data?: { notify_email?: string }) {
    return api.post<ApiResponse<{ notify_email: string }>>(
      `/protocol/witness-staff/${staffId}/send-profile-verify-email`,
      data ?? {},
    )
  },

  /** 公开：解析邮件中的授权令牌 */
  resolveWitnessAuthToken(token: string) {
    return api.get<{
      name: string
      id_card_no: string
      phone: string
      /** 执行台档案中是否已同时有身份证与手机号（有则表单只读展示） */
      has_id_card_and_phone: boolean
      email: string
      /** profile=名单核验邮件（人脸+档案签名）；project=项目授权邮件 */
      token_scope?: 'profile' | 'project'
      protocol_id: number | null
      protocol_code: string
      protocol_title: string
      icf_version_id: number | null
      /** 档案核验邮件：本链接内是否已完成手写签名提交 */
      staff_signature_registered?: boolean
      identity_verified?: boolean
      face_verified_at?: string | null
      /** 是否完成真实在线核身（非旧版占位提交） */
      face_verification_effective?: boolean
      /** 仅为旧占位「假核验」时为 true，须重新走火山 H5 */
      legacy_placeholder_face_record?: boolean
      /** 与受试者 L2 相同；sdk_ready 为 false 时无法发起火山 H5 */
      identity_provider_state?: {
        sdk_ready?: boolean
        h5_config_id_set?: boolean
        sub_ak_set?: boolean
        sub_sk_set?: boolean
        role_trn_set?: boolean
        callback_token_set?: boolean
      }
      /** 联调：为 true 时 face-start 跳过火山并可进入知情联调页 */
      witness_face_dev_bypass?: boolean
      /** 签名授权：agreed | refused，空表示人脸通过后尚未选择 */
      signature_auth_decision?: string | null
      signature_auth_at?: string | null
      /** 双签档案是否已上传手写签名（同意授权前置条件） */
      staff_signature_on_file?: boolean
      /** 双签档案主键，用于深链定位名单行 */
      witness_staff_id?: number
    }>('/protocol/witness-auth/resolve', { params: { token } })
  },

  /** 人脸核验通过后：同意或拒绝本项目使用签名信息（与扫码知情签署分离） */
  witnessSignatureAuthorize(data: { token: string; decision: 'agree' | 'refuse' }) {
    return api.post<ApiResponse<{ signature_auth_decision: string; already_recorded?: boolean }>>(
      '/protocol/witness-auth/signature-authorize',
      data,
    )
  },

  /** 档案核验邮件：人脸通过后提交手写签名图片（公开） */
  registerWitnessStaffSignature(data: { token: string; image_base64: string }) {
    return api.post<
      ApiResponse<{
        already_registered?: boolean
        witness_staff_id?: number
        storage_key?: string
        signature_at?: string | null
      }>
    >('/protocol/witness-auth/register-staff-signature', data)
  },

  /** 公开：发起火山引擎 H5 人脸核身（与受试者 L2 共用配置）；档案缺身份证/手机号时需传 */
  startWitnessFaceVerification(data: { token: string; id_card_no?: string; phone?: string }) {
    return api.post<{
      already_verified?: boolean
      /** 联调：已直接标记核身完成，勿打开火山 H5 */
      dev_bypass?: boolean
      witness_staff_id?: number
      identity_verified?: boolean
      /** 当前实现为 volcengine；腾讯云接入后可扩展 */
      identity_provider?: 'volcengine' | 'tencent'
      byted_token?: string
      h5_config_id?: string
      verify_id?: string
      verify_url?: string | null
    }>('/protocol/witness-auth/face-start', data)
  },

  /** 联调：按协议 ICF 节点顺序列出内容与阅读秒数（需 WITNESS_FACE_DEV_BYPASS） */
  getWitnessDevConsentQueue(token: string) {
    return api.get<{
      protocol_id: number
      protocol_code: string
      protocol_title: string
      items: Array<{
        icf_version_id: number
        node_title: string
        version: string
        required_reading_duration_seconds: number
        content: string
        enable_subject_signature?: boolean
        /** 0=未开启受试者签名；1/2=与小程序生效规则一致 */
        subject_signature_times?: 0 | 1 | 2
        enable_checkbox_recognition?: boolean
        supplemental_collect_labels?: string[]
        collect_other_information?: boolean
      }>
    }>('/protocol/witness-auth/dev-consent-queue', { params: { token } })
  },

  /** 核验测试 H5：公开口令下列出 ICF（执行台 /#/consent-test-scan） */
  getConsentTestScanQueue(params: { p: number; t: string }) {
    return api.get<{
      protocol_id: number
      protocol_code: string
      protocol_title: string
      /** 与知情配置 consent_settings.require_face_verify 一致；未启用时扫码填写信息后直接进入文档测试 */
      require_face_verify?: boolean
      /** 与协议 consent_settings.enable_auto_sign_date 一致；服务端写入签署日时为当日日历日 */
      enable_auto_sign_date?: boolean
      items: Array<{
        icf_version_id: number
        node_title: string
        version: string
        required_reading_duration_seconds: number
        content: string
        enable_subject_signature?: boolean
        subject_signature_times?: 0 | 1 | 2
        enable_auto_sign_date?: boolean
        enable_checkbox_recognition?: boolean
        supplemental_collect_labels?: string[]
        collect_other_information?: boolean
      }>
    }>('/protocol/public/consent-test-queue', { params })
  },

  /** 核验测试 H5：写入测试类型签署记录 */
  submitConsentTestScan(data: {
    p: number
    t: string
    icf_version_ids: number[]
    icf_version_answers?: Array<{ icf_version_id: number; answers: Array<{ value: string }> }>
    /** 各节点手写签名 PNG（data URL），与 icf_version_ids 顺序对应 */
    icf_version_signatures?: Array<{ icf_version_id: number; signature_images: string[] }>
    subject_name?: string
    id_card_no?: string
    phone?: string
    screening_number?: string
  }) {
    return api.post<{
      protocol_id: number
      subject_id: number
      subject_no: string
      consent_ids: number[]
      /** 与单次提交批次绑定，用于公开下载回执 PDF */
      consent_test_scan_batch_id: string
      receipt_items: Array<{
        consent_id: number
        icf_version_id: number
        node_title: string
        version: string
        receipt_no: string
      }>
    }>('/protocol/public/consent-test-submit', data)
  },

  /** 联调：将已阅读的 ICF 节点写入测试类型 SubjectConsent（需 WITNESS_FACE_DEV_BYPASS） */
  submitWitnessDevConsent(data: {
    token: string
    icf_version_ids: number[]
    /** 各节点勾选结果，与 signature_data.icf_checkbox_answers 一致 */
    icf_version_answers?: Array<{ icf_version_id: number; answers: Array<{ value: string }> }>
  }) {
    return api.post<{
      protocol_id: number
      subject_id: number
      subject_no: string
      witness_staff_id: number
      consent_ids: number[]
    }>('/protocol/witness-auth/dev-consent-submit', data)
  },

  /** 公开：轮询人脸核身结果（cert_verify_query） */
  getWitnessFaceVerificationResult(token: string) {
    return api.get<{
      status: 'pending' | 'verified' | 'failed'
      msg?: string
      witness_staff_id?: number
      identity_verified?: boolean
    }>('/protocol/witness-auth/face-result', { params: { token } })
  },
}
