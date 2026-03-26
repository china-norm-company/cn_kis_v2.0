import Taro from '@tarojs/taro'

const CLOUDRUN_ENV_ID = 'prod-3gfhkz1551e76534'
/** 与微信云托管控制台服务名一致（当前标准服务：utest） */
const CLOUDRUN_SERVICE = 'utest'
const CLOUDRUN_API_PREFIX = '/api/v1'

let cloudRunAvailable: boolean | null = null
type CloudContainerResponse = {
  statusCode?: number
  errCode?: number
  data?: unknown
}

function toCloudContainerResponse(value: unknown): CloudContainerResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const statusCode = Reflect.get(value, 'statusCode')
  const errCode = Reflect.get(value, 'errCode')
  const data = Reflect.get(value, 'data')
  return {
    statusCode: typeof statusCode === 'number' ? statusCode : undefined,
    errCode: typeof errCode === 'number' ? errCode : undefined,
    data,
  }
}

function resolveWxCloud(raw: unknown): WxCloudLike | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const initFn = Reflect.get(raw, 'init')
  const callContainerFn = Reflect.get(raw, 'callContainer')
  const cloud: WxCloudLike = {}
  if (typeof initFn === 'function') {
    cloud.init = (options) => {
      Reflect.apply(initFn, raw, [options])
    }
  }
  if (typeof callContainerFn === 'function') {
    cloud.callContainer = async (options) => {
      const result = Reflect.apply(callContainerFn, raw, [options])
      return toCloudContainerResponse(await Promise.resolve(result))
    }
  }
  return cloud.init || cloud.callContainer ? cloud : undefined
}

function getResponseMsg(payload: unknown, fallback: string): string {
  if (isRecord(payload)) {
    const maybeMsg = payload.msg
    if (typeof maybeMsg === 'string' && maybeMsg.trim()) {
      return maybeMsg
    }
  }
  return fallback
}

/**
 * 严格按微信开放文档「调用云托管服务」使用 wx.cloud.callContainer。
 * 云中转/生产通过构建期环境变量注入基址；
 * 本地或真机调试可通过 TARO_APP_API_BASE 指定 http(s)://host:port/api/v1（http 需在开发者工具勾选「不校验合法域名」）。
 */
async function cloudContainerRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  data?: unknown,
  header?: Record<string, string>,
): Promise<{ statusCode: number; data: unknown }> {
  // Taro.cloud 类型在多端声明不完全一致，这里桥接为最小云能力接口以便统一调用。
  const cloud = (typeof wx !== 'undefined' ? resolveWxCloud(wx?.cloud) : undefined) ?? resolveWxCloud(Taro.cloud)
  if (!cloud?.callContainer) {
    throw new Error('wx.cloud.callContainer not available')
  }
  const options: Record<string, unknown> = {
    config: { env: CLOUDRUN_ENV_ID },
    path: `${CLOUDRUN_API_PREFIX}${path}`,
    method,
    header: { 'X-WX-SERVICE': CLOUDRUN_SERVICE, ...header },
    data,
  }
  const resp = toCloudContainerResponse(await cloud.callContainer(options))
  return { statusCode: resp.statusCode ?? resp.errCode ?? 200, data: resp.data }
}

/**
 * API 基础地址：
 * - 微信小程序中 wx.request 必须使用完整 URL（http 或 https），相对路径会报 invalid url。
 * - 使用云托管时通过 wx.cloud.callContainer 走 path，无需完整 URL。
 * - 云托管不可用或未开通时，通过 TARO_APP_API_BASE 构建时传入完整基址（如 https://your-domain.com/api/v1 或 http://局域网IP:8001/api/v1）。
 */
/** H5 等非小程序端相对 API 前缀（小程序内 wx 环境用空串走云托管 path） */
const WEB_RELAY_BASE = '/api/v1'
/** 微信小程序 wx.request 必须使用完整 URL；备份兜底地址仅允许 https */
const isHttpsUrl = (s: string) => /^https:\/\//i.test((s || '').trim())
/** 直连 wx.request 的绝对基址（http 或 https） */
const isAbsoluteApiBaseUrl = (s: string) => /^https?:\/\//i.test((s || '').trim())
const CLOUD_RELAY_BACKUP_BASE_RAW =
  typeof process !== 'undefined' &&
  process &&
  process.env &&
  process.env.TARO_APP_API_BACKUP_BASE
    ? process.env.TARO_APP_API_BACKUP_BASE
    : ''
const ENABLE_API_FALLBACK =
  typeof process !== 'undefined' &&
  process &&
  process.env &&
  String(process.env.TARO_APP_ENABLE_FALLBACK || '').toLowerCase() === 'true'

