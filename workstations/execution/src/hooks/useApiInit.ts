/**
 * API 客户端初始化 Hook
 *
 * 在 App 层调用，配置 baseURL、token 获取、401 处理
 * 开发旁路：VITE_DEV_AUTH_BYPASS=1 时使用 dev-bypass-token，后端 DEBUG 下会接受
 *
 * Tracking Prevention：Edge 等浏览器可能阻止 localStorage，使用内存回退
 *
 * 注意：必须同步初始化，否则子组件首次请求可能在 token 写入前发出，导致 401/403 白屏
 */
import { createApiClient } from '@cn-kis/api-client'

const DEV_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === '1'
const DEV_TOKEN = 'dev-bypass-token'
/** 与 feishu-sdk FeishuAuthProvider DEV_BYPASS 一致；useFeishuAuth 需 token + auth_user 才会跳过 autoLogin */
const DEV_AUTH_USER_JSON = JSON.stringify({
  id: 0,
  name: '开发测试用户',
  email: 'dev@cnkis.local',
  avatar: '',
})

let initialized = false
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
  } catch {
    /* ignore */
  }
}

function ensureInit() {
  if (initialized) return
  initialized = true

  if (DEV_BYPASS) {
    const existing = safeGetStorage('auth_token')
    if (!existing) {
      safeSetStorage('auth_token', DEV_TOKEN)
      _memoryToken = DEV_TOKEN
    } else {
      _memoryToken = existing
    }
    if (!safeGetStorage('auth_token_ts')) {
      safeSetStorage('auth_token_ts', String(Date.now()))
    }
    if (!safeGetStorage('auth_user')) {
      safeSetStorage('auth_user', DEV_AUTH_USER_JSON)
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
      } catch {
        /* ignore */
      }
      window.location.hash = '#/login'
    },
    skipClearAuthStorageOnAuthError: DEV_BYPASS,
  })
}

export function useApiInit() {
  ensureInit()
}
