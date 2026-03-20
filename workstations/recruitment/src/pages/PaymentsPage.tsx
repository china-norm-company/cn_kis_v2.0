import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { executionApi, subjectApi } from '@cn-kis/api-client'
import type { Subject, SubjectPayment } from '@cn-kis/api-client'
import { toast } from '../hooks/useToast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorAlert } from '../components/ErrorAlert'
import { Search, Download } from 'lucide-react'
import { exportToCsv } from '../utils/exportCsv'

const statusLabels: Record<string, string> = { pending: '待处理', initiated: '已发起', paid: '已支付', cancelled: '已取消' }
const statusColors: Record<string, string> = { pending: 'bg-amber-100 text-amber-700', initiated: 'bg-sky-100 text-sky-700', paid: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-slate-100 text-slate-600' }

export default function PaymentsPage() {
  const queryClient = useQueryClient()
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showBatchCreate, setShowBatchCreate] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [confirmInitiate, setConfirmInitiate] = useState<number | null>(null)
  const [showConfirmPay, setShowConfirmPay] = useState<number | null>(null)
  const [confirmForm, setConfirmForm] = useState({ transaction_id: '', payment_method: 'bank_transfer', notes: '' })

  const subjectsQuery = useQuery({
    queryKey: ['subjects', 'payment-list'],
    queryFn: async () => { const res = await subjectApi.list({ page_size: 200 }); if (!res?.data) throw new Error('加载失败'); return res },
  })

  const paymentsQuery = useQuery({
    queryKey: ['payments', selectedSubject],
    queryFn: async () => { const res = await executionApi.listPayments(selectedSubject!); if (!res?.data) throw new Error('加载失败'); return res },
    enabled: !!selectedSubject,
  })

  const initiateMutation = useMutation({
    mutationFn: (paymentId: number) => executionApi.initiatePayment(paymentId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payments'] }); toast.success('支付已发起'); setConfirmInitiate(null) },
    onError: (err) => { toast.error((err as Error).message || '发起失败'); setConfirmInitiate(null) },
  })

  const confirmMutation = useMutation({
    mutationFn: (paymentId: number) => executionApi.confirmPayment(paymentId, confirmForm),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payments'] }); toast.success('支付已确认'); setShowConfirmPay(null) },
    onError: (err) => { toast.error((err as Error).message || '确认失败'); setShowConfirmPay(null) },
  })

  const allSubjects: Subject[] = subjectsQuery.data?.data?.items ?? []
  const subjects = searchInput ? allSubjects.filter((s) => s.name.includes(searchInput) || s.subject_no?.includes(searchInput)) : allSubjects
  const payments: SubjectPayment[] = paymentsQuery.data?.data?.items ?? []

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 md:text-xl">礼金管理</h2>
          <p className="text-sm text-slate-500 mt-1">创建、发起和确认受试者礼金支付</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {payments.length > 0 && <button onClick={() => {
            exportToCsv('礼金记录', [
              { key: 'payment_no', label: '支付编号' }, { key: 'payment_type', label: '类型' },
              { key: 'amount', label: '金额' }, { key: 'status', label: '状态', formatter: (v) => statusLabels[v as string] || String(v) },
              { key: 'paid_at', label: '支付时间', formatter: (v) => String(v ?? '').slice(0, 10) },
            ], payments as unknown as Record<string, unknown>[])
            toast.success('导出成功')
          }} className="flex min-h-11 items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"><Download className="w-4 h-4" /> 导出</button>}
          <button onClick={() => setShowBatchCreate(true)} className="min-h-11 px-3 py-2 border border-emerald-200 text-emerald-600 rounded-lg text-sm hover:bg-emerald-50">批量创建</button>
          {selectedSubject && <button onClick={() => setShowCreate(true)} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">新建支付</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">选择受试者</h3>
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="搜索" className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          {subjectsQuery.error && <ErrorAlert message="加载失败" onRetry={() => subjectsQuery.refetch()} />}
          <div className="space-y-1 max-h-72 overflow-y-auto md:max-h-96">
            {subjects.map((s) => (
              <button key={s.id} onClick={() => { setSelectedSubject(s.id); setShowCreate(false) }} className={`min-h-10 w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedSubject === s.id ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>{s.name}</button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3">
          {selectedSubject ? (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">礼金记录</h3>
              {paymentsQuery.isLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
              ) : paymentsQuery.error ? (
                <ErrorAlert message="加载礼金记录失败" onRetry={() => paymentsQuery.refetch()} />
              ) : payments.length === 0 ? (
                <div className="text-sm text-slate-400 py-6 text-center">暂无礼金记录</div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 font-medium text-slate-600">支付编号</th>
                      <th className="text-left py-2 font-medium text-slate-600">类型</th>
                      <th className="text-left py-2 font-medium text-slate-600">金额</th>
                      <th className="text-left py-2 font-medium text-slate-600">状态</th>
                      <th className="text-left py-2 font-medium text-slate-600">支付时间</th>
                      <th className="text-left py-2 font-medium text-slate-600">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100">
                        <td className="py-2 text-slate-700 font-medium">{p.payment_no}</td>
                        <td className="py-2 text-slate-600">{p.payment_type}</td>
                        <td className="py-2 text-slate-700 font-medium">&yen;{p.amount}</td>
                        <td className="py-2"><span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[p.status] || 'bg-slate-100'}`}>{statusLabels[p.status] || p.status}</span></td>
                        <td className="py-2 text-slate-500">{p.paid_at?.slice(0, 10) || '-'}</td>
                        <td className="py-2">
                          <div className="flex gap-1">
                            {p.status === 'pending' && <button onClick={() => setConfirmInitiate(p.id)} className="min-h-9 px-2 py-1 text-xs rounded bg-sky-100 text-sky-700 hover:bg-sky-200" disabled={initiateMutation.isPending}>发起</button>}
                            {p.status === 'initiated' && <button onClick={() => { setShowConfirmPay(p.id); setConfirmForm({ transaction_id: '', payment_method: 'bank_transfer', notes: '' }) }} className="min-h-9 px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">确认</button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-5 text-sm text-slate-400 text-center py-12">请从左侧选择受试者</div>
          )}
        </div>
      </div>

      {showCreate && selectedSubject && <CreatePaymentModal subjectId={selectedSubject} onClose={() => setShowCreate(false)} />}
      {showBatchCreate && <BatchCreatePaymentModal subjects={allSubjects} onClose={() => setShowBatchCreate(false)} />}

      <ConfirmDialog open={!!confirmInitiate} title="发起支付" message="确定要发起该笔支付吗？" confirmLabel="发起" loading={initiateMutation.isPending} onConfirm={() => confirmInitiate && initiateMutation.mutate(confirmInitiate)} onCancel={() => setConfirmInitiate(null)} />

      {showConfirmPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowConfirmPay(null)}>
          <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-md max-h-[90vh] overflow-y-auto p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">确认支付完成</h3>
            <div className="space-y-3">
              <div><label className="block text-sm font-medium text-slate-600 mb-1">交易号 *</label><input value={confirmForm.transaction_id} onChange={(e) => setConfirmForm({ ...confirmForm, transaction_id: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="银行/微信/支付宝交易号" /></div>
              <div><label className="block text-sm font-medium text-slate-600 mb-1">支付方式</label>
                <select value={confirmForm.payment_method} onChange={(e) => setConfirmForm({ ...confirmForm, payment_method: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" title="支付方式">
                  <option value="bank_transfer">银行转账</option><option value="wechat">微信支付</option><option value="alipay">支付宝</option><option value="cash">现金</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium text-slate-600 mb-1">备注</label><textarea value={confirmForm.notes} onChange={(e) => setConfirmForm({ ...confirmForm, notes: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={2} title="备注" placeholder="支付备注" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowConfirmPay(null)} className="min-h-11 px-4 py-2 text-sm text-slate-600">取消</button>
              <button onClick={() => { if (!confirmForm.transaction_id.trim()) { toast.error('请输入交易号'); return }; showConfirmPay && confirmMutation.mutate(showConfirmPay) }} disabled={confirmMutation.isPending} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{confirmMutation.isPending ? '确认中...' : '确认支付'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CreatePaymentModal({ subjectId, onClose }: { subjectId: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ payment_type: 'visit', amount: '', notes: '' })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.amount || Number(form.amount) <= 0) throw new Error('请输入有效金额')
      return executionApi.createPayment(subjectId, { payment_type: form.payment_type, amount: form.amount, notes: form.notes })
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payments', subjectId] }); toast.success('支付记录已创建'); onClose() },
    onError: (err) => toast.error((err as Error).message || '创建失败'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-md max-h-[90vh] overflow-y-auto p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">新建礼金支付</h3>
        <div className="space-y-3">
          <div><label className="block text-sm font-medium text-slate-600 mb-1">支付类型</label>
            <select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" title="支付类型"><option value="visit">到访礼金</option><option value="completion">完成礼金</option><option value="transportation">交通补贴</option><option value="meal">餐饮补贴</option><option value="other">其他</option></select>
          </div>
          <div><label className="block text-sm font-medium text-slate-600 mb-1">金额 (元) *</label><input type="number" min={0.01} step={0.01} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="输入金额" /></div>
          <div><label className="block text-sm font-medium text-slate-600 mb-1">备注</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={2} title="备注" placeholder="支付备注" /></div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="min-h-11 px-4 py-2 text-sm text-slate-600">取消</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{mutation.isPending ? '创建中...' : '创建'}</button>
        </div>
      </div>
    </div>
  )
}

function BatchCreatePaymentModal({ subjects, onClose }: { subjects: Subject[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [form, setForm] = useState({ payment_type: 'visit', amount: '', notes: '' })
  const [search, setSearch] = useState('')

  const filtered = search ? subjects.filter((s) => s.name.includes(search) || s.subject_no?.includes(search)) : subjects

  const toggleId = (id: number) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filtered.map((s) => s.id)))
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (selectedIds.size === 0) throw new Error('请至少选择一名受试者')
      if (!form.amount || Number(form.amount) <= 0) throw new Error('请输入有效金额')
      return executionApi.batchCreatePayments({
        subject_ids: Array.from(selectedIds),
        payment_type: form.payment_type,
        amount: form.amount,
        notes: form.notes || undefined,
      })
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      toast.success(`已为 ${res?.data?.created_count ?? selectedIds.size} 名受试者创建支付`)
      onClose()
    },
    onError: (err) => toast.error((err as Error).message || '批量创建失败'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-lg max-h-[90vh] overflow-y-auto p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">批量创建礼金支付</h3>

        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="block text-sm font-medium text-slate-600 mb-1">支付类型</label>
              <select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" title="支付类型"><option value="visit">到访礼金</option><option value="completion">完成礼金</option><option value="transportation">交通补贴</option><option value="meal">餐饮补贴</option></select>
            </div>
            <div><label className="block text-sm font-medium text-slate-600 mb-1">金额 (元) *</label><input type="number" min={0.01} step={0.01} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="每人金额" /></div>
          </div>
          <div><label className="block text-sm font-medium text-slate-600 mb-1">备注</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="批量支付备注" /></div>
        </div>

        <div className="border rounded-lg border-slate-200 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleAll} className="rounded" title="全选" />
              <span className="text-sm text-slate-600">已选 {selectedIds.size}/{filtered.length} 人</span>
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索" className="min-h-10 px-2 py-1 border border-slate-200 rounded text-xs w-full sm:w-32" />
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filtered.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleId(s.id)} className="rounded" />
                <span className="text-sm text-slate-700">{s.name}</span>
                <span className="text-xs text-slate-400">{s.subject_no}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="min-h-11 px-4 py-2 text-sm text-slate-600">取消</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending || selectedIds.size === 0} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{mutation.isPending ? '创建中...' : `为 ${selectedIds.size} 人创建支付`}</button>
        </div>
      </div>
    </div>
  )
}
