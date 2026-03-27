import { useState, useEffect } from 'react'
import {
  Database, RefreshCw, ChevronRight, Layers, Shield, Lock,
  Target, AlertTriangle, Clock, Users, FileText,
} from 'lucide-react'
import { dataPlatformApi } from '@cn-kis/api-client'

const LIFECYCLE_STAGE_CONFIG: Record<string, { label: string; color: string; badge: string }> = {
  raw:       { label: '外部原始层', color: 'text-red-700 bg-red-50 border-red-200',       badge: 'bg-red-100 text-red-700' },
  staging:   { label: '接入暂存层', color: 'text-amber-700 bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-700' },
  formal:    { label: '正式业务层', color: 'text-blue-700 bg-blue-50 border-blue-200',     badge: 'bg-blue-100 text-blue-700' },
  content:   { label: '内容信号层', color: 'text-indigo-700 bg-indigo-50 border-indigo-200', badge: 'bg-indigo-100 text-indigo-700' },
  knowledge: { label: '知识资产层', color: 'text-violet-700 bg-violet-50 border-violet-200', badge: 'bg-violet-100 text-violet-700' },
  meta:      { label: '治理元数据层', color: 'text-slate-700 bg-slate-50 border-slate-200', badge: 'bg-slate-100 text-slate-700' },
}

const DOMAIN_TYPE_CONFIG: Record<string, { label: string; icon: string }> = {
  external:  { label: '外部来源', icon: '🌐' },
  staging:   { label: '暂存流转', icon: '⏳' },
  business:  { label: '业务核心', icon: '🏢' },
  content:   { label: '内容信号', icon: '📡' },
  knowledge: { label: '知识资产', icon: '🧠' },
  meta:      { label: '治理元数据', icon: '🔧' },
}

const DOMAIN_COLOR_MAP: Record<string, string> = {
  red:     'text-red-700 bg-red-50 border-red-200',
  amber:   'text-amber-700 bg-amber-50 border-amber-200',
  rose:    'text-rose-700 bg-rose-50 border-rose-200',
  blue:    'text-blue-700 bg-blue-50 border-blue-200',
  purple:  'text-purple-700 bg-purple-50 border-purple-200',
  emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  teal:    'text-teal-700 bg-teal-50 border-teal-200',
  indigo:  'text-indigo-700 bg-indigo-50 border-indigo-200',
  violet:  'text-violet-700 bg-violet-50 border-violet-200',
  slate:   'text-slate-700 bg-slate-50 border-slate-200',
}

