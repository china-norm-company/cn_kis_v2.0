import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { subjectApi } from '@cn-kis/api-client'
import type { Subject } from '@cn-kis/api-client'
import { ErrorAlert } from '../components/ErrorAlert'
import { Pagination } from '../components/Pagination'
import { Search, Download } from 'lucide-react'
import { exportToCsv } from '../utils/exportCsv'
import { toast } from '../hooks/useToast'

const statusLabels: Record<string, string> = {
  active: '活跃', enrolled: '入组中', completed: '已完成', withdrawn: '已退出', screened: '筛选中',
}
const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700', enrolled: 'bg-blue-100 text-blue-700',
  completed: 'bg-slate-100 text-slate-600', withdrawn: 'bg-red-100 text-red-700', screened: 'bg-amber-100 text-amber-700',
}
const riskColors: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-red-100 text-red-700',
}

export default function SubjectsPage() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  function doSearch() {
    setKeyword(searchInput)
    setPage(1)
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['subjects', { keyword, status: statusFilter, page }],
    queryFn: async () => {
      const res = await subjectApi.list({ keyword: keyword || undefined, status: statusFilter || undefined, page, page_size: 20 })
      if (!res?.data) throw new Error('获取受试者列表失败')
      return res
    },
  })

  const items: Subject[] = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 md:text-xl">受试者管理</h2>
          <p className="text-sm text-slate-500 mt-1">查看受试者列表，管理档案信息</p>
        </div>
        <button onClick={() => {
          exportToCsv('受试者列表', [
            { key: 'subject_no', label: '编号' }, { key: 'name', label: '姓名' },
            { key: 'gender', label: '性别' }, { key: 'age', label: '年龄' },
            { key: 'phone', label: '手机' }, { key: 'source_channel', label: '来源渠道' },
            { key: 'risk_level', label: '风险等级' }, { key: 'status', label: '状态', formatter: (v) => statusLabels[v as string] || String(v) },
          ], items as unknown as Record<string, unknown>[])
          toast.success('导出成功')
        }} disabled={items.length === 0} title="导出受试者列表" className="flex min-h-11 items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Download className="w-4 h-4" /> 导出</button>
      </div>

      {error && <ErrorAlert message={(error as Error).message} onRetry={() => refetch()} />}

      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="relative min-w-[220px] flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={searchInput} title="搜索姓名编号手机" onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="搜索姓名/编号/手机" className="min-h-11 w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" title="状态筛选">
          <option value="">全部状态</option>
          {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="shrink-0 self-center text-sm text-slate-400">共 {total} 人</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-400 py-12 text-center">暂无受试者数据</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">编号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">姓名</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">性别/年龄</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">手机</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">来源渠道</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">风险等级</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} onClick={() => navigate(`/subjects/${s.id}`)} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-3 text-emerald-600 font-medium">{s.subject_no || '-'}</td>
                  <td className="px-4 py-3 text-slate-700">{s.name}</td>
                  <td className="px-4 py-3 text-slate-500">{s.gender || '-'} / {s.age ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{s.phone || '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{s.source_channel || '-'}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${riskColors[s.risk_level] || 'bg-slate-100'}`}>{s.risk_level}</span></td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[s.status] || 'bg-slate-100'}`}>{statusLabels[s.status] || s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Pagination page={page} pageSize={20} total={total} onChange={setPage} />
    </div>
  )
}
