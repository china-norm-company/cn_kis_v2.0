import { useState, useEffect } from 'react'
import { Layers, RefreshCw, ArrowRight, AlertTriangle, CheckCircle, ArrowDownCircle } from 'lucide-react'
import { dataPlatformApi } from '@cn-kis/api-client'

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; bar: string }> = {
  raw:       { bg: 'bg-red-50',     border: 'border-red-200',    text: 'text-red-700',     badge: 'bg-red-100 text-red-700',     bar: 'bg-red-300' },
  staging:   { bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',   badge: 'bg-amber-100 text-amber-700', bar: 'bg-amber-300' },
  formal:    { bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-700',    badge: 'bg-blue-100 text-blue-700',   bar: 'bg-blue-300' },
  content:   { bg: 'bg-indigo-50',  border: 'border-indigo-200', text: 'text-indigo-700',  badge: 'bg-indigo-100 text-indigo-700', bar: 'bg-indigo-300' },
  knowledge: { bg: 'bg-violet-50',  border: 'border-violet-200', text: 'text-violet-700',  badge: 'bg-violet-100 text-violet-700', bar: 'bg-violet-300' },
  meta:      { bg: 'bg-slate-50',   border: 'border-slate-200',  text: 'text-slate-700',   badge: 'bg-slate-100 text-slate-700', bar: 'bg-slate-300' },
}

// 各层主要对象和流转语义
const STAGE_SEMANTICS: Record<string, { objects: string[]; flows_to: string; stranded_risk: string }> = {
  raw:       { objects: ['LIMS 原始记录', '易快报原始记录'], flows_to: '生成接入候选 → 接入暂存层', stranded_risk: 'injection_status=pending 超 7 天' },
  staging:   { objects: ['外部接入候选（t_ext_ingest_candidate）'], flows_to: '人工审核批准 → 正式业务层', stranded_risk: 'review_status=pending 超 3 天' },
  formal:    { objects: ['受试者、协议、访视、工单、EDC、质量、财务、人事'], flows_to: '飞书采集上下文 → 内容信号层', stranded_risk: '业务数据孤岛（无关联记录）' },
  content:   { objects: ['PersonalContext（邮件、IM、任务、日历）'], flows_to: '知识入库 Pipeline → 知识资产层', stranded_risk: 'PersonalContext 未转化为 KnowledgeEntry' },
  knowledge: { objects: ['KnowledgeEntry、KnowledgeEntity、KnowledgeRelation'], flows_to: 'Qwen3-embedding 向量化 → Qdrant 索引', stranded_risk: 'index_status=pending/failed 积压' },
  meta:      { objects: ['账号、角色、权限、会话 Token、飞书 Token、审计日志'], flows_to: '（元数据层，不向上流转）', stranded_risk: '过期 Token 未清理' },
}

export function LifecyclePage() {
  const [stages, setStages] = useState<any[]>([])
  const [byDomain, setByDomain] = useState<any[]>([])
  const [stranded, setStranded] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<string>('')

  const loadData = () => {
    setLoading(true)
    Promise.allSettled([
      dataPlatformApi.lifecycleOverview(),
      dataPlatformApi.lifecycleByDomain(),
      dataPlatformApi.lifecycleStranded(),
    ]).then(([stagesRes, domainRes, strandRes]) => {
      if (stagesRes.status === 'fulfilled') setStages(((stagesRes.value as any)?.data?.stages) ?? [])
      if (domainRes.status === 'fulfilled') setByDomain(((domainRes.value as any)?.data?.items) ?? [])
      if (strandRes.status === 'fulfilled') setStranded((strandRes.value as any)?.data ?? null)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  const filteredDomains = activeFilter ? byDomain.filter(d => d.lifecycle_stage === activeFilter) : byDomain
  const totalRows = stages.reduce((a, s) => a + (s.total_rows || 0), 0)

  // 计算各层滞留风险
  const strandedByStage: Record<string, number> = {}
  if (stranded) {
    strandedByStage['raw'] = (stranded.raw_stranded?.lims ?? 0) + (stranded.raw_stranded?.ekuaibao ?? 0)
    strandedByStage['staging'] = stranded.staging_stranded?.count ?? 0
    strandedByStage['content'] = stranded.content_to_knowledge_gap?.gap ?? 0
    strandedByStage['knowledge'] = (stranded.knowledge_pending_vectorization?.pending ?? 0) + (stranded.knowledge_pending_vectorization?.failed ?? 0)
  }

  return (
    <div className="space-y-5">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">数据生命周期</h2>
          <p className="text-sm text-slate-500 mt-1">
            追踪数据从外部采集 → 接入暂存 → 正式业务 → 内容信号 → 知识资产的完整流转链路
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 生命周期流转图 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">六层生命周期总览</h3>
        {loading ? (
          <div className="flex gap-3">
            {[...Array(6)].map((_, i) => <div key={i} className="flex-1 h-24 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="flex items-stretch gap-1">
            {stages.map((stage, idx) => {
              const cfg = STAGE_COLORS[stage.id] ?? STAGE_COLORS['meta']
              const strandedCount = strandedByStage[stage.id] ?? 0
              const isArrow = idx < stages.length - 1 && stage.id !== 'meta'
              return (
                <div key={stage.id} className="flex items-center flex-1 min-w-0">
                  <button
                    onClick={() => setActiveFilter(activeFilter === stage.id ? '' : stage.id)}
                    className={`flex-1 rounded-xl border-2 p-3 text-left transition-all ${cfg.bg} ${cfg.border} ${
                      activeFilter === stage.id ? 'ring-2 ring-offset-1 ring-blue-400' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <p className={`text-[10px] font-semibold ${cfg.text} truncate flex-1`}>{stage.label}</p>
                      {strandedCount > 0 && (
                        <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 ml-1" title={`${strandedCount} 条滞留`} />
                      )}
                    </div>
                    <p className="text-lg font-bold text-slate-800 mt-1">
                      {stage.total_rows?.toLocaleString() ?? '—'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{stage.domain_count} 个域</p>
                    {strandedCount > 0 && (
                      <p className="text-[10px] text-amber-600 mt-1 font-medium">{strandedCount} 滞留</p>
                    )}
                  </button>
                  {isArrow && (
                    <ArrowRight className="w-4 h-4 text-slate-300 mx-0.5 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        )}
        {totalRows > 0 && !loading && (
          <p className="text-xs text-slate-400 mt-3 text-right">
            全系统估算总记录：<strong className="text-slate-600">{totalRows.toLocaleString()}</strong> 条
          </p>
        )}
      </div>

      {/* 层语义说明 */}
      <div className="grid grid-cols-3 gap-3">
        {stages.map(stage => {
          const cfg = STAGE_COLORS[stage.id] ?? STAGE_COLORS['meta']
          const semantics = STAGE_SEMANTICS[stage.id]
          const strandedCount = strandedByStage[stage.id] ?? 0
          return (
            <div key={stage.id} className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold ${cfg.text}`}>{stage.label}</span>
                {strandedCount > 0 ? (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">{strandedCount} 滞留</span>
                ) : (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </div>
              {semantics && (
                <>
                  <div className="space-y-1 mb-2">
                    {semantics.objects.map((obj, i) => (
                      <p key={i} className="text-[10px] text-slate-600">• {obj}</p>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500">
                    <ArrowDownCircle className="w-3 h-3 shrink-0" />
                    <span className="truncate">{semantics.flows_to}</span>
                  </div>
                  {strandedCount > 0 && (
                    <p className="text-[10px] text-amber-600 mt-1.5 font-medium">⚠ {semantics.stranded_risk}</p>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* 过滤器 */}
      {activeFilter && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">当前过滤：</span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${STAGE_COLORS[activeFilter]?.badge || ''}`}>
            {stages.find(s => s.id === activeFilter)?.label || activeFilter}
          </span>
          <button onClick={() => setActiveFilter('')} className="text-xs text-slate-400 hover:text-slate-600">
            清除过滤
          </button>
        </div>
      )}

      {/* 各域行数明细 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">各域数据量明细</h3>
          <span className="text-xs text-slate-400">{filteredDomains.length} 个域</span>
        </div>
        {loading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded animate-pulse" />)}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredDomains.map(domain => {
              const cfg = STAGE_COLORS[domain.lifecycle_stage] ?? STAGE_COLORS['meta']
              const tables = Object.entries(domain.table_rows || {}) as [string, number][]
              const maxRows = Math.max(...tables.map(([, v]) => v as number), 1)
              return (
                <div key={domain.domain_id} className="px-5 py-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${cfg.badge}`}>
                      {stages.find(s => s.id === domain.lifecycle_stage)?.label || domain.lifecycle_stage}
                    </span>
                    <span className="text-sm font-medium text-slate-700">{domain.label}</span>
                    <div className="flex gap-1 ml-1">
                      {(domain.regulatory ?? []).map((r: string) => (
                        <span key={r} className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-100">{r}</span>
                      ))}
                    </div>
                    <span className="ml-auto text-sm font-bold text-slate-800">
                      {(domain.total_rows as number)?.toLocaleString() ?? '—'} 行
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {tables.map(([tbl, rows]) => (
                      <div key={tbl} className="flex items-center gap-3">
                        <code className="text-[10px] text-slate-500 w-44 shrink-0 truncate">{tbl}</code>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all ${cfg.bar}`}
                            style={{ width: `${Math.min(100, maxRows > 0 ? ((rows as number) / maxRows) * 100 : 0)}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-600 w-16 text-right font-mono shrink-0">
                          {(rows as number)?.toLocaleString() ?? '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {filteredDomains.length === 0 && (
              <div className="px-5 py-8 text-center text-slate-400 text-sm">
                无匹配数据
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
