import Taro from '@tarojs/taro'
import { post, get, getCurrentChannel } from './api'
import { computePrimaryRole, resolveLoginRoute } from '@cn-kis/subject-core'
import type { RouteTarget } from '@cn-kis/subject-core'

const LOGIN_TRACE_KEY = 'wechat_login_trace'
const LOGIN_TRACE_MAX = 40

type LoginTraceItem = {
  ts: string
  stage: string
  detail: string
  traceId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function getErrorMessage(error: unknown): string {
  if (!isRecord(error)) return ''
  const errMsg = typeof error.errMsg === 'string' ? error.errMsg : ''
  const message = typeof error.message === 'string' ? error.message : ''
  return errMsg || message
}

function isLoginTraceItem(value: unknown): value is LoginTraceItem {
  if (!isRecord(value)) return false
  return (
    typeof value.ts === 'string' &&
    typeof value.stage === 'string' &&
    typeof value.detail === 'string' &&
    typeof value.traceId === 'string'
  )
}

function appendLoginTrace(traceId: string, stage: string, detail: string) {
  const ts = new Date().toISOString()
  const item: LoginTraceItem = { ts, stage, detail, traceId }
  try {
    const raw = Taro.getStorageSync(LOGIN_TRACE_KEY)
    const parsed = raw ? JSON.parse(String(raw)) : []
    const arr = Array.isArray(parsed) ? parsed.filter(isLoginTraceItem) : []
    const next = [...arr, item].slice(-LOGIN_TRACE_MAX)
    Taro.setStorageSync(LOGIN_TRACE_KEY, JSON.stringify(next))
  } catch {
    Taro.setStorageSync(LOGIN_TRACE_KEY, JSON.stringify([item]))
  }
}

/** 用户信息 */
export interface UserInfo {
  id: string
  name: string
  subjectNo: string
  enrollDate: string
  projectName: string
  /** 入组状态：enrolled=已入组, pending=待入组, completed=已完成, withdrawn=已退出 */
  enrollmentStatus?: string
  /** 受试者 ID（后端主键） */
  subjectId?: number
  /** 入组记录 ID */
  enrollmentId?: number
  /** 访视计划 ID */
  planId?: number
  /** 方案 ID */
  protocolId?: number
  /** 账号类型：internal / subject / external / system */
  account_type?: 'internal' | 'subject' | 'external' | 'system'
  /** 角色名列表，如 ['technician', 'viewer'] */
  roles?: string[]
  /** 主角色（优先级最高的角色） */
  primary_role?: string
  /** 问候展示名（GET /my/profile 的 display_name，与 home-dashboard 规则一致） */
  displayName?: string
  displayNameSource?: string
}

/** /my/profile 中与问候相关的字段（§2.2、附录 A §4） */
export type MyProfileGreetingFields = {
  subject_id?: number
  subject_no?: string
  name?: string
  display_name?: string
  display_name_source?: string
  project_name_from_appointment?: string
}

export function mergeMyProfileGreetingIntoUser(base: UserInfo, p: MyProfileGreetingFields): void {
  if (p.subject_no != null && p.subject_no !== '') base.subjectNo = p.subject_no
  if (p.name != null && p.name !== '') base.name = p.name
  if (p.subject_id != null) base.subjectId = p.subject_id
  const dn = typeof p.display_name === 'string' ? p.display_name.trim() : ''
  if (dn) {
    base.displayName = dn
    base.displayNameSource =
      typeof p.display_name_source === 'string' ? p.display_name_source : undefined
  }
}

function isUserInfo(value: unknown): value is UserInfo {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.subjectNo === 'string' &&
    typeof value.enrollDate === 'string' &&
    typeof value.projectName === 'string'
  )
}

interface WechatLoginRawUser {
  id: number | string
  username?: string
  display_name?: string
  email?: string
  avatar?: string
  account_type?: string
}


function isWechatLoginRawUser(value: unknown): value is WechatLoginRawUser {
  if (!isRecord(value)) return false
  const id = value.id
  return typeof id === 'number' || typeof id === 'string'
}

interface WechatLoginRawResponse {
  access_token: string
  user?: WechatLoginRawUser
  roles?: string[]
  visible_workbenches?: string[]
  needs_bind?: boolean
}

