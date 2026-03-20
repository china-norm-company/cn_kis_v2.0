/**
 * 中书·智能台 — AI 对话入口页
 *
 * 各工作台「AI 快捷操作」及「去对话」链接统一跳转至此。
 * URL 参数：skill, script, action（Claw 快捷动作）或 agent（指定 Agent 对话）
 */
import { useSearchParams } from 'react-router-dom'
import { Bot, MessageSquare } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ChatPage() {
  const [searchParams] = useSearchParams()
  const skill = searchParams.get('skill')
  const script = searchParams.get('script')
  const action = searchParams.get('action')
  const agent = searchParams.get('agent')
  const contextClientId = searchParams.get('context_client_id')

  const hasParams = !!(skill || script || action || agent)

  return (
    <div
      data-testid="chat-page"
      className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-12"
    >
      <div className="flex max-w-md flex-col items-center gap-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-100">
          <MessageSquare className="h-7 w-7 text-violet-600" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-800">AI 对话入口</h1>
          <p className="mt-2 text-sm text-slate-500">
            您已进入中书·智能台的对话页。完整的对话与技能执行界面将在此展示。
          </p>
        </div>
        {hasParams && (
          <div className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              当前上下文
            </p>
            <ul className="space-y-1 text-sm text-slate-700">
              {skill && <li><span className="text-slate-500">技能：</span>{skill}</li>}
              {script && <li><span className="text-slate-500">脚本：</span>{script}</li>}
              {action && <li><span className="text-slate-500">动作：</span>{action}</li>}
              {agent && <li><span className="text-slate-500">Agent：</span>{agent}</li>}
              {contextClientId && <li><span className="text-slate-500">客户上下文：</span>{contextClientId}</li>}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/portal"
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            <Bot className="h-4 w-4" />
            返回数字员工门户
          </Link>
        </div>
      </div>
    </div>
  )
}
