export interface ApiResponse<T = unknown> {
  code: number
  msg: string
  data: T
}

export interface RequestOptions {
  auth?: boolean
  headers?: Record<string, string>
  silent?: boolean
  timeoutMs?: number
}

export interface ApiClient {
  get<T = unknown>(url: string, params?: Record<string, unknown>, options?: RequestOptions): Promise<ApiResponse<T>>
  post<T = unknown>(url: string, data?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>
  put<T = unknown>(url: string, data?: unknown, options?: RequestOptions): Promise<ApiResponse<T>>
  del<T = unknown>(url: string, options?: RequestOptions): Promise<ApiResponse<T>>
}
