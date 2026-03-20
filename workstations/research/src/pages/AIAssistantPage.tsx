/**
 * P1.1b: AI 助手页面
 *
 * Agent 选择器 + 快捷指令 + 对话界面 + 对话历史 + 报告生成
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Select, Badge, Empty } from '@cn-kis/ui-kit'
import {
  Send, Bot, User, Clock, Sparkles, FileText, AlertTriangle,
  TrendingUp, MessageSquare, Loader2,
} from 'lucide-react'

interface Agent {
  id: string
  name: string
  display_name: string
  description: string
  provider: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface Session {
  session_id: string
  agent_id: string
  create_time: string
  message_count: number
}

const QUICK_COMMANDS = [
  { label: '分析项目进展风险', icon: AlertTriangle, prompt: '请分析当前所有活跃项目的进展风险，重点关注入组率低于预期、工单逾期、偏差未关闭的项目。' },
  { label: '生成本周项目报告', icon: FileText, prompt: '请帮我生成本周的项目进展报告，包括各项目的入组进度、关键里程碑完成情况、数据质量概况。' },
  { label: '客户合作分析', icon: TrendingUp, prompt: '请分析各客户的合作历史和满意度情况，识别需要重点维护的客户关系。' },
  { label: '数据质量趋势', icon: Sparkles, prompt: '请分析最近一个月的CRF数据质量趋势，包括完整度、异常率、质量审计通过率的变化。' },
]

const MANAGER_AGENTS = ['general-assistant', 'analysis-agent', 'report-agent', 'insight-agent', 'alert-agent']

export default function AIAssistantPage() {
  const [selectedAgent, setSelectedAgent] = useState('general-assistant')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: agentsRes } = useQuery({
    queryKey: ['agents', 'list'],
    queryFn: () => api.get<Agent[]>('/agents/list'),
  })

  const { data: sessionsRes } = useQuery({
    queryKey: ['agents', 'sessions'],
    queryFn: () => api.get<Session[]>('/agents/sessions'),
  })

  const agents = (agentsRes?.data ?? []) as Agent[]
  const managerAgents = agents.filter(a => MANAGER_AGENTS.includes(a.id || a.name))
  const sessions = (sessionsRes?.data ?? []) as Session[]

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await api.post<{
        response: string
        session_id: string
        agent_id: string
      }>('/agents/chat', {
        agent_id: selectedAgent,
        message,
        session_id: sessionId || undefined,
      })
      return res.data
    },
    onSuccess: (data) => {
      if (data) {
        setSessionId((data as any).session_id)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: (data as any).response,
          timestamp: new Date().toISOString(),
        }])
      }
    },
  })

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || chatMutation.isPending) return
    setInput('')
    setMessages(prev => [...prev, {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }])
    chatMutation.mutate(text)
  }, [input, chatMutation])

  const handleQuickCommand = (prompt: string) => {
    setInput('')
    setMessages(prev => [...prev, {
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
    }])
    chatMutation.mutate(prompt)
  }

  const handleRestoreSession = async (session: Session) => {
    setSelectedAgent(session.agent_id)
    setSessionId(session.session_id)
    try {
      const res = await api.get<any>(`/agents/sessions/${session.session_id}/history`)
      if (res.data?.messages) {
        setMessages(res.data.messages.map((m: any) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp || '',
        })))
      }
    } catch {
      setMessages([])
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Report generation
  const reportMutation = useMutation({
    mutationFn: async (reportType: string) => {
      const create = await api.post<{ id: number }>('/report/create', {
        report_type: reportType,
        title: `${reportType} - ${new Date().toLocaleDateString()}`,
      })
      if (create.data?.id) {
        const gen = await api.post<any>(`/report/${(create.data as any).id}/generate`, {})
        return gen.data
      }
    },
  })

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left: Chat */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200">
        {/* Agent selector */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-200">
          <Bot className="w-5 h-5 text-purple-500" />
          <select
            value={selectedAgent}
            onChange={(e) => {
              setSelectedAgent(e.target.value)
              setSessionId(null)
              setMessages([])
            }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
          >
            {managerAgents.length > 0 ? managerAgents.map(a => (
              <option key={a.id || a.name} value={a.id || a.name}>
                {a.display_name || a.name}
              </option>
            )) : MANAGER_AGENTS.map(id => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
          <span className="text-xs text-slate-400">
            {managerAgents.find(a => (a.id || a.name) === selectedAgent)?.description || ''}
          </span>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Bot className="w-12 h-12 text-purple-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500 mb-6">选择一个智能体，开始对话</p>
              <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                {QUICK_COMMANDS.map((cmd) => (
                  <button
                    key={cmd.label}
                    onClick={() => handleQuickCommand(cmd.prompt)}
                    className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 text-left hover:bg-slate-50 transition text-sm"
                  >
                    <cmd.icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-slate-600">{cmd.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-purple-600" />
                </div>
              )}
              <div className={`max-w-[70%] rounded-xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-blue-600" />
                </div>
              )}
            </div>
          ))}

          {chatMutation.isPending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-purple-600 animate-spin" />
              </div>
              <div className="bg-slate-100 rounded-xl px-4 py-3 text-sm text-slate-400">
                正在思考...
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-200">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="输入消息..."
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending}
              className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right: Sessions + Reports */}
      <div className="w-72 space-y-4">
        {/* Report Generation */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">快速生成报告</h3>
          <div className="space-y-2">
            {[
              { type: 'enrollment_status', label: '入组状态报告' },
              { type: 'workorder_summary', label: '工单汇总报告' },
              { type: 'compliance_report', label: '合规检查报告' },
              { type: 'safety_report', label: '安全性报告' },
            ].map(r => (
              <button
                key={r.type}
                onClick={() => reportMutation.mutate(r.type)}
                disabled={reportMutation.isPending}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                <FileText className="w-4 h-4 text-slate-400" />
                {r.label}
              </button>
            ))}
            {reportMutation.isSuccess && (
              <div className="text-xs text-green-600 bg-green-50 p-2 rounded">报告已生成</div>
            )}
          </div>
        </div>

        {/* Session History */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <Clock className="w-4 h-4" />
            对话历史
          </h3>
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-400">暂无历史对话</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-auto">
              {sessions.slice(0, 10).map((s) => (
                <button
                  key={s.session_id}
                  onClick={() => handleRestoreSession(s)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-slate-50 ${
                    sessionId === s.session_id ? 'bg-blue-50 border border-blue-200' : 'border border-slate-100'
                  }`}
                >
                  <div className="font-medium text-slate-700">{s.agent_id}</div>
                  <div className="text-slate-400">{s.message_count} 条消息 · {new Date(s.create_time).toLocaleDateString()}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
