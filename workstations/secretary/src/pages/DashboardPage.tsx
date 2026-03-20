import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { StatCard, Card, DigitalWorkerSuggestionBar, DigitalWorkerActionCard } from '@cn-kis/ui-kit'
import { api, assistantGovernanceApi, assistantResearchApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { useFeishuContext, PermissionGuard } from '@cn-kis/feishu-sdk'
import {
  FolderOpen,
  Play,
  ClipboardList,
  MessageSquare,
  Clock,
  Mail,
  MessageCircle,
  Calendar,
  CheckSquare,
  RefreshCw,
  TrendingUp,
  Users,
  Sparkles,
  ShieldAlert,
  Lightbulb,
} from 'lucide-react'

interface DashboardStats {
  project_count: number
  active_count: number
  pending_workorders: number
  ai_chat_count: number
}

interface RecentActivity {
  id: string
  title: string
  type: string
  time: string
}

interface FeishuPreflight {
  passed?: boolean
  granted_capabilities?: Record<string, boolean>
  missing?: string[]
  requires_reauth?: boolean
  message?: string
  auth_source?: 'feishu' | 'non_feishu' | 'feishu_expired'
}

interface FeishuScan {
  mail: string[]
  im: string[]
  calendar: string[]
  task: string[]
  message?: string
  preflight?: FeishuPreflight
}

interface ProjectAnalysis {
  analysis: string
  summary: Record<string, unknown>
  message?: string
}

interface HotTopics {
  topics: string[]
  trends: string[]
  message?: string
}

interface DashboardOverview {
  feishu_scan: FeishuScan
  project_analysis: ProjectAnalysis
  hot_topics: HotTopics
}

interface AssistantEffectMetrics {
  window_days: number
  overview: {
    time_saved_minutes: number
    suggestion_count: number
    feedback_count: number
    adopted_count: number
    suggestion_accept_rate: number
    execution_count: number
    execution_success_count: number
    automation_success_rate: number
    on_time_task_rate: number
  }
  by_action_type: Array<{
    action_type: string
    suggestion_count: number
    suggestion_accept_rate: number
    automation_success_rate: number
    estimated_time_saved_minutes: number
  }>
  research_route_metrics?: {
    window_days?: number
    recommended_by_card_type?: Record<string, string>
    card_type_routes?: Record<string, Record<string, { sample_size: number; adoption_rate: number; weighted_score: number }>>
  }
  research_route_governance?: {
    override_hit_rate?: number
    override_success_rate?: number
    totals?: { fallback_rate?: number }
  }
  research_route_profile?: {
    auto_execute_enabled?: boolean
    approval_mode?: string
    max_risk?: string
    min_confidence?: number
    min_priority?: number
  }
}

interface ResearchInsightCard {
  type: string
  title: string
  summary: string
  actions: string[]
  recommended_route?: string
  recommended_reason?: string
}

interface ResearchInsights {
  role: string
  installed_skill_slugs: string[]
  cards: ResearchInsightCard[]
  route_overrides?: Record<string, string>
}

interface ResearchRoutePreference {
  overrides: Record<string, string>
}

const PREFLIGHT_CAP_LABELS: Record<string, string> = {
  mail: '邮件',
  im: '聊天',
  calendar: '日历',
  task: '任务',
}

export function DashboardPage() {
  const [overviewRefresh, setOverviewRefresh] = useState(0)
  const { profile, hasPermission, login } = useFeishuContext()
  const queryClient = useQueryClient()

  const canViewStats = hasPermission('dashboard.stats.read')
  const canViewFeishuScan = hasPermission('dashboard.feishu_scan.read')
  const canViewProjectAnalysis = hasPermission('dashboard.project_analysis.read')
  const canViewHotTopics = hasPermission('dashboard.hot_topics.read')
  const canViewActivities = hasPermission('dashboard.activities.read')
  const canPushResearchAction = hasPermission('assistant.summary.generate')
  const canManageResearchRoute = hasPermission('assistant.preference.manage')

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<DashboardStats>('/dashboard/stats'),
    enabled: canViewStats,
  })

  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ['dashboard-activities'],
    queryFn: () => api.get<RecentActivity[]>('/dashboard/activities'),
    enabled: canViewActivities,
  })

  const {
    data: overviewRes,
    isLoading: overviewLoading,
    isFetching: overviewFetching,
  } = useQuery({
    queryKey: ['dashboard-overview', overviewRefresh],
    queryFn: () =>
      api.get<DashboardOverview>('/dashboard/overview', {
        params: { refresh: overviewRefresh > 0 },
      }),
    enabled: canViewFeishuScan || canViewProjectAnalysis || canViewHotTopics,
  })

  // 登录后立即触发预检，不等 overview 加载，让重授权提示尽早出现
  const { data: preflightRes } = useQuery({
    queryKey: ['dashboard-feishu-preflight'],
    queryFn: () => api.get<FeishuPreflight>('/dashboard/feishu-preflight'),
    enabled: canViewFeishuScan,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const earlyPreflight = preflightRes?.data

  const { data: effectMetricsRes, isLoading: effectMetricsLoading } = useQuery({
    queryKey: ['assistant-effect-metrics'],
    queryFn: () => assistantGovernanceApi.getMetrics({ days: 30 }),
    enabled: hasPermission('assistant.context.read'),
  })
  const { data: researchInsightsRes, isLoading: researchInsightsLoading } = useQuery({
    queryKey: ['assistant-research-insights'],
    queryFn: () => assistantResearchApi.getInsights({ include_llm: false }),
    enabled: hasPermission('assistant.context.read'),
  })
  const { data: routePrefRes } = useQuery({
    queryKey: ['assistant-research-route-preferences'],
    queryFn: () => assistantResearchApi.getRoutePreferences(),
    enabled: canManageResearchRoute,
  })

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'secretary'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('secretary'),
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []

  const statsData = stats?.data
  const activityList = activities?.data ?? []
  const overview = overviewRes?.data
  const effectMetrics = (effectMetricsRes as { data?: AssistantEffectMetrics } | undefined)?.data
  const researchInsights = (researchInsightsRes as { data?: ResearchInsights } | undefined)?.data
  const routePref = (routePrefRes as { data?: { overrides?: Record<string, string> } } | undefined)?.data?.overrides ?? {}
  const pushResearchInsightMutation = useMutation({
    mutationFn: (cardTypes: string[]) =>
      assistantResearchApi.postInsightsActions({ card_types: cardTypes, include_llm: false }),
    onSuccess: (res) => {
      const created = Number((res as { data?: { items?: unknown[] } })?.data?.items?.length || 0)
      window.alert(created > 0 ? `已入箱 ${created} 条动作，请到动作箱确认` : '暂无新增动作（可能24小时内已入箱）')
      queryClient.invalidateQueries({ queryKey: ['assistant-actions-inbox'] })
    },
  })
  const upsertRoutePrefMutation = useMutation({
    mutationFn: ({ cardType, route }: { cardType: string; route: string }) =>
      assistantResearchApi.saveRoutePreferences({ overrides: { [cardType]: route } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assistant-research-route-preferences'] })
      queryClient.invalidateQueries({ queryKey: ['assistant-research-insights'] })
    },
  })
  const createKnowledgeEntryMutation = useMutation({
    mutationFn: () =>
      api.post('/knowledge/entries/create', {
        entry_type: 'experience',
        title: `经营热点与经验摘要 ${new Date().toISOString().slice(0, 10)}`,
        content: [
          ...(overview?.hot_topics?.topics || []).slice(0, 5),
          ...(overview?.hot_topics?.trends || []).slice(0, 5),
        ].join('\n'),
        summary: '由知识管家从秘书台热点话题中自动沉淀',
        tags: ['数字员工', '经营热点', '经验沉淀'],
        source_type: 'secretary_dashboard',
      }),
    onSuccess: () => {
      window.alert('知识条目已创建')
    },
  })
  const createBusinessBriefSnapshotMutation = useMutation({
    mutationFn: () =>
      api.post('/hr/collaboration/snapshots/create', {
        source_workstation: 'secretary',
        data_type: 'business_brief',
        period: new Date().toISOString().slice(0, 10),
        payload: {
          project_analysis: overview?.project_analysis || {},
          hot_topics: overview?.hot_topics || {},
          effect_metrics: effectMetrics?.overview || {},
        },
        sync_status: 'pending',
      }),
    onSuccess: () => {
      window.alert('经营简报快照已创建')
    },
  })

  const handleRefreshOverview = () => {
    setOverviewRefresh((n) => n + 1)
  }

  const primaryRole = profile?.roles?.length
    ? profile.roles.reduce((a, b) => (a.level >= b.level ? a : b))
    : null

  const SourceSection = ({
    icon,
    title,
    items,
    emptyText,
  }: {
    icon: React.ReactNode
    title: string
    items: string[]
    emptyText: string
  }) => (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm font-medium text-slate-700">{title}</span>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1.5 text-sm text-slate-600">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400 italic">{emptyText}</p>
      )}
    </div>
  )

  return (
    <div className="space-y-5 md:space-y-6">
      {/* 飞书权限预检早提示：登录后立即检测，不等 overview 加载 */}
      {/* 仅对飞书身份用户展示，微信/短信登录用户跳过（auth_source=non_feishu） */}
      {earlyPreflight?.requires_reauth && earlyPreflight.auth_source !== 'non_feishu' && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="flex-1">
            <span className="font-medium">飞书授权不完整</span>
            {Array.isArray(earlyPreflight.missing) && earlyPreflight.missing.length > 0 && (
              <span className="ml-1 text-amber-700">
                — 缺失：{earlyPreflight.missing.map((k) => PREFLIGHT_CAP_LABELS[k] || k).join('、')}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => login()}
            className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
          >
            一键重授权（子衿）
          </button>
        </div>
      )}

      {/* 页面标题 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 md:text-xl">工作台总览</h2>
          <p className="mt-1 text-sm text-slate-500">
            {primaryRole
              ? `${profile?.display_name} · ${primaryRole.display_name}`
              : '飞书信息扫描、项目客户分析、热点话题跟进'}
          </p>
        </div>
        {profile?.data_scope && profile.data_scope !== 'global' && (
          <div className="flex min-h-10 items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-xs text-amber-700">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>
              {profile.data_scope === 'project'
                ? '数据范围：已分配项目'
                : '数据范围：个人'}
            </span>
          </div>
        )}
      </div>

      <DigitalWorkerSuggestionBar items={suggestions} loading={suggestionsLoading} />

      {/* 统计卡片 — 需要 dashboard.stats.read 权限 */}
      <PermissionGuard permission="dashboard.stats.read">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
          <StatCard
            title="项目数"
            value={statsLoading ? '-' : statsData?.project_count ?? 0}
            icon={<FolderOpen className="w-6 h-6" />}
          />
          <StatCard
            title="进行中"
            value={statsLoading ? '-' : statsData?.active_count ?? 0}
            icon={<Play className="w-6 h-6" />}
          />
          <StatCard
            title="待处理工单"
            value={statsLoading ? '-' : statsData?.pending_workorders ?? 0}
            icon={<ClipboardList className="w-6 h-6" />}
          />
          <StatCard
            title="AI对话数"
            value={statsLoading ? '-' : statsData?.ai_chat_count ?? 0}
            icon={<MessageSquare className="w-6 h-6" />}
          />
        </div>
      </PermissionGuard>

      {/* P3.2：策略效果卡 */}
      <PermissionGuard permission="assistant.context.read">
        <Card
          title="子衿策略效果"
          subtitle="近30天自动化收益与执行质量"
        >
          {effectMetricsLoading ? (
            <div className="py-6 text-sm text-slate-500">加载中...</div>
          ) : effectMetrics ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">节省时长</p>
                  <p className="text-lg font-semibold text-slate-800">{effectMetrics.overview.time_saved_minutes} 分钟</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">建议采纳率</p>
                  <p className="text-lg font-semibold text-slate-800">{(effectMetrics.overview.suggestion_accept_rate * 100).toFixed(1)}%</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">自动化成功率</p>
                  <p className="text-lg font-semibold text-slate-800">{(effectMetrics.overview.automation_success_rate * 100).toFixed(1)}%</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">建议总数</p>
                  <p className="text-lg font-semibold text-slate-800">{effectMetrics.overview.suggestion_count}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">高收益动作类型</p>
                <ul className="space-y-1.5">
                  {(effectMetrics.by_action_type || []).slice(0, 3).map((item) => (
                    <li key={item.action_type} className="flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                      <span>{item.action_type}</span>
                      <span className="text-slate-500">
                        节省 {item.estimated_time_saved_minutes} 分钟 · 采纳 {(item.suggestion_accept_rate * 100).toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {!!Object.keys(effectMetrics.research_route_metrics?.recommended_by_card_type || {}).length && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">研究路径自适应推荐</p>
                  <ul className="space-y-1.5">
                    {Object.entries(effectMetrics.research_route_metrics?.recommended_by_card_type || {}).map(([cardType, route]) => (
                      <li key={cardType} className="flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                        <span>{cardType}</span>
                        <span className="text-slate-500">{route}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!!effectMetrics.research_route_governance && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">路径治理指标</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 p-2">
                      <p className="text-[11px] text-slate-500">覆写命中率</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {(((effectMetrics.research_route_governance.override_hit_rate || 0) * 100)).toFixed(1)}%
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-2">
                      <p className="text-[11px] text-slate-500">覆写后成功率</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {(((effectMetrics.research_route_governance.override_success_rate || 0) * 100)).toFixed(1)}%
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-2">
                      <p className="text-[11px] text-slate-500">回退率</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {((((effectMetrics.research_route_governance.totals?.fallback_rate || 0) * 100))).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {!!effectMetrics.research_route_profile && (
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">当前审批配置</p>
                  <p className="text-xs text-slate-600">
                    自动执行：{effectMetrics.research_route_profile.auto_execute_enabled ? '开启' : '关闭'} ·
                    模式：{effectMetrics.research_route_profile.approval_mode || 'graded'} ·
                    最大风险：{effectMetrics.research_route_profile.max_risk || 'medium'} ·
                    置信度≥{effectMetrics.research_route_profile.min_confidence ?? 75} ·
                    优先级≥{effectMetrics.research_route_profile.min_priority ?? 70}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-6 text-sm text-slate-500">暂无策略效果数据</div>
          )}
        </Card>
      </PermissionGuard>

      <div className="grid gap-4 md:grid-cols-2">
        <DigitalWorkerActionCard
          roleCode="knowledge_curator"
          roleName="知识管家"
          title="沉淀知识条目与经验摘要"
          description="知识管家可将近期回放、热点话题和复盘结论沉淀为知识条目，供后续复用。"
          items={[]}
          onAccept={() => createKnowledgeEntryMutation.mutate()}
          loading={createKnowledgeEntryMutation.isPending}
          acceptLabel="创建知识条目"
        />
        <DigitalWorkerActionCard
          roleCode="business_analyst"
          roleName="经营分析员"
          title="生成经营简报与价值解读"
          description="经营分析员可汇总项目状态、热点话题和策略收益，生成经营简报。"
          items={[]}
          onAccept={() => createBusinessBriefSnapshotMutation.mutate()}
          loading={createBusinessBriefSnapshotMutation.isPending}
          acceptLabel="创建经营简报快照"
        />
      </div>

      <PermissionGuard permission="assistant.context.read">
        <Card title="研究洞察卡片" subtitle="产品/市场/竞品/方法/客户执行预判">
          {researchInsightsLoading ? (
            <div className="py-6 text-sm text-slate-500">加载中...</div>
          ) : researchInsights?.cards?.length ? (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                当前角色：{researchInsights.role} · 已安装技能 {researchInsights.installed_skill_slugs?.length || 0} 个
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {researchInsights.cards.map((card) => (
                  <div key={card.type} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      <p className="text-sm font-medium text-slate-800">{card.title}</p>
                    </div>
                    <p className="text-sm text-slate-600">{card.summary}</p>
                    {card.recommended_route && (
                      <p className="mt-1 text-xs text-indigo-600">
                        推荐路径：{card.recommended_route}
                        {card.recommended_reason ? ` · ${card.recommended_reason}` : ''}
                      </p>
                    )}
                    <ul className="mt-2 space-y-1">
                      {(card.actions || []).slice(0, 3).map((action, idx) => (
                        <li key={`${card.type}-${idx}`} className="text-xs text-slate-500">
                          - {action}
                        </li>
                      ))}
                    </ul>
                    {canManageResearchRoute && (
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          className="min-h-10 rounded border border-slate-200 px-2 py-1 text-xs text-slate-700"
                          value={routePref[card.type] || 'auto'}
                          onChange={(e) => upsertRoutePrefMutation.mutate({ cardType: card.type, route: e.target.value })}
                          aria-label={`研究路径覆写-${card.type}`}
                          title="设置该卡片类型的推荐路径覆写"
                        >
                          <option value="auto">自动（学习）</option>
                          <option value="confirm_only">仅确认</option>
                          <option value="execute_direct">直接执行</option>
                          <option value="delegate_claw">委派Claw</option>
                        </select>
                        <span className="text-[11px] text-slate-400">路径覆写</span>
                      </div>
                    )}
                    {canPushResearchAction && (
                      <button
                        className="mt-2 min-h-10 text-xs text-primary-600 hover:text-primary-700 hover:underline disabled:opacity-60"
                        onClick={() => pushResearchInsightMutation.mutate([card.type])}
                        disabled={pushResearchInsightMutation.isPending}
                        title="将该洞察入动作箱"
                      >
                        入动作箱
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {canPushResearchAction && (
                <div className="pt-1">
                  <button
                    className="min-h-10 text-xs text-slate-600 hover:text-slate-800 hover:underline disabled:opacity-60"
                    onClick={() => pushResearchInsightMutation.mutate([])}
                    disabled={pushResearchInsightMutation.isPending}
                    title="将全部洞察入动作箱"
                  >
                    一键全部入箱
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-6 text-sm text-slate-500">暂无研究洞察数据</div>
          )}
        </Card>
      </PermissionGuard>

      {/* 第一部分：飞书信息扫描 — 需要 dashboard.feishu_scan.read 权限 */}
      <PermissionGuard permission="dashboard.feishu_scan.read">
        <Card
          title="飞书信息扫描"
          subtitle="对本账号下的飞书信息进行全面扫描，提炼关键信息"
          actions={
            <button
              onClick={handleRefreshOverview}
              disabled={overviewFetching}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
              title="刷新"
            >
              <RefreshCw
                className={`w-4 h-4 ${overviewFetching ? 'animate-spin' : ''}`}
              />
            </button>
          }
        >
          {overviewLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-500">
              <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mr-2" />
              正在扫描飞书信息并提炼关键信息...
            </div>
          ) : overview?.feishu_scan?.preflight?.requires_reauth &&
            overview.feishu_scan.preflight?.auth_source !== 'non_feishu' ? (
            <div className="py-10 text-center">
              <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
              <p className="text-sm text-slate-600 mb-1">
                {overview.feishu_scan.message || '部分飞书权限不可用，请使用子衿重新授权'}
              </p>
              {Array.isArray(overview.feishu_scan.preflight?.missing) &&
                overview.feishu_scan.preflight.missing.length > 0 && (
                  <p className="text-xs text-slate-500 mb-3">
                    缺失能力：{overview.feishu_scan.preflight.missing.map((k) => PREFLIGHT_CAP_LABELS[k] || k).join('、')}
                  </p>
                )}
              <button
                type="button"
                onClick={() => login()}
                className="mt-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 transition-colors"
              >
                一键重授权（子衿）
              </button>
            </div>
          ) : overview?.feishu_scan?.message ? (
            <div className="py-10 text-center">
              <Mail className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500 mb-2">
                {overview.feishu_scan.message}
              </p>
              <button
                onClick={handleRefreshOverview}
                disabled={overviewFetching}
                className="mt-2 text-xs text-primary-600 hover:text-primary-700 hover:underline disabled:opacity-50"
              >
                {overviewFetching ? '刷新中...' : '点击重试'}
              </button>
            </div>
          ) : overview?.feishu_scan ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <SourceSection
                icon={<Mail className="w-4 h-4 text-blue-500" />}
                title="来自邮件"
                items={overview.feishu_scan.mail || []}
                emptyText="暂无邮件关键信息"
              />
              <SourceSection
                icon={<MessageCircle className="w-4 h-4 text-emerald-500" />}
                title="来自聊天和群聊"
                items={overview.feishu_scan.im || []}
                emptyText="暂无聊天关键信息"
              />
              <SourceSection
                icon={<Calendar className="w-4 h-4 text-amber-500" />}
                title="来自日历"
                items={overview.feishu_scan.calendar || []}
                emptyText="暂无日历关键信息"
              />
              <SourceSection
                icon={<CheckSquare className="w-4 h-4 text-violet-500" />}
                title="来自任务"
                items={overview.feishu_scan.task || []}
                emptyText="暂无任务关键信息"
              />
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500 text-sm">
              加载中...
            </div>
          )}
        </Card>
      </PermissionGuard>

      {/* 第二部分：项目/客户分析 — 需要 dashboard.project_analysis.read 权限 */}
      <PermissionGuard permission="dashboard.project_analysis.read">
        <Card
          title="项目与客户分析"
          subtitle="根据飞书信息关联项目或客户，跟踪历史与现状"
        >
          {overviewLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : overview?.project_analysis?.analysis ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Users className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {overview.project_analysis.analysis}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-slate-500 text-sm">
              {overview?.project_analysis?.message || '暂无项目客户分析'}
            </div>
          )}
        </Card>
      </PermissionGuard>

      {/* 第三部分：热点话题跟进 — 需要 dashboard.hot_topics.read 权限 */}
      <PermissionGuard permission="dashboard.hot_topics.read">
        <Card
          title="热点话题与趋势"
          subtitle="近期客户、项目、公司内部及同事提及的热点话题"
        >
          {overviewLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : overview?.hot_topics ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium text-slate-700">
                    热点话题
                  </span>
                </div>
                {overview.hot_topics.topics?.length > 0 ? (
                  <ul className="space-y-2">
                    {overview.hot_topics.topics.map((t, i) => (
                      <li
                        key={i}
                        className="text-sm text-slate-600 flex items-start gap-2"
                      >
                        <span className="text-amber-500">•</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400 italic">暂无热点话题</p>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-primary-500" />
                  <span className="text-sm font-medium text-slate-700">
                    趋势
                  </span>
                </div>
                {overview.hot_topics.trends?.length > 0 ? (
                  <ul className="space-y-2">
                    {overview.hot_topics.trends.map((t, i) => (
                      <li
                        key={i}
                        className="text-sm text-slate-600 flex items-start gap-2"
                      >
                        <span className="text-primary-500">→</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400 italic">暂无趋势分析</p>
                )}
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-slate-500 text-sm">
              {overview?.hot_topics?.message || '暂无热点话题'}
            </div>
          )}
        </Card>
      </PermissionGuard>

      {/* 最近动态 — 需要 dashboard.activities.read 权限 */}
      <PermissionGuard permission="dashboard.activities.read">
        <Card title="最近动态" subtitle="系统最新操作记录">
          {activitiesLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mr-2" />
              加载中...
            </div>
          ) : activityList.length === 0 ? (
            <div className="py-8 text-center">
              <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">暂无最近动态</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activityList.map((activity) => (
                <li
                  key={activity.id}
                  className="flex items-center gap-3 py-3"
                >
                  <div className="w-2 h-2 rounded-full bg-primary-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">
                      {activity.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {activity.type}
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {activity.time}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PermissionGuard>

      {/* 无任何权限时的提示 */}
      {!canViewStats &&
        !canViewFeishuScan &&
        !canViewProjectAnalysis &&
        !canViewActivities && (
          <Card>
            <div className="py-12 text-center">
              <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-base font-medium text-slate-700 mb-2">
                权限受限
              </h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                您当前的角色
                {primaryRole ? `（${primaryRole.display_name}）` : ''}
                暂无工作台查看权限。请联系管理员分配相应角色。
              </p>
            </div>
          </Card>
        )}
    </div>
  )
}
