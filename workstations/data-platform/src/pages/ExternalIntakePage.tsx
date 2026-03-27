import { useState, useEffect } from 'react'
import {
  Inbox, RefreshCw, CheckCircle, XCircle, Clock, Zap,
  ChevronDown, ChevronUp, ArrowRight, AlertTriangle, BarChart2,
} from 'lucide-react'
import { dataPlatformApi } from '@cn-kis/api-client'

interface WorkstationSummary {
  pending: number
  approved: number
  rejected: number
  ingested: number
  auto_ingested: number
}

interface SourceStat {
  source_type: string
  count: number
}

interface TrendPoint {
  day: string
  count: number
}

interface GovernanceSummary {
  total_candidates: number
  pending_total: number
  ingested_total: number
  high_confidence_pending: number
  avg_confidence: number
  by_workstation: Record<string, WorkstationSummary>
  by_source_type: Record<string, number>
  recent_ingested_trend: TrendPoint[]
}

const WS_LABELS: Record<string, string> = {
  execution: '执行工作台',
  quality: '质量工作台',
  finance: '财务工作台',
  hr: '人事工作台',
  lab_personnel: '实验室人员',
  research: '研究工作台',
  crm: 'CRM工作台',
}

const SOURCE_LABELS: Record<string, string> = {
  lims: 'LIMS实验室系统',
  feishu_mail: '飞书邮件',
  feishu_im: '飞书消息',
  feishu_doc: '飞书文档',
  feishu_approval: '飞书审批',
  feishu_calendar: '飞书日历',
  ekuaibao: '易快报',
}

