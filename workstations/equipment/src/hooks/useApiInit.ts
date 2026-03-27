/**
 * API 客户端初始化 Hook
 *
 * 在 App 层调用，配置 baseURL、token 获取、401 处理
 * 开发旁路：VITE_DEV_AUTH_BYPASS=1 时使用 dev-bypass-token，后端 DEBUG 下会接受
 *
 * 注意：必须同步初始化，否则子组件首次请求可能在 token 写入前发出，导致 403
 */
import { createApiClient } from '@cn-kis/api-client'

const DEV_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === '1'
const DEV_TOKEN = 'dev-bypass-token'

let initialized = false

function ensureInit() {
  if (initialized) return
  initialized = true

  // 开发旁路：确保 API 请求携带 dev-bypass-token（同步执行，避免竞态）
  if (DEV_BYPASS) {
    try {
      const existing = localStorage.getItem('auth_token')
      if (!existing) localStorage.setItem('auth_token', DEV_TOKEN)
    } catch { /* ignore */ }
  }

  createApiClient({
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
    timeout: 30000,
    getToken: () => {
      const stored = localStorage.getItem('auth_token')
      if (DEV_BYPASS && !stored) return DEV_TOKEN
      return stored
    },
    skipClearAuthStorageOnAuthError: DEV_BYPASS,
    onUnauthorized: () => {
      if (DEV_BYPASS) return
      localStorage.removeItem('auth_token')
      window.location.hash = '#/login'
    },
  })
}

export function useApiInit() {
  ensureInit()
}