interface WechatLoginResponseEnvelope {
  code?: number
  msg?: string
  data?: WechatLoginRawResponse
  access_token?: string
  user?: WechatLoginRawUser
}

function isWechatLoginRawResponse(value: unknown): value is WechatLoginRawResponse {
  if (!isRecord(value)) return false
  return typeof value.access_token === 'string'
}

function extractWechatLoginPayload(res: unknown): {
  raw: Partial<WechatLoginResponseEnvelope>
  payload?: WechatLoginRawResponse
} {
  const raw: Partial<WechatLoginResponseEnvelope> = isRecord(res)
    ? {
        code: typeof res.code === 'number' ? res.code : undefined,
        msg: typeof res.msg === 'string' ? res.msg : undefined,
        data: isWechatLoginRawResponse(res.data) ? res.data : undefined,
        access_token: typeof res.access_token === 'string' ? res.access_token : undefined,
        user: isWechatLoginRawUser(res.user) ? res.user : undefined,
      }
    : {}
  const payload = isWechatLoginRawResponse(raw.data)
    ? raw.data
    : (isWechatLoginRawResponse(res) ? res : undefined)
  return { raw, payload }
}

/**
 * 微信登录流程：
 * 1. Taro.login() 获取 code（每次点击都会重新获取，code 仅能使用一次且约 5 分钟有效）
 *    或从外部传入 code（例如从 getPhoneNumber 事件获取）
 * 2. POST /api/v1/auth/wechat/login 发送 code 到后端
 * 3. 后端换取 openid，返回 token + 用户信息
 * 4. 本地存储 token 和用户信息
 */
