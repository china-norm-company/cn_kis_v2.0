import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { TransactionItem, TransactionStats } from '@cn-kis/api-client'
import { ArrowRightLeft, ChevronLeft, ChevronRight, Download } from 'lucide-react'

const TYPE_BADGE_COLORS: Record<string, string> = {
  sample_inbound: 'bg-green-50 text-green-700 border-green-200',
  consumable_inbound: 'bg-green-50 text-green-700 border-green-200',
  return: 'bg-green-50 text-green-700 border-green-200',
  return_inbound: 'bg-green-50 text-green-700 border-green-200',
  sample_distribute: 'bg-blue-50 text-blue-700 border-blue-200',
  consumable_issue: 'bg-blue-50 text-blue-700 border-blue-200',
  sample_return: 'bg-green-50 text-green-700 border-green-200',
  sample_destroy: 'bg-red-50 text-red-700 border-red-200',
  destroy: 'bg-red-50 text-red-700 border-red-200',
}

function getTypeBadgeColor(type: string): string {
  if (TYPE_BADGE_COLORS[type]) return TYPE_BADGE_COLORS[type]
  if (type.includes('inbound') || type.includes('return')) return 'bg-green-50 text-green-700 border-green-200'
  if (type.includes('distribute') || type.includes('issue')) return 'bg-blue-50 text-blue-700 border-blue-200'
  if (type.includes('destroy')) return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

export function TransactionPage() {
  const [typeFilter, setTypeFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)

  const { data: statsData } = useQuery({
    queryKey: ['material', 'transaction-stats'],
    queryFn: () => materialApi.getTransactionStats(),
  })
  const stats = (statsData as any)?.data as TransactionStats | undefined

  const { data: listData, isLoading } = useQuery({
    queryKey: ['material', 'transactions', { typeFilter, startDate, endDate, page }],
    queryFn: () => materialApi.listTransactions({
      transaction_type: typeFilter || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      page,
      page_size: 20,
    }),
  })

  const list = (listData as any)?.data as { items: TransactionItem[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  const statCards = [
    { label: '今日入库', value: stats?.today_inbound ?? '--', color: 'text-green-600' },
    { label: '今日出库', value: stats?.today_outbound ?? '--', color: 'text-blue-600' },
    { label: '本月总流水', value: stats?.month_total ?? '--', color: 'text-amber-600' },
    { label: '异常流水', value: stats?.abnormal_count ?? '--', color: 'text-red-600' },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">出入库流水</h2>
        <p className="text-sm text-slate-500 mt-1">产品与耗材的出库、入库、调拨记录</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <select
          title="操作类型筛选"
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="操作类型筛选"
        >
          <option value="">全部类型</option>
          <option value="sample_inbound">样品入库</option>
          <option value="consumable_inbound">耗材入库</option>
          <option value="sample_distribute">样品分发</option>
          <option value="consumable_issue">耗材领用</option>
          <option value="sample_return">样品回收</option>
          <option value="sample_destroy">样品销毁</option>
          <option value="return_inbound">退回入库</option>
        </select>
        <div className="flex shrink-0 items-center gap-2">
          <label className="text-sm text-slate-500" htmlFor="tx-start-date">开始日期</label>
          <input
            id="tx-start-date"
            type="date"
            title="开始日期"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
            className="min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="text-sm text-slate-500" htmlFor="tx-end-date">结束日期</label>
          <input
            id="tx-end-date"
            type="date"
            title="结束日期"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
            className="min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        {(typeFilter || startDate || endDate) && (
          <button
            onClick={() => { setTypeFilter(''); setStartDate(''); setEndDate(''); setPage(1) }}
            title="清除筛选"
            className="shrink-0 min-h-11 px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
          >
            清除筛选
          </button>
        )}
        <div className="ml-auto shrink-0">
          <button
            onClick={() => {
              materialApi.exportTransactions({
                format: 'csv',
                transaction_type: typeFilter || undefined,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
              })
            }}
            title="导出流水"
            className="inline-flex min-h-11 items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 transition-colors"
          >
            <Download className="w-4 h-4" />导出
          </button>
        </div>
      </div>

      {/* Transaction Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <ArrowRightLeft className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无流水记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">时间</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">操作类型</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">物料名称</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">编码</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">批号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">数量</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">操作人</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">关联单据</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">备注</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{item.create_time}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getTypeBadgeColor(item.transaction_type)}`}>
                      {item.type_display}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{item.material_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.material_code}</td>
                  <td className="px-4 py-3 text-slate-600">{item.batch_number || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.operator_name || '-'}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{item.related_document || '-'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-[160px] truncate">{item.remarks || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-slate-500">共 {list?.total ?? 0} 条记录</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="上一页"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-600 px-3">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
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
