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
    const payload = {
      ws: this.config.workstation || 'unknown',
      app_id: this.config.appId,
      trace_id: traceId || this.generateTraceId(),
      nonce: Math.random().toString(36).slice(2, 14),
      ts: Math.floor(Date.now() / 1000),
      ver: 'v1',
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
    return (
      `https://open.feishu.cn/open-apis/authen/v1/authorize` +
      `?client_id=${appId}` +
      `&redirect_uri=${encodedRedirect}` +
      `&response_type=code` +
      `&scope=${scope}` +
      `&state=${state}`
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
      if (oauthParamsInHash && window.location.hash.includes('?')) {
        const cleanHash = window.location.hash.split('?')[0]
        window.history.replaceState({}, '', window.location.pathname + cleanHash)
      } else {
        window.history.replaceState({}, '', window.location.pathname + window.location.hash)
      }
      try {
        const result = await this.exchangeCode(code, state || storedState || undefined)
        this.clearStoredOAuthContext()
        this.clearOAuthRetryGuard()
        return result
      } catch (err) {
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
    window.location.href = this.getAuthUrl()
  }
}