function normalizeRelayBase(raw?: string): string | undefined {
  if (!raw) return undefined
  const value = raw.trim()
  // http(s)://host[:port][/path] — host 为域名或 IPv4；http 时微信端需勾选「不校验合法域名」
  if (/^https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?(\/.*)?$/i.test(value)) {
    return value.replace(/\/+$/, '')
  }
  // 3) 局域网 HTTP 开发（如 http://10.x.x.x:8001/api/v1；开发者工具需勾选「不校验合法域名」）
  if (/^http:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?(\/.*)?$/i.test(value)) {
    return value.replace(/\/+$/, '')
  }
  return undefined
}

// 由 config defineConstants 注入，构建时 TARO_APP_API_BASE=http://127.0.0.1:8001/api/v1
const rawEnvBase: string | undefined = process.env.TARO_APP_API_BASE as string | undefined
const compileEnvBaseUrl = rawEnvBase ? normalizeRelayBase(rawEnvBase) : undefined

const runtimeDefaultBase = (typeof wx !== 'undefined' && !!wx) ? '' : WEB_RELAY_BASE
export const API_BASE_URL = (compileEnvBaseUrl || runtimeDefaultBase).replace(/\/+$/, '')
const CLOUD_RELAY_BACKUP_BASE = (CLOUD_RELAY_BACKUP_BASE_RAW || '').trim().replace(/\/+$/, '')
const REQUEST_TIMEOUT_MS = 8000
const RETRY_TIMEOUT_MS = 12000
let currentApiBaseUrl = API_BASE_URL

const INITIAL_COMPILED_API_BASE = API_BASE_URL

/** 本机 / 局域网私网可直连（含 localhost、127.0.0.1、RFC1918），用于真机联调与联调地址覆盖判断 */
export function isPrivateLanApiBase(base: string): boolean {
  const s = (base || '').trim()
  if (!s) return false
  try {
    const u = new URL(s.startsWith('http') ? s : `http://${s}`)
    const h = u.hostname
    if (h === 'localhost' || h === '127.0.0.1') return true
    return /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/.test(
      h,
    )
  } catch {
    return false
  }
}

export const DEV_API_BASE_STORAGE_KEY = 'cn_kis_dev_api_base_url'

export function allowsDevApiBaseStorageOverride(): boolean {
  const b = (API_BASE_URL || '').trim()
  const compiledIsLocalhost = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/i.test(b)
  return compiledIsLocalhost || isPrivateLanApiBase(API_BASE_URL)
}

export function applyDevApiBaseOverrideFromStorage(): void {
  if (!allowsDevApiBaseStorageOverride()) return
  try {
    const raw = Taro.getStorageSync(DEV_API_BASE_STORAGE_KEY)
    if (raw == null || raw === '') return
    const s = typeof raw === 'string' ? raw.trim() : String(raw).trim()
    if (!s) return
    const normalized = normalizeRelayBase(s)
    if (normalized) currentApiBaseUrl = normalized
  } catch {
    // ignore
  }
}

export function getDevApiBaseOverrideRaw(): string {
  if (!allowsDevApiBaseStorageOverride()) return ''
  try {
    const raw = Taro.getStorageSync(DEV_API_BASE_STORAGE_KEY)
    return typeof raw === 'string' ? raw : ''
  } catch {
    return ''
  }
}

export function setDevApiBaseOverride(
  url: string | null | undefined,
): { ok: boolean; msg?: string } {
  if (!allowsDevApiBaseStorageOverride()) {
    return { ok: false, msg: '当前构建为正式 API 地址，不支持本地覆盖' }
  }
  const empty = !url || !String(url).trim()
  if (empty) {
    try {
      Taro.removeStorageSync(DEV_API_BASE_STORAGE_KEY)
    } catch {
      // ignore
    }
    currentApiBaseUrl = INITIAL_COMPILED_API_BASE
    return { ok: true }
  }
  const trimmed = String(url).trim()
  const normalized = normalizeRelayBase(trimmed)
  if (!normalized) {
    return { ok: false, msg: '请输入有效的 http(s):// 地址，局域网需为 http://192.168.x.x:端口/api/v1 形式' }
  }
  try {
    Taro.setStorageSync(DEV_API_BASE_STORAGE_KEY, trimmed)
    currentApiBaseUrl = normalized
    return { ok: true }
  } catch {
    return { ok: false, msg: '保存失败' }
  }
}

function isWebRuntime(): boolean {
  // 小程序运行时 Taro 会注入浏览器兼容对象，不能仅靠 window/document 判断。
  // 必须以 Taro 运行环境为准，避免在 weapp 误把相对路径当作可用 baseUrl。
  return Taro.getEnv() === Taro.ENV_TYPE.WEB
}