export async function wechatLogin(phoneCode?: string): Promise<UserInfo | null> {
  const traceId = `wxlogin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  appendLoginTrace(traceId, 'start', '点击登录按钮，开始微信登录流程')

  const fail = (title: string): null => {
    const withTrace = `${title} [trace:${traceId}]`
    appendLoginTrace(traceId, 'fail', withTrace)
    Taro.hideLoading()
    Taro.setStorageSync('last_login_error', withTrace)
    Taro.showModal({
      title: '登录失败',
      content: withTrace,
      showCancel: false,
      confirmText: '我知道了',
    })
    return null
  }

  Taro.showLoading({ title: '登录中...', mask: false })
  try {
    const isLikelyNetworkTimeout = (msg: string) =>
      /timeout|timed out|request:fail|errcode:-100|cronet|network/i.test(msg || '')

    const isLocalDev = /127\.0\.0\.1|localhost|192\.168\.\d+\.\d+/.test(
      (process.env.TARO_APP_API_BASE as string) || ''
    )
    const tryLoginOnce = async (timeoutMs: number) => {
      let codeToSend: string
      if (phoneCode) {
        // 从 getPhoneNumber 事件获取的 code
        codeToSend = phoneCode
        appendLoginTrace(traceId, 'wx.login.skip', `使用传入的 phoneCode，len=${codeToSend.length}`)
      } else if (isLocalDev) {
        codeToSend = 'dev-bypass-wechat'
        appendLoginTrace(traceId, 'wx.login.ok', 'local dev bypass')
      } else {
        appendLoginTrace(traceId, 'wx.login.start', `开始调用 Taro.login，timeout=${timeoutMs}ms`)
        const loginRes = await Taro.login()
        if (!loginRes.code) {
          appendLoginTrace(traceId, 'wx.login.fail', loginRes.errMsg || '未获取到code')
          return {
            ok: false as const,
            res: null,
            msg: `微信登录失败：${loginRes.errMsg || '未获取到code'}`,
          }
        }
        codeToSend = loginRes.code
        appendLoginTrace(traceId, 'wx.login.ok', `拿到code，len=${codeToSend.length}`)
      }

      appendLoginTrace(traceId, 'api.wechat.start', `POST /auth/wechat/login timeout=${timeoutMs}ms channel=${getCurrentChannel()}`)
      const res = await post<WechatLoginRawResponse>(
        '/auth/wechat/login',
        { code: codeToSend },
        {
          auth: false,
          timeoutMs,
          headers: {
            'X-Client-Trace-Id': traceId,
          },
        }
      )
      appendLoginTrace(traceId, 'api.wechat.done', `返回 code=${res?.code ?? 'unknown'} msg=${res?.msg ?? ''}`)
      return { ok: true as const, res, msg: '' }
    }

    // 首次尝试：超时 20s
    let attempt = await tryLoginOnce(20000)
    if (!attempt.ok) {
      return fail(attempt.msg)
    }

    let res = attempt.res
    let extracted = extractWechatLoginPayload(res)
    let raw = extracted.raw
    let payload = extracted.payload

    // 网络超时/抖动时，自动二次重试一次（重新获取 code，超时 35s）
    if (!payload?.access_token || !payload?.user) {
      const firstMsg = raw?.msg || ''
      if (isLikelyNetworkTimeout(firstMsg)) {
        attempt = await tryLoginOnce(35000)
        if (!attempt.ok) {
          return fail(attempt.msg)
        }
        res = attempt.res
        extracted = extractWechatLoginPayload(res)
        raw = extracted.raw
        payload = extracted.payload
      }
    }

    // 后端现在只返回 {access_token}，用户信息需要通过 /auth/profile 获取
    if (!payload?.access_token) {
      const msg = raw?.msg || '登录失败'
      const isCodeInvalid =
        msg.includes('重新点击登录') ||
        msg.includes('登录码已失效') ||
        /40029|40163/.test(msg)
      return fail(isCodeInvalid ? '登录码已失效，请再次点击登录' : msg)
    }

    // 保存 token
    Taro.setStorageSync('token', payload.access_token)
    Taro.removeStorageSync('needsBind')

    if (payload.needs_bind === true) {
      Taro.setStorageSync('needsBind', true)
      return { needsBind: true } as unknown as UserInfo
    }

    // 从 /auth/profile 获取用户信息（token 已设置，请求会自动携带）
    let normalizedUser = await _fetchAndMergeProfile({
      id: '',
      name: '受试者',
      subjectNo: '',
      enrollDate: '',
      projectName: '',
      roles: Array.isArray(payload.roles) ? payload.roles : [],
    }, traceId)

    try {
      const profileRes = await get<MyProfileGreetingFields>('/my/profile', { silent: true })
      if (profileRes.code === 200 && profileRes.data) {
        mergeMyProfileGreetingIntoUser(normalizedUser, profileRes.data)
      }
      const enrollRes = await get<{ items: Array<{ protocol_id?: number; protocol_title?: string; plan_id?: number; enrolled_at?: string; id?: number; status?: string }> }>('/my/enrollments', { silent: true })
      if (enrollRes.code === 200 && enrollRes.data?.items?.length) {
        const first = enrollRes.data.items[0]
        normalizedUser.projectName = first.protocol_title || normalizedUser.projectName
        normalizedUser.planId = first.plan_id
        normalizedUser.enrollDate = first.enrolled_at || normalizedUser.enrollDate
        normalizedUser.enrollmentId = first.id
        normalizedUser.protocolId = first.protocol_id
        normalizedUser.enrollmentStatus = first.status
      } else if (profileRes.code === 200 && profileRes.data?.project_name_from_appointment) {
        normalizedUser.projectName = profileRes.data.project_name_from_appointment
        normalizedUser.enrollmentStatus = 'pending'
      }
    } catch {
      // 404/无权限时静默，使用基础信息完成登录
    }

    Taro.setStorageSync('userInfo', JSON.stringify(normalizedUser))
    Taro.removeStorageSync('last_login_error')
    appendLoginTrace(traceId, 'success', `登录成功，account=${normalizedUser.id || 'unknown'} via=${getCurrentChannel()} roles=${JSON.stringify(normalizedUser.roles)}`)
    return normalizedUser
  } catch (error) {
    console.error('[Auth Error]', error)
    return fail(`登录失败：${getErrorMessage(error) || '请重试'}`)
  } finally {
    Taro.hideLoading()
  }
}


/**
 * 合并角色信息到 userInfo 中。
 * 使用登录响应中已有的 roles 字段计算主角色。
 */
async function _fetchAndMergeProfile(base: UserInfo, _traceId: string): Promise<UserInfo> {
  // 使用登录响应中已有的 roles 计算主角色
  if (base.roles && base.roles.length > 0) {
    return {
      ...base,
      primary_role: computePrimaryRole(base.roles),
    }
  }
  return base
}

/**
 * 手机验证码登录（L1）
 */
export async function smsCodeLogin(phone: string, code: string): Promise<UserInfo | null> {
  const traceId = `smslogin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  appendLoginTrace(traceId, 'start', `手机号验证码登录 phone=${phone.slice(0, 3)}****${phone.slice(-4)}`)

  const fail = (title: string): null => {
    const withTrace = `${title} [trace:${traceId}]`
    appendLoginTrace(traceId, 'fail', withTrace)
    Taro.setStorageSync('last_login_error', withTrace)
    Taro.showToast({ title, icon: 'none' })
    return null
  }

  try {
    const res = await post<WechatLoginRawResponse>(
      '/auth/sms/verify',
      { phone, code, scene: 'cn_kis_login' },
      { auth: false, headers: { 'X-Client-Trace-Id': traceId } }
    )
    const { payload, raw } = extractWechatLoginPayload(res)
    if (!payload?.access_token) {
      return fail(raw.msg || '验证码登录失败')
    }

    Taro.setStorageSync('token', payload.access_token)

    const normalizedUser: UserInfo = await _fetchAndMergeProfile({
      id: '',
      name: '受试者',
      subjectNo: '',
      enrollDate: '',
      projectName: '',
      roles: Array.isArray(payload.roles) ? payload.roles : [],
    }, traceId)

    try {
      const profileRes = await get<MyProfileGreetingFields>('/my/profile', { silent: true })
      if (profileRes.code === 200 && profileRes.data) {
        mergeMyProfileGreetingIntoUser(normalizedUser, profileRes.data)
      }
    } catch {
      // 静默，不阻塞验证码登录
    }

    Taro.setStorageSync('userInfo', JSON.stringify(normalizedUser))
    Taro.removeStorageSync('last_login_error')
    appendLoginTrace(traceId, 'success', `登录成功，account=${normalizedUser.id || 'unknown'} roles=${JSON.stringify(normalizedUser.roles)}`)
    return normalizedUser
  } catch (error) {
    return fail(`登录失败：${getErrorMessage(error) || '请重试'}`)
  }
}

