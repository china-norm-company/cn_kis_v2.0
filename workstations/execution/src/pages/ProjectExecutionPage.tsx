/**
 * 项目级执行仪表盘
 *
 * 路由：/projects/:id/execution
 * 展示单个项目的完整执行状态：
 * - 排程甘特图
 * - 工单完成统计
 * - 资源使用情况
 * - 偏差/变更记录
 * - 入组进度
 * - S5-3: 项目执行上下文（要求摘要、决策日志、变更记录）
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { protocolApi, workorderApi, schedulingApi, subjectApi, qualityApi } from '@cn-kis/api-client'
import { StatCard, Badge, Empty } from '@cn-kis/ui-kit'
import {
  ArrowLeft, BarChart3, Users, ClipboardList, Calendar,
  AlertTriangle, CheckCircle, FileText, GitBranch, BookOpen,
} from 'lucide-react'

type TabKey = 'overview' | 'context'

export default function ProjectExecutionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const protocolId = Number(id)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  // Protocol details
  const { data: protocolRes } = useQuery({
    queryKey: ['protocol', protocolId],
    queryFn: () => protocolApi.get(protocolId),
    enabled: !!protocolId,
  })

  // Work order stats for this protocol
  const { data: woStatsRes } = useQuery({
    queryKey: ['workorder', 'analytics', protocolId],
    queryFn: () => workorderApi.analyticsSummary({ protocol_id: protocolId }),
    enabled: !!protocolId,
  })

  // Enrollment stats for this protocol
  const { data: enrollStatsRes } = useQuery({
    queryKey: ['subject', 'enrollment-stats', protocolId],
    queryFn: () => subjectApi.enrollmentStats({ protocol_id: protocolId }),
    enabled: !!protocolId,
  })

  // Deviations for this protocol
  const { data: deviationsRes } = useQuery({
    queryKey: ['quality', 'deviations', protocolId],
    queryFn: () => qualityApi.listDeviations({ project_id: protocolId, page: 1, page_size: 10 }),
    enabled: !!protocolId,
  })

  // S5-3: 项目执行上下文
  const { data: contextRes } = useQuery({
    queryKey: ['workorder', 'project-context', protocolId],
    queryFn: () => workorderApi.getProjectContext(protocolId),
    enabled: !!protocolId && activeTab === 'context',
  })

  const protocol = protocolRes?.data as any
  const woStats = woStatsRes?.data as any
  const enrollStats = enrollStatsRes?.data as Record<string, number> | undefined
  const deviations = (deviationsRes?.data as any)?.items ?? []
  const executionContext = contextRes?.data

  const summary = woStats?.summary
  const statusDist = woStats?.status_distribution ?? []

  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: 'overview', label: '执行概览', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'context', label: '执行上下文', icon: <BookOpen className="w-4 h-4" /> },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Back + Header */}
      <div className="flex items-start gap-3 sm:gap-4">
        <button title="返回上一页" onClick={() => navigate(-1)} className="min-h-11 min-w-11 p-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">
            {protocol?.title || `项目 #${protocolId}`}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {protocol?.code || ''} — 项目执行详情
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
      <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="目标样本"
          value={protocol?.sample_size ?? '-'}
          icon={<Users className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          label="已入组"
          value={enrollStats?.enrolled ?? 0}
          icon={<Users className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          label="总工单"
          value={summary?.total ?? 0}
          icon={<ClipboardList className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          label="完成率"
          value={`${summary?.completion_rate ?? 0}%`}
          icon={<CheckCircle className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          label="偏差数"
          value={deviations.length}
          icon={<AlertTriangle className="w-5 h-5" />}
          color={deviations.length > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Work Order Status Distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-slate-500" /> 工单状态分布
          </h3>
          {statusDist.length === 0 ? (
            <Empty message="暂无工单数据" />
          ) : (
            <div className="space-y-2">
              {statusDist.map((item: any) => {
                const total = summary?.total ?? 1
                const pct = Math.round((item.count / total) * 100)
                return (
                  <div key={item.status} className="flex items-center gap-3">
                    <span className="text-sm text-slate-600 w-16">{item.status}</span>
                    <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-slate-700 w-12 text-right">{item.count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Enrollment Progress */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-500" /> 入组进度
          </h3>
          {!enrollStats ? (
            <Empty message="暂无入组数据" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">总入组</span>
                <span className="text-2xl font-bold text-slate-800">{enrollStats?.total ?? 0}</span>
              </div>
              {protocol?.sample_size && (
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>进度</span>
                    <span>{Math.round(((enrollStats?.enrolled ?? 0) / protocol.sample_size) * 100)}%</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-400 rounded-full transition-all"
                      style={{ width: `${Math.min(100, ((enrollStats?.enrolled ?? 0) / protocol.sample_size) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(enrollStats ?? {}).filter(([k]) => k !== 'total').map(([key, val]) => (
                  <div key={key} className="bg-slate-50 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-slate-800">{val}</div>
                    <div className="text-xs text-slate-500">{key}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent Deviations */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6 lg:col-span-2">
          <h3 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-slate-500" /> 近期偏差
          </h3>
          {deviations.length === 0 ? (
            <Empty message="暂无偏差记录" />
          ) : (
            <div className="space-y-2">
              {deviations.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100">
                  <div className="flex items-center gap-3">
                    <Badge variant={d.severity === 'critical' ? 'error' : d.severity === 'major' ? 'warning' : 'default'}>
                      {d.severity}
                    </Badge>
                    <span className="text-sm text-slate-700">{d.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={d.status === 'closed' ? 'success' : 'warning'}>{d.status}</Badge>
                    <span className="text-xs text-slate-400">{d.reported_at?.split('T')[0]}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {/* S5-3: Execution Context Tab */}
      {activeTab === 'context' && (
      <div className="space-y-4">
        {/* Key Requirements */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
          <h3 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-500" /> 关键要求摘要
          </h3>
          {(!executionContext?.key_requirements || executionContext.key_requirements.length === 0) ? (
            <Empty message="暂无关键要求记录，CRC可在此维护项目执行要求" />
          ) : (
            <div className="space-y-2">
              {executionContext.key_requirements.map((req, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
                  <Badge variant={req.priority === 'high' ? 'error' : req.priority === 'medium' ? 'warning' : 'default'}>
                    {req.priority}
                  </Badge>
                  <div>
                    <div className="text-sm font-medium text-slate-700">{req.category}</div>
                    <div className="text-sm text-slate-500 mt-0.5">{req.content}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Special Notes */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
          <h3 className="text-base font-semibold text-slate-700 mb-4">特殊注意事项</h3>
          {executionContext?.special_notes ? (
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{executionContext.special_notes}</p>
          ) : (
            <Empty message="暂无特殊注意事项" />
          )}
        </div>

        {/* Decision Logs + Change Responses */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Decision Logs */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-slate-500" /> CRC决策日志
            </h3>
            {(!executionContext?.decision_logs || executionContext.decision_logs.length === 0) ? (
              <Empty message="暂无决策记录" />
            ) : (
              <div className="space-y-3">
                {executionContext.decision_logs.map((d) => (
                  <div key={d.id} className="p-3 rounded-lg bg-slate-50 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={d.scope === 'major' ? 'error' : d.scope === 'moderate' ? 'warning' : 'default'}>
                          {d.scope}
                        </Badge>
                        <span className="text-sm font-medium text-slate-700">{d.title}</span>
                      </div>
                      <span className="text-xs text-slate-400">{d.decision_time?.split('T')[0]}</span>
                    </div>
                    <p className="text-xs text-slate-500">{d.description}</p>
                    {d.rationale && (
                      <p className="text-xs text-slate-400">依据：{d.rationale}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Change Responses */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-base font-semibold text-slate-700 mb-4 flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-slate-500" /> 变更响应记录
            </h3>
            {(!executionContext?.change_responses || executionContext.change_responses.length === 0) ? (
              <Empty message="暂无变更响应记录" />
            ) : (
              <div className="space-y-3">
                {executionContext.change_responses.map((c) => (
                  <div key={c.id} className="p-3 rounded-lg bg-slate-50 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">{c.change_source}</span>
                      <Badge variant={c.status === 'completed' ? 'success' : 'warning'}>{c.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">{c.change_description}</p>
                    {c.impact_assessment && (
                      <p className="text-xs text-slate-400">影响：{c.impact_assessment}</p>
                    )}
                    <span className="text-xs text-slate-400">{c.received_at?.split('T')[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  )
}
