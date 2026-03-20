/**
 * 项目级 Dashboard（F2 升级版）
 *
 * 8 个 Tab：概览 / 受试者 / 数据质量 / 财务 / 团队 / 会议与沟通 / 文档中心 / 里程碑
 *
 * 升级内容：
 * - 概览增加趋势图（A1 联动）
 * - 数据质量增加 AI 分析洞察（D1 联动）
 * - 会议与沟通 Tab（E3 联动）
 * - 文档中心 Tab（eTMF）
 * - 里程碑 Tab（甘特图）
 * - 启动包生成（B3 联动）
 * - 状态通报（E2 联动）
 */
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { StatCard, Tabs, Badge, Empty, DataTable, Button, AIInsightWidget } from '@cn-kis/ui-kit'
import { useState } from 'react'
import {
  ArrowLeft, Users, ClipboardList, ShieldCheck, Banknote, UserCog,
  AlertTriangle, CheckCircle, TrendingUp, Calendar, FileText, Flag,
  Send, Package, MessageSquare, Brain,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { CommunicationTimeline } from '../components/CommunicationTimeline'

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#94a3b8']
const STATUS_LABELS: Record<string, string> = {
  pending: '待处理', assigned: '已分配', in_progress: '进行中',
  completed: '已完成', review: '待审核', approved: '已批准',
  rejected: '已拒绝', cancelled: '已取消',
  enrolled: '已入组', withdrawn: '已退出',
  open: '待处理', investigating: '调查中', resolved: '已纠正', closed: '已关闭',
  planned: '计划中', verification: '验证中', overdue: '逾期',
  kickoff: '启动会', weekly: '周会', review_type: '评审会', client: '客户会议',
}

export default function ProjectDashboardPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const protocolId = Number(id)
  const [activeTab, setActiveTab] = useState('overview')

  const qOpts = { staleTime: 60_000, refetchOnWindowFocus: false } as const

  const { data: dashRes, isLoading } = useQuery({
    queryKey: ['protocol', 'dashboard', protocolId],
    queryFn: () => api.get<any>(`/protocol/${protocolId}/dashboard`),
    enabled: !!protocolId,
    ...qOpts,
  })

  const { data: trendsRes } = useQuery({
    queryKey: ['project-trends', protocolId],
    queryFn: () => api.get<any>('/dashboard/trends', { params: { protocol_id: protocolId } }),
    enabled: activeTab === 'overview' && !!protocolId,
    ...qOpts,
  })

  const { data: subjectsRes } = useQuery({
    queryKey: ['subjects', protocolId],
    queryFn: () => api.get<any>('/subject/list', { params: { protocol_id: protocolId, page: 1, page_size: 50 } }),
    enabled: activeTab === 'subjects',
    ...qOpts,
  })

  const { data: deviationsRes } = useQuery({
    queryKey: ['deviations', protocolId],
    queryFn: () => api.get<any>('/quality/deviations/list', { params: { project: protocolId, page: 1, page_size: 20 } }),
    enabled: activeTab === 'quality',
    ...qOpts,
  })

  const { data: capasRes } = useQuery({
    queryKey: ['capas', protocolId],
    queryFn: () => api.get<any>('/quality/capas/list', { params: { deviation__project: protocolId, page: 1, page_size: 20 } }),
    enabled: activeTab === 'quality',
    ...qOpts,
  })

  const { data: meetingsRes } = useQuery({
    queryKey: ['meetings', protocolId],
    queryFn: () => api.get<any>('/proposal/meetings/list', { params: { protocol_id: protocolId } }),
    enabled: activeTab === 'meetings',
    ...qOpts,
  })

  const { data: documentsRes } = useQuery({
    queryKey: ['documents', protocolId],
    queryFn: () => api.get<any>('/document/list', { params: { protocol_id: protocolId } }),
    enabled: activeTab === 'documents',
    ...qOpts,
  })

  const { data: portfolioRes } = useQuery({
    queryKey: ['project-milestones', protocolId],
    queryFn: () => api.get<any>('/dashboard/portfolio'),
    enabled: activeTab === 'milestones',
    ...qOpts,
  })

  const generateStartup = useMutation({
    mutationFn: () => api.post<any>(`/protocol/${protocolId}/startup-package`, {}),
  })

  const publishStatus = useMutation({
    mutationFn: () => api.post<any>(`/protocol/${protocolId}/publish-status`, {}),
  })

  const generateProfit = useMutation({
    mutationFn: () => api.post<any>(`/finance/profit-analysis/generate/${protocolId}`, {}),
  })

  const dash = dashRes?.data
  const protocol = dash?.protocol
  const enrollment = dash?.enrollment
  const workorders = dash?.workorders
  const quality = dash?.quality
  const finance = dash?.finance
  const trends = trendsRes?.data

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
  }

  if (!dash) {
    return <div className="p-6"><Empty description="项目不存在" /></div>
  }

  const woStatusData = (workorders?.by_status || []).map((d: any) => ({
    name: STATUS_LABELS[d.status] || d.status,
    value: d.count,
  })).filter((d: any) => d.value > 0)

  const projectMilestones = (portfolioRes?.data?.projects || [])
    .find((p: any) => p.id === protocolId)?.milestones || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-lg" title="返回">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-slate-800">{protocol?.title}</h2>
            <p className="text-sm text-slate-500 mt-1">{protocol?.code} · {protocol?.efficacy_type || '功效测试'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => generateStartup.mutate()}
            disabled={generateStartup.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-100 disabled:opacity-50"
          >
            <Package className="w-3.5 h-3.5" />
            {generateStartup.isPending ? '生成中...' : '生成启动包'}
          </button>
          <button
            onClick={() => publishStatus.mutate()}
            disabled={publishStatus.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            {publishStatus.isPending ? '推送中...' : '发布通报'}
          </button>
        </div>
      </div>

      {/* Startup Package Result */}
      {generateStartup.data?.data && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-emerald-700 mb-2">启动包生成结果</h4>
          <div className="grid grid-cols-4 gap-2 text-xs">
            {(generateStartup.data.data as any).items?.map((item: any, i: number) => (
              <div key={i} className={`p-2 rounded ${
                item.status === 'created' ? 'bg-green-100 text-green-700' :
                item.status === 'skipped' ? 'bg-slate-100 text-slate-600' :
                'bg-red-100 text-red-700'
              }`}>
                <div className="font-medium">{item.name}</div>
                <div>{item.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: 'overview', label: '概览' },
          { value: 'subjects', label: '受试者' },
          { value: 'quality', label: '数据质量' },
          { value: 'finance', label: '财务' },
          { value: 'team', label: '团队' },
          { value: 'meetings', label: '会议与沟通' },
          { value: 'documents', label: '文档中心' },
          { value: 'milestones', label: '里程碑' },
          { value: 'communications', label: '沟通时间线' },
        ]}
      />

      {/* Overview Tab (with trends A1) */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <StatCard title="入组率" value={`${enrollment?.rate ?? 0}%`} icon={<Users className="w-5 h-5" />} color="blue" />
            <StatCard title="工单完成率" value={`${workorders?.completion_rate ?? 0}%`} icon={<ClipboardList className="w-5 h-5" />} color="green" />
            <StatCard title="未关闭偏差" value={quality?.deviation_total ?? 0} icon={<AlertTriangle className="w-5 h-5" />} color="amber" />
            <StatCard title="逾期工单" value={workorders?.overdue ?? 0} icon={<ShieldCheck className="w-5 h-5" />} color="red" />
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Enrollment Progress */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">入组进度</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">已入组 / 目标</span>
                  <span className="font-medium text-slate-800">{enrollment?.enrolled ?? 0} / {protocol?.sample_size ?? 0}</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-4">
                  <div className="bg-blue-500 h-4 rounded-full transition-all"
                    style={{ width: `${Math.min(enrollment?.rate || 0, 100)}%` }} />
                </div>
                {trends?.prediction?.predicted_date && (
                  <div className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
                    预计完成日期: {trends.prediction.predicted_date}（置信度 {trends.prediction.confidence}%）
                  </div>
                )}
              </div>
            </div>

            {/* Enrollment Trend Chart */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">入组趋势</h3>
              {trends?.enrollment?.actual?.length ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={(() => {
                    const dateMap: Record<string, Record<string, number>> = {}
                    for (const p of trends.enrollment.plan || []) { dateMap[p.date] = { ...dateMap[p.date], plan: p.count } }
                    for (const a of trends.enrollment.actual || []) { dateMap[a.date] = { ...dateMap[a.date], actual: a.count } }
                    for (const p of trends.enrollment.predicted || []) { dateMap[p.date] = { ...dateMap[p.date], predicted: p.count } }
                    return Object.entries(dateMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }))
                  })()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="plan" name="计划" stroke="#94a3b8" strokeDasharray="5 5" dot={false} />
                    <Line type="monotone" dataKey="actual" name="实际" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="predicted" name="预测" stroke="#f59e0b" strokeDasharray="3 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Empty description="暂无入组趋势数据" />
              )}
            </div>
          </div>

          {/* Work Order Distribution */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">工单状态分布</h3>
              {woStatusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={woStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                      {woStatusData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Empty description="暂无工单" />
              )}
            </div>

            {/* Work Order Trend */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">工单趋势</h3>
              {trends?.workorder?.series?.length ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trends.workorder.series.slice(-14)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip />
                    <Bar dataKey="created" name="新增" fill="#60a5fa" />
                    <Bar dataKey="completed" name="完成" fill="#34d399" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Empty description="暂无工单趋势" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Subjects Tab */}
      {activeTab === 'subjects' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">受试者列表</h3>
          {(subjectsRes?.data?.items || []).length > 0 ? (
            <DataTable
              columns={[
                { key: 'id', title: 'ID', render: (_: unknown, r: any) => <span className="font-mono text-xs">#{r.id}</span> },
                { key: 'name', title: '姓名' },
                { key: 'gender', title: '性别' },
                { key: 'age', title: '年龄' },
                { key: 'risk_level', title: '风险等级', render: (_: unknown, r: any) => <Badge variant={r.risk_level === 'high' ? 'error' : r.risk_level === 'medium' ? 'warning' : 'success'}>{r.risk_level || '低'}</Badge> },
                { key: 'status', title: '状态', render: (_: unknown, r: any) => <Badge>{STATUS_LABELS[r.status] || r.status}</Badge> },
              ]}
              data={subjectsRes?.data?.items || []}
            />
          ) : (
            <Empty description="暂无受试者数据" />
          )}
        </div>
      )}

      {/* Quality Tab (with AI insight D1) */}
      {activeTab === 'quality' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <StatCard title="偏差总数" value={quality?.deviation_total ?? 0} icon={<AlertTriangle className="w-5 h-5" />} color="amber" />
            <StatCard title="CAPA总数" value={quality?.capa_total ?? 0} icon={<ShieldCheck className="w-5 h-5" />} color="purple" />
            <StatCard title="工单完成率" value={`${workorders?.completion_rate ?? 0}%`} icon={<CheckCircle className="w-5 h-5" />} color="green" />
            <StatCard title="逾期工单" value={workorders?.overdue ?? 0} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
          </div>

          {/* AI Insight for Quality (D1) */}
          <AIInsightWidget
            agentId="insight-agent"
            contextType="quality_analysis"
            contextData={{
              protocol_id: protocolId,
              deviation_total: quality?.deviation_total ?? 0,
              capa_total: quality?.capa_total ?? 0,
              overdue_workorders: workorders?.overdue ?? 0,
              completion_rate: workorders?.completion_rate ?? 0,
            }}
            title="AI 质量分析洞察"
            onTrigger={async (agentId, contextType, contextData) => {
              const res = await api.post<{ data: { content: string } }>('/agents/trigger-insight', {
                agent_id: agentId,
                context_type: contextType,
                context_data: contextData,
              })
              return (res.data as any)?.data?.content || '暂无洞察'
            }}
          />

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">偏差列表</h3>
              {(deviationsRes?.data?.items || []).length > 0 ? (
                <div className="space-y-2">
                  {(deviationsRes?.data?.items || []).map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
                      <div>
                        <span className="font-mono text-xs text-slate-400 mr-2">{d.code}</span>
                        <span className="text-slate-700">{d.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={d.severity === 'critical' ? 'error' : d.severity === 'major' ? 'warning' : 'default'}>{d.severity}</Badge>
                        <Badge>{STATUS_LABELS[d.status] || d.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty description="暂无偏差记录" />
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">CAPA 列表</h3>
              {(capasRes?.data?.items || []).length > 0 ? (
                <div className="space-y-2">
                  {(capasRes?.data?.items || []).map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0 text-sm">
                      <div>
                        <span className="font-mono text-xs text-slate-400 mr-2">{c.code}</span>
                        <span className="text-slate-700">{c.title}</span>
                      </div>
                      <Badge variant={c.status === 'overdue' ? 'error' : c.status === 'closed' ? 'success' : 'warning'}>
                        {STATUS_LABELS[c.status] || c.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty description="暂无 CAPA 记录" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Finance Tab */}
      {activeTab === 'finance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <StatCard title="合同金额" value={`¥${((finance?.contract_amount || 0) / 10000).toFixed(1)}万`} icon={<Banknote className="w-5 h-5" />} color="blue" />
            <StatCard title="已开票" value={`¥${((finance?.invoiced || 0) / 10000).toFixed(1)}万`} icon={<Banknote className="w-5 h-5" />} color="green" />
            <StatCard title="已回款" value={`¥${((finance?.received || 0) / 10000).toFixed(1)}万`} icon={<Banknote className="w-5 h-5" />} color="emerald" />
            <StatCard title="应收" value={`¥${((finance?.outstanding || 0) / 10000).toFixed(1)}万`} icon={<Banknote className="w-5 h-5" />} color="amber" />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-700">利润分析</h3>
              <button onClick={() => generateProfit.mutate()} disabled={generateProfit.isPending}
                className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100">
                {generateProfit.isPending ? '生成中...' : '生成利润分析'}
              </button>
            </div>
            {generateProfit.data?.data ? (
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-slate-500">合同金额</span><div className="font-medium text-slate-800">¥{(generateProfit.data.data as any).contract_amount}</div></div>
                <div><span className="text-slate-500">总成本</span><div className="font-medium text-slate-800">¥{(generateProfit.data.data as any).total_cost}</div></div>
                <div><span className="text-slate-500">毛利率</span><div className="font-medium text-green-600">{(generateProfit.data.data as any).gross_margin}</div></div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">点击"生成利润分析"查看项目盈利情况</p>
            )}
          </div>
        </div>
      )}

      {/* Team Tab */}
      {activeTab === 'team' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">团队工作量统计</h3>
          {(workorders?.by_assignee || []).length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={(workorders?.by_assignee || []).map((a: any) => ({
                name: `用户#${a.assigned_to}`, total: a.total, completed: a.completed,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip /><Legend />
                <Bar dataKey="total" name="总工单" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="已完成" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty description="暂无团队数据" />
          )}
        </div>
      )}

      {/* Meetings Tab (E3) */}
      {activeTab === 'meetings' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">会议与沟通</h3>
          </div>
          {(meetingsRes?.data?.items || []).length > 0 ? (
            <div className="space-y-3">
              {(meetingsRes?.data?.items || []).map((m: any) => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    <div>
                      <div className="text-sm font-medium text-slate-700">{m.title}</div>
                      <div className="text-xs text-slate-400">{m.scheduled_date?.slice(0, 16)} · {m.duration_minutes}分钟</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={m.status === 'completed' ? 'success' : m.status === 'cancelled' ? 'error' : 'default'}>
                      {STATUS_LABELS[m.meeting_type] || m.meeting_type}
                    </Badge>
                    <Badge>{m.status === 'completed' ? '已完成' : m.status === 'cancelled' ? '已取消' : '计划中'}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty description="暂无会议记录" />
          )}
        </div>
      )}

      {/* Documents Tab (eTMF) */}
      {activeTab === 'documents' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">eTMF 文档中心</h3>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {['协议文件', '伦理文件', '知情同意书', 'CRF/数据采集', '报告文件', '通信文件', '监查文件', '归档文件'].map((cat) => (
              <div key={cat} className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
                <FileText className="w-5 h-5 text-blue-400 mb-1" />
                <div className="text-xs font-medium text-slate-600">{cat}</div>
              </div>
            ))}
          </div>
          {(documentsRes?.data?.items || []).length > 0 ? (
            <DataTable
              columns={[
                { key: 'title', title: '文档名称' },
                { key: 'category', title: '分类', render: (_: unknown, r: any) => <Badge>{r.category_name || r.category}</Badge> },
                { key: 'version', title: '版本' },
                { key: 'status', title: '状态', render: (_: unknown, r: any) => <Badge variant={r.status === 'published' ? 'success' : 'default'}>{r.status}</Badge> },
              ]}
              data={documentsRes?.data?.items || []}
            />
          ) : (
            <Empty description="暂无文档，请使用启动包生成功能创建 TMF 文档目录" />
          )}
        </div>
      )}

      {/* Milestones Tab */}
      {activeTab === 'milestones' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">项目里程碑</h3>
          {projectMilestones.length > 0 ? (
            <div className="space-y-4">
              {projectMilestones.map((ms: any, i: number) => (
                <div key={i} className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    ms.is_achieved ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {ms.is_achieved ? <CheckCircle className="w-4 h-4" /> : <Flag className="w-4 h-4" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{ms.name}</span>
                      <Badge variant={ms.is_achieved ? 'success' : 'default'}>
                        {ms.type?.toUpperCase() || ms.name}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      计划: {ms.target_date}
                      {ms.actual_date && <span className="ml-2">实际: {ms.actual_date}</span>}
                    </div>
                  </div>
                  {ms.is_achieved && ms.actual_date && ms.target_date && (
                    <div className={`text-xs px-2 py-0.5 rounded ${
                      ms.actual_date <= ms.target_date ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {ms.actual_date <= ms.target_date ? '按时' : '延期'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty description="暂无里程碑数据，请使用启动包生成功能创建里程碑计划" />
          )}
        </div>
      )}

      {/* Communications Tab */}
      {activeTab === 'communications' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            项目全生命周期沟通时间线
          </h3>
          <CommunicationTimeline protocolId={protocolId} />
        </div>
      )}
    </div>
  )
}