function isWeappLikeRuntime(): boolean {
  // 某些宿主环境下 Taro.getEnv 可能与实际网络栈不一致；以 wx.request 能力兜底判定。
  return typeof wx !== 'undefined' && !!wx && typeof wx.request === 'function'
}

function isRelativeApiBase(base: string): boolean {
  return /^\/[a-z0-9/_-]*$/i.test(base)
}

/** localhost / 127.0.0.1 基址 */
function isLocalhostBase(base: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/i.test((base || '').trim())
}

/** 任意 http 基址（含局域网/公网 IP）：不走云托管，直接 wx.request */
function isPlainHttpApiBase(base: string): boolean {
  return /^http:\/\//i.test((base || '').trim())
}

export function getCurrentApiBaseUrl(): string {
  return currentApiBaseUrl
}

export function getCurrentChannel(): string {
  return cloudRunAvailable === true ? 'cloudrun' : 'https'
}

/**
 * 是否应对 /auth/wechat/login 使用 dev-bypass-wechat（不调微信、免 IP 白名单）。
 */
export function shouldUseWechatLoginBypass(): boolean {
  if (/127\.0\.0\.1|localhost/.test((process.env.TARO_APP_API_BASE as string) || '')) {
    return true
  }
  const base = (getCurrentApiBaseUrl() || '').trim()
  if (isLocalhostBase(base)) return true
  const lower = base.toLowerCase()
  if (lower.includes('localhost') || lower.includes('127.0.0.1')) return true
  // H5 开发：相对路径 /api/v1 通常由 devServer 代理到本机 Django
  if (
    isRelativeApiBase(base) &&
    typeof process !== 'undefined' &&
    process.env &&
    process.env.NODE_ENV !== 'production'
  ) {
    return true
  }
  return false
}

/** 本地开发：实名页「开始认证」走服务端 dev-skip；含局域网 IP */
export function shouldUseIdentityVerifyDevBypass(): boolean {
  if (shouldUseWechatLoginBypass()) return true
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return false
  return isPrivateLanApiBase(getCurrentApiBaseUrl())
}

/** 统一响应格式 */
interface ApiResponse<T = unknown> {
  code: number
  msg: string
  data: T
}

/** 请求配置 */
interface RequestOptions {
  /** 是否需要鉴权 (默认 true) */
  auth?: boolean
  /** 自定义请求头 */
  headers?: Record<string, string>
  /** 是否静默处理错误（不弹 toast） */
  silent?: boolean
  /** 请求超时（毫秒） */
  timeoutMs?: number
}

type RequestParams = Record<string, unknown>

function emptyData<T>(): T {
  // 统一失败分支返回空数据；调用方应以 code 判断成功与否。
  return fallbackData<T>(null)
}

function fallbackData<T>(value: unknown): T {
  return (value ?? null) as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toApiResponse<T>(payload: unknown): ApiResponse<T> {
  if (isRecord(payload)) {
    const code = payload.code
    const msg = payload.msg
    if (typeof code === 'number' && typeof msg === 'string') {
      return { code, msg, data: fallbackData<T>(payload.data) }
    }
  }
  return { code: 200, msg: 'ok', data: fallbackData<T>(payload) }
}

function isRequestOptions(value: unknown): value is RequestOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  return (
    'auth' in value ||
    'headers' in value ||
    'silent' in value ||
    'timeoutMs' in value
  )
}

function getErrorMessage(error: unknown): string {
  if (!isRecord(error)) return ''
  const errMsg = typeof error.errMsg === 'string' ? error.errMsg : ''
  const message = typeof error.message === 'string' ? error.message : ''
  return errMsg || message
}

/**
 * 获取存储的 token
 */
function getToken(): string {
  return Taro.getStorageSync('token') || ''
}

/**
 * 统一请求封装
 */
