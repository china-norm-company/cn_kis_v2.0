/**
 * 从 API 错误中提取用户可读的提示信息
 *
 * 覆盖：后端 msg、Axios 原始错误、403/401 等常见场景
 */
type ApiError = Error & {
  response?: { data?: { msg?: string; message?: string }; status?: number }
}

export function getApiErrorMessage(error: unknown, fallback403 = '无权限，需 admin 或 superadmin 角色'): string {
  if (!error) return '加载失败'
  const err = error as ApiError
  const msg = err instanceof Error ? err.message : String(error)

  // 1. 优先使用 response.data.msg（后端返回）
  const resp = err?.response?.data
  if (resp && typeof resp === 'object') {
    const backendMsg = resp.msg || resp.message
    if (typeof backendMsg === 'string' && backendMsg.trim()) return backendMsg
  }

  // 2. 403 相关原始错误 -> 友好提示
  if (/status code 403|403|Forbidden|无权限/i.test(msg)) return fallback403

  return msg || '加载失败'
}
