/**
 * AIInsightWidget (D1)
 *
 * 统一的 AI 洞察卡片组件，可嵌入到任何业务页面。
 * 支持：触发/刷新/展开/收起/反馈
 */
import { useState, useCallback } from 'react'
import { Brain, RefreshCw, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react'

interface AIInsightWidgetProps {
  /** Agent ID to call */
  agentId: string
  /** Business context type */
  contextType: string
  /** Business context data */
  contextData: Record<string, unknown>
  /** Title for the widget */
  title?: string
  /** Auto-trigger on mount */
  autoTrigger?: boolean
  /** Callback for API interaction */
  onTrigger?: (agentId: string, contextType: string, contextData: Record<string, unknown>) => Promise<string>
  /** Initially collapsed */
  defaultCollapsed?: boolean
}

export function AIInsightWidget({
  agentId,
  contextType,
  contextData,
  title = 'AI 洞察',
  autoTrigger = false,
  onTrigger,
  defaultCollapsed = false,
}: AIInsightWidgetProps) {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)

  const trigger = useCallback(async () => {
    if (!onTrigger) return
    setLoading(true)
    try {
      const result = await onTrigger(agentId, contextType, contextData)
      setContent(result)
      setCollapsed(false)
    } catch (e: any) {
      setContent(`AI 分析失败: ${e.message || '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }, [agentId, contextType, contextData, onTrigger])

  // Auto-trigger on mount (if enabled and no content yet)
  useState(() => {
    if (autoTrigger && !content && onTrigger) {
      trigger()
    }
  })

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-100 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-semibold text-purple-700">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={trigger}
            disabled={loading}
            className="p-1.5 rounded-md text-purple-500 hover:bg-purple-100 disabled:opacity-50 transition"
            title={content ? '刷新' : '生成'}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
          </button>
          {content && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1.5 rounded-md text-purple-500 hover:bg-purple-100 transition"
            >
              {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {!collapsed && content && (
        <div className="mt-3">
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{content}</p>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-purple-100">
            <span className="text-[10px] text-slate-400">这个分析有帮助吗？</span>
            <button
              onClick={() => setFeedback('up')}
              className={`p-1 rounded transition ${feedback === 'up' ? 'bg-green-100 text-green-600' : 'text-slate-400 hover:text-green-500'}`}
            >
              <ThumbsUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => setFeedback('down')}
              className={`p-1 rounded transition ${feedback === 'down' ? 'bg-red-100 text-red-600' : 'text-slate-400 hover:text-red-500'}`}
            >
              <ThumbsDown className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {!content && !loading && (
        <div className="mt-2">
          <button
            onClick={trigger}
            className="text-xs text-purple-500 hover:text-purple-700 hover:underline"
          >
            点击生成 AI 洞察分析
          </button>
        </div>
      )}

      {loading && !content && (
        <div className="mt-3 flex items-center gap-2 text-xs text-purple-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>AI 正在分析中...</span>
        </div>
      )}
    </div>
  )
}