async function request<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  data?: unknown,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { auth = true, headers = {}, silent = false, timeoutMs } = options

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  }

  if (auth) {
    const token = getToken()
    if (token) {
      header['Authorization'] = `Bearer ${token}`
    }
  }

  const runRequest = async (baseUrl: string, requestTimeout: number) => {
    const response = await Taro.request({
      url: `${baseUrl}${url}`,
      method,
      data,
      header,
      timeout: requestTimeout,
    })
    return response
  }

  // localhost 或显式 http 基址：直连后端，不先走云托管 utest
  const useDirectHttpRequest = isLocalhostBase(currentApiBaseUrl) || isPlainHttpApiBase(currentApiBaseUrl)
  const cloud = (typeof wx !== 'undefined' ? resolveWxCloud(wx?.cloud) : undefined) ?? resolveWxCloud(Taro.cloud)
  if (!useDirectHttpRequest && cloudRunAvailable !== false && cloud?.callContainer) {
    try {
      const resp = await cloudContainerRequest(method, url, data, header)
      cloudRunAvailable = true
      const response = resp
      const { statusCode, data: resData } = response
      if (statusCode === 401) {
        Taro.removeStorageSync('token')
        Taro.removeStorageSync('userInfo')
        if (!silent) Taro.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
        return { code: 401, msg: '未授权', data: emptyData<T>() }
      }
      if (statusCode >= 400) {
        const errorMsg = getResponseMsg(resData, `请求失败 (${statusCode})`)
        if (!silent) Taro.showToast({ title: errorMsg, icon: 'none' })
        return { code: statusCode, msg: errorMsg, data: fallbackData<T>(resData) }
      }
      return toApiResponse<T>(resData)
    } catch (cloudErr) {
      console.warn('[CloudRun] callContainer failed, falling back to HTTPS:', cloudErr)
      cloudRunAvailable = false
    }
  }

  try {
    // 小程序 wx.request 必须用完整 URL；允许 http(s) 绝对地址、H5 相对路径
    const baseValid = !!(
      currentApiBaseUrl &&
      (isAbsoluteApiBaseUrl(currentApiBaseUrl) ||
        (!isWeappLikeRuntime() && isWebRuntime() && isRelativeApiBase(currentApiBaseUrl)))
    )
    if (!baseValid) {
      const cloudHint =
        cloudRunAvailable === false
          ? '云托管调用失败，请检查网络与云环境'
          : '请开通云开发并关联环境，或配置 API 直连'
      if (!silent) {
        Taro.showToast({
          title: cloudHint,
          icon: 'none',
          duration: 4000,
        })
      }
      return {
        code: -1,
        msg: `cloud run preferred but unavailable; env=${CLOUDRUN_ENV_ID}; ${cloudHint}`,
        data: emptyData<T>(),
      }
    }

    const response = await runRequest(currentApiBaseUrl!, timeoutMs || REQUEST_TIMEOUT_MS)

    const { statusCode, data: resData } = response

    // Token 过期处理
    if (statusCode === 401) {
      Taro.removeStorageSync('token')
      Taro.removeStorageSync('userInfo')
      Taro.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
      return { code: 401, msg: '未授权', data: emptyData<T>() }
    }

    // HTTP 错误（保留 data 以便调用方读取 error_code 等业务错误码）
    if (statusCode >= 400) {
      const errorMsg = getResponseMsg(resData, `请求失败 (${statusCode})`)
      if (!silent) {
        Taro.showToast({ title: errorMsg, icon: 'none' })
      }
      return { code: statusCode, msg: errorMsg, data: fallbackData<T>(resData) }
    }

    return toApiResponse<T>(resData)
  } catch (error) {
    const tryBackup =
      ENABLE_API_FALLBACK &&
      !!CLOUD_RELAY_BACKUP_BASE &&
      isHttpsUrl(CLOUD_RELAY_BACKUP_BASE) &&
      currentApiBaseUrl !== CLOUD_RELAY_BACKUP_BASE &&
      /timeout|timed out|errcode:-100|cronet|network|request:fail/i.test(
        String(getErrorMessage(error))
      )

    if (tryBackup) {
      try {
        const retryResp = await runRequest(CLOUD_RELAY_BACKUP_BASE, timeoutMs || RETRY_TIMEOUT_MS)
        currentApiBaseUrl = CLOUD_RELAY_BACKUP_BASE
        if (!silent) {
          Taro.showToast({ title: '主通道超时，已切换备用通道', icon: 'none', duration: 2200 })
        }
        const { statusCode, data: retryData } = retryResp
        if (statusCode >= 400) {
          const msg = getResponseMsg(retryData, `请求失败 (${statusCode})`)
          if (!silent) Taro.showToast({ title: msg, icon: 'none' })
          return { code: statusCode, msg, data: fallbackData<T>(retryData) }
        }
        return toApiResponse<T>(retryData)
      } catch (retryError) {
        error = retryError
      }
    }

    console.error('[API Error]', method, url, error)
    const detailMsg = getErrorMessage(error)
    const toastMsg = detailMsg.includes('url not in domain list')
      ? '请求域名未在小程序后台白名单'
      : detailMsg.includes('ssl') || detailMsg.includes('certificate')
        ? 'HTTPS证书异常，请联系管理员'
        : detailMsg.includes('timeout')
          ? '请求超时：请检查网络或稍后重试'
        : detailMsg.includes('errcode:-100') || detailMsg.includes('cronet')
          ? '网络连接失败：请检查手机网络；若为公网直连模式，请确认小程序后台已配置对应 request 合法域名'
          : detailMsg.includes('errcode:105') || detailMsg.includes('errcode 105')
            ? '网络请求失败（105）：请检查小程序 request 合法域名和 HTTPS 证书链'
            : detailMsg.includes('errcode:101') || detailMsg.includes('errcode 101')
              ? '网络请求失败（101）：请检查请求参数或微信环境'
              : '网络请求失败'
    if (!silent) {
      Taro.showToast({ title: toastMsg, icon: 'none', duration: 3500 })
    }
    return { code: -1, msg: detailMsg || '网络请求失败', data: emptyData<T>() }
  }
}

