import type { ApiClient, ApiResponse, RequestOptions } from './types'

export function createApiClient(transport: ApiClient): ApiClient {
  return transport
}

export async function safeCall<T>(
  handler: () => Promise<ApiResponse<T>>,
  fallbackMsg = '请求失败'
): Promise<ApiResponse<T | null>> {
  try {
    return await handler()
  } catch (error) {
    return { code: -1, msg: fallbackMsg, data: null }
  }
}

export type { ApiClient, ApiResponse, RequestOptions }
