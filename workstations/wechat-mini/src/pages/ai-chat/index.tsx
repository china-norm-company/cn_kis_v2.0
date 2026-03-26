import { useRef, useState } from 'react'
import { View, Text, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { buildSubjectEndpoints } from '@cn-kis/subject-core'
import { taroApiClient } from '../../adapters/subject-core'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

const DEFAULT_AGENT_ID = 'general-assistant'
const POLL_INTERVAL_MS = 800
const POLL_TIMEOUT_MS = 120000

export default function AiChatPage() {
  const [message, setMessage] = useState('')
  const [response, setResponse] = useState('')
  const [statusText, setStatusText] = useState('待发送')
  const [loading, setLoading] = useState(false)
  const [callId, setCallId] = useState('')
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }

  const pollCall = async (id: string, startedAt: number) => {
    const now = Date.now()
    if (now - startedAt > POLL_TIMEOUT_MS) {
      setLoading(false)
      setStatusText('轮询超时，请重试')
      Taro.showToast({ title: 'AI 响应超时，请重试', icon: 'none' })
      stopPolling()
      return
    }

    try {
      const res = await subjectApi.getAgentCallStatus(id)
      if (res.code !== 200 || !res.data) {
        throw new Error(res.msg || '状态查询失败')
      }
      const data = res.data as { status?: string; output_text?: string; chunks?: string[] } | null
      const status = data?.status || 'running'
      const text = data?.output_text || (Array.isArray(data?.chunks) ? data!.chunks!.join('') : '')
      if (text) setResponse(text)
      setStatusText(status)

      if (status === 'success' || status === 'failed') {
        setLoading(false)
        stopPolling()
        if (status === 'failed') {
          Taro.showToast({ title: 'AI 调用失败', icon: 'none' })
        }
        return
      }

      pollTimerRef.current = setTimeout(() => {
        pollCall(id, startedAt)
      }, POLL_INTERVAL_MS)
    } catch (error) {
      setLoading(false)
      setStatusText('轮询失败')
      stopPolling()
      Taro.showToast({ title: '轮询失败，请重试', icon: 'none' })
      console.error('[AI Chat] poll error', error)
    }
  }

  const handleSend = async () => {
    const content = message.trim()
    if (!content) {
      Taro.showToast({ title: '请输入问题', icon: 'none' })
      return
    }
    setLoading(true)
    setResponse('')
    setStatusText('queued')
    stopPolling()
    try {
      const res = await subjectApi.createAgentChatAsync({
        agent_id: DEFAULT_AGENT_ID,
        message: content,
      })
      if (res.code !== 200 || !(res.data as { call_id?: string } | null)?.call_id) {
        throw new Error(res.msg || '请求失败')
      }
      const nextCallId = (res.data as { call_id: string }).call_id
      setCallId(nextCallId)
      pollCall(nextCallId, Date.now())
    } catch (error) {
      setLoading(false)
      setStatusText('发送失败')
      Taro.showToast({ title: '发送失败，请重试', icon: 'none' })
      console.error('[AI Chat] send error', error)
    }
  }

  const handleClear = () => {
    stopPolling()
    setLoading(false)
    setMessage('')
    setResponse('')
    setStatusText('待发送')
    setCallId('')
  }

  return (
    <View className='ai-chat-page'>
      <View className='ai-chat-card'>
        <Text className='ai-chat-title'>子衿 AI 助手</Text>
        <Text className='ai-chat-sub'>小程序端走异步轮询，App 端可切 SSE 流式。</Text>

        <Textarea
          className='ai-chat-input'
          value={message}
          maxlength={1500}
          placeholder='请输入你的问题，例如：下一次访视要准备哪些事项？'
          onInput={(e) => setMessage(e.detail.value)}
        />

        <View className='ai-chat-btns'>
          <View className='ai-chat-btn ai-chat-btn--primary' onClick={handleSend}>
            {loading ? '处理中...' : '发送'}
          </View>
          <View className='ai-chat-btn ai-chat-btn--ghost' onClick={handleClear}>
            清空
          </View>
        </View>

        <View className='ai-chat-result'>
          {response || (loading ? 'AI 正在思考中...' : '这里会展示 AI 回复')}
        </View>
        <Text className='ai-chat-meta'>状态：{statusText}{callId ? ` | call_id: ${callId}` : ''}</Text>
      </View>
    </View>
  )
}