/** GET 请求 */
export function get<T = unknown>(
  url: string,
  paramsOrOptions?: RequestParams | RequestOptions,
  options?: RequestOptions
) {
  const params = isRequestOptions(paramsOrOptions) ? undefined : paramsOrOptions
  const requestOptions = isRequestOptions(paramsOrOptions)
    ? paramsOrOptions
    : options
  return request<T>('GET', url, params, { silent: true, ...(requestOptions || {}) })
}

/** POST 请求 */
export function post<T = unknown>(url: string, data?: unknown, options?: RequestOptions) {
  return request<T>('POST', url, data, options)
}

/** PUT 请求 */
export function put<T = unknown>(url: string, data?: unknown, options?: RequestOptions) {
  return request<T>('PUT', url, data, options)
}

/** DELETE 请求 */
export function del<T = unknown>(url: string, options?: RequestOptions) {
  return request<T>('DELETE', url, undefined, options)
}

/** 二维码图片 URL（后端生成 PNG，避免第三方 downloadFile 域名） */
export function getQrcodeImageUrl(qrData: string): string {
  return `${currentApiBaseUrl}/qrcode/image?data=${encodeURIComponent(qrData)}`
}

// ============================================================================
// 受试者自助 /my/ 端点
// ============================================================================

/** 获取我的档案 */
export interface MyProfileData {
  [key: string]: unknown
}

export function getMyProfile() {
  return get<MyProfileData>('/my/profile')
}

/** 更新我的档案 */
export function updateMyProfile(data: Record<string, unknown>) {
  return put<MyProfileData>('/my/profile', data)
}

/** 获取我的预约列表 */
export interface MyAppointmentItem {
  id: number
  appointment_date: string
  appointment_time: string | null
  purpose: string
  status: string
}

export function getMyAppointments() {
  return get<{ items: MyAppointmentItem[] }>('/my/appointments')
}

/** 创建预约 */
export function createMyAppointment(data: {
  appointment_date: string
  appointment_time?: string
  purpose?: string
  enrollment_id?: number
  visit_point?: string
}) {
  return post<{ id?: number; status?: string; appointment_no?: string }>('/my/appointments', data)
}

/** 取消预约 */
export function cancelMyAppointment(appointmentId: number) {
  return post<{ status?: string }>(`/my/appointments/${appointmentId}/cancel`)
}

/** 获取我的问卷列表 */
export interface MyQuestionnaireItem {
  id: number
  title?: string
  status?: string
  due_date?: string | null
  [key: string]: unknown
}

export function getMyQuestionnaires(status?: string) {
  const url = status ? `/my/questionnaires?status=${status}` : '/my/questionnaires'
  return get<{ items: MyQuestionnaireItem[] }>(url)
}

/** eCRF 通用类型 */
export interface EcrfQuestion {
  id: string
  type: string
  title: string
  required?: boolean
  options?: Array<{ label: string; value: string }>
  min?: number
  max?: number
  unit?: string
  repeat?: number
  auto_average?: boolean
  placeholder?: string
  [key: string]: unknown
}

export interface EcrfTemplate {
  id: number
  name: string
  schema: { questions: EcrfQuestion[] }
  is_self_report?: boolean
}

export interface EcrfRecord {
  id: number
  template_id?: number
  data?: Record<string, unknown>
  status?: 'draft' | 'submitted' | 'verified' | string
}

/** 我的 CRF 结果记录 */
export interface MyResultItem {
  id: number
  template_name?: string
  completed_at?: string
}

export function getMyResults() {
  return get<{ items: MyResultItem[] }>('/my/results')
}

/** 提交问卷 */
export function submitMyQuestionnaire(questionnaireId: number, data: {
  answers: Record<string, unknown>
  score?: number
}) {
  return post<{ status?: string }>(`/my/questionnaires/${questionnaireId}/submit`, data)
}

/** 获取我的礼金记录 */
export interface MyPaymentItem {
  id: number
  payment_no: string
  payment_type: string
  amount: string
  status: string
  paid_at: string | null
}

export function getMyPayments() {
  return get<{ items: MyPaymentItem[] }>('/my/payments')
}

