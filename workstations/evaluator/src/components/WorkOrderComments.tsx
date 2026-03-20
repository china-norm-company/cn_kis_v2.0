import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Send, User } from 'lucide-react'
import { workorderApi } from '@cn-kis/api-client'

interface WorkOrderCommentsProps {
  workOrderId: number
}

export function WorkOrderComments({ workOrderId }: WorkOrderCommentsProps) {
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [expanded, setExpanded] = useState(false)

  const { data: commentsRes } = useQuery({
    queryKey: ['workorder', 'comments', workOrderId],
    queryFn: () => workorderApi.listComments(workOrderId),
    enabled: expanded,
  })

  const rawData = (commentsRes as any)?.data ?? commentsRes
  const comments = (Array.isArray(rawData) ? rawData : rawData?.items ?? []) as any[]

  const addMutation = useMutation({
    mutationFn: (text: string) =>
      workorderApi.addComment(workOrderId, { content: text }),
    onSuccess: () => {
      setContent('')
      queryClient.invalidateQueries({ queryKey: ['workorder', 'comments', workOrderId] })
    },
  })

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-indigo-500" />
          工单评论
          {comments.length > 0 && (
            <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">
              {comments.length}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">{expanded ? '收起' : '展开'}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 p-3 space-y-3">
          {comments.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-3">暂无评论</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {comments.map((c: any, i: number) => (
                <div key={i} className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-700">{c.author_name ?? '匿名'}</span>
                      <span className="text-[10px] text-slate-400">{c.create_time ? new Date(c.create_time).toLocaleString('zh-CN') : ''}</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">{c.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && content.trim() && addMutation.mutate(content.trim())}
              placeholder="输入评论..."
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
            />
            <button
              onClick={() => content.trim() && addMutation.mutate(content.trim())}
              disabled={!content.trim() || addMutation.isPending}
              className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