const STATUS_STYLE = {
  pending:   { label: '待审核', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  approved:  { label: '已批准', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  rejected:  { label: '已拒绝', color: 'text-red-600 bg-red-50 border-red-200' },
  ingested:  { label: '已接入', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  auto_ingested: { label: '自动接入', color: 'text-purple-600 bg-purple-50 border-purple-200' },
}

function ConfidenceBadge({ score }: { score: number }) {
  if (score >= 0.8) return (
    <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
      高 {Math.round(score * 100)}%
    </span>
  )
  if (score >= 0.5) return (
    <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
      中 {Math.round(score * 100)}%
    </span>
  )
  return (
    <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
      低 {Math.round(score * 100)}%
    </span>
  )
}

async function fetchGovernanceSummary(): Promise<GovernanceSummary | null> {
  try {
    const r = await dataPlatformApi.intakeOverview()
    return (r as any)?.data ?? null
  } catch {
    return null
  }
}

async function triggerPopulate(sourceType = '') {
  const params = sourceType ? { source_type: sourceType, limit: 500 } : { limit: 500 }
  return dataPlatformApi.populateAllCandidates(params)
}

async function fetchCandidateTrace(candidateId: number) {
  return dataPlatformApi.traceCandidate(candidateId)
}

function CandidateTracePanel() {
  const [inputId, setInputId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  const handleTrace = async () => {
    const id = parseInt(inputId.trim(), 10)
    if (!id || isNaN(id)) { setError('请输入有效的候选记录 ID'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetchCandidateTrace(id)
      if (res?.code === 404) { setError(`候选 ID=${id} 不存在`); return }
      setResult(res?.data ?? res)
    } catch {
      setError('追溯查询失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <ArrowRight className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-700">候选记录追溯链查询</h3>
        <span className="text-xs text-slate-400">输入候选 ID 查看该记录从原始来源到接入结果的完整链路</span>
      </div>
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={inputId}
            onChange={e => setInputId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTrace()}
            placeholder="候选记录 ID（如 42）"
            className="w-44 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <button
            onClick={handleTrace}
            disabled={loading || !inputId}
            className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
            追溯链
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {result && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="bg-green-100 border border-green-300 text-green-800 rounded px-2 py-1 font-mono">
                来源: {result.source_type} #{result.source_raw_id}
              </div>
              <ArrowRight className="w-3 h-3 text-slate-400" />
              <div className={`border rounded px-2 py-1 font-mono ${
                result.status === 'ingested' || result.status === 'auto_ingested'
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                  : result.status === 'pending'
                  ? 'bg-amber-100 border-amber-300 text-amber-800'
                  : 'bg-blue-100 border-blue-300 text-blue-800'
              }`}>
                候选 #{result.candidate_id} · {result.status}
              </div>
              {result.ingestion_result && (
                <>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                  <div className="bg-purple-100 border border-purple-300 text-purple-800 rounded px-2 py-1 font-mono">
                    已接入 → {result.ingestion_result.target_workstation ?? '未知工作台'}
                  </div>
                </>
              )}
            </div>
            <div className="text-slate-500">
              <span className="text-slate-400">内容预览：</span>{result.content_preview ?? '—'}
              &emsp;
              <span className="text-slate-400">置信度：</span>
              {result.confidence_score ? `${Math.round(result.confidence_score * 100)}%` : '—'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function ExternalIntakePage() {
  const [summary, setSummary] = useState<GovernanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [populating, setPopulating] = useState(false)
  const [expandedWs, setExpandedWs] = useState<string | null>(null)
  const [populateResult, setPopulateResult] = useState<string | null>(null)

  const loadData = () => {
    setLoading(true)
    fetchGovernanceSummary().then(d => {
      setSummary(d)
      setLoading(false)
    })
  }

  useEffect(() => { loadData() }, [])

  const handlePopulate = async (sourceType = '') => {
    setPopulating(true)
    setPopulateResult(null)
    try {
      const res = await triggerPopulate(sourceType)
      setPopulateResult(res?.data?.message ?? '生成完成')
      loadData()
    } catch {
      setPopulateResult('操作失败，请检查控制台')
    } finally {
      setPopulating(false)
    }
  }

  const summaryCards = [
    {
      label: '全部候选',
      value: summary?.total_candidates ?? '-',
      icon: Inbox,
      color: 'text-slate-600 bg-slate-50',
    },
    {
      label: '待审核',
      value: summary?.pending_total ?? '-',
      icon: Clock,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: '高置信待审',
      value: summary?.high_confidence_pending ?? '-',
      icon: Zap,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: '已接入',
      value: summary?.ingested_total ?? '-',
      icon: CheckCircle,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: '平均置信度',
      value: summary ? `${Math.round((summary.avg_confidence ?? 0) * 100)}%` : '-',
      icon: BarChart2,
      color: 'text-purple-600 bg-purple-50',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">外部数据接入治理</h2>
          <p className="text-sm text-slate-500 mt-1">
            飞书、LIMS、易快报数据经清洗映射后，等待各工作台人工审核接入
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePopulate()}
            disabled={populating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${populating ? 'animate-spin' : ''}`} />
            {populating ? '生成中…' : '生成候选记录'}
          </button>
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            刷新
          </button>
        </div>
      </div>

      {populateResult && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-3">
          {populateResult}
        </div>
      )}

      {/* 汇总卡片 */}
      <div className="grid grid-cols-5 gap-4">
        {summaryCards.map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">{c.label}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{c.value}</p>
              </div>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.color}`}>
                <c.icon className="w-4 h-4" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 各工作台明细 */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">各工作台接入状态</h3>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {Object.entries(WS_LABELS).map(([ws, label]) => {
              const s = summary?.by_workstation?.[ws] ?? {}
              const pending = (s as any).pending ?? 0
              const ingested = ((s as any).ingested ?? 0) + ((s as any).auto_ingested ?? 0)
              const rejected = (s as any).rejected ?? 0
              const total = Object.values(s as Record<string, number>).reduce((a, b) => a + b, 0)
              const isExpanded = expandedWs === ws

              return (
                <div key={ws}>
                  <button
                    className="w-full flex items-center px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                    onClick={() => setExpandedWs(isExpanded ? null : ws)}
                  >
                    <div className="flex-1 flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-700">{label}</span>
                      {pending > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          {pending} 待审核
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mr-3">
                      <span className="text-xs text-slate-400">共 {total} 条</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-emerald-600">{ingested} 已接入</span>
                        <span className="text-xs text-red-500">{rejected} 已拒绝</span>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-4 bg-slate-50">
                      <div className="grid grid-cols-5 gap-2 mb-3">
                        {Object.entries(STATUS_STYLE).map(([st, cfg]) => (
                          <div key={st} className={`rounded-lg border px-3 py-2 text-center ${cfg.color}`}>
                            <p className="text-lg font-bold">{(s as any)[st] ?? 0}</p>
                            <p className="text-xs mt-0.5">{cfg.label}</p>
                          </div>
                        ))}
                      </div>
                      <a
                        href={`#/external-intake`}
                        className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                      >
                        <ArrowRight className="w-3 h-3" />
                        前往该工作台审核
                      </a>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 来源类型分布 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">来源类型分布</h3>
          {summary?.by_source_type && Object.keys(summary.by_source_type).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(summary.by_source_type)
                .sort(([, a], [, b]) => b - a)
                .map(([src, cnt]) => {
                  const total = Object.values(summary.by_source_type).reduce((a, b) => a + b, 0)
                  const pct = total > 0 ? Math.round((cnt / total) * 100) : 0
                  return (
                    <div key={src}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-600">{SOURCE_LABELS[src] ?? src}</span>
                        <span className="text-slate-500">{cnt} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full">
                        <div
                          className="h-1.5 bg-primary-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : (
            <p className="text-sm text-slate-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              暂无数据，点击「生成候选记录」从原始层创建候选
            </p>
          )}
        </div>

        {/* 最近7天接入趋势 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">近7天接入趋势</h3>
          {summary?.recent_ingested_trend && summary.recent_ingested_trend.length > 0 ? (
            <div className="space-y-2">
              {summary.recent_ingested_trend.map(p => (
                <div key={p.day} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-20 shrink-0">{p.day}</span>
                  <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-4 bg-emerald-400 rounded-full"
                      style={{
                        width: `${Math.min(100, (p.count / Math.max(...summary.recent_ingested_trend.map(x => x.count))) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-slate-600 w-6 text-right">{p.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">近7天暂无接入记录</p>
          )}
        </div>
      </div>

      {/* 候选记录追溯链查询 */}
      <CandidateTracePanel />
    </div>
  )
}
