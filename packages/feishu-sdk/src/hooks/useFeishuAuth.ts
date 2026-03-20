/**
 * 飞书认证 React Hook
 *
 * 增强：token 过期自动清除、错误分类
 */
import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { FeishuAuth, AuthError, type FeishuAuthConfig, type FeishuUser, type AuthErrorType } from '../auth'

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours
const NONCE_RECOVERY_ONCE_KEY = 'cnkis_nonce_recovery_once'

interface UseFeishuAuthReturn {
  user: FeishuUser | null
  token: string | null
  loading: boolean
  error: string | null
  errorType: AuthErrorType | null
  login: () => void
  logout: () => void
  isAuthenticated: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null
  return value as Record<string, unknown>
}

function normalizeFeishuUser(raw: unknown): FeishuUser | null {
  const source = asRecord(raw)
  if (!source) return null
  const payload = asRecord(source.data) ?? source
  const account = asRecord(payload.account) ?? asRecord(payload.user) ?? payload

  const id =
    account.id
    ?? account.open_id
    ?? account.user_id
    ?? account.union_id
    ?? (typeof account.name === 'string' ? account.name : undefined)
  const name =
    typeof account.name === 'string'
      ? account.name
      : typeof account.display_name === 'string'
        ? account.display_name
        : typeof account.username === 'string'
          ? account.username
          : ''
  if (!name || (typeof id !== 'string' && typeof id !== 'number')) return null

  return {
    id,
    name,
    email: typeof account.email === 'string' ? account.email : '',
    avatar: typeof account.avatar === 'string' ? account.avatar : '',
    department: typeof account.department === 'string' ? account.department : '',
  }
}

function hasOAuthCodeInUrl(): boolean {
  if (typeof window === 'undefined') return false
  const query = new URLSearchParams(window.location.search)
  if (query.get('code')) return true
  if (!window.location.hash.includes('?')) return false
  const hashQuery = window.location.hash.split('?')[1] || ''
  const hashParams = new URLSearchParams(hashQuery)
  return !!hashParams.get('code')
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // ignored
  }
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
    return
  } catch {
    // ignored
  }
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // ignored
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignored
  }
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignored
  }
}

function isTokenExpired(): boolean {
  try {
    const token = safeGetItem('auth_token')
    if (token) {
      const [, payloadBase64] = token.split('.')
      if (payloadBase64) {
        const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
        const payload = JSON.parse(atob(normalized))
        if (typeof payload.exp === 'number') {
          // 提前 5 分钟视为过期，减少临界态请求失败
          return Date.now() >= payload.exp * 1000 - 5 * 60 * 1000
        }
      }
    }
    const ts = safeGetItem('auth_token_ts')
    if (!ts) return false
    return Date.now() - Number(ts) > TOKEN_MAX_AGE_MS
  } catch {
    return false
  }
}

function clearAuthStorage() {
  safeRemoveItem('auth_token')
  safeRemoveItem('auth_user')
  safeRemoveItem('auth_profile')
  safeRemoveItem('auth_profile_token')
  safeRemoveItem('auth_roles')
  safeRemoveItem('auth_workbenches')
  safeRemoveItem('auth_token_ts')
  safeRemoveItem('auth_session_meta')
}

export function useFeishuAuth(config: FeishuAuthConfig): UseFeishuAuthReturn {
  const [user, setUser] = useState<FeishuUser | null>(null)
  const [token, setToken] = useState<string | null>(() => {
    const t = safeGetItem('auth_token')
    if (t && isTokenExpired()) {
      clearAuthStorage()
      return null
    }
    return t
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorType, setErrorType] = useState<AuthErrorType | null>(null)

  const auth = new FeishuAuth(config)

  useEffect(() => {
    const init = async () => {
      // If token exists but expired, clear it
      if (token && isTokenExpired()) {
        clearAuthStorage()
        setToken(null)
        setLoading(false)
        return
      }

      const savedUser = safeGetItem('auth_user')
      const hasOauthCode = hasOAuthCodeInUrl()
      if (token && savedUser && !hasOauthCode) {
        try {
          const normalizedUser = normalizeFeishuUser(JSON.parse(savedUser))
          if (!normalizedUser) {
            clearAuthStorage()
            setToken(null)
          } else {
            setUser(normalizedUser)
            setLoading(false)
            return
          }
        } catch {
          clearAuthStorage()
          setToken(null)
        }
      }

      try {
        const result = await auth.autoLogin()
        if (result) {
          safeRemoveItem(NONCE_RECOVERY_ONCE_KEY)
          const normalizedUser = normalizeFeishuUser(result.user)
          if (!normalizedUser) {
            throw new AuthError('用户信息结构异常', 'unknown')
          }
          setToken(result.token)
          setUser(normalizedUser)
          safeSetItem('auth_token', result.token)
          safeSetItem('auth_user', JSON.stringify(normalizedUser))
          safeSetItem('auth_token_ts', String(Date.now()))
          if (result.roles) {
            safeSetItem('auth_roles', JSON.stringify(result.roles))
          }
          if (result.visible_workbenches) {
            safeSetItem('auth_workbenches', JSON.stringify(result.visible_workbenches))
          }
          if (result.session_meta) {
            safeSetItem('auth_session_meta', JSON.stringify(result.session_meta))
          }
          // OAuth 回调后刷新页面，避免 React Strict Mode 下 effect 双跑导致 URL 已清空、第二次 autoLogin() 返回 null 而回到登录页
          window.location.reload()
          return
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '登录失败'
        const type = err instanceof AuthError ? err.type : 'unknown'
        // 某些容器场景会命中 AUTH_NONCE_REPLAY。这里允许一次自动恢复：
        // 清理/重建 OAuth 状态并重新发起授权，避免用户卡在错误页。
        if (msg.includes('AUTH_NONCE_REPLAY')) {
          const recovered = safeGetItem(NONCE_RECOVERY_ONCE_KEY)
          if (!recovered) {
            safeSetItem(NONCE_RECOVERY_ONCE_KEY, '1')
            auth.redirectToAuth(true)
            return
          }
          safeRemoveItem(NONCE_RECOVERY_ONCE_KEY)
        }
        setError(msg)
        setErrorType(type)
      } finally {
        setLoading(false)
      }
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, config.apiBaseUrl])

  const login = useCallback(() => {
    auth.redirectToAuth()
  }, [auth])

  const logout = useCallback(() => {
    const currentToken = token
    if (currentToken) {
      axios.post(
        `${config.apiBaseUrl || '/api/v1'}/auth/logout`,
        {},
        { headers: { Authorization: `Bearer ${currentToken}` } },
      ).catch(() => {
        // best-effort 撤销，失败时仍然本地清理
      })
    }
    setUser(null)
    setToken(null)
    setError(null)
    setErrorType(null)
    clearAuthStorage()
  }, [])

  return {
    user,
    token,
    loading,
    error,
    errorType,
    login,
    logout,
    isAuthenticated: !!token && !!user,
  }
}
