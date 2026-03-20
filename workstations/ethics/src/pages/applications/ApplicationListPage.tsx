import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { ethicsApi } from '@/services/ethicsApi'

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'submitted', label: '已提交' },
  { value: 'reviewing', label: '审查中' },
  { value: 'approved', label: '已批准' },
  { value: 'rejected', label: '已驳回' },
  { value: 'withdrawn', label: '已撤回' },
]

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  submitted: 'bg-blue-100 text-blue-700',
  reviewing: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  withdrawn: 'bg-slate-100 text-slate-500',
}

export function ApplicationListPage() {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['ethics', 'applications', { status, page }],
    queryFn: () => ethicsApi.getApplications({ status, page, page_size: 20 }),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">伦理申请</h2>
        <PermissionGuard permission="ethics.application.create">
          <Link
            to="/applications/create"
            className="inline-flex min-h-11 items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建申请
          </Link>
        </PermissionGuard>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setStatus(opt.value); setPage(1) }}
            className={`shrink-0 min-h-11 px-3 py-1.5 text-sm rounded-md transition-colors ${
              status === opt.value
                ? 'bg-indigo-100 text-indigo-700 font-medium'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
            title={opt.label}
          >
            {opt.label}
          </button>
        ))}
      </div>

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
                <th className="px-4 py-3">申请编号</th>
                <th className="px-4 py-3">项目名称</th>
                <th className="px-4 py-3">申请类型</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">提交时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">
                    {item.application_no || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {item.protocol_title || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {item.application_type_display || item.application_type}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${STATUS_COLORS[item.status] || 'bg-slate-100 text-slate-600'}`}>
                      {item.status_display || item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/applications/${item.id}`} className="inline-flex min-h-9 items-center text-sm text-indigo-600 hover:text-indigo-800">
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