/**
 * 从服务器拉取并补全用户信息，更新本地存储
 * 用于首页 useDidShow 时刷新，确保 projectName/planId 等不为空
 */
export async function refreshUserInfo(): Promise<UserInfo | null> {
  const raw = Taro.getStorageSync('userInfo')
  const base: UserInfo = raw ? JSON.parse(raw) : { id: '', name: '受试者', subjectNo: '', enrollDate: '', projectName: '' }
  if (!base.id) return base

  try {
    const profileRes = await get<MyProfileGreetingFields>('/my/profile', { silent: true })
    if (profileRes.code === 200 && profileRes.data) {
      mergeMyProfileGreetingIntoUser(base, profileRes.data)
    }
    const enrollRes = await get<{ items: Array<{ protocol_id?: number; protocol_title?: string; plan_id?: number; enrolled_at?: string; id?: number; status?: string }> }>('/my/enrollments', { silent: true })
    if (enrollRes.code === 200 && enrollRes.data?.items?.length) {
      const first = enrollRes.data.items[0]
      base.projectName = first.protocol_title || base.projectName
      base.planId = first.plan_id
      base.enrollDate = first.enrolled_at || base.enrollDate
      base.enrollmentId = first.id
      base.protocolId = first.protocol_id
      base.enrollmentStatus = first.status
    } else if (profileRes.code === 200 && profileRes.data?.project_name_from_appointment) {
      base.projectName = profileRes.data.project_name_from_appointment
      base.enrollmentStatus = 'pending'
    }
    Taro.setStorageSync('userInfo', JSON.stringify(base))
    return base
  } catch {
    return base
  }
}

/**
 * 获取本地存储的用户信息
 */
