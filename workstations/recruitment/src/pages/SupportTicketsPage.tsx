import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { executionApi } from '@cn-kis/api-client'
import type { SupportTicket } from '@cn-kis/api-client'
import { useFeishuContext } from '@cn-kis/feishu-sdk'
import { toast } from '../hooks/useToast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorAlert } from '../components/ErrorAlert'

const statusLabels: Record<string, string> = { open: '待处理', replied: '已回复', closed: '已关闭' }
const statusColors: Record<string, string> = { open: 'bg-amber-100 text-amber-700', replied: 'bg-blue-100 text-blue-700', closed: 'bg-slate-100 text-slate-600' }

export default function SupportTicketsPage() {
  const { hasPermission } = useFeishuContext()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [replyingId, setReplyingId] = useState<number | null>(null)
  const [replyText, setReplyText] = useState('')
  const canReply = hasPermission('subject.recruitment.update')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['support-tickets', statusFilter],
    queryFn: async () => {
      const res = await executionApi.listSupportTickets({ status: statusFilter || undefined })
      if (!res?.data) throw new Error('获取工单列表失败')
      return res
    },
  })

  const replyMutation = useMutation({
    mutationFn: ({ ticketId, reply }: { ticketId: number; reply: string }) => {
      if (!canReply) throw new Error('缺少权限: subject.recruitment.update')
      if (!reply.trim()) throw new Error('请输入回复内容')
      return executionApi.replySupportTicket(ticketId, reply)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] })
      toast.success('回复已发送')
      setReplyingId(null)
      setReplyText('')
    },
    onError: (err) => toast.error((err as Error).message || '回复失败'),
  })

  const tickets: SupportTicket[] = data?.data?.items ?? []

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 md:text-xl">客服工单</h2>
        <p className="text-sm text-slate-500 mt-1">处理受试者咨询和反馈</p>
      </div>

      {error && <ErrorAlert message={(error as Error).message} onRetry={() => refetch()} />}

      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" title="状态筛选">
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="shrink-0 text-sm text-slate-400">共 {tickets.length} 条</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : tickets.length === 0 ? (
          <div className="text-sm text-slate-400 py-12 text-center">暂无客服工单</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-slate-700">{ticket.ticket_no}</span>
                    <span className="text-xs text-slate-400">{ticket.category}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[ticket.status] || 'bg-slate-100'}`}>{statusLabels[ticket.status] || ticket.status}</span>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{ticket.create_time?.slice(0, 10)}</span>
                </div>
                <p className="text-sm text-slate-700 mt-2">{ticket.title}</p>
                {ticket.reply && <div className="mt-2 p-2 rounded bg-blue-50 text-sm text-blue-700">回复: {ticket.reply}</div>}

                {ticket.status === 'open' && canReply && (
                  <div className="mt-3">
                    {replyingId === ticket.id ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input value={replyText} title="回复内容" onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && replyText.trim() && replyMutation.mutate({ ticketId: ticket.id, reply: replyText })} className="min-h-10 flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm" placeholder="输入回复内容" />
                        <button title="发送回复" onClick={() => replyMutation.mutate({ ticketId: ticket.id, reply: replyText })} disabled={!replyText.trim() || replyMutation.isPending} className="min-h-10 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">{replyMutation.isPending ? '发送中...' : '发送'}</button>
                        <button title="取消回复" onClick={() => { setReplyingId(null); setReplyText('') }} className="min-h-10 px-3 py-1.5 text-sm text-slate-600">取消</button>
                      </div>
                    ) : (
                      <button title="回复工单" onClick={() => setReplyingId(ticket.id)} className="min-h-10 px-2 py-1 text-sm text-emerald-600 hover:underline">回复</button>
                    )}
                  </div>
                )}
                {ticket.status === 'open' && !canReply && (
                  <div className="mt-3 text-xs text-slate-400">仅具备招募更新权限的账号可回复工单</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
