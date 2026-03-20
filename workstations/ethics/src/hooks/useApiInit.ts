/**
 * API 客户端初始化 Hook
 *
 * 在 App 层调用，配置 baseURL、token 获取、401 处理
 */
import { useEffect } from 'react'
import { createApiClient } from '@cn-kis/api-client'

let initialized = false

export function useApiInit() {
  useEffect(() => {
    if (initialized) return
    initialized = true

    createApiClient({
      baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
      timeout: 30000,
      getToken: () => localStorage.getItem('auth_token'),
      onUnauthorized: () => {
        localStorage.removeItem('auth_token')
        window.location.hash = '#/login'
      },
    })
  }, [])
}
