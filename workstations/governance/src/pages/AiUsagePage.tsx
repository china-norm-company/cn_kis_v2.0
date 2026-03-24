import { useState, useEffect, useCallback } from 'react'
import { Brain, RefreshCw, MessageSquare, Zap, TrendingUp, Activity, BarChart3, CheckCircle, AlertCircle } from 'lucide-react'
import { api, iamApi } from '@cn-kis/api-client'

interface AgentCallStat {
  agent_id: string
  name: string
  calls: number
  description?: string
  status?: string
}

export function AiUsagePage() {
  const [providers, setProviders] = useState<any[]>([])
  const [agents, setAgents] = useState<any[]>([])
  const [metrics, setMetrics] = useState<any>(null)
  const [agentStats, setAgentStats] = useState<AgentCallStat[]>([])
  const [recentCalls, setRecentCalls] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.allSettled([
      api.get('/agents/providers'),
      api.get('/agents/list'),
      api.get('/agents/fallback/metrics'),
      // 从审计日志中提取 AI 调用记录（action=AGENT_CALL 或 resource_type 含 agent）
      iamApi.listAuditLogs({ page: 1, page_size: 200 }),
    ]).then(([provRes, agentRes, metricsRes, auditRes]) => {
      if (provRes.status === 'fulfilled') setProviders((provRes.value as any)?.data?.providers ?? [])

      const agentList: any[] = agentRes.status === 'fulfilled'
        ? ((agentRes.value as any)?.data?.agents ?? [])
        : []
      setAgents(agentList)

      if (metricsRes.status === 'fulfilled') setMetrics((metricsRes.value as any)?.data)

      // 从审计日志中统计 Agent 调用频次
      if (auditRes.status === 'fulfilled') {
        const logs: any[] = (auditRes.value as any)?.data?.items ?? []

        // 过滤 AI 相关日志（action 或 resource_type 含 agent/ai/knowledge_search 等）
        const aiLogs = logs.filter((l: any) => {
          const rt = (l.resource_type || '').toLowerCase()
          const act = (l.action || '').toLowerCase()
          return (
            rt.includes('agent') || act.includes('agent') ||
            rt.includes('knowledge_search') || act.includes('knowledge') ||
            act.includes('ai_') || rt.includes('t_agent')
          )
        })
        setRecentCalls(aiLogs.slice(0, 20))

        // 按 agent_id 统计
        const callMap: Record<string, number> = {}
        aiLogs.forEach((l: any) => {
          const agentKey = l.resource_id ? `agent-${l.resource_id}` : (l.resource_type || 'unknown')
          callMap[agentKey] = (callMap[agentKey] || 0) + 1
        })

        // 融合注册 Agent 与统计数据
        const stats: AgentCallStat[] = agentList.map((a: any) => ({
          agent_id: a.agent_id || String(a.id),
          name: a.name || a.agent_id,
          description: a.description,
          status: a.status,
          calls: callMap[`agent-${a.id}`] || callMap[a.agent_id] || 0,
        })).sort((x, y) => y.calls - x.calls)

        setAgentStats(stats)
      }
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const activeAgents = agents.filter((a: any) => a.status === 'active').length
  const healthyProviders = providers.filter((p: any) => p.healthy !== false).length
  const totalAiCalls = agentStats.reduce((s, a) => s + a.calls, 0)
  const maxCalls = Math.max(1, ...agentStats.map(a => a.calls))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">AI 使用监控</h2>
          <p className="text-sm text-slate-500 mt-1">推理通道状态、智能体调用频次与活动日志</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 统计卡片 */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
              <div className="h-8 bg-slate-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">活跃智能体</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{activeAgents}</p>
                <p className="text-xs text-slate-400 mt-0.5">共 {agents.length} 个注册</p>
              </div>
              <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                <Brain className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">健康推理通道</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{healthyProviders}</p>
                <p className="text-xs text-slate-400 mt-0.5">共 {providers.length} 个</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">AI 调用（审计样本）</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{totalAiCalls}</p>
                <p className="text-xs text-slate-400 mt-0.5">近 200 条日志中</p>
              </div>
              <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">通道回退次数</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">
                  {metrics?.total_fallbacks ?? '–'}
                </p>
              </div>
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 推理通道状态 */}
      {!loading && providers.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <p className="text-sm font-medium text-slate-700">推理通道状态</p>
          </div>
          <div className="divide-y divide-slate-100">
            {providers.map((p: any, i: number) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                {p.healthy !== false
                  ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                  : <AlertCircle className="w-4 h-4 text-red-500" />
                }
                <span className="text-sm font-medium text-slate-800">{p.name || p.provider}</span>
                <span className="text-xs text-slate-400">{p.model || ''}</span>
                <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
                  p.healthy !== false
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {p.healthy !== false ? '健康' : '异常'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 智能体调用频次 */}
      {!loading && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <p className="text-sm font-medium text-slate-700">智能体调用频次</p>
            <span className="text-xs text-slate-400 ml-auto">基于审计日志统计</span>
          </div>
          {agentStats.length === 0 ? (
            <div className="px-4 py-8 text-center text-slate-400 text-sm">
              <Brain className="w-8 h-8 mx-auto mb-2 text-slate-200" />
              <p>暂无智能体注册数据</p>
              <p className="text-xs mt-1">运行 python manage.py import_v1_skills 导入 V1 技能</p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {agentStats.map(a => (
                <div key={a.agent_id} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 min-w-0">
                    <p className="text-sm text-slate-700 truncate" title={a.name}>{a.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{a.agent_id}</p>
                  </div>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-purple-500 h-full rounded-full transition-all duration-500"
                      style={{ width: a.calls > 0 ? `${Math.max(4, (a.calls / maxCalls) * 100)}%` : '0%' }}
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500 w-6 text-right">{a.calls || '–'}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      a.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {a.status || 'unknown'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 近期 AI 活动日志 */}
      {!loading && recentCalls.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-slate-500" />
            <p className="text-sm font-medium text-slate-700">近期 AI 活动</p>
          </div>
          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {recentCalls.map((log: any, i: number) => (
              <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                <Activity className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 truncate">{log.description || log.action}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {log.performed_by_name || log.performed_by || '系统'} ·
                    {new Date(log.created_at || log.create_time).toLocaleString('zh-CN')}
                  </p>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded shrink-0">
                  {log.action}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && recentCalls.length === 0 && totalAiCalls === 0 && (
        <div className="bg-slate-50 border border-slate-200 text-slate-600 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
          <Brain className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            尚无 AI 调用记录。当智能体被调用时，活动将自动出现在此页面（通过审计日志 action=AGENT_CALL 追踪）。
          </span>
        </div>
      )}
    </div>
  )
}
