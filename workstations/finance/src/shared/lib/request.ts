/**
 * 统一 API 请求工具（高层封装）
 * 职责：基于 apiClient 封装 get/post/put/patch/delete，直接返回 res.data，简化调用方。
 * 主要导出：request。供部分 legacy 或不需要 ApiResponse 结构的调用使用。
 * 依赖：@/shared/api/client。被部分 feature 或页面引用。
 * 涉及后端接口：与 apiClient 相同，路径与鉴权由底层处理。
 * 联调注意点：与 apiClient 相同；新代码推荐直接用 apiClient 或各 feature 的 createMockAdapterCaller 封装。
 */
import { apiClient } from '@/shared/api/client';

export const request = {
  get: <T = unknown>(url: string, options?: { params?: Record<string, unknown> }) => {
    return apiClient.get<T>(url, options).then(res => res.data);
  },
  
  post: <T = unknown>(url: string, body?: unknown, options?: { headers?: Record<string, string> }) => {
    return apiClient.post<T>(url, body, options).then(res => res.data);
  },
  
  put: <T = unknown>(url: string, body?: unknown) => {
    return apiClient.put<T>(url, body).then(res => res.data);
  },
  
  patch: <T = unknown>(url: string, body?: unknown) => {
    return apiClient.patch<T>(url, body).then(res => res.data);
  },
  
  delete: <T = unknown>(url: string) => {
    return apiClient.delete<T>(url).then(res => res.data);
  },
};




