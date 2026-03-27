/**
 * 飞书 OAuth 认证核心逻辑
 *
 * 支持两种场景：
 * 1. 飞书端内免登（JSSDK tt.requestAuthCode）
 * 2. 浏览器 OAuth 授权码模式
 *
 * 容错策略：
 * - code 重复使用（飞书 code=10014）→ 自动重新发起 OAuth
 * - 网络超时 → 最多重试 2 次，间隔 1s
 * - 端内免登失败 → 降级到 OAuth 授权码模式
 */
import axios from 'axios'

export type AuthErrorType = 'network' | 'auth_expired' | 'config' | 'unknown'

export interface FeishuAuthConfig {
  appId: string
  redirectUri: string
  workstation?: string
  apiBaseUrl?: string
  state?: string
  scope?: string
}

export interface FeishuUser {
  id: string | number
  name: string
  email?: string
  avatar?: string
  department?: string
}

/** 后端 feishu_callback 返回结构（含角色和可见工作台） */
interface AuthTokenResponse {
  access_token: string
  user: {
    id: number
    username: string
    display_name: string
    email: string
    avatar: string
    account_type: string
  }
  roles: string[]
  visible_workbenches: string[]
  session_meta?: Record<string, unknown>
}

export interface AuthResult {
  token: string
  user: FeishuUser
  roles: string[]
  visible_workbenches: string[]
  session_meta?: Record<string, unknown>
}

export class AuthError extends Error {
  type: AuthErrorType
  constructor(message: string, type: AuthErrorType) {
    super(message)
    this.name = 'AuthError'
    this.type = type
  }
}

/**
 * 子衿统一授权所需的用户数据 scope（OIDC 标准，空格分隔）。
 *
 * 设计原则：有了不用可以，没有必出问题。
 * 覆盖范围：全量数据采集（邮件/IM/日历/任务/审批/文档/云盘/知识库/会议纪要）
 *           + 智能体写回执行（创建任务/审批/日历/文档）
 *           + 未来能力预留（工号/手机/多维表格）
 *
 * 重要说明：
 * - 刷新 token 不会增加新 scope，用户需重新登录才能获得新增权限。
 * - 后端 _save_feishu_user_token 会将实际获得的 scope 存入 feishu_scope 字段，
 *   供运行时校验使用。
 *
 * 最近更新：2026-03-23 — 补全 wiki/docx/drive/IM消息体/邮件正文/会议纪要/任务写回/审批写回
 */
const DEFAULT_USER_SCOPES = [
  // ── 基础 ──────────────────────────────────────────────────────────────────
  'offline_access',                       // refresh_token 续期，绝对必须

  // ── 通讯录与组织架构 ──────────────────────────────────────────────────────
  'contact:user.base:readonly',           // 姓名/头像/open_id
  'contact:user.email:readonly',          // 邮箱地址
  'contact:user.employee_id:readonly',    // 工号（HR/lab-personnel 集成）
  'contact:user.phone:readonly',          // 手机号（CRM/紧急联络场景）
  'contact:department.base:readonly',     // 部门列表（组织架构图谱）

  // ── 即时通讯（IM）──────────────────────────────────────────────────────────
  'im:chat:readonly',                     // 群组/会话列表
  'im:message:readonly',                  // 消息列表及正文（用户委托权限，覆盖群聊+单聊）

  // ── 邮件 ──────────────────────────────────────────────────────────────────
  'mail:user_mailbox',                    // 邮箱基础访问
  'mail:user_mailbox.message:readonly',   // 邮件列表（发件人/时间等字段）
  'mail:user_mailbox.message.body:read',  // 邮件正文（subject/body/from）

  // ── 日历 ──────────────────────────────────────────────────────────────────
  'calendar:calendar:readonly',           // 读取日历事件
  'calendar:calendar',                    // 创建/更新/删除日历事件（智能体排程）

  // ── 任务 ──────────────────────────────────────────────────────────────────
  'task:task:read',                       // 读取任务
  'task:task:write',                      // 创建/更新任务（智能体代办创建）

  // ── 审批 ──────────────────────────────────────────────────────────────────
  'approval:approval:readonly',           // 读取审批实例
  'approval:approval',                    // 发起审批（智能体代提交）

  // ── 文档 ──────────────────────────────────────────────────────────────────
  'docx:document',                        // 读写飞书文档（知识采集核心）

  // ── 云盘 ──────────────────────────────────────────────────────────────────
  'drive:drive:readonly',                 // 云盘文件列表
  'drive:file',                           // 下载/读取文件内容（附件binary）

  // ── 知识库（Wiki）────────────────────────────────────────────────────────
  'wiki:wiki',                            // 读写知识库（知识采集核心）

  // ── 多维表格 ────────────────────────────────────────────────────────────
  'bitable:app',                          // 个人/共享多维表格读写（预留）

].join(' ')

