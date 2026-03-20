/**
 * 知识委员会审核台 — 批量审核 pending_review 知识条目
 * 来源包括：哨塔报告沉淀、项目复盘沉淀、策略学习记录
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'

const ENTRY_TYPE_LABEL: Record<string, string> = {
  regulation: '法规',
  sop: 'SOP',
  method_reference: '方法参考',
  lesson_learned: '经验教训',
  proposal_template: '方案模板',
  faq: '常见问题',
}

const SOURCE_TYPE_LABEL: Record<string, string> = {
  project_retrospective: '项目复盘',
  evergreen_watch: '升级哨塔',
  agent_policy: '策略学习',
  manual: '人工录入',
}

type ReviewItem = {
  id: number
  entry_type: string
  title: string
  summary: string
  tags: string[]
  source_type: string
  source_id: number | null
  quality_score: number | null
  create_time: string
}

export default function KnowledgeReviewPage() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [filterSource, setFilterSource] = useState('')

  const { data: res, isLoading } = useQuery({
    queryKey: ['digital-workforce', 'knowledge-review', filterSource],
    queryFn: () =>
      (digitalWorkforcePortalApi as any).getKnowledgeReviewList({ limit: 80, source_type: filterSource }),
  })

  const reviewData = (res as any)?.data
  const items: ReviewItem[] = reviewData?.items ?? []
  const sourceStats: { source_type: string; count: number }[] = reviewData?.source_stats ?? []
  const total: number = reviewData?.total ?? 0

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'knowledge-review'] })
    setSelected(new Set())
  }

  const batchMut = useMutation({
    mutationFn: ({ action }: { action: 'publish' | 'reject' }) =>
      (digitalWorkforcePortalApi as any).batchKnowledgeReviewAction({
        entry_ids: Array.from(selected),
        action,
      }),
    onSuccess: invalidate,
  })

  const [showQualityReport, setShowQualityReport] = useState(false)
  const { data: qrRes, refetch: fetchQR, isFetching: qrLoading } = useQuery({
    queryKey: ['digital-workforce', 'knowledge-quality-report'],
    queryFn: () => (digitalWorkforcePortalApi as any).getKnowledgeQualityReport(100),
    enabled: false,
  })
  const qualityReport = (qrRes as any)?.data?.data

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map((i) => i.id)))
    }
  }

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const isPending = batchMut.isPending

  return (
    <div data-testid="knowledge-review-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">知识委员会审核台</h2>
          <p className="mt-1 text-sm text-slate-500">
            批量审核来自哨塔、复盘、策略的待审条目 · 共 {total} 条待审
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowQualityReport((v) => !v); if (!showQualityReport) fetchQR() }}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {qrLoading ? '分析中…' : showQualityReport ? '收起质量报告' : '质量抽查报告'}
          </button>
          <button
            disabled={selected.size === 0 || isPending}
            onClick={() => batchMut.mutate({ action: 'publish' })}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
          >
            批量发布 {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
          <button
            disabled={selected.size === 0 || isPending}
            onClick={() => batchMut.mutate({ action: 'reject' })}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-40"
          >
            批量拒绝
          </button>
        </div>
      </div>

      {/* 来源分类快速筛选 */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterSource('')}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filterSource === '' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          全部来源
        </button>
        {sourceStats.map((s) => (
          <button
            key={s.source_type}
            onClick={() => setFilterSource(s.source_type === filterSource ? '' : s.source_type)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterSource === s.source_type
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {SOURCE_TYPE_LABEL[s.source_type] ?? s.source_type} ({s.count})
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">
          加载中…
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          暂无待审核知识条目
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-10 px-4 py-2">
                  <input
                    type="checkbox"
                    aria-label="全选"
                    checked={selected.size === items.length && items.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">类型</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">标题</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">来源</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">质量分</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">标签</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">创建时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer hover:bg-slate-50 ${selected.has(row.id) ? 'bg-blue-50' : ''}`}
                  onClick={() => toggle(row.id)}
                >
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      aria-label={`选择条目 ${row.id}`}
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {ENTRY_TYPE_LABEL[row.entry_type] ?? row.entry_type}
                    </span>
                  </td>
                  <td className="max-w-[240px] px-4 py-2">
                    <div className="truncate text-sm font-medium text-slate-800" title={row.title}>
                      {row.title}
                    </div>
                    {row.summary && (
                      <div className="mt-0.5 truncate text-xs text-slate-500" title={row.summary}>
                        {row.summary}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-600">
                    {SOURCE_TYPE_LABEL[row.source_type] ?? row.source_type}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {row.quality_score != null ? (
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${
                          row.quality_score >= 70
                            ? 'bg-green-100 text-green-700'
                            : row.quality_score >= 50
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-50 text-red-500'
                        }`}
                      >
                        {row.quality_score}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>
                  <td className="max-w-[140px] px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(row.tags ?? []).slice(0, 3).map((tag) => (
                        <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                    {row.create_time?.slice(0, 16)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 质量抽查报告面板 */}
      {showQualityReport && qualityReport && (
        <div data-testid="quality-report-panel" className="rounded-xl border border-amber-200 bg-amber-50 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-amber-800">质量抽查报告</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white rounded-lg p-3 border border-amber-100">
              <p className="text-xl font-bold text-slate-800">{qualityReport.total_pending_review}</p>
              <p className="text-xs text-slate-500 mt-1">待审核总数</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-100">
              <p className="text-xl font-bold text-red-600">{qualityReport.low_quality_entries?.length ?? 0}</p>
              <p className="text-xs text-slate-500 mt-1">低质量（分&lt;50）</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-100">
              <p className="text-xl font-bold text-amber-600">{qualityReport.no_search_vector_entries?.length ?? 0}</p>
              <p className="text-xs text-slate-500 mt-1">无检索文本</p>
            </div>
          </div>
          {(qualityReport.recommendations ?? []).length > 0 && (
            <ul className="space-y-1">
              {qualityReport.recommendations.map((rec: string, i: number) => (
                <li key={i} className="text-sm text-amber-800">· {rec}</li>
              ))}
            </ul>
          )}
          {(qualityReport.by_source_quality ?? []).length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-600 mb-2">按来源平均质量分</h4>
              <div className="flex flex-wrap gap-2">
                {qualityReport.by_source_quality.map((s: any) => {
                  const sourceLabels: Record<string, string> = {
                    project_retrospective: '项目复盘',
                    evergreen_watch: '升级哨塔',
                    digital_worker_asset: '资产库',
                  }
                  return (
                    <span key={s.source_type} className="rounded bg-white border border-amber-200 px-2 py-1 text-xs">
                      {sourceLabels[s.source_type] ?? s.source_type}：
                      <strong>{s.avg_quality != null ? Number(s.avg_quality).toFixed(0) : '-'}</strong>分
                      （{s.count}条）
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 知识质量仪表盘 */}
      <KnowledgeQualityDashboard />
    </div>
  )
}


function KnowledgeQualityDashboard() {
  const { data: res } = useQuery({
    queryKey: ['digital-workforce', 'knowledge-quality-summary'],
    queryFn: () => digitalWorkforcePortalApi.getKnowledgeQualitySummary(),
  })

  const summaries = (res as { data?: { summaries?: Array<{ package_id: string; package_label: string; total_entries: number; published_entries: number; avg_quality_score: number; coverage_rate: number; expiry_rate: number; cite_rate_per_entry: number }> } })?.data?.summaries ?? []

  if (!summaries.length) return null

  return (
    <div data-testid="knowledge-quality-dashboard" className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-4">知识质量仪表盘（按专题包）</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-600">专题包</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-600">条目数</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-600">已发布</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-600">质量分</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-600">覆盖率</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-600">过期率</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-600">引用率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {summaries.map((s) => (
              <tr key={s.package_id} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-slate-700 font-medium">{s.package_label || s.package_id}</td>
                <td className="px-3 py-2 text-right text-slate-600">{s.total_entries}</td>
                <td className="px-3 py-2 text-right text-slate-600">{s.published_entries}</td>
                <td className="px-3 py-2 text-right">
                  <span className={s.avg_quality_score >= 60 ? 'text-green-600' : s.avg_quality_score >= 40 ? 'text-amber-600' : 'text-red-500'}>
                    {s.avg_quality_score.toFixed(0)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={s.coverage_rate >= 0.8 ? 'text-green-600' : s.coverage_rate >= 0.5 ? 'text-amber-600' : 'text-red-500'}>
                    {(s.coverage_rate * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className={s.expiry_rate > 0.1 ? 'text-red-500' : 'text-green-600'}>
                    {(s.expiry_rate * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-slate-600">{s.cite_rate_per_entry.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
