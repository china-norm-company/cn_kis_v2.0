/**
 * API 客户端初始化 Hook
 *
 * 在 App 层调用，配置 baseURL、token 获取、401 处理
 * 开发旁路：VITE_DEV_AUTH_BYPASS=1 时使用 dev-bypass-token，后端 DEBUG 下会接受
 *
 * Tracking Prevention：Edge 等浏览器可能阻止 localStorage，使用内存回退
 *
 * 注意：必须同步初始化，否则子组件首次请求可能在 token 写入前发出，导致 403
 */
import { createApiClient } from '@cn-kis/api-client'

const DEV_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === '1'
const DEV_TOKEN = 'dev-bypass-token'

let initialized = false
/** 当 localStorage 被 Tracking Prevention 阻止时的内存回退 */
let _memoryToken: string | null = null

function safeGetStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch { /* ignore */ }
}

function ensureInit() {
  if (initialized) return
  initialized = true

  // 开发旁路：确保 API 请求携带 dev-bypass-token（同步执行，避免竞态）
  // 当 localStorage 被 Tracking Prevention 阻止时，_memoryToken 作为回退
  if (DEV_BYPASS) {
    const existing = safeGetStorage('auth_token')
    if (!existing) {
      safeSetStorage('auth_token', DEV_TOKEN)
      _memoryToken = DEV_TOKEN
    } else {
      _memoryToken = existing
    }
  }

  createApiClient({
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
    timeout: 30000,
    getToken: () => {
      const stored = safeGetStorage('auth_token')
      if (DEV_BYPASS && !stored) return _memoryToken ?? DEV_TOKEN
      return stored ?? _memoryToken
    },
    onUnauthorized: () => {
      if (DEV_BYPASS) return
      _memoryToken = null
      try {
        localStorage.removeItem('auth_token')
      } catch { /* ignore */ }
      window.location.hash = '#/login'
    },
  })
}

export function useApiInit() {
  ensureInit()
}
