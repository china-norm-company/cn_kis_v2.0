/**
 * 反馈与训练 — 对最近 Agent 回答打分（1-5），可选文字反馈
 * 需先有 call_id（可从对话历史或工作动态进入）
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { agentApi } from '@cn-kis/api-client'
import { MessageSquare, Star } from 'lucide-react'

export default function FeedbackPage() {
  const [callId, setCallId] = useState('')
  const [rating, setRating] = useState<number>(3)
  const [feedbackText, setFeedbackText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      agentApi.submitCallFeedback(Number(callId), {
        rating,
        ...(feedbackText.trim() ? { feedback_text: feedbackText.trim() } : {}),
      }),
    onSuccess: () => setSubmitted(true),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const id = Number(callId)
    if (!Number.isInteger(id) || id <= 0) {
      mutation.reset()
      return
    }
    setSubmitted(false)
    mutation.mutate()
  }

  return (
    <div data-testid="feedback-page" className="max-w-xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">反馈与训练</h2>
        <p className="mt-1 text-sm text-slate-500">
          对 Agent 回复打分（1-5），帮助数字员工持续改进；需填写有效的调用记录 ID（call_id）
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">调用记录 ID (call_id)</label>
          <input
            type="number"
            min={1}
            value={callId}
            onChange={(e) => setCallId(e.target.value)}
            placeholder="从对话历史或工作动态中获取"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">评分 (1-5)</label>
          <div className="mt-2 flex gap-2">
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRating(r)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                  rating === r ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'
                }`}
              >
                <Star className="h-5 w-5" />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">文字反馈（选填）</label>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            rows={3}
            placeholder="补充说明或纠正建议"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800"
          />
        </div>
        <button
          type="submit"
          disabled={mutation.isPending || !callId.trim()}
          className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          <MessageSquare className="h-4 w-4" />
          {mutation.isPending ? '提交中...' : '提交反馈'}
        </button>
        {mutation.isError && (
          <p className="text-sm text-red-600">提交失败：{(mutation.error as Error).message}</p>
        )}
        {submitted && mutation.isSuccess && (
          <p className="text-sm text-emerald-600">反馈已记录，感谢您的评分。</p>
        )}
      </form>
    </div>
  )
}