const RETRY_DELAY = 1000
const MAX_RETRIES = 2
const AUTH_SESSION_FALLBACK_KEY = '__cnkis_auth_fallback__'
const OAUTH_RETRY_GUARD_KEY = 'cnkis_oauth_retry_once'
const OAUTH_STATE_KEY = 'cnkis_auth_state'
const OAUTH_TRACE_ID_KEY = 'cnkis_auth_trace_id'
const OAUTH_EXCHANGE_INFLIGHT_KEY = 'cnkis_oauth_exchange_inflight'

/** 邮件核验页在登录前写入，随 OAuth state 回传（跨 127.0.0.1 ↔ localhost 时 sessionStorage 不同源无法共享） */
export const CNKIS_POST_LOGIN_HASH_STORAGE_KEY = 'cnkis.execution.postLoginHash'
/** 换票成功后写入，reload 后 PostAuth 消费并 navigate */
export const CNKIS_OAUTH_RESTORE_HASH_KEY = 'cnkis.oauth.restore_hash'

let oauthCodeExchangePromise: Promise<AuthResult | null> | null = null

function b64urlDecodeJsonToRecord(stateStr: string): Record<string, unknown> | null {
  try {
    let b64 = stateStr.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    if (pad) b64 += '='.repeat(4 - pad)
    const binary = atob(b64)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    const json = new TextDecoder('utf-8').decode(bytes)
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

/** 从 OAuth state（与 generateState 一致）解析待恢复的 hash（#/consent?…） */
export function extractPostLoginHashFromOAuthState(stateStr: string): string | null {
  const payload = b64urlDecodeJsonToRecord(stateStr)
  if (!payload) return null
  const h = payload.post_login_hash
  if (typeof h === 'string' && h.length > 0 && h.length <= 512) return h
  const pid = payload.post_login_focus_protocol_id
  if (typeof pid === 'number' && Number.isFinite(pid) && pid > 0) {
    return `#/consent?focusProtocolId=${Math.floor(pid)}`
  }
  const wid = payload.post_login_focus_witness_staff_id
  if (typeof wid === 'number' && Number.isFinite(wid) && wid > 0) {
    return `#/consent/witness-staff?focusWitnessStaffId=${Math.floor(wid)}`
  }
  return null
}

/** 从 OAuth 回调 URL 提取 state（避免 URLSearchParams 对部分字符处理与飞书不一致） */
export function getOAuthStateFromUrl(): string {
  if (typeof window === 'undefined') return ''
  const search = window.location.search
  if (search.length > 1) {
    const m = search.match(/[?&]state=([^&]*)/)
    if (m?.[1]) {
      try {
        return decodeURIComponent(m[1])
      } catch {
        return m[1]
      }
    }
  }
  const hash = window.location.hash || ''
  if (hash.includes('?')) {
    const q = hash.split('?')[1]
    if (q) return new URLSearchParams(q).get('state') || ''
  }
  return ''
}

/** 邮件核验「打开知情管理 / 双签名单」前调用；generateState 会读入并写入紧凑数字字段以缩短 OAuth state */
export function setExecutionPostLoginHashForOAuth(hash: string): void {
  if (typeof window === 'undefined') return
  if (!hash || hash.length > 512) return
  try {
    sessionStorage.setItem(CNKIS_POST_LOGIN_HASH_STORAGE_KEY, hash)
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(CNKIS_POST_LOGIN_HASH_STORAGE_KEY, hash)
  } catch {
    /* ignore */
  }
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function classifyError(err: unknown): AuthErrorType {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'network'
    const status = err.response.status
    if (status === 401 || status === 403) return 'auth_expired'
    if (status === 400) {
      const msg = err.response.data?.msg || ''
      if (msg.includes('未识别') || msg.includes('app_id')) return 'config'
    }
  }
  return 'unknown'
}

export class FeishuAuth {
  private config: FeishuAuthConfig
  private apiBase: string

  constructor(config: FeishuAuthConfig) {
    this.config = config
    this.apiBase = config.apiBaseUrl || '/api/v1'
  }

  private generateTraceId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  private normalizeOAuthCode(code: string): string {
    const normalized = (code || '').trim()
    if (!normalized) return normalized
    // 某些环境会把 + 解成空格，导致 code 校验失败。
    if (normalized.includes(' ') && !normalized.includes('+')) {
      return normalized.replace(/ /g, '+')
    }
    return normalized
  }

  private toBase64Url(raw: string): string {
    const encoded = typeof btoa === 'function' ? btoa(raw) : ''
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }

  generateState(traceId?: string): string {
    const payload: Record<string, unknown> = {
      ws: this.config.workstation || 'unknown',
      app_id: this.config.appId,
      trace_id: traceId || this.generateTraceId(),
      nonce: Math.random().toString(36).slice(2, 14),
      ts: Math.floor(Date.now() / 1000),
      ver: 'v1',
    }
    try {
      let h: string | null = null
      if (typeof sessionStorage !== 'undefined') {
        h = sessionStorage.getItem(CNKIS_POST_LOGIN_HASH_STORAGE_KEY)
      }
      if (!h && typeof localStorage !== 'undefined') {
        h = localStorage.getItem(CNKIS_POST_LOGIN_HASH_STORAGE_KEY)
      }
      if (h && h.length > 0 && h.length <= 512) {
        const fp = h.match(/[?&]focusProtocolId=(\d+)/) ?? h.match(/focusProtocolId=(\d+)/)
        const ws = h.match(/[?&]focusWitnessStaffId=(\d+)/) ?? h.match(/focusWitnessStaffId=(\d+)/)
        if (fp) {
          const n = parseInt(fp[1], 10)
          if (!Number.isNaN(n) && n > 0) payload.post_login_focus_protocol_id = n
        }
        if (ws) {
          const n = parseInt(ws[1], 10)
          if (!Number.isNaN(n) && n > 0) payload.post_login_focus_witness_staff_id = n
        }
        if (!payload.post_login_focus_protocol_id && !payload.post_login_focus_witness_staff_id) {
          payload.post_login_hash = h
        }
      }
    } catch {
      /* ignore */
    }
    return this.toBase64Url(JSON.stringify(payload))
  }

  private setSessionValue(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value)
      return
    } catch {
      // ignored
    }
    const globalObj = window as any
    const fallback = (globalObj[AUTH_SESSION_FALLBACK_KEY] ||= {})
    fallback[key] = value
  }

  private getSessionValue(key: string): string | null {
    try {
      return sessionStorage.getItem(key)
    } catch {
      // ignored
    }
    const globalObj = window as any
    return globalObj[AUTH_SESSION_FALLBACK_KEY]?.[key] || null
  }

  private removeSessionValue(key: string): void {
    try {
      sessionStorage.removeItem(key)
    } catch {
      // ignored
    }
    const globalObj = window as any
    if (globalObj[AUTH_SESSION_FALLBACK_KEY]) {
      delete globalObj[AUTH_SESSION_FALLBACK_KEY][key]
    }
  }

  private clearStoredOAuthContext(): void {
    this.removeSessionValue(OAUTH_STATE_KEY)
    this.removeSessionValue(OAUTH_TRACE_ID_KEY)
  }

  private clearOAuthRetryGuard(): void {
    try {
      sessionStorage.removeItem(OAUTH_RETRY_GUARD_KEY)
    } catch {
      // ignored
    }
  }

  private shouldRetryOAuthExchange(err: AuthError): boolean {
    const msg = err.message || ''
    // 仅对“可重试”的授权码类错误自动重试，避免进入无限跳转。
    if (msg.includes('AUTH_CODE_EXPIRED')) return true
    if (msg.includes('AUTH_NONCE_REPLAY')) return true
    if (msg.includes('AUTH_OAUTH_FAILED:10014')) return true
    return false
  }

  getAuthUrl(): string {
    const { appId, redirectUri } = this.config
    const traceId = this.generateTraceId()
    const state = this.config.state || this.generateState(traceId)
    this.setSessionValue(OAUTH_TRACE_ID_KEY, traceId)
    this.setSessionValue(OAUTH_STATE_KEY, state)
    const encodedRedirect = encodeURIComponent(redirectUri)
    const scope = encodeURIComponent(this.config.scope || DEFAULT_USER_SCOPES)
    const encodedState = encodeURIComponent(state)
    return (
      `https://open.feishu.cn/open-apis/authen/v1/authorize` +
      `?client_id=${appId}` +
      `&redirect_uri=${encodedRedirect}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&state=${encodedState}`
    )
  }

  /**
   * 使用授权码换取 Token（带重试）
   */
  async exchangeCode(code: string, state?: string | null): Promise<AuthResult> {
    let lastErr: unknown
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const resp = await axios.post<AuthTokenResponse>(
          `${this.apiBase}/auth/feishu/callback`,
          {
            code: this.normalizeOAuthCode(code),
            app_id: this.config.appId,
            /** 必须与授权 URL 中的 redirect_uri 完全一致，否则飞书换 token 返回 20024 invalid_grant */
            redirect_uri: this.config.redirectUri,
            state: state || undefined,
            workstation: this.config.workstation,
            trace_id: this.getSessionValue(OAUTH_TRACE_ID_KEY) || undefined,
          },
          { timeout: 15000 },
        )
        const data = resp.data
        return {
          token: data.access_token,
          user: {
            id: data.user.id,
            name: data.user.display_name || data.user.username,
            email: data.user.email,
            avatar: data.user.avatar,
          },
          roles: data.roles || [],
          visible_workbenches: data.visible_workbenches || [],
          session_meta: data.session_meta,
        }
      } catch (err) {
        lastErr = err
        const errType = classifyError(err)
        // 开发调试：打印后端返回的完整错误
        if (axios.isAxiosError(err) && err.response?.data) {
          console.error('[FeishuAuth] exchangeCode 失败:', err.response.status, err.response.data)
        }
        // code 已使用或 auth 配置错误不应重试
        if (errType === 'config' || errType === 'auth_expired') break
        // 飞书 code 只能使用一次，400 错误不重试
        if (axios.isAxiosError(err) && err.response?.status === 400) break
        if (attempt < MAX_RETRIES) {
          console.warn(`[FeishuAuth] exchangeCode 重试 ${attempt + 1}/${MAX_RETRIES}`)
          await delay(RETRY_DELAY)
        }
      }
    }
    const errType = classifyError(lastErr)
    let msg = lastErr instanceof Error ? lastErr.message : '授权码交换失败'
    if (axios.isAxiosError(lastErr)) {
      const backendMsg = (lastErr.response?.data as any)?.msg
      const backendCode = (lastErr.response?.data as any)?.data?.error_code
      if (typeof backendMsg === 'string' && backendMsg.trim()) {
        msg = backendCode ? `${backendMsg} (${backendCode})` : backendMsg
      }
    }
    throw new AuthError(msg, errType)
  }

  isInFeishu(): boolean {
    if (typeof window === 'undefined') return false
    const ua = navigator.userAgent.toLowerCase()
    return ua.includes('lark') || ua.includes('feishu')
  }

  async requestInAppAuth(): Promise<string> {
    return new Promise((resolve, reject) => {
      const tt = (window as any).tt
      if (!tt?.requestAuthCode) {
        reject(new AuthError('飞书 JSSDK 不可用，请确认在飞书客户端内打开', 'config'))
        return
      }
      tt.requestAuthCode({
        appId: this.config.appId,
        success: (res: { code: string }) => resolve(res.code),
        fail: (err: any) => reject(new AuthError(`飞书免登失败: ${JSON.stringify(err)}`, 'auth_expired')),
      })
    })
  }

  /**
   * 自动登录：优先飞书端内免登，否则跳转 OAuth
   */
  async autoLogin(): Promise<AuthResult | null> {
    // 1. 检查 URL 中是否有 code（OAuth 回调）
    const urlParams = new URLSearchParams(window.location.search)
    let code = urlParams.get('code')
    let state = urlParams.get('state')
    let oauthParamsInHash = false

    if (!code && window.location.hash) {
      const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : ''
      if (hashQuery) {
        const hashParams = new URLSearchParams(hashQuery)
        code = hashParams.get('code')
        state = hashParams.get('state')
        oauthParamsInHash = !!code
      }
    }

    if (code) {
      const storedState = this.getSessionValue(OAUTH_STATE_KEY)
      if (oauthCodeExchangePromise) {
        return oauthCodeExchangePromise
      }

      oauthCodeExchangePromise = (async (): Promise<AuthResult | null> => {
        try {
          try {
            if (typeof sessionStorage !== 'undefined') {
              if (sessionStorage.getItem(OAUTH_EXCHANGE_INFLIGHT_KEY) === '1') {
                return null
              }
              sessionStorage.setItem(OAUTH_EXCHANGE_INFLIGHT_KEY, '1')
            }
          } catch {
            // sessionStorage 不可用时仍尝试换票
          }

          try {
            const result = await this.exchangeCode(code, state || storedState || undefined)
            const stateFromUrl = getOAuthStateFromUrl()
            const stateForRestore = (stateFromUrl || state || storedState || urlParams.get('state') || '').trim()
            let restore = stateForRestore ? extractPostLoginHashFromOAuthState(stateForRestore) : null
            if (!restore && storedState) {
              restore = extractPostLoginHashFromOAuthState(storedState)
            }
            // state 解析失败时：换票回调页（如 localhost）与打开登录页主机（如 127.0.0.1）不同源时，
            // post_login 仅存于另一主机；删除 key 前再读一次本机 storage，尽量写入 oauth.restore_hash。
            if (!restore) {
              try {
                const h =
                  (typeof sessionStorage !== 'undefined' &&
                    sessionStorage.getItem(CNKIS_POST_LOGIN_HASH_STORAGE_KEY)) ||
                  (typeof localStorage !== 'undefined' && localStorage.getItem(CNKIS_POST_LOGIN_HASH_STORAGE_KEY))
                const trimmed = (h || '').trim()
                if (trimmed.startsWith('#/consent')) {
                  restore = trimmed
                }
              } catch {
                /* ignore */
              }
            }
            if (restore && typeof sessionStorage !== 'undefined') {
              try {
                sessionStorage.setItem(CNKIS_OAUTH_RESTORE_HASH_KEY, restore)
              } catch {
                /* ignore */
              }
              try {
                localStorage.setItem(CNKIS_OAUTH_RESTORE_HASH_KEY, restore)
              } catch {
                /* ignore */
              }
            }
            // 仅当已成功写入 oauth.restore_hash 时再删 postLoginHash；否则保留供执行台 peek 兜底（避免 state 解析失败时空指针）
            if (restore) {
              try {
                if (typeof sessionStorage !== 'undefined') {
                  sessionStorage.removeItem(CNKIS_POST_LOGIN_HASH_STORAGE_KEY)
                }
              } catch {
                /* ignore */
              }
              try {
                if (typeof localStorage !== 'undefined') {
                  localStorage.removeItem(CNKIS_POST_LOGIN_HASH_STORAGE_KEY)
                }
              } catch {
                /* ignore */
              }
            }
            this.clearStoredOAuthContext()
            this.clearOAuthRetryGuard()
            if (oauthParamsInHash && window.location.hash.includes('?')) {
              const cleanHash = window.location.hash.split('?')[0]
              window.history.replaceState({}, '', window.location.pathname + cleanHash)
            } else {
              window.history.replaceState({}, '', window.location.pathname + (window.location.hash || ''))
            }
            try {
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem(OAUTH_EXCHANGE_INFLIGHT_KEY)
              }
            } catch {
              // ignore
            }
            return result
          } catch (err) {
            try {
              if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem(OAUTH_EXCHANGE_INFLIGHT_KEY)
              }
            } catch {
              // ignore
            }
            console.error('[FeishuAuth] 授权码交换失败:', err)
            if (err instanceof AuthError && this.shouldRetryOAuthExchange(err)) {
              const retried = this.getSessionValue(OAUTH_RETRY_GUARD_KEY)
              if (!retried) {
                this.setSessionValue(OAUTH_RETRY_GUARD_KEY, '1')
                console.warn('[FeishuAuth] 授权码可重试，发起一次 OAuth 重试')
                this.redirectToAuth(false)
                return null
              }
            }
            throw err
          }
        } finally {
          oauthCodeExchangePromise = null
        }
      })()

      return oauthCodeExchangePromise
    }

    // 2. 飞书端内免登（JSSDK）
    if (this.isInFeishu()) {
      try {
        const authCode = await this.requestInAppAuth()
        return await this.exchangeCode(authCode)
      } catch (err) {
        console.warn('[FeishuAuth] 端内免登失败，降级到 OAuth:', err)
      }
    }

    // 3. 无登录信息，返回 null（调用方决定是否跳转）
    // 当 URL 中已无 code/state 时，清理历史重试标记，避免后续手动登录被旧标记阻断。
    this.clearOAuthRetryGuard()
    return null
  }

  redirectToAuth(resetRetryGuard = true): void {
    if (resetRetryGuard) {
      this.clearOAuthRetryGuard()
    }
    // 任意入口发起 OAuth 前同步当前 hash（与 ExecutionLoginFallback.handleLogin 一致），
    // 避免仅错误重试 / nonce 恢复等路径直接 login() 时未写入 post_login，换票后只能落首页。
    try {
      if (typeof window !== 'undefined') {
        const h = window.location.hash || ''
        if (h.includes('focusProtocolId') || h.includes('focusWitnessStaffId')) {
          setExecutionPostLoginHashForOAuth(h.startsWith('#') ? h : `#${h}`)
        }
      }
    } catch {
      /* ignore */
    }
    window.location.href = this.getAuthUrl()
  }
}
