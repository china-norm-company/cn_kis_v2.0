import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ethicsApi } from '@/services/ethicsApi'

const OPINION_TYPE_COLORS: Record<string, string> = {
  approve: 'bg-emerald-100 text-emerald-700',
  conditional_approve: 'bg-blue-100 text-blue-700',
  revise: 'bg-amber-100 text-amber-700',
  disapprove: 'bg-rose-100 text-rose-700',
  suspend: 'bg-orange-100 text-orange-700',
  terminate: 'bg-red-100 text-red-800',
}

export function ReviewOpinionListPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['ethics', 'review-opinions', page],
    queryFn: () => ethicsApi.getReviewOpinions({ page, page_size: 20 }),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  return (
    <div className="space-y-4 md:space-y-5">
      <h2 className="text-lg font-semibold text-slate-800 md:text-xl">审查意见</h2>

      <div className="bg-white rounded-lg border border-slate-200">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">暂无数据</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                <th className="px-4 py-3">意见编号</th>
                <th className="px-4 py-3">关联申请</th>
                <th className="px-4 py-3">意见类型</th>
                <th className="px-4 py-3">审查日期</th>
                <th className="px-4 py-3">需回复</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{item.opinion_no}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.application_no || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${OPINION_TYPE_COLORS[item.opinion_type] || 'bg-slate-100'}`}>
                      {item.opinion_type_display || item.opinion_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {item.review_date ? new Date(item.review_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {item.response_required ? (
                      <span className={`${item.response_received ? 'text-emerald-600' : 'text-amber-600 font-medium'}`}>
                        {item.response_received ? '已回复' : '待回复'}
                      </span>
                    ) : (
                      <span className="text-slate-400">否</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/review-opinions/${item.id}`} className="inline-flex min-h-9 items-center text-sm text-indigo-600 hover:text-indigo-800">
                      查看
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {total > 20 && (
        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="min-h-10 px-3 py-1.5 text-sm rounded border border-slate-200 disabled:opacity-50"
            title="上一页"
          >
            上一页
          </button>
          <span className="px-3 py-1.5 text-sm text-slate-600">
            第 {page} 页 / 共 {Math.ceil(total / 20)} 页
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / 20)}
            className="min-h-10 px-3 py-1.5 text-sm rounded border border-slate-200 disabled:opacity-50"
            title="下一页"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}
