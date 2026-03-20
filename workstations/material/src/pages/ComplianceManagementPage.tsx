import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { ProductUsageItem, ProductItem } from '@cn-kis/api-client'
import {
  ClipboardList,
  Percent,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Filter,
  Flag,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const DEVIATION_TYPES = [
  { value: 'under_usage', label: '用量不足' },
  { value: 'over_usage', label: '用量过多' },
  { value: 'no_usage', label: '未使用' },
  { value: 'time_deviation', label: '时间偏差' },
  { value: 'other', label: '其他' },
] as const

const SEVERITY_OPTIONS = [
  { value: 'minor', label: '轻微' },
  { value: 'major', label: '严重' },
] as const

type UsageWithProduct = ProductUsageItem & { product_name?: string; protocol_title?: string }

const COMPLIANCE_STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'compliant', label: '合规' },
  { value: 'minor_deviation', label: '轻微偏差' },
  { value: 'major_deviation', label: '严重偏差' },
] as const

function ComplianceStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    compliant: { label: '合规', className: 'bg-green-50 text-green-700 border-green-200' },
    minor_deviation: { label: '轻微偏差', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    major_deviation: { label: '严重偏差', className: 'bg-red-50 text-red-700 border-red-200' },
  }
  const cfg = config[status] ?? { label: status, className: 'bg-slate-50 text-slate-600 border-slate-200' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

export function ComplianceManagementPage() {
  const queryClient = useQueryClient()
  const [productFilter, setProductFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [complianceFilter, setComplianceFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const [deviationRecordId, setDeviationRecordId] = useState<number | null>(null)

  const { data: usagesData, isLoading } = useQuery({
    queryKey: [
      'material',
      'usages',
      { productFilter, subjectFilter, complianceFilter, startDate, endDate, page },
    ],
    queryFn: () =>
      materialApi.listUsages({
        product_id: productFilter ? Number(productFilter) : undefined,
        subject_id: subjectFilter ? Number(subjectFilter) : undefined,
        compliance_status: complianceFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
        page_size: 20,
      }),
  })

  const { data: productsData } = useQuery({
    queryKey: ['material', 'products-list'],
    queryFn: () => materialApi.listProducts({ page_size: 200 }),
  })

  const { data: dispensingsData } = useQuery({
    queryKey: ['material', 'dispensings-list'],
    queryFn: () => materialApi.listDispensings({ page_size: 500 }),
  })

  const products = (productsData as any)?.data?.items ?? ([] as ProductItem[])
  const dispensings = (dispensingsData as any)?.data?.items ?? []
  const dispensingToProduct = useMemo(() => {
    const m = new Map<number, string>()
    dispensings.forEach((d: { id: number; product_name: string }) => {
      m.set(d.id, d.product_name)
    })
    return m
  }, [dispensings])
  const list = (usagesData as any)?.data as { items: UsageWithProduct[]; total: number } | undefined
  const usages = list?.items ?? []
  const total = list?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  const stats = useMemo(() => {
    const compliant = usages.filter((u) => u.compliance_status === 'compliant').length
    const minor = usages.filter((u) => u.compliance_status === 'minor_deviation').length
    const major = usages.filter((u) => u.compliance_status === 'major_deviation').length
    const pending = usages.filter((u) => !u.deviation_reported && (minor || major)).length
    const rate = usages.length ? Math.round((compliant / usages.length) * 100) : 0
    return {
      totalRecords: total,
      complianceRate: rate,
      deviationCount: minor + major,
      pendingCount: pending,
    }
  }, [usages, total])

  const complianceByProduct = useMemo(() => {
    const byProduct = new Map<string, { compliant: number; total: number }>()
    usages.forEach((u) => {
      const name = dispensingToProduct.get(u.dispensing_id) ?? '未知产品'
      const cur = byProduct.get(name) ?? { compliant: 0, total: 0 }
      cur.total += 1
      if (u.compliance_status === 'compliant') cur.compliant += 1
      byProduct.set(name, cur)
    })
    return Array.from(byProduct.entries()).map(([name, data]) => ({
      product: name,
      rate: data.total ? Math.round((data.compliant / data.total) * 100) : 0,
      compliant: data.compliant,
      total: data.total,
    }))
  }, [usages, dispensingToProduct])

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">依从性管理</h2>
          <p className="text-sm text-slate-500 mt-1">使用记录合规追踪与偏差管理</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500 flex items-center gap-1">
            <ClipboardList className="w-4 h-4" /> 总使用记录
          </p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{stats.totalRecords}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500 flex items-center gap-1">
            <Percent className="w-4 h-4" /> 依从率
          </p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.complianceRate}%</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500 flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> 偏差数
          </p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.deviationCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500 flex items-center gap-1">
            <Clock className="w-4 h-4" /> 待处理
          </p>
          <p className="text-2xl font-bold text-red-600 mt-1">{stats.pendingCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <div className="flex shrink-0 items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={productFilter}
            onChange={(e) => { setProductFilter(e.target.value); setPage(1) }}
            className="min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
            aria-label="产品筛选"
          >
            <option value="">全部产品</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          placeholder="受试者编号"
          value={subjectFilter}
          onChange={(e) => { setSubjectFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm w-32 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <select
          value={complianceFilter}
          onChange={(e) => { setComplianceFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="合规状态"
        >
          {COMPLIANCE_STATUS_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          placeholder="开始日期"
        />
        <span className="shrink-0 text-slate-400">至</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          placeholder="结束日期"
        />
      </div>

      {/* Compliance rate chart */}
      {complianceByProduct.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-800 mb-4">各产品依从率</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={complianceByProduct} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="product" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
                        <p className="font-medium text-slate-800">{payload[0].payload.product}</p>
                        <p className="text-slate-600">依从率: {payload[0].payload.rate}%</p>
                        <p className="text-slate-500 text-xs">
                          {payload[0].payload.compliant} / {payload[0].payload.total} 合规
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="rate" name="依从率" radius={[4, 4, 0, 0]}>
                  {complianceByProduct.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.rate >= 90 ? '#22c55e' : entry.rate >= 70 ? '#f59e0b' : '#ef4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Usage records table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h3 className="text-base font-semibold text-slate-800 px-6 py-4 border-b border-slate-200">
          使用记录
        </h3>
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : usages.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无使用记录</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">受试者编号</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">产品</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">使用日期</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">应用量</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">实际用量</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">合规状态</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">偏差类型</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {usages.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-800">{u.subject_code}</td>
                    <td className="px-4 py-3 text-slate-600">{dispensingToProduct.get(u.dispensing_id) ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {u.period_start} ~ {u.period_end}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-800">{u.expected_usage}</td>
                    <td className="px-4 py-3 text-right text-slate-800">{u.actual_usage ?? '-'}</td>
                    <td className="px-4 py-3">
                      <ComplianceStatusBadge status={u.compliance_status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {u.deviation_reported ? '已标记' : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDeviationRecordId(u.id)}
                        className="inline-flex min-h-9 items-center gap-1 px-2 py-1 text-amber-600 hover:bg-amber-50 rounded text-xs font-medium transition-colors"
                      >
                        <Flag className="w-3.5 h-3.5" /> 标记偏差
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {totalPages > 1 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-t border-slate-200">
                <span className="text-sm text-slate-500">共 {total} 条记录</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="min-h-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                    title="上一页"
                    aria-label="上一页"
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden />
                  </button>
                  <span className="text-sm text-slate-600 px-2">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="min-h-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                    title="下一页"
                    aria-label="下一页"
                  >
                    <ChevronRight className="w-4 h-4" aria-hidden />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Deviation modal */}
      {deviationRecordId && (
        <DeviationModal
          usageId={deviationRecordId}
          onClose={() => setDeviationRecordId(null)}
          onSuccess={() => {
            setDeviationRecordId(null)
            queryClient.invalidateQueries({ queryKey: ['material', 'usages'] })
          }}
        />
      )}
    </div>
  )
}

function DeviationModal({
  usageId,
  onClose,
  onSuccess,
}: {
  usageId: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [deviationType, setDeviationType] = useState<string>(DEVIATION_TYPES[0].value)
  const [deviationNotes, setDeviationNotes] = useState('')
  const [severity, setSeverity] = useState<string>('minor')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      materialApi.updateUsage(usageId, {
        deviation_reported: true,
        deviation_type: deviationType,
        deviation_description: deviationNotes || undefined,
        severity,
        compliance_status: severity === 'major' ? 'major_deviation' : 'minor_deviation',
      }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '标记失败'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[92vw] max-w-[480px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">标记偏差</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
          )}
          <label className="block">
            <span className="text-sm font-medium text-slate-700">偏差类型</span>
            <select
              value={deviationType}
              onChange={(e) => setDeviationType(e.target.value)}
              className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              {DEVIATION_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">严重程度</span>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="mt-1 w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">偏差说明</span>
            <textarea
              value={deviationNotes}
              onChange={(e) => setDeviationNotes(e.target.value)}
              rows={3}
              placeholder="可选，描述偏差详情"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>
          <div className="pt-2 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex-1 min-h-11 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '提交中...' : '确认标记'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
