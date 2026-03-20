import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { receptionApi } from '@cn-kis/api-client'
import { LogIn, LogOut, Search } from 'lucide-react'

export default function CheckinPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: queueData, isLoading } = useQuery({
    queryKey: ['reception-queue'],
    queryFn: () => receptionApi.todayQueue(),
    refetchInterval: 30000,
  })

  const checkinMutation = useMutation({
    mutationFn: (subjectId: number) => receptionApi.quickCheckin({ subject_id: subjectId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reception-queue'] }),
  })

  const checkoutMutation = useMutation({
    mutationFn: (checkinId: number) => receptionApi.quickCheckout(checkinId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reception-queue'] }),
  })

  const items = (queueData?.data as any)?.items ?? []
  const filtered = search
    ? items.filter((i: any) => String(i.subject_code ?? '').includes(search) || String(i.subject_name ?? '').includes(search))
    : items

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center gap-3">
        <LogIn className="w-6 h-6 text-green-600" />
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">签到签出</h1>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="搜索受试者编号或姓名..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['受试者编号', '姓名', '访视', '预约时间', '签到时间', '操作'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">加载中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">暂无今日访视记录</td></tr>
              ) : filtered.map((item: any) => (
                <tr key={item.subject_id ?? item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{item.subject_code ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.subject_name ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{item.visit_name ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{item.scheduled_time ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{item.checkin_time ?? '未签到'}</td>
                  <td className="px-4 py-3">
                    {!item.checkin_time ? (
                      <button
                        onClick={() => checkinMutation.mutate(item.subject_id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"
                      >
                        <LogIn className="w-3 h-3" /> 签到
                      </button>
                    ) : !item.checkout_time ? (
                      <button
                        onClick={() => item.checkin_id && checkoutMutation.mutate(item.checkin_id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-600 text-white rounded-lg text-xs font-medium hover:bg-slate-700"
                      >
                        <LogOut className="w-3 h-3" /> 签出
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">已完成</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