const REG_CONFIG: Record<string, { label: string; color: string }> = {
  'REG-GCP': { label: 'GCP', color: 'bg-purple-50 text-purple-600 border-purple-100' },
  'REG-PI':  { label: 'PIPL', color: 'bg-rose-50 text-rose-600 border-rose-100' },
  'REG-TAX': { label: '税法', color: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  'REG-INT': { label: '内规', color: 'bg-slate-100 text-slate-500 border-slate-200' },
}

export function DomainsPage() {
  const [domains, setDomains] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [domainDetail, setDomainDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    dataPlatformApi.listDomains()
      .then(res => {
        const data = (res as any)?.data ?? {}
        setDomains(data.domains ?? [])
        setSummary(data.summary ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const loadDetail = (domain: any) => {
    setSelected(domain)
    setDomainDetail(null)
    setDetailLoading(true)
    dataPlatformApi.getDomain(domain.domain_id)
      .then(res => setDomainDetail((res as any)?.data ?? null))
      .catch(() => setDomainDetail(null))
      .finally(() => setDetailLoading(false))
  }

  const stages = ['raw', 'staging', 'formal', 'content', 'knowledge', 'meta']
  const byStage = stages.map(s => ({
    stage: s,
    config: LIFECYCLE_STAGE_CONFIG[s],
    domains: domains.filter(d => d.lifecycle_stage === s),
  })).filter(g => g.domains.length > 0)

  const colorClass = (color: string) => DOMAIN_COLOR_MAP[color] || 'text-slate-700 bg-slate-50 border-slate-200'

  return (
    <div className="space-y-4">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">数据域地图</h2>
          <p className="text-sm text-slate-500 mt-1">按数据类型、业务归属和生命周期层组织的 10 个数据域</p>
        </div>
        {summary && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-500">{summary.total_domains} 个数据域</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500">{summary.total_tables} 张核心表</span>
          </div>
        )}
      </div>

      <div className="flex gap-4 h-[calc(100vh-200px)]">
        {/* 左侧：域列表（按生命周期分组） */}
        <div className="w-72 shrink-0 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            byStage.map(({ stage, config, domains: stageDomains }) => (
              <div key={stage} className="space-y-1">
                <div className={`text-[10px] font-semibold px-3 py-1 rounded-lg border ${config.color}`}>
                  {config.label}（{stageDomains.length} 域）
                </div>
                {stageDomains.map(domain => (
                  <button
                    key={domain.domain_id}
                    onClick={() => loadDetail(domain)}
                    className={`w-full text-left bg-white rounded-xl border p-3 hover:shadow-sm transition-all ${
                      selected?.domain_id === domain.domain_id
                        ? 'border-blue-400 shadow-sm ring-1 ring-blue-200'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`mt-1 w-2 h-2 rounded-full shrink-0 bg-${domain.color}-400`} style={{ background: `var(--color-${domain.color}-400, #94a3b8)` }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{domain.label}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{domain.description}</p>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {(domain.regulatory ?? []).map((reg: string) => (
                            <span key={reg} className={`text-[10px] px-1.5 py-0.5 rounded border ${REG_CONFIG[reg]?.color || 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                              {REG_CONFIG[reg]?.label ?? reg}
                            </span>
                          ))}
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* 右侧：域详情 */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {selected ? (
            <>
              {/* 域头部 */}
              <div className={`rounded-xl border p-5 ${colorClass(selected.color)}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <Database className="w-6 h-6 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold">{selected.label}</h2>
                        {selected.domain_type && (
                          <span className="text-xs px-2 py-0.5 rounded bg-white/50 border border-current/20 font-medium opacity-80">
                            {DOMAIN_TYPE_CONFIG[selected.domain_type]?.icon} {DOMAIN_TYPE_CONFIG[selected.domain_type]?.label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-1 opacity-80">{selected.description}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${LIFECYCLE_STAGE_CONFIG[selected.lifecycle_stage]?.badge || ''} border-transparent`}>
                          {LIFECYCLE_STAGE_CONFIG[selected.lifecycle_stage]?.label || selected.lifecycle_stage}
                        </span>
                        <code className="text-[11px] opacity-60 font-mono">{selected.domain_id}</code>
                      </div>
                    </div>
                  </div>
                  {detailLoading && <RefreshCw className="w-4 h-4 animate-spin shrink-0 opacity-60" />}
                </div>
              </div>

              {/* 核心职责 */}
              {selected.core_responsibilities?.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-blue-600" />
                    <h3 className="text-sm font-semibold text-slate-700">核心职责</h3>
                  </div>
                  <ul className="space-y-2">
                    {selected.core_responsibilities.map((r: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="w-5 h-5 shrink-0 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 治理重点 + 保留期 */}
              <div className="grid grid-cols-2 gap-4">
                {selected.governance_focus?.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="w-4 h-4 text-purple-600" />
                      <h3 className="text-sm font-semibold text-slate-700">治理重点</h3>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.governance_focus.map((f: string) => (
                        <span key={f} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-100">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-semibold text-slate-700">保留期要求</h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {selected.retention_expectation || '未定义保留期要求'}
                  </p>
                </div>
              </div>

              {/* 包含表（实时行数） */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-700">包含表（实时行数）</h3>
                  </div>
                  <span className="text-xs text-slate-400">{selected.tables?.length ?? 0} 张表</span>
                </div>
                <div className="space-y-2">
                  {domainDetail?.table_stats?.length > 0 ? (
                    domainDetail.table_stats.map((ts: any) => (
                      <div key={ts.table} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-lg">
                        <code className="text-xs font-mono text-slate-600 flex-1">{ts.table}</code>
                        {ts.approx_rows != null && (
                          <span className="text-xs font-mono text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
                            {ts.approx_rows.toLocaleString()} 行
                          </span>
                        )}
                        {ts.classification?.is_phi && (
                          <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100 shrink-0">PHI</span>
                        )}
                        {ts.classification?.security_level && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded shrink-0">
                            {ts.classification.security_level}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    selected.tables?.map((tbl: string) => (
                      <div key={tbl} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-lg">
                        <code className="text-xs font-mono text-slate-600">{tbl}</code>
                        {detailLoading && <div className="w-16 h-4 bg-slate-200 rounded animate-pulse ml-auto" />}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 元信息：责任人 + 来源 App + 合规 */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 grid grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <p className="text-xs text-slate-400">数据责任人</p>
                  </div>
                  <p className="text-sm font-medium text-slate-700">{selected.owner_role}</p>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Database className="w-3.5 h-3.5 text-slate-400" />
                    <p className="text-xs text-slate-400">来源 App</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selected.source_apps?.map((a: string) => (
                      <code key={a} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{a}</code>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <p className="text-xs text-slate-400">合规管辖</p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {selected.regulatory?.map((r: string) => (
                      <span key={r} className={`text-xs px-2 py-0.5 rounded border font-medium ${REG_CONFIG[r]?.color || 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {REG_CONFIG[r]?.label ?? r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400">
              <div className="text-center">
                <Layers className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p className="text-sm font-medium">从左侧选择一个数据域查看详情</p>
                <p className="text-xs text-slate-300 mt-1">
                  共 {domains.length} 个数据域，覆盖 6 个生命周期层
                </p>
                {!loading && summary && (
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center max-w-xs mx-auto">
                    {Object.entries(summary.by_domain_type ?? {}).map(([type, info]: [string, any]) => (
                      info.count > 0 ? (
                        <div key={type} className="bg-white rounded-lg border border-slate-200 p-2">
                          <p className="text-lg font-bold text-slate-700">{info.count}</p>
                          <p className="text-[10px] text-slate-400">
                            {DOMAIN_TYPE_CONFIG[type]?.label ?? type}
                          </p>
                        </div>
                      ) : null
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
