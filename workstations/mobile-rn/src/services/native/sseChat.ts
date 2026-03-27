export interface SseChatPayload {
  agent_id: string
  message: string
  session_id?: string
  context?: Record<string, unknown>
}

export interface SseHandlers {
  onChunk: (text: string) => void
  onDone?: (meta: Record<string, unknown>) => void
  onError?: (message: string) => void
}

export function createSseChat(baseUrl: string, token: string) {
  return async function startSseChat(payload: SseChatPayload, handlers: SseHandlers) {
    const res = await fetch(`${baseUrl}/agents/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
    const reader = res.body?.getReader()
    if (!reader) {
      handlers.onError?.('SSE 连接失败')
      return
    }
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''
      events.forEach((evt) => {
        const lines = evt.split('\n')
        const eventName = lines.find((line) => line.startsWith('event:'))?.replace('event:', '').trim()
        const dataText = lines.find((line) => line.startsWith('data:'))?.replace('data:', '').trim()
        if (!dataText) return
        const data = JSON.parse(dataText)
        if (eventName === 'chunk') handlers.onChunk(String(data.content || ''))
        if (eventName === 'done') handlers.onDone?.(data)
        if (eventName === 'error') handlers.onError?.(String(data.message || '未知错误'))
      })
    }
  }
}
