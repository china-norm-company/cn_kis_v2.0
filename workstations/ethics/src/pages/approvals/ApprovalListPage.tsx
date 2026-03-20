import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ethicsApi } from '@/services/ethicsApi'

export function ApprovalListPage() {
  const [filter, setFilter] = useState<'all' | 'expiring'>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['ethics', 'approvals', filter],
    queryFn: () =>
      filter === 'expiring'
        ? ethicsApi.getExpiringApprovals().then((res) => ({
            code: res.code,
            msg: res.msg,
            data: { items: res.data ?? [], total: (res.data ?? []).length },
          }))
        : ethicsApi.getApprovals(),
  })

  const payload = (data as any)?.data
  const items = payload?.items ?? payload ?? []

  return (
    <div className="space-y-4 md:space-y-5">
      <h2 className="text-lg font-semibold text-slate-800 md:text-xl">伦理批件</h2>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilter('all')}
          title="查看全部批件"
          className={`shrink-0 min-h-11 px-3 py-1.5 text-sm rounded-md ${filter === 'all' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          全部批件
        </button>
        <button
          onClick={() => setFilter('expiring')}
          title="查看即将到期批件"
          className={`shrink-0 min-h-11 px-3 py-1.5 text-sm rounded-md ${filter === 'expiring' ? 'bg-amber-100 text-amber-700 font-medium' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          即将到期
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">加载中...</div>
        ) : (items as any[]).length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">暂无数据</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                <th className="px-4 py-3">批件编号</th>
                <th className="px-4 py-3">关联申请</th>
                <th className="px-4 py-3">批准日期</th>
                <th className="px-4 py-3">有效期至</th>
                <th className="px-4 py-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {(items as any[]).map((item: any) => {
                const isExpiring = item.valid_until && new Date(item.valid_until) < new Date(Date.now() + 30 * 86400000)
                return (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{item.document_no || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.application_no || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.approved_at ? new Date(item.approved_at).toLocaleDateString() : '-'}</td>
                    <td className={`px-4 py-3 text-sm ${isExpiring ? 'text-amber-600 font-medium' : 'text-slate-600'}`}>
                      {item.valid_until ? new Date(item.valid_until).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${isExpiring ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {isExpiring ? '即将到期' : '有效'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