/** 获取我的礼金汇总 */
export interface MyPaymentSummary {
  total_amount: string
  paid_amount: string
  pending_amount: string
  by_type: Array<{ type: string; count: number; amount: string }>
}

export function getMyPaymentSummary() {
  return get<MyPaymentSummary>('/my/payment-summary')
}

/** 获取我的客服工单 */
export interface MySupportTicketItem {
  id: number
  ticket_no: string
  category: string
  title: string
  status: string
  reply: string
  create_time: string
}

export function getMySupportTickets() {
  return get<{ items: MySupportTicketItem[] }>('/my/support-tickets')
}

/** 创建客服工单 */
export function createMySupportTicket(data: {
  title: string
  content: string
  category?: string
}) {
  return post<{ id?: number; ticket_no?: string; status?: string }>('/my/support-tickets', data)
}

/** 获取我的通知列表 */
export interface MyNotificationItem {
  id: number
  title: string
  content: string
  status: string
  channel: string
  sent_at: string | null
  create_time: string
}

export function getMyNotifications() {
  return get<{ items: MyNotificationItem[]; unread: number }>('/my/notifications')
}

/** 标记通知已读 */
export function markMyNotificationRead(notificationId: number) {
  return post<{ status?: string }>(`/my/notifications/${notificationId}/read`)
}

/** 我的入组记录 */
export interface MyEnrollmentItem {
  id: number
  protocol_id?: number
  protocol_title?: string
  /** 项目编号，展示在项目名称上面 */
  project_code?: string
  status?: string
  enrolled_at?: string | null
  [key: string]: unknown
}

export interface MyEnrollmentsData {
  items: MyEnrollmentItem[]
  has_appointment: boolean
  pending_appointment: {
    appointment_date: string
    appointment_time: string | null
    project_name: string
    project_code: string
    visit_point: string
    status: string
  } | null
}

export function getMyEnrollments() {
  return get<MyEnrollmentsData>('/my/enrollments')
}

/** 绑定状态 */
export interface BindingStatus {
  is_bound: boolean
  phone_masked: string | null
}

export function getMyBindingStatus() {
  return get<BindingStatus>('/my/binding/status')
}

/** 首次绑定手机号 */
export function bindPhone(phone: string) {
  return post<{ subject_id: number; phone_masked: string; is_new: boolean }>('/my/binding/bind-phone', { phone })
}

/** 发送短信验证码（L1） */
export function sendSmsVerifyCode(data: { phone: string; scene?: string }) {
  return post<{
    phone_masked: string
    scene: string
    expire_seconds: number
    cooldown_seconds: number
  }>('/auth/sms/send', data, { auth: false })
}

/** 校验短信验证码并登录（L1） */
export function verifySmsCodeLogin(data: { phone: string; code: string; scene?: string }) {
  return post<{
    access_token: string
    user: {
      id: number | string
      username?: string
      display_name?: string
      email?: string
      avatar?: string
      account_type?: string
    }
    roles?: string[]
    visible_workbenches?: string[]
  }>('/auth/sms/verify', data, { auth: false })
}

/** 认证等级：L0 游客 / L1 手机认证 / L2 实名认证 */
export const AUTH_LEVEL = {
  GUEST: 'guest',
  PHONE_VERIFIED: 'phone_verified',
  IDENTITY_VERIFIED: 'identity_verified',
} as const

export type AuthLevel = (typeof AUTH_LEVEL)[keyof typeof AUTH_LEVEL]

/** 认证状态响应（业务成功须同时有 data.auth_level） */
export interface IdentityStatusData {
  auth_level: AuthLevel
  identity_verified_at: string | null
  identity_verify_status: string | null
  phone_masked: string | null
  id_card_masked: string | null
  trace_id: string | null
}

/** 获取认证等级与实名状态；前端须依据 data.auth_level 做门禁 */
export function getMyIdentityStatus() {
  return get<IdentityStatusData>('/my/identity/status')
}

/** 判断接口为业务成功：code 200 且 data 存在且含关键字段（防伪成功） */
export function isIdentityStatusOk(res: { code?: number; data?: IdentityStatusData }): boolean {
  return res?.code === 200 && !!res?.data && typeof res.data.auth_level === 'string'
}

/** 判断是否为礼金/签署等 L2 门禁拒绝（后端 403 时 error_code 在 body 中，可能位于 data 或顶层） */
export function isIdentityRequiredError<T extends { code?: number; data?: unknown; error_code?: unknown }>(res: T): boolean {
  if (res?.code !== 403) return false
  const nestedCode = isRecord(res?.data) ? res.data.error_code : undefined
  const code = typeof res?.error_code === 'string' ? res.error_code : nestedCode
  return code === '403_IDENTITY_REQUIRED'
}