export function getLocalUserInfo(): UserInfo | null {
  try {
    const raw = Taro.getStorageSync('userInfo')
    const parsed = raw ? JSON.parse(String(raw)) : null
    return isUserInfo(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * 获取本地缓存的角色列表
 */
export function getLocalRoles(): string[] {
  const userInfo = getLocalUserInfo()
  return Array.isArray(userInfo?.roles) ? userInfo!.roles! : []
}

/**
 * 获取本地缓存的账号类型
 */
export function getLocalAccountType(): UserInfo['account_type'] | undefined {
  return getLocalUserInfo()?.account_type
}

/**
 * 根据本地角色计算登录后应跳转的路由目标
 */
export function getLocalRouteTarget(): RouteTarget {
  const userInfo = getLocalUserInfo()
  return resolveLoginRoute(userInfo?.account_type, userInfo?.roles)
}

/**
 * 检查是否已登录
 */
export function isLoggedIn(): boolean {
  return !!Taro.getStorageSync('token')
}

/**
 * 冷启动角色刷新：使用本地缓存的角色重新计算主角色。
 * 在 useDidShow 中调用，确保权限变更后自动生效
 */
export async function refreshRolesFromProfile(): Promise<void> {
  if (!isLoggedIn()) return
  const existing = getLocalUserInfo()
  if (!existing) return
  try {
    const updated = await _fetchAndMergeProfile(existing, `coldrefresh-${Date.now()}`)
    Taro.setStorageSync('userInfo', JSON.stringify(updated))
  } catch {
    // 网络超时静默失败，保留缓存角色
  }
}

/**
 * 退出登录
 */
export async function logout(): Promise<void> {
  const token = Taro.getStorageSync('token')
  if (token) {
    try {
      await post('/auth/wechat/logout', {}, { auth: true })
    } catch {
      // 静默失败，继续清除本地
    }
  }
  Taro.removeStorageSync('needsBind')
  Taro.removeStorageSync('token')
  Taro.removeStorageSync('userInfo')
}

/**
 * 检查是否需要绑定手机号（token 已有，但未绑定 Subject）
 */
export function needsPhoneBind(): boolean {
  try {
    const raw = Taro.getStorageSync('needsBind')
    return raw === true || raw === 'true' || raw === 1
  } catch {
    return false
  }
}

/**
 * 绑定手机号（首次登录后调用）
 * 绑定成功后拉取 profile/enrollments，返回完整 UserInfo
 */
export async function bindPhone(phone: string): Promise<UserInfo | null> {
  const res = await post<{ code?: number; msg?: string; data?: { subject_id?: number; subject_no?: string; name?: string } }>(
    '/auth/wechat/bind-phone',
    { phone: phone.trim() }
  )
  const r = res as { code?: number; msg?: string; data?: { subject_id?: number; subject_no?: string; name?: string } }
  if (r.code !== 200 || !r.data) {
    Taro.showToast({ title: r.msg || '绑定失败', icon: 'none' })
    return null
  }
  Taro.removeStorageSync('needsBind')
  const data = r.data
  const base: UserInfo = {
    id: '',
    name: data.name || '受试者',
    subjectNo: data.subject_no || '',
    enrollDate: '',
    projectName: '',
    subjectId: data.subject_id,
  }
  try {
    const profileRes = await get<MyProfileGreetingFields>('/my/profile', { silent: true })
    if (profileRes.code === 200 && profileRes.data) {
      mergeMyProfileGreetingIntoUser(base, profileRes.data)
    }
    const enrollRes = await get<{ items: Array<{ protocol_id?: number; protocol_title?: string; plan_id?: number; enrolled_at?: string; id?: number; status?: string }> }>('/my/enrollments', { silent: true })
    if (enrollRes.code === 200 && enrollRes.data?.items?.length) {
      const first = enrollRes.data.items[0]
      base.projectName = first.protocol_title || ''
      base.planId = first.plan_id
      base.enrollDate = first.enrolled_at || ''
      base.enrollmentId = first.id
      base.protocolId = first.protocol_id
      base.enrollmentStatus = first.status
    } else if (profileRes.code === 200 && profileRes.data?.project_name_from_appointment) {
      base.projectName = profileRes.data.project_name_from_appointment
      base.enrollmentStatus = 'pending'
    }
  } catch {
    // 静默
  }
  base.id = String(base.subjectId || 'subj')
  Taro.setStorageSync('userInfo', JSON.stringify(base))
  return base
}
