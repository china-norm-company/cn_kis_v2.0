import type { ApiClient, ApiResponse, RequestOptions } from '@cn-kis/subject-core'
import * as SecureStore from 'expo-secure-store'

const API_BASE = process.env.EXPO_PUBLIC_API_BASE || ''

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  data?: unknown,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }
  if (options.auth !== false) {
    const token = await SecureStore.getItemAsync('token')
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const target = `${API_BASE}${url}`
  const res = await fetch(target, {
    method,
    headers,
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(data || {}),
  })
  const body = await res.json().catch(() => ({}))
  if (typeof body?.code === 'number') return body as ApiResponse<T>
  return { code: res.status, msg: res.ok ? 'ok' : '请求失败', data: body as T }
}

export const rnApiClient: ApiClient = {
  get: (url, params, options) => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>).toString()}` : ''
    return request('GET', `${url}${query}`, undefined, options)
  },
  post: (url, data, options) => request('POST', url, data, options),
  put: (url, data, options) => request('PUT', url, data, options),
  del: (url, options) => request('DELETE', url, undefined, options),
}
