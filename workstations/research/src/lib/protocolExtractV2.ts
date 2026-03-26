/**
 * AI 解析服务（ProtocolExtractV2），与 KIS 一致
 * 按 subagent 调用解析接口并返回结构化结果
 */

const getBaseUrl = (): string =>
  (import.meta.env.VITE_PROTOCOL_EXTRACT_BASE_URL as string) || '/aiapi'

const getToken = (): string | undefined =>
  (import.meta.env.VITE_PROTOCOL_EXTRACT_TOKEN as string) || undefined

export interface ProtocolExtractResponse {
  data: unknown
  status: number
  rawText: string
}

function buildExtractUrl(subagent: string): string {
  const base = getBaseUrl().replace(/\/$/, '')
  const q = new URLSearchParams({ subagent }).toString()
  return `${base}/ProtocolExtractV2/api/v1/protocol-extract-v2/extract?${q}`
}

async function parseResponseBody(response: Response): Promise<{ data: unknown; rawText: string }> {
  const rawText = await response.text()
  if (!rawText) return { data: null, rawText: '' }
  try {
    return { data: JSON.parse(rawText), rawText }
  } catch {
    return { data: rawText, rawText }
  }
}

export const protocolExtractV2Api = {
  extractBySubagent: async (
    file: File,
    subagent: string,
    signal?: AbortSignal
  ): Promise<ProtocolExtractResponse> => {
    const token = getToken()
    if (!token) {
      throw new Error('未配置 VITE_PROTOCOL_EXTRACT_TOKEN，无法调用 AI 解析服务')
    }
    const formData = new FormData()
    formData.append('file', file)
    const url = buildExtractUrl(subagent)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 600_000)
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: signal ?? controller.signal,
    })
    clearTimeout(timeoutId)
    const { data, rawText } = await parseResponseBody(response)
    if (!response.ok) {
      const hints: string[] = []
      if (response.status === 401) {
        hints.push('解析服务返回 401 未授权，请检查 .env 中 VITE_PROTOCOL_EXTRACT_TOKEN 是否与解析服务一致（可向 KIS 或服务方获取有效 Token）')
      }
      if (response.status === 400) {
        hints.push('请求被拒绝(400)，可能原因：文件格式不支持、subagent 不被服务识别、或请求体不符合要求。')
      }
      const detail =
        typeof data === 'object' && data !== null && (data as Record<string, unknown>).message
          ? String((data as Record<string, unknown>).message)
          : rawText && rawText.length < 500
            ? rawText
            : ''
      const msg = [
        `AI 解析失败（${subagent}），HTTP ${response.status}`,
        ...hints,
        detail ? `服务返回: ${detail}` : '',
      ]
        .filter(Boolean)
        .join(' ')
      const err = new Error(msg) as Error & { status?: number; data?: unknown; rawText?: string }
      err.status = response.status
      err.data = data
      err.rawText = rawText
      throw err
    }
    return { data, status: response.status, rawText }
  },
}