/** 是否为 L2 实名认证等级（用于门禁判断与展示） */
export function isL2(authLevel: string): boolean {
  return authLevel === AUTH_LEVEL.IDENTITY_VERIFIED
}

/** 认证等级展示文案（统一入口，避免页面硬编码） */
export function getAuthLevelLabel(authLevel: AuthLevel | string): string {
  const map: Record<string, string> = {
    [AUTH_LEVEL.GUEST]: '未认证',
    [AUTH_LEVEL.PHONE_VERIFIED]: '手机已认证',
    [AUTH_LEVEL.IDENTITY_VERIFIED]: '实名已认证',
  }
  return map[authLevel] ?? (typeof authLevel === 'string' ? authLevel : '')
}

/** 依从性评估数据 */
export interface MyComplianceEvaluationItem {
  id: number
  overall_score?: number
  rating?: string
  evaluation_date?: string
}

export interface MyComplianceData {
  latest_score?: number
  latest_rating?: string
  history?: MyComplianceEvaluationItem[]
}

export function getMyCompliance() {
  return get<MyComplianceData>('/my/compliance')
}

/** 发起实名认证 */
export function startIdentityVerify(provider?: string) {
  return post<{ verify_id: string; provider: string; expire_at: string; byted_token: string; h5_config_id: string; trace_id: string | null }>(
    '/my/identity/verify/start',
    { provider: provider || 'volcengine_cert' }
  )
}

/** 查询实名核验结果 */
export function getIdentityVerifyResult(verifyId: string) {
  return get<{ verify_id: string; status: string; verified_at: string | null; reject_reason: string | null; trace_id: string | null }>(
    `/my/identity/verify/result?verify_id=${encodeURIComponent(verifyId)}`
  )
}

/** 回写实名核验结果（测试/回调用） */
export function completeIdentityVerify(data: { verify_id: string; status: 'verified' | 'rejected'; id_card_encrypted?: string; reject_reason?: string }) {
  return post<{ status: string }>('/my/identity/verify/complete', data)
}

/** 获取我的知情同意 */
export function getMyConsents() {
  return get<{ items: Array<{ id: number; icf_version_id?: number; icf_version: string; is_signed: boolean; signed_at: string | null; receipt_no: string | null }> }>('/my/consents')
}

/** 获取 ICF 内容（动态加载） */
export function getIcfContent(icfVersionId: number) {
  return get<{ id: number; version: string; content: string; file_path: string; protocol_title: string }>(`/my/consents/icf/${icfVersionId}`)
}

/** 人脸核身签署知情同意书（L2 必选） */
export function faceSignConsent(icfVersionId: number, data: { face_verify_token: string; reading_duration_seconds?: number; comprehension_quiz_passed?: boolean }) {
  return post<{ consent_id: number; signed_at: string; receipt_no: string; status: string; trace_id: string | null }>(
    `/my/consents/${icfVersionId}/face-sign`,
    data
  )
}

/** 获取我的筛选进度 */
export interface MyScreeningStatusEntry {
  registration_id: number
  registration_no: string
  plan_id: number
  reg_status: string
  reg_date: string
  pre_screening: { id: number; result: string; date: string | null; notes: string } | null
  screening: { id: number; result: string; date: string | null; notes: string } | null
  enrollment: { id: number; status: string; enrollment_no: string; date: string | null } | null
}

export function getMyScreeningStatus() {
  return get<{ items: MyScreeningStatusEntry[] }>('/my/screening-status')
}

/** 获取可报名项目 */
export interface AvailablePlanItem {
  id: number
  title: string
  description?: string
  protocol_title?: string
  target_count?: number
  enrolled_count?: number
  start_date?: string
  end_date?: string
  completion_rate?: string
  remaining_slots?: number
  criteria?: Array<{ type: string; description: string; is_mandatory: boolean }>
}

export function getAvailablePlans() {
  return get<{ items: AvailablePlanItem[] }>('/my/public/plans', { auth: false, silent: true })
}

/** 获取项目详情 */
export function getPlanDetail(planId: number) {
  return get<AvailablePlanItem>(`/my/public/plans/${planId}`, { auth: false, silent: true })
}

/** 自助报名 */
export function registerForPlan(data: {
  plan_id: number
  gender?: string
  age?: number
  email?: string
  medical_history?: string
  skin_type?: string
}) {
  return post<{ registration_no: string }>('/my/register', data)
}

/** 获取即将到来的访视 */
export interface VisitNodeItem {
  id: number
  plan_id: number
  name: string
  baseline_day: number
  window_before: number
  window_after: number
  status: string
  order: number
  create_time: string
}

