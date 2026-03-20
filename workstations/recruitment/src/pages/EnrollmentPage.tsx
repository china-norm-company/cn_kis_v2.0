import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { recruitmentApi } from '@cn-kis/api-client'
import { toast } from '../hooks/useToast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorAlert } from '../components/ErrorAlert'
import { Pagination } from '../components/Pagination'
import { Search, UserMinus } from 'lucide-react'

export default function EnrollmentPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [confirmEnroll, setConfirmEnroll] = useState<{ id: number; name: string } | null>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<{ id: number; name: string } | null>(null)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recruitment', 'registrations', 'enrolled-pending', page],
    queryFn: async () => {
      const res = await recruitmentApi.listRegistrations({ status: 'enrolled', page, page_size: 20 })
      if (!res?.data) throw new Error('获取待入组列表失败')
      return res
    },
  })

  const enrollMutation = useMutation({
    mutationFn: (regId: number) => recruitmentApi.createEnrollmentRecord(regId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment'] })
      toast.success('入组记录已创建')
      setConfirmEnroll(null)
    },
    onError: (err) => { toast.error((err as Error).message || '入组操作失败'); setConfirmEnroll(null) },
  })

  const withdrawMutation = useMutation({
    mutationFn: async (regId: number) => {
      if (!withdrawReason.trim()) throw new Error('请填写退出原因')
      return recruitmentApi.withdrawRegistration(regId, { reason: withdrawReason })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment'] })
      toast.success('已标记退出')
      setWithdrawTarget(null)
      setWithdrawReason('')
    },
    onError: (err) => toast.error((err as Error).message || '退出操作失败'),
  })

  const allItems = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const items = keyword ? allItems.filter((r: { name: string; registration_no: string; phone: string }) => r.name.includes(keyword) || r.registration_no.includes(keyword) || r.phone.includes(keyword)) : allItems

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 md:text-xl">入组确认</h2>
        <p className="text-sm text-slate-500 mt-1">确认筛选通过的受试者入组，跟踪 ICF 签署状态</p>
      </div>

      {error && <ErrorAlert message={(error as Error).message} onRetry={() => refetch()} />}

      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="relative min-w-[220px] flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={searchInput} title="搜索姓名编号" onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setKeyword(searchInput)} placeholder="搜索姓名/编号" className="min-h-11 w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <span className="shrink-0 self-center text-sm text-slate-400">共 {total} 条待入组</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-400 py-12 text-center">{keyword ? '无匹配结果' : '暂无待入组记录'}</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">报名编号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">姓名</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">手机</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((reg: { id: number; registration_no: string; name: string; phone: string; status: string }) => (
                <tr key={reg.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700 font-medium">{reg.registration_no}</td>
                  <td className="px-4 py-3 text-slate-700">{reg.name}</td>
                  <td className="px-4 py-3 text-slate-500">{reg.phone}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">已通过筛选</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setConfirmEnroll({ id: reg.id, name: reg.name })} className="min-h-9 px-3 py-1 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700" disabled={enrollMutation.isPending}>创建入组</button>
                      <button onClick={() => setWithdrawTarget({ id: reg.id, name: reg.name })} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700" title="标记退出">
                        <UserMinus className="w-3 h-3" /> 退出
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Pagination page={page} pageSize={20} total={total} onChange={setPage} />

      <ConfirmDialog open={!!confirmEnroll} title="确认创建入组" message={confirmEnroll ? `确定要为「${confirmEnroll.name}」创建入组记录吗？` : ''} confirmLabel="创建入组" loading={enrollMutation.isPending} onConfirm={() => confirmEnroll && enrollMutation.mutate(confirmEnroll.id)} onCancel={() => setConfirmEnroll(null)} />

      {withdrawTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setWithdrawTarget(null); setWithdrawReason('') }}>
          <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-sm max-h-[90vh] overflow-y-auto p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-full bg-red-100"><UserMinus className="w-5 h-5 text-red-600" /></div>
              <h3 className="text-base font-semibold text-slate-800">退出入组</h3>
            </div>
            <p className="text-sm text-slate-500 mb-3">将「{withdrawTarget.name}」标记为退出，此操作不可逆。</p>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">退出原因 *</label>
              <textarea value={withdrawReason} title="退出原因" onChange={(e) => setWithdrawReason(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={3} placeholder="请详细说明退出原因..." />
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setWithdrawTarget(null); setWithdrawReason('') }} className="min-h-11 px-4 py-2 text-sm text-slate-600">取消</button>
              <button onClick={() => withdrawMutation.mutate(withdrawTarget.id)} disabled={withdrawMutation.isPending || !withdrawReason.trim()} className="min-h-11 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">{withdrawMutation.isPending ? '处理中...' : '确认退出'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
