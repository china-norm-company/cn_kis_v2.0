/**
 * API 客户端实现
 *
 * 增强：401 自动清理缓存、网络错误友好消息、5xx 自动重试
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios'
import type { ApiClientConfig, ApiResponse } from './types'

let _instance: AxiosInstance | null = null

function clearAuthStorage() {
  try {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    localStorage.removeItem('auth_profile')
    localStorage.removeItem('auth_roles')
    localStorage.removeItem('auth_workbenches')
    localStorage.removeItem('auth_token_ts')
  } catch { /* ignore */ }
}

async function retryRequest(instance: AxiosInstance, config: AxiosRequestConfig): Promise<any> {
  await new Promise((r) => setTimeout(r, 1000))
  return instance.request(config)
}

/**
 * 创建/配置 API 客户端实例
 */
export function createApiClient(config: ApiClientConfig = {}): AxiosInstance {
  const {
    baseURL: rawBaseURL = '/api/v1',
    timeout = 30000,
    getToken = () => localStorage.getItem('auth_token'),
    onUnauthorized,
  } = config
  const baseURL = rawBaseURL

  const instance = axios.create({
    baseURL,
    timeout,
    headers: { 'Content-Type': 'application/json' },
  })

  instance.interceptors.request.use(
    (reqConfig) => {
      const token = getToken()
      if (token) {
        reqConfig.headers.Authorization = `Bearer ${token}`
      }
      // FormData 上传时移除 Content-Type，让浏览器自动设置 multipart boundary
      if (reqConfig.data instanceof FormData) {
        delete reqConfig.headers['Content-Type']
      }
      return reqConfig
    },
    (error) => Promise.reject(error),
  )

  instance.interceptors.response.use(
    (response) => {
      // 二进制响应（如文件下载）不检查 code
      if (response.config.responseType === 'blob' || response.config.responseType === 'arraybuffer') {
        return response
      }
      const body = response.data as { code?: number | string; msg?: string; data?: unknown } | undefined
      // 兼容 code 为字符串 "200" 或数字 200（严格相等曾误判为业务失败；且部分代理/中间层会改类型）
      if (body && typeof body === 'object' && !Array.isArray(body) && body.code != null) {
        const c = Number(body.code)
        if (!Number.isNaN(c) && c !== 0 && c !== 200) {
          const msg = body.msg || '请求失败'
          const err = new Error(msg) as Error & { response: typeof response }
          err.response = response
          return Promise.reject(err)
        }
      }
      return response
    },
    async (error: AxiosError) => {
      if (error.response) {
        const { status } = error.response
        const body = error.response.data
        let backendMsg: string | null = null
        let requiredPermission: string | null = null
        let requiredPermissions: string[] = []
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          const b = body as { msg?: string; message?: string; detail?: string | unknown; data?: unknown }
          backendMsg = b.msg || b.message || (typeof b.detail === 'string' ? b.detail : null) || null
          if (!backendMsg && Array.isArray(b.detail) && b.detail.length > 0) {
            const first = (b.detail as unknown[])[0]
            if (first && typeof first === 'object' && 'msg' in first) backendMsg = String((first as { msg?: string }).msg)
            else if (typeof first === 'string') backendMsg = first
          }
          const payload = b.data
          if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
            const p = payload as { required_permission?: unknown; required_permissions?: unknown }
            if (typeof p.required_permission === 'string' && p.required_permission.trim()) {
              requiredPermission = p.required_permission.trim()
            }
            if (Array.isArray(p.required_permissions)) {
              requiredPermissions = p.required_permissions
                .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
                .map((item) => item.trim())
            }
          }
        }
        if (!backendMsg && body && typeof body === 'string' && body.length < 500) {
          backendMsg = body
        }

        const authRequired =
          status === 401
          || (status === 403 && (
            backendMsg === '请先登录'
            || (
              body
              && typeof body === 'object'
              && !Array.isArray(body)
              && typeof (body as { data?: unknown }).data === 'object'
              && (body as { data?: { error_code?: string } }).data?.error_code === 'AUTH_REQUIRED'
            )
          ))

        if (authRequired) {
          clearAuthStorage()
          onUnauthorized?.()
          const err = new Error(backendMsg || '未授权，请重新登录') as Error & { response: typeof error.response }
          err.response = error.response
          return Promise.reject(err)
        }

        // 4xx: 使用后端返回的 msg
        if (status >= 400 && status < 500) {
          let msg = backendMsg || (status === 404 ? '请求的资源不存在' : `请求失败 (${status})`)
          if (status === 403) {
            const permTips = [
              requiredPermission,
              ...requiredPermissions,
            ].filter((item): item is string => !!item)
            if (permTips.length > 0) {
              msg = `${backendMsg || '无权限访问'}（缺少权限：${permTips.join(' / ')}）`
            } else if (!backendMsg) {
              msg = '无权限访问（请联系管理员分配对应权限）'
            }
          }
          const err = new Error(msg) as Error & { response: typeof error.response }
          err.response = error.response
          return Promise.reject(err)
        }

        // 5xx: 仅对幂等请求重试一次（GET/HEAD），避免 POST 创建类接口重复提交
        const config = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined
        const method = (config?.method || 'get').toUpperCase()
        const allow5xxRetry = method === 'GET' || method === 'HEAD'
        if (status >= 500 && allow5xxRetry && !config?._retried && config) {
          config._retried = true
          try {
            return await retryRequest(instance, config)
          } catch {
            const err = new Error(backendMsg || '服务暂时不可用，请稍后重试') as Error & { response: typeof error.response }
            err.response = error.response
            return Promise.reject(err)
          }
        }
        if (status >= 500 && !allow5xxRetry) {
          const err = new Error(backendMsg || `请求失败 (${status})`) as Error & { response: typeof error.response }
          err.response = error.response
          return Promise.reject(err)
        }
      } else {
        // Network error (no response) — attach friendly message
        const networkErr = new Error('网络连接失败，请检查网络后重试') as Error & { originalError: unknown }
        networkErr.originalError = error
        return Promise.reject(networkErr)
      }
      return Promise.reject(error)
    },
  )

  _instance = instance
  return instance
}

function getInstance(): AxiosInstance {
  if (!_instance) {
    _instance = createApiClient()
  }
  return _instance
}

/** 获取 axios 实例，用于 blob 下载等需要完整 response 的场景 */
export function getAxiosInstance(): AxiosInstance {
  return getInstance()
}

/**
 * API 请求方法封装
 */
export const api = {
  get: <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    getInstance().get(url, config).then((res) => res.data),

  post: <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    getInstance().post(url, data, config).then((res) => res.data),

  put: <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    getInstance().put(url, data, config).then((res) => res.data),

  delete: <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    getInstance().delete(url, config).then((res) => res.data),

  patch: <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    getInstance().patch(url, data, config).then((res) => res.data),

  upload: <T = unknown>(url: string, formData: FormData, config?: AxiosRequestConfig): Promise<ApiResponse<T>> =>
    getInstance().post(url, formData, {
      ...config,
      headers: { 'Content-Type': 'multipart/form-data', ...config?.headers },
    }).then((res) => res.data),
}
