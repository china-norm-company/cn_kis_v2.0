import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { recruitmentApi } from '@cn-kis/api-client'
import { toast } from '../hooks/useToast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorAlert } from '../components/ErrorAlert'
import { Pagination } from '../components/Pagination'
import { Search, UserMinus, Download, MessageCircle, Phone, Mail, MapPin, MessageSquare, X, ChevronRight } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { exportToCsv } from '../utils/exportCsv'

const statusLabels: Record<string, string> = {
  registered: '已报名', contacted: '已联系', screening: '筛选中',
  screened_pass: '筛选通过', screened_fail: '筛选未通过',
  enrolled: '已入组', withdrawn: '已退出',
}

const statusColors: Record<string, string> = {
  registered: 'bg-amber-100 text-amber-700', contacted: 'bg-sky-100 text-sky-700',
  screening: 'bg-indigo-100 text-indigo-700', screened_pass: 'bg-teal-100 text-teal-700',
  screened_fail: 'bg-red-100 text-red-700', enrolled: 'bg-emerald-100 text-emerald-700',
  withdrawn: 'bg-slate-100 text-slate-600',
}

export default function RegistrationsPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || '')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [confirmScreening, setConfirmScreening] = useState<{ id: number; name: string } | null>(null)
  const [withdrawTarget, setWithdrawTarget] = useState<{ id: number; name: string } | null>(null)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [contactDrawer, setContactDrawer] = useState<{ id: number; name: string; regNo: string } | null>(null)

  useEffect(() => {
    const urlStatus = searchParams.get('status')
    if (urlStatus && urlStatus !== statusFilter) {
      setStatusFilter(urlStatus)
      setPage(1)
    }
  }, [searchParams])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recruitment', 'registrations', { status: statusFilter, page }],
    queryFn: async () => {
      const res = await recruitmentApi.listRegistrations({ status: statusFilter || undefined, page, page_size: 20 })
      if (!res?.data) throw new Error('获取报名列表失败')
      return res
    },
  })

  const screeningMutation = useMutation({
    mutationFn: (regId: number) => recruitmentApi.createScreening(regId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'registrations'] })
      toast.success('已开始筛选')
      setConfirmScreening(null)
    },
    onError: (err) => { toast.error((err as Error).message || '筛选启动失败'); setConfirmScreening(null) },
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 md:text-xl">报名管理</h2>
          <p className="text-sm text-slate-500 mt-1">管理受试者报名，联系跟进，退出管理</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => {
            exportToCsv('报名记录', [
              { key: 'registration_no', label: '报名编号' }, { key: 'name', label: '姓名' },
              { key: 'phone', label: '手机' }, { key: 'gender', label: '性别' },
              { key: 'age', label: '年龄' }, { key: 'status', label: '状态', formatter: (v) => statusLabels[v as string] || String(v) },
              { key: 'create_time', label: '报名时间', formatter: (v) => String(v ?? '').slice(0, 10) },
            ], allItems as unknown as Record<string, unknown>[])
            toast.success('导出成功')
          }} disabled={allItems.length === 0} className="flex min-h-11 items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50" title="导出报名记录"><Download className="w-4 h-4" /> 导出</button>
          <PermissionGuard permission="recruitment.registration.create">
            <button onClick={() => setShowCreate(true)} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors" title="新建报名">新建报名</button>
          </PermissionGuard>
        </div>
      </div>

      {error && <ErrorAlert message={(error as Error).message} onRetry={() => refetch()} />}

      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setKeyword(searchInput)} placeholder="搜索姓名/编号/手机" className="w-full min-h-11 pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm" title="搜索姓名编号手机" />
        </div>
        <select value={statusFilter} onChange={(e) => { const val = e.target.value; setStatusFilter(val); setPage(1); val ? setSearchParams({ status: val }) : setSearchParams({}) }} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" title="状态筛选">
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="shrink-0 self-center text-sm text-slate-400">共 {total} 条</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-400 py-12 text-center">{keyword ? '无匹配结果' : '暂无报名记录'}</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">报名编号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">姓名</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">手机</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">最后联系</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">下次联系</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">报名时间</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((reg: { id: number; registration_no: string; name: string; phone: string; gender?: string; age?: number; status: string; create_time?: string; contacted_at?: string; contact_notes?: string; next_contact_date?: string; withdrawal_reason?: string }) => {
                const isNextOverdue = reg.next_contact_date && new Date(reg.next_contact_date) <= new Date()
                return (
                <tr key={reg.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700 font-medium">{reg.registration_no}</td>
                  <td className="px-4 py-3 text-slate-700">{reg.name} <span className="text-slate-400 text-xs">{reg.gender === 'male' ? '男' : reg.gender === 'female' ? '女' : ''}{reg.age ? `/${reg.age}岁` : ''}</span></td>
                  <td className="px-4 py-3 text-slate-500">{reg.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[reg.status] || 'bg-slate-100'}`}>{statusLabels[reg.status] || reg.status}</span>
                    {reg.status === 'withdrawn' && reg.withdrawal_reason && <span className="block text-xs text-slate-400 mt-0.5" title={reg.withdrawal_reason}>原因: {reg.withdrawal_reason.slice(0, 20)}{reg.withdrawal_reason.length > 20 ? '...' : ''}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {reg.contacted_at ? (
                      <div>
                        <span className="text-slate-600">{reg.contacted_at.slice(0, 10)}</span>
                        {reg.contact_notes && <span className="block text-xs text-slate-400 truncate max-w-[120px]" title={reg.contact_notes}>{reg.contact_notes}</span>}
                      </div>
                    ) : (
                      <span className="text-slate-300">未联系</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {reg.next_contact_date ? (
                      <span className={isNextOverdue ? 'text-red-600 font-medium' : 'text-slate-600'}>{reg.next_contact_date}</span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{reg.create_time?.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setContactDrawer({ id: reg.id, name: reg.name, regNo: reg.registration_no })} className="flex min-h-9 items-center gap-1 text-xs text-blue-600 hover:text-blue-800" title="跟进">
                        <MessageCircle className="w-3 h-3" /> 跟进
                      </button>
                      {(reg.status === 'registered' || reg.status === 'contacted') && (
                        <button onClick={() => setConfirmScreening({ id: reg.id, name: reg.name })} className="min-h-9 text-xs text-emerald-600 hover:underline" disabled={screeningMutation.isPending} title="开始筛选">筛选</button>
                      )}
                      {!['withdrawn', 'screened_fail', 'enrolled'].includes(reg.status) && (
                        <button onClick={() => setWithdrawTarget({ id: reg.id, name: reg.name })} className="flex min-h-9 items-center gap-1 text-xs text-red-500 hover:text-red-700" title="标记退出">
                          <UserMinus className="w-3 h-3" /> 退出
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Pagination page={page} pageSize={20} total={total} onChange={setPage} />

      {showCreate && <CreateRegistrationModal onClose={() => setShowCreate(false)} />}

      <ConfirmDialog open={!!confirmScreening} title="开始筛选" message={confirmScreening ? `确定要对「${confirmScreening.name}」开始筛选流程吗？` : ''} confirmLabel="开始筛选" loading={screeningMutation.isPending} onConfirm={() => confirmScreening && screeningMutation.mutate(confirmScreening.id)} onCancel={() => setConfirmScreening(null)} />

      {withdrawTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setWithdrawTarget(null); setWithdrawReason('') }}>
          <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-sm max-h-[90vh] overflow-y-auto p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-full bg-red-100"><UserMinus className="w-5 h-5 text-red-600" /></div>
              <h3 className="text-base font-semibold text-slate-800">退出报名</h3>
            </div>
            <p className="text-sm text-slate-500 mb-3">将「{withdrawTarget.name}」标记为退出，此操作不可逆。</p>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">退出原因 *</label>
              <textarea value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={3} placeholder="请详细说明退出原因..." title="退出原因" />
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setWithdrawTarget(null); setWithdrawReason('') }} className="min-h-11 px-4 py-2 text-sm text-slate-600" title="取消退出">取消</button>
              <button onClick={() => withdrawMutation.mutate(withdrawTarget.id)} disabled={withdrawMutation.isPending || !withdrawReason.trim()} className="min-h-11 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50" title="确认退出">{withdrawMutation.isPending ? '处理中...' : '确认退出'}</button>
            </div>
          </div>
        </div>
      )}
      {contactDrawer && (
        <ContactDrawer
          regId={contactDrawer.id}
          regName={contactDrawer.name}
          regNo={contactDrawer.regNo}
          onClose={() => { setContactDrawer(null); refetch() }}
        />
      )}
    </div>
  )
}

const contactTypeIcons: Record<string, typeof Phone> = {
  phone: Phone, wechat: MessageSquare, email: Mail, visit: MapPin, sms: MessageCircle, other: MessageCircle,
}
const contactTypeLabels: Record<string, string> = {
  phone: '电话', wechat: '微信', email: '邮件', visit: '面访', sms: '短信', other: '其他',
}
const resultLabels: Record<string, string> = {
  interested: '有意向', not_interested: '无意向', scheduled: '已约筛选',
  no_answer: '未接通', callback: '要求回电', need_time: '需考虑', other: '其他',
}
const resultColors: Record<string, string> = {
  interested: 'text-emerald-600', not_interested: 'text-red-500', scheduled: 'text-blue-600',
  no_answer: 'text-amber-500', callback: 'text-purple-500', need_time: 'text-slate-500', other: 'text-slate-400',
}

function ContactDrawer({ regId, regName, regNo, onClose }: { regId: number; regName: string; regNo: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ contact_type: 'phone', content: '', result: 'other', next_contact_date: '', next_contact_plan: '' })

  const { data, isLoading, refetch: refetchContacts } = useQuery({
    queryKey: ['recruitment', 'contacts', regId],
    queryFn: async () => {
      const res = await recruitmentApi.listContactRecords(regId)
      return res?.data?.items ?? []
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!form.content.trim()) throw new Error('请输入联系内容')
      return recruitmentApi.createContactRecord(regId, {
        contact_type: form.contact_type,
        content: form.content,
        result: form.result,
        next_contact_date: form.next_contact_date || undefined,
        next_contact_plan: form.next_contact_plan || undefined,
      })
    },
    onSuccess: () => {
      refetchContacts()
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'registrations'] })
      toast.success('跟进记录已添加')
      setShowForm(false)
      setForm({ contact_type: 'phone', content: '', result: 'other', next_contact_date: '', next_contact_plan: '' })
    },
    onError: (err) => toast.error((err as Error).message || '添加失败'),
  })

  const records = data ?? []

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-md bg-white shadow-2xl h-full flex flex-col animate-in slide-in-from-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-800">跟进记录</h3>
            <p className="text-xs text-slate-400 mt-0.5">{regNo} · {regName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowForm(!showForm)} className="min-h-10 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700" title="添加跟进">{showForm ? '取消' : '+ 添加跟进'}</button>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭"><X className="w-5 h-5 text-slate-400" /></button>
          </div>
        </div>

        {showForm && (
          <div className="px-5 py-4 border-b border-slate-200 bg-blue-50/50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">联系方式</label>
                <select value={form.contact_type} onChange={(e) => setForm({ ...form, contact_type: e.target.value })} className="w-full min-h-10 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" title="联系方式">
                  {Object.entries(contactTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">联系结果</label>
                <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} className="w-full min-h-10 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" title="联系结果">
                  {Object.entries(resultLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">联系内容 *</label>
              <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded text-sm" rows={2} placeholder="简述本次联系内容..." title="联系内容" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">下次联系日期</label>
                <input type="date" value={form.next_contact_date} onChange={(e) => setForm({ ...form, next_contact_date: e.target.value })} className="w-full min-h-10 px-2 py-1.5 border border-slate-200 rounded text-sm" title="下次联系日期" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">下次联系计划</label>
                <input value={form.next_contact_plan} onChange={(e) => setForm({ ...form, next_contact_plan: e.target.value })} className="w-full min-h-10 px-2 py-1.5 border border-slate-200 rounded text-sm" placeholder="如：再次电话确认" title="下次联系计划" />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.content.trim()} className="min-h-10 px-4 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50" title="保存跟进记录">{createMutation.isPending ? '提交中...' : '保存记录'}</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />)}</div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400">暂无跟进记录，点击"添加跟进"开始</div>
          ) : (
            <div className="relative">
              <div className="absolute left-3.5 top-0 bottom-0 w-px bg-slate-200" />
              <div className="space-y-4">
                {records.map((r: { id: number; contact_type: string; content: string; result: string; next_contact_date: string | null; next_contact_plan: string; contact_date: string }) => {
                  const Icon = contactTypeIcons[r.contact_type] || MessageCircle
                  return (
                    <div key={r.id} className="relative pl-9">
                      <div className="absolute left-1.5 top-1 w-4 h-4 bg-white border-2 border-blue-400 rounded-full flex items-center justify-center">
                        <Icon className="w-2.5 h-2.5 text-blue-500" />
                      </div>
                      <div className="bg-white border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-slate-700">{contactTypeLabels[r.contact_type] || r.contact_type}</span>
                          <span className="text-xs text-slate-400">{r.contact_date?.slice(0, 16).replace('T', ' ')}</span>
                        </div>
                        <p className="text-sm text-slate-600">{r.content}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className={`text-xs font-medium ${resultColors[r.result] || 'text-slate-400'}`}>{resultLabels[r.result] || r.result}</span>
                          {r.next_contact_date && (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <ChevronRight className="w-3 h-3" /> 下次：{r.next_contact_date}
                              {r.next_contact_plan && <span className="text-slate-300">({r.next_contact_plan})</span>}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CreateRegistrationModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ plan_id: 0, name: '', phone: '', gender: '', age: undefined as number | undefined, email: '' })

  const plansQuery = useQuery({
    queryKey: ['recruitment', 'plans', 'select'],
    queryFn: async () => {
      const res = await recruitmentApi.listPlans({ status: 'active', page_size: 100 })
      return res?.data?.items ?? []
    },
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.plan_id) throw new Error('请选择招募计划')
      if (!form.name.trim()) throw new Error('请输入姓名')
      if (!form.phone.trim()) throw new Error('请输入手机号码')
      if (form.phone && !/^1\d{10}$/.test(form.phone)) throw new Error('手机号格式不正确')
      return recruitmentApi.createRegistration({ plan_id: Number(form.plan_id), name: form.name, phone: form.phone, gender: form.gender, age: form.age, email: form.email })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'registrations'] })
      toast.success('报名创建成功')
      onClose()
    },
    onError: (err) => toast.error((err as Error).message || '创建失败'),
  })

  const plans = plansQuery.data ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-lg max-h-[90vh] overflow-y-auto p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-slate-800 mb-4">新建报名</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">招募计划</label>
            <select value={form.plan_id} onChange={(e) => setForm({ ...form, plan_id: Number(e.target.value) })} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm" title="选择招募计划">
              <option value={0}>请选择计划</option>
              {plans.map((p: { id: number; plan_no: string; title: string }) => <option key={p.id} value={p.id}>{p.plan_no} - {p.title}</option>)}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-slate-600 mb-1">姓名 *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="受试者姓名" title="受试者姓名" /></div>
          <div><label className="block text-sm font-medium text-slate-600 mb-1">手机 *</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="11位手机号码" title="受试者手机号" /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="block text-sm font-medium text-slate-600 mb-1">性别</label><select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm" title="性别"><option value="">未指定</option><option value="male">男</option><option value="female">女</option></select></div>
            <div><label className="block text-sm font-medium text-slate-600 mb-1">年龄</label><input type="number" min={0} max={120} value={form.age ?? ''} onChange={(e) => setForm({ ...form, age: e.target.value ? Number(e.target.value) : undefined })} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="年龄" title="年龄" /></div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="min-h-11 px-4 py-2 text-sm text-slate-600" title="取消新建报名">取消</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50" title="提交报名">{mutation.isPending ? '提交中...' : '提交报名'}</button>
        </div>
      </div>
    </div>
  )
}
