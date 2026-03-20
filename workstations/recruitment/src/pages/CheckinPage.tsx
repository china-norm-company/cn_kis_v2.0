import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { executionApi, subjectApi, receptionApi } from '@cn-kis/api-client'
import type { Subject } from '@cn-kis/api-client'
import type { QueueItem } from '@cn-kis/api-client'
import { toast } from '../hooks/useToast'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorAlert } from '../components/ErrorAlert'
import { Search, CalendarPlus, Download } from 'lucide-react'

const VISIT_POINT_OPTIONS = ['初筛', '复筛', '基线', 'V1', 'V2', 'V3', 'V4', '其他']

export default function CheckinPage() {
  const queryClient = useQueryClient()
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [confirmCheckin, setConfirmCheckin] = useState(false)
  const [confirmCheckout, setConfirmCheckout] = useState<number | null>(null)
  const [showCreateAppointment, setShowCreateAppointment] = useState(false)
  const [newApptDate, setNewApptDate] = useState('')
  const [newApptTime, setNewApptTime] = useState('')
  const [newApptPurpose, setNewApptPurpose] = useState('初筛')
  const [newApptVisitPoint, setNewApptVisitPoint] = useState('')
  const [listDate, setListDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [listProjectCode, setListProjectCode] = useState('')

  const subjectsQuery = useQuery({
    queryKey: ['subjects', 'checkin-list'],
    queryFn: async () => {
      const res = await subjectApi.list({ status: 'active', page_size: 200 })
      if (!res?.data) throw new Error('获取受试者列表失败')
      return res
    },
  })

  const checkinsQuery = useQuery({
    queryKey: ['checkins', selectedSubject],
    queryFn: async () => {
      const res = await executionApi.listCheckins(selectedSubject!)
      if (!res?.data) throw new Error('获取签到记录失败')
      return res
    },
    enabled: !!selectedSubject,
  })

  const queueQuery = useQuery({
    queryKey: ['reception', 'today-queue', listDate, listProjectCode],
    queryFn: () =>
      receptionApi.todayQueue({
        target_date: listDate,
        page: 1,
        page_size: 500,
        project_code: listProjectCode.trim() || undefined,
      }),
  })
  const queueItems: QueueItem[] = queueQuery.data?.data?.items ?? []
  const projectOptions = useMemo(() => {
    const byCode = new Map<string, string>()
    queueItems.forEach((i) => {
      const code = (i.project_code || '').trim()
      const name = (i.project_name || code || '').trim()
      if (code) byCode.set(code, name || code)
    })
    return Array.from(byCode.entries()).map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code))
  }, [queueItems])
  const filteredList = queueItems

  const exportCheckinList = () => {
    const headers = ['日期', '受试者姓名', '受试者编号', '项目', '项目编号', '访视点', '预约时间', '签到时间', '签出时间', '状态']
    const rows = filteredList.map((i) => [
      listDate,
      i.subject_name ?? '',
      i.subject_no ?? '',
      (i.project_name || i.project_code) ?? '',
      i.project_code ?? '',
      i.visit_point ?? '',
      i.appointment_time ?? '',
      i.checkin_time ?? '',
      i.checkout_time ?? '',
      i.status === 'checked_in' ? '已签到' : i.status === 'checked_out' ? '已签出' : i.status === 'no_show' ? '缺席' : i.status === 'in_progress' ? '执行中' : '待签到',
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\r\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `签到列表_${listDate}${listProjectCode ? `_${listProjectCode}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    toast.success('导出成功')
  }

  const checkinMutation = useMutation({
    mutationFn: (subjectId: number) => executionApi.checkin(subjectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkins'] })
      queryClient.invalidateQueries({ queryKey: ['reception', 'today-queue'] })
      toast.success('签到成功')
      setConfirmCheckin(false)
    },
    onError: (err) => { toast.error((err as Error).message || '签到失败'); setConfirmCheckin(false) },
  })

  const checkoutMutation = useMutation({
    mutationFn: (checkinId: number) => executionApi.checkout(checkinId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkins'] })
      queryClient.invalidateQueries({ queryKey: ['reception', 'today-queue'] })
      toast.success('签出成功')
      setConfirmCheckout(null)
    },
    onError: (err) => { toast.error((err as Error).message || '签出失败'); setConfirmCheckout(null) },
  })

  const createApptMutation = useMutation({
    mutationFn: () => {
      if (!selectedSubject) throw new Error('请先选择受试者')
      return executionApi.createAppointment(selectedSubject, {
        appointment_date: newApptDate,
        appointment_time: newApptTime || undefined,
        purpose: newApptPurpose,
        visit_point: newApptVisitPoint || undefined,
      })
    },
    onSuccess: () => {
      toast.success('预约创建成功')
      setShowCreateAppointment(false)
      setNewApptDate('')
      setNewApptTime('')
      setNewApptPurpose('初筛')
      setNewApptVisitPoint('')
      queryClient.invalidateQueries({ queryKey: ['reception', 'today-queue'] })
    },
    onError: (err) => toast.error((err as Error).message || '创建失败'),
  })

  const allSubjects: Subject[] = subjectsQuery.data?.data?.items ?? []
  const subjects = searchInput
    ? allSubjects.filter((s) => s.name.includes(searchInput) || s.subject_no?.includes(searchInput) || s.phone?.includes(searchInput))
    : allSubjects
  const checkins = checkinsQuery.data?.data?.items ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">签到管理</h2>
        <p className="text-sm text-slate-500 mt-1">管理受试者到访签到和签出</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">受试者列表</h3>
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="搜索姓名/编号" className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
          {subjectsQuery.isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-9 bg-slate-100 rounded animate-pulse" />)}</div>
          ) : subjectsQuery.error ? (
            <ErrorAlert message="加载失败" onRetry={() => subjectsQuery.refetch()} />
          ) : subjects.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">暂无活跃受试者</div>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {subjects.map((s) => (
                <button key={s.id} onClick={() => setSelectedSubject(s.id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedSubject === s.id ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-slate-400 ml-2">{s.subject_no}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-2 space-y-4">
          {selectedSubject ? (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">签到操作</h3>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setConfirmCheckin(true)} disabled={checkinMutation.isPending} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">签到</button>
                  <button onClick={() => setShowCreateAppointment(true)} className="inline-flex items-center gap-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <CalendarPlus className="w-4 h-4" /> 新建预约
                  </button>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">签到记录</h3>
                {checkinsQuery.isLoading ? (
                  <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
                ) : checkinsQuery.error ? (
                  <ErrorAlert message="加载签到记录失败" onRetry={() => checkinsQuery.refetch()} />
                ) : checkins.length === 0 ? (
                  <div className="text-sm text-slate-400 py-6 text-center">暂无签到记录</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 font-medium text-slate-600">日期</th>
                        <th className="text-left py-2 font-medium text-slate-600">签到时间</th>
                        <th className="text-left py-2 font-medium text-slate-600">签出时间</th>
                        <th className="text-left py-2 font-medium text-slate-600">状态</th>
                        <th className="text-left py-2 font-medium text-slate-600">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkins.map((c) => (
                        <tr key={c.id} className="border-b border-slate-100">
                          <td className="py-2 text-slate-700">{c.checkin_date}</td>
                          <td className="py-2 text-slate-600">{c.checkin_time || '-'}</td>
                          <td className="py-2 text-slate-600">{c.checkout_time || '-'}</td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.status === 'checked_in' ? 'bg-emerald-100 text-emerald-700' : c.status === 'checked_out' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                              {c.status === 'checked_in' ? '已签到' : c.status === 'checked_out' ? '已签出' : c.status}
                            </span>
                          </td>
                          <td className="py-2">
                            {c.status === 'checked_in' && (
                              <button onClick={() => setConfirmCheckout(c.id)} className="text-xs text-emerald-600 hover:underline" disabled={checkoutMutation.isPending}>签出</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-5 text-sm text-slate-400 text-center py-12">请从左侧选择受试者</div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">签到列表（按日期/项目）</h3>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="text-sm text-slate-600">日期</label>
          <input type="date" value={listDate} onChange={(e) => setListDate(e.target.value)} className="min-h-9 px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
          <label className="text-sm text-slate-600">项目编号</label>
          <input
            type="text"
            value={listProjectCode}
            onChange={(e) => setListProjectCode(e.target.value)}
            placeholder="输入或选择"
            className="min-h-9 w-36 px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
          />
          <select
            value={listProjectCode}
            onChange={(e) => setListProjectCode(e.target.value)}
            className="min-h-9 px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-44"
            title="从当日队列选择项目"
          >
            <option value="">全部项目</option>
            {projectOptions.map(({ code, name }) => (
              <option key={code} value={code}>{name} ({code})</option>
            ))}
          </select>
          <button onClick={exportCheckinList} disabled={filteredList.length === 0} className="inline-flex items-center gap-1 min-h-9 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Download className="w-4 h-4" /> 导出
          </button>
        </div>
        {queueQuery.isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : queueQuery.error ? (
          <ErrorAlert message="加载队列失败" onRetry={() => queueQuery.refetch()} />
        ) : filteredList.length === 0 ? (
          <div className="text-sm text-slate-400 py-8 text-center">该日期暂无预约记录，可切换日期或项目查看</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600">受试者</th>
                  <th className="text-left py-2 font-medium text-slate-600">项目</th>
                  <th className="text-left py-2 font-medium text-slate-600">访视点</th>
                  <th className="text-left py-2 font-medium text-slate-600">预约时间</th>
                  <th className="text-left py-2 font-medium text-slate-600">签到时间</th>
                  <th className="text-left py-2 font-medium text-slate-600">签出时间</th>
                  <th className="text-left py-2 font-medium text-slate-600">状态</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((i) => (
                  <tr key={i.appointment_id ?? i.subject_id + (i.appointment_time || '')} className="border-b border-slate-100">
                    <td className="py-2 text-slate-700">{i.subject_name} <span className="text-slate-400">{i.subject_no}</span></td>
                    <td className="py-2 text-slate-600">{i.project_name || i.project_code || '-'}</td>
                    <td className="py-2 text-slate-600">{i.visit_point || '-'}</td>
                    <td className="py-2 text-slate-600">{i.appointment_time || '-'}</td>
                    <td className="py-2 text-slate-600">{i.checkin_time || '-'}</td>
                    <td className="py-2 text-slate-600">{i.checkout_time || '-'}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        i.status === 'checked_in' ? 'bg-emerald-100 text-emerald-700' :
                        i.status === 'checked_out' ? 'bg-blue-100 text-blue-700' :
                        i.status === 'no_show' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {i.status === 'checked_in' ? '已签到' : i.status === 'checked_out' ? '已签出' : i.status === 'no_show' ? '缺席' : i.status === 'in_progress' ? '执行中' : '待签到'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog open={confirmCheckin} title="确认签到" message="确定要为该受试者签到吗？" confirmLabel="签到" loading={checkinMutation.isPending} onConfirm={() => selectedSubject && checkinMutation.mutate(selectedSubject)} onCancel={() => setConfirmCheckin(false)} />
      <ConfirmDialog open={!!confirmCheckout} title="确认签出" message="确定要签出该受试者吗？" confirmLabel="签出" loading={checkoutMutation.isPending} onConfirm={() => confirmCheckout && checkoutMutation.mutate(confirmCheckout)} onCancel={() => setConfirmCheckout(null)} />

      {showCreateAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[92vw] max-w-md">
            <h3 className="text-lg font-semibold mb-4">新建预约</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">预约日期</label>
                <input type="date" value={newApptDate} onChange={(e) => setNewApptDate(e.target.value)} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">预约时间（可选）</label>
                <input type="time" value={newApptTime} onChange={(e) => setNewApptTime(e.target.value)} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">到访目的</label>
                <select value={newApptPurpose} onChange={(e) => setNewApptPurpose(e.target.value)} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm">
                  <option value="初筛">初筛</option>
                  <option value="复筛">复筛</option>
                  <option value="常规访视">常规访视</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">访视点（必选）</label>
                <select value={newApptVisitPoint} onChange={(e) => setNewApptVisitPoint(e.target.value)} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm">
                  <option value="">请选择</option>
                  {VISIT_POINT_OPTIONS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowCreateAppointment(false)} className="min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm">取消</button>
              <button onClick={() => createApptMutation.mutate()} disabled={!newApptDate || !newApptVisitPoint || createApptMutation.isPending} className="min-h-11 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
                {createApptMutation.isPending ? '创建中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
