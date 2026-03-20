/**
 * 哨塔报告详情页 — 展示 findings、推荐动作、关联知识条目
 */
import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { ArrowLeft, ExternalLink, Tag, BookOpen } from 'lucide-react'

export default function EvergreenWatchDetailPage() {
  const { reportId } = useParams<{ reportId: string }>()

  const { data: res, isLoading } = useQuery({
    queryKey: ['digital-workforce', 'evergreen-watch-report', reportId],
    queryFn: () => digitalWorkforcePortalApi.getEvergreenWatchReportDetail(Number(reportId)),
    enabled: !!reportId,
  })

  const report = (res as { data?: Record<string, unknown> })?.data

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-slate-400">加载中...</div>
  }

  if (!report) {
    return (
      <div className="space-y-4">
        <Link to="/upgrades" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> 返回哨塔列表
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">报告不存在</div>
      </div>
    )
  }

  const findings = report.findings as Record<string, unknown> | null
  const candidates = report.candidates as Record<string, unknown> | null
  const knowledgeTags = (report.knowledge_tags as string[]) ?? []
  const roleCodes = (report.role_codes as string[]) ?? []
  const linkedKnowledge = (report.linked_knowledge as Array<{ id: number; title: string; status: string; entry_type: string }>) ?? []

  return (
    <div data-testid="evergreen-watch-detail-page" className="space-y-6">
      <Link to="/upgrades" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
        <ArrowLeft className="h-4 w-4" /> 返回哨塔列表
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{report.source_name as string}</h2>
            <p className="mt-1 text-sm text-slate-500">{report.headline as string || '无摘要'}</p>
          </div>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{report.status as string}</span>
        </div>

        {report.source_url && (
          <a
            href={report.source_url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> 访问来源
          </a>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {knowledgeTags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
              <Tag className="h-3 w-3" /> {tag}
            </span>
          ))}
          {roleCodes.map((code) => (
            <span key={code} className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">{code}</span>
          ))}
        </div>
      </div>

      {findings && Object.keys(findings).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-slate-700">Findings</h3>
          <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-600">
            {JSON.stringify(findings, null, 2)}
          </pre>
        </div>
      )}

      {candidates && Object.keys(candidates).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-slate-700">推荐动作</h3>
          <pre className="mt-2 max-h-60 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-600">
            {JSON.stringify(candidates, null, 2)}
          </pre>
        </div>
      )}

      {linkedKnowledge.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <BookOpen className="h-4 w-4" /> 关联知识条目
          </h3>
          <ul className="mt-3 space-y-2">
            {linkedKnowledge.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{entry.title}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {entry.status} · {entry.entry_type}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-400">创建时间: {(report.created_at as string)?.slice(0, 19)}</p>
    </div>
  )
}