export interface MyUpcomingVisitItem {
  id: number
  date: string
  time: string | null
  purpose: string
  status: string
}

export function getMyUpcomingVisits() {
  return get<{ items: MyUpcomingVisitItem[] }>('/my/upcoming-visits')
}

/** 获取我的排程 */
export interface MyScheduleItem {
  id: number
  title: string
  status: string
  visit_name: string
  activity_name: string
  scheduled_date: string | null
  start_time: string | null
}

export function getMySchedule() {
  return get<{ items: MyScheduleItem[] }>('/my/schedule')
}

/** 获取日记列表 */
export interface MyDiaryEntryItem {
  id: number
  entry_date: string
  mood: string
  symptoms: string
  medication_taken: boolean
  notes: string
}

export function getMyDiary() {
  return get<{ items: MyDiaryEntryItem[] }>('/my/diary')
}

/** 新增日记 */
export function createMyDiary(data: {
  mood?: string
  symptoms?: string
  medication_taken?: boolean
  notes?: string
}) {
  return post<{ id: number }>('/my/diary', data)
}

/** 提交 NPS */
export function submitMyNps(data: {
  plan_id?: number
  score: number
  comment?: string
}) {
  return post<{ id: number }>('/my/nps', data)
}

/** 确认样品签收 */
export function confirmMySample(dispensingId: number) {
  return post<{ status: string }>(`/my/sample-confirm?dispensing_id=${dispensingId}`)
}

/** 我的产品列表 */
export interface MyProductItem {
  dispensing_id: number
  product_name: string
  status: string
  quantity_dispensed: number
  dispensed_at?: string | null
  next_visit_date?: string | null
  latest_usage?: { compliance_status?: string; compliance_rate?: number | null } | null
  latest_return?: { status?: string } | null
  active_recalls?: Array<{ recall_title: string }>
  active_state: boolean
}

export function getMyProducts(status: 'all' | 'active' | 'closed' = 'all') {
  return get<{ items: MyProductItem[] }>(`/my/products?status=${status}`)
}

/** 我的产品详情 */
export interface MyProductDetail {
  dispensing_id: number
  product_name: string
  status: string
  quantity_dispensed: number
  usage_instructions?: string
  dispensed_at?: string | null
  confirmed_at?: string | null
  latest_return?: { status?: string } | null
  active_recalls?: Array<{ recall_title: string; recall_level: string }>
  timeline?: Array<{ type: string; title: string; description: string; time?: string }>
}

export function getMyProductDetail(dispensingId: number) {
  return get<MyProductDetail>(`/my/products/${dispensingId}`)
}

/** 记录我的产品使用 */
export function createMyProductUsage(dispensingId: number, data: {
  actual_usage: number
  period_days?: number
  notes?: string
  adverse_event?: string
  deviation?: string
}) {
  return post<{ id: number }>(`/my/products/${dispensingId}/usage`, data)
}

/** 提交我的产品归还 */
export function createMyProductReturn(dispensingId: number, data: {
  return_reason?: string
  return_reason_detail?: string
  returned_quantity?: number
  unused_quantity?: number
  used_quantity?: number
  notes?: string
}) {
  return post<{ id: number }>(`/my/products/${dispensingId}/return`, data)
}

/** 我的产品提醒 */
export interface MyProductReminderItem {
  title: string
  description: string
}

export function getMyProductReminders() {
  return get<{ items: MyProductReminderItem[] }>('/my/products-reminders')
}

/** 推荐记录 */
export interface MyReferralItem {
  id: number
  referred_name?: string
  status?: string
  reward_amount?: number
  created_at?: string
}

export function getMyReferrals() {
  return get<{ items: MyReferralItem[] }>('/my/referrals')
}

export interface AgentChatAsyncIn {
  agent_id: string
  message: string
  context?: Record<string, unknown>
  session_id?: string
  provider?: string
  model_id?: string
  allow_fallback?: boolean
  fallback_provider?: string
}

export interface AgentChatAsyncOut {
  call_id: string
  task_id: string
  status: string
}

export interface AgentCallPollOut {
  call_id: string
  task_id: string
  status: string
  output_text: string
  chunks: string[]
  duration_ms?: number | null
  agent_id?: string | null
  provider?: string | null
}

/** 异步发起 AI 对话（返回 call_id/task_id） */
export function createAgentChatAsync(data: AgentChatAsyncIn) {
  return post<AgentChatAsyncOut>('/agents/chat/async', data)
}

/** 轮询 AI 对话结果 */
export function getAgentCallStatus(callId: string) {
  return get<AgentCallPollOut>(`/agents/calls/${encodeURIComponent(callId)}`)
}

export default { get, post, put, del }
