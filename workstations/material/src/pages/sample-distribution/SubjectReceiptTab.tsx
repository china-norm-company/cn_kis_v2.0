/**
 * 受试者签收 - 展示小程序提交的样品签收数据
 * 数据来源：受试者在小程序「我的产品」中确认签收后，同步到 ProductDispensing
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { ProductDispensingItem } from '@cn-kis/api-client'
import { ClipboardList, ChevronLeft, ChevronRight, Smartphone } from 'lucide-react'

const DISPENSING_STATUS_STYLES: Record<string, string> = {
  planned: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  prepared: 'bg-blue-50 text-blue-700 border-blue-200',
  dispensed: 'bg-green-50 text-green-700 border-green-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
}

const DISPENSING_STATUS_LABELS: Record<string, string> = {
  planned: '计划中',
  prepared: '已备货',
  dispensed: '已分发',
  confirmed: '已确认',
  cancelled: '已取消',
}

function formatDateTime(v: string | null | undefined): string {
  if (!v) return '—'
  return String(v).replace('T', ' ').slice(0, 19)
}

export function SubjectReceiptTab() {
  const [statusFilter, setStatusFilter] = useState<string>('confirmed')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data: listData, isLoading } = useQuery({
    queryKey: ['material', 'subject-receipts', { statusFilter, page }],
    queryFn: () =>
      materialApi.listDispensings({
        status: statusFilter || undefined,
        page,
        page_size: pageSize,
      }),
  })

  const list = listData as { items?: ProductDispensingItem[]; total?: number } | undefined
  const items = list?.items ?? []
  const total = list?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">小程序签收联动</p>
            <p className="mt-0.5 text-amber-700">
              受试者在微信小程序「我的产品」中确认签收后，数据会同步到此处。状态为「已确认」即表示受试者已完成签收。
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="状态筛选"
        >
          <option value="">全部状态</option>
          <option value="confirmed">已确认（受试者已签收）</option>
          <option value="dispensed">已分发（待签收）</option>
          <option value="prepared">已备货</option>
          <option value="planned">计划中</option>
          <option value="cancelled">已取消</option>
        </select>
        <span className="text-sm text-slate-500">共 {total} 条</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">
              {statusFilter === 'confirmed' ? '暂无受试者签收记录' : '暂无分发记录'}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              受试者在小程序中确认签收后，数据将在此展示
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">分发单号</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">受试者</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">访视</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">产品</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">数量</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">签收时间</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.dispensing_no}</td>
                    <td className="px-4 py-3 text-slate-800">{item.subject_code}</td>
                    <td className="px-4 py-3 text-slate-600">{item.visit_code || '—'}</td>
                    <td className="px-4 py-3 text-slate-800">{item.product_name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.quantity_dispensed}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                          DISPENSING_STATUS_STYLES[item.status] || 'bg-slate-50 text-slate-600'
                        }`}
                      >
                        {DISPENSING_STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {item.status === 'confirmed' ? formatDateTime(item.confirmed_at) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-slate-500">共 {total} 条记录</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="min-h-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="上一页"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-600 px-3">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="min-h-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="下一页"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
