/**
 * AI 解析服务（ProtocolExtractV2）
 * 通过后端代理调用解析服务，避免静态部署时直连导致 401；Token 与地址由后端配置。
 * 使用原生 fetch 以绕过 api-client 的 axios 响应拦截器（拦截器会把 code≠0/200 的 body reject，
 * 与 AI 代理返回的 502/504 状态码冲突）。
 */

export interface ProtocolExtractResponse {
  data: unknown
  status: number
  rawText: string
}

function toRawText(data: unknown): string {
  if (data == null) return ''
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data)
  } catch {
    return String(data)
  }
}

function getBaseURL(): string {
  const stored = localStorage.getItem('api_base_url')
  if (stored) return stored
  return '/api/v1'
}

function getToken(): string | null {
  return localStorage.getItem('auth_token')
}

export const protocolExtractV2Api = {
  extractBySubagent: async (
    file: File,
    subagent: string,
    signal?: AbortSignal
  ): Promise<ProtocolExtractResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    const baseURL = getBaseURL()
    const url = `${baseURL}/projects/protocol-extract?${new URLSearchParams({ subagent }).toString()}`
    const headers: Record<string, string> = {}
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 200_000)
    const mergedSignal = signal
      ? (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any?.([signal, controller.signal]) ?? controller.signal
      : controller.signal

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: mergedSignal,
      })
    } catch (e) {
      clearTimeout(timeoutId)
      if ((e as Error).name === 'AbortError') {
        const err = new Error(`AI 解析超时（${subagent}），请稍后重试`) as Error & { status?: number }
        err.status = 0
        throw err
      }
      throw new Error(`AI 解析网络错误（${subagent}）：${(e as Error).message}`)
    }
    clearTimeout(timeoutId)

    let data: unknown
    const rawText = await res.text()
    try {
      data = JSON.parse(rawText)
    } catch {
      data = rawText
    }

    if (res.status >= 200 && res.status < 300) {
      return { data, status: res.status, rawText }
    }
    const hints: string[] = []
    if (res.status === 401) hints.push('未授权，请重新登录后再试')
    if (res.status === 502) hints.push('解析服务暂时不可用，请检查后端 PROTOCOL_EXTRACT_V2_* 配置')
    if (res.status === 504) hints.push('解析服务响应超时，请稍后重试或检查服务状态')
    if (res.status === 400) hints.push('请求被拒绝(400)，可能原因：文件格式不支持、subagent 不被服务识别。')
    const detail =
      typeof data === 'object' && data !== null && (data as Record<string, unknown>).msg
        ? String((data as Record<string, unknown>).msg)
        : typeof data === 'object' && data !== null && (data as Record<string, unknown>).message
          ? String((data as Record<string, unknown>).message)
          : rawText && rawText.length < 500
            ? rawText
            : ''
    const msg = [
      `AI 解析失败（${subagent}），HTTP ${res.status}`,
      ...hints,
      detail ? `服务返回: ${detail}` : '',
    ]
      .filter(Boolean)
      .join(' ')
    const err = new Error(msg) as Error & { status?: number; data?: unknown; rawText?: string }
    err.status = res.status
    err.data = data
    err.rawText = rawText
    throw err
  },
}
