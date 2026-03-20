import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ethicsApi } from '@/services/ethicsApi'

export function ReviewOpinionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [responseText, setResponseText] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['ethics', 'review-opinion', id],
    queryFn: () => ethicsApi.getReviewOpinionDetail(Number(id)),
    enabled: !!id,
  })

  const respondMutation = useMutation({
    mutationFn: (text: string) => ethicsApi.respondToOpinion(Number(id), text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ethics', 'review-opinion', id] })
      setResponseText('')
    },
  })

  if (isLoading) return <div className="text-sm text-slate-400">加载中...</div>

  const opinion = data?.data
  if (!opinion) return <div className="text-sm text-slate-400">未找到该审查意见</div>

  return (
    <div className="max-w-3xl space-y-5 md:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">审查意见详情</h2>
        <button onClick={() => navigate('/review-opinions')} className="min-h-11 text-sm text-slate-500 hover:text-slate-700" title="返回审查意见列表">
          返回列表
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-6 space-y-4">
        <InfoRow label="意见编号" value={opinion.opinion_no} />
        <InfoRow label="意见类型" value={opinion.opinion_type_display || opinion.opinion_type} />
        <InfoRow label="审查日期" value={opinion.review_date} />
        <InfoRow label="摘要" value={opinion.summary} />
        <InfoRow label="详细意见" value={opinion.detailed_opinion} />
        {opinion.modification_requirements && (
          <InfoRow label="修改要求" value={opinion.modification_requirements} />
        )}
        <InfoRow label="审查委员" value={opinion.reviewer_names?.join('、')} />
      </div>

      {opinion.response_required && !opinion.response_received && (
        <div className="bg-white rounded-lg border border-amber-200 p-4 md:p-6 space-y-4">
          <h3 className="text-base font-medium text-amber-700">待回复</h3>
          {opinion.response_deadline && (
            <p className="text-sm text-slate-500">
              回复截止日期：{new Date(opinion.response_deadline).toLocaleDateString()}
            </p>
          )}
          <textarea
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            rows={4}
            placeholder="输入回复内容..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
            title="回复内容"
          />
          <button
            onClick={() => respondMutation.mutate(responseText)}
            disabled={!responseText.trim() || respondMutation.isPending}
            className="min-h-11 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            title="提交回复"
          >
            {respondMutation.isPending ? '提交中...' : '提交回复'}
          </button>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row">
      <span className="w-28 text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm text-slate-700 whitespace-pre-wrap">{value || '-'}</span>
    </div>
  )
}
