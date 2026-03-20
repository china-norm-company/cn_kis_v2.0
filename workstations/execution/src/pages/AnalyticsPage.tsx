/**
 * 分析与报表
 *
 * 统计图表 + PDF/Excel 导出
 * - 项目维度：入组率、访视完成率、数据质量评分
 * - 人员维度：工作量统计、质量通过率
 * - 人机料法环分析
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { workorderApi, protocolApi, resourceApi } from '@cn-kis/api-client'
import type { ResourceStatusOverview } from '@cn-kis/api-client'
import { StatCard, Tabs, Empty, Button } from '@cn-kis/ui-kit'
import { ExportButton } from '@cn-kis/ui-kit'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  BarChart3, TrendingUp, Users, Settings, Download,
  Wrench, Package, FileText, Thermometer, Shield, Plus,
} from 'lucide-react'

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理', assigned: '已分配', in_progress: '进行中',
  completed: '已完成', review: '待审核', approved: '已批准', rejected: '已拒绝',
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState('project')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: analyticsRes } = useQuery({
    queryKey: ['analytics', 'summary', dateFrom, dateTo],
    queryFn: () => workorderApi.analyticsSummary({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
  })

  // S5-5: KPI数据
  const { data: kpiRes } = useQuery({
    queryKey: ['analytics', 'kpi', dateFrom, dateTo],
    queryFn: () => workorderApi.analyticsKpi({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    enabled: activeTab === 'kpi',
  })

  const { data: protocolsRes } = useQuery({
    queryKey: ['analytics', 'protocols'],
    queryFn: () => protocolApi.list({ page: 1, page_size: 50 }),
  })

  const { data: statusOverviewRes } = useQuery({
    queryKey: ['resource', 'status-overview'],
    queryFn: () => resourceApi.statusOverview(),
  })

  const analytics = analyticsRes?.data
  const summary = analytics?.summary
  const protocols = protocolsRes?.data?.items ?? []
  const statusOverview = statusOverviewRes?.data as ResourceStatusOverview | undefined

  const woStatusData = (analytics?.status_distribution || []).map(d => ({
    name: STATUS_LABELS[d.status] || d.status,
    value: d.count,
  })).filter(d => d.value > 0)

  const dailyTrend = (analytics?.daily_trend || []).map(d => ({
    day: d.day?.substring(5) || '',
    created: d.created,
    completed: d.completed,
  }))

  const projectData = protocols.map((p: any) => ({
    name: p.title?.substring(0, 10) || `#${p.id}`,
    sample_size: p.sample_size || 0,
  }))

  const exportData = woStatusData.map(d => ({ 状态: d.name, 数量: d.value }))

  // 5M1E data for chart
  const fiveMData = statusOverview ? [
    {
      name: '人',
      total: statusOverview.personnel?.total ?? 0,
      available: statusOverview.personnel?.available ?? 0,
      warning: statusOverview.personnel?.gcp_expiring ?? 0,
    },
    {
      name: '机',
      total: statusOverview.equipment?.total ?? 0,
      available: statusOverview.equipment?.active ?? 0,
      warning: statusOverview.equipment?.calibration_expiring ?? 0,
    },
    {
      name: '料',
      total: statusOverview.material?.total ?? 0,
      available: statusOverview.material?.in_stock ?? 0,
      warning: statusOverview.material?.expiring_soon ?? 0,
    },
    {
      name: '法',
      total: statusOverview.method?.total_sops ?? 0,
      available: statusOverview.method?.effective ?? 0,
      warning: statusOverview.method?.under_review ?? 0,
    },
    {
      name: '环',
      total: 100,
      available: statusOverview.environment?.recent_compliance_rate ?? 100,
      warning: statusOverview.environment?.non_compliant ?? 0,
    },
  ] : []

  const handleExportCSV = () => {
    const url = workorderApi.analyticsExportUrl({ date_from: dateFrom, date_to: dateTo, format: 'csv' })
    window.open(url, '_blank')
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">分析与报表</h2>
          <p className="text-sm text-slate-500 mt-1">项目执行数据分析与统计报告</p>
        </div>
        <ExportButton
          data={exportData}
          filename="analytics-report"
          formats={['excel', 'csv']}
        />
      </div>

      {/* 日期筛选 */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm"
          placeholder="开始日期"
        />
        <span className="shrink-0 text-slate-400">至</span>
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm"
          placeholder="结束日期"
        />
        <button
          onClick={handleExportCSV}
          className="shrink-0 flex min-h-11 items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200"
        >
          <Download className="w-4 h-4" />
          导出 CSV
        </button>
      </div>

      {/* KPI 概要 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard label="工单总量" value={summary?.total || 0} icon={<BarChart3 className="w-5 h-5" />} color="blue" />
        <StatCard label="完成率" value={`${summary?.completion_rate ?? 0}%`} icon={<TrendingUp className="w-5 h-5" />} color="green" />
        <StatCard label="逾期数" value={summary?.overdue || 0} icon={<Users className="w-5 h-5" />} color="amber" />
        <StatCard label="活跃项目" value={protocols.length} icon={<Settings className="w-5 h-5" />} color="purple" />
      </div>

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: 'project', label: '项目分析' },
          { value: 'workorder', label: '工单分析' },
          { value: 'fiveM', label: '人机料法环分析' },
          { value: 'kpi', label: 'KPI绩效' },
          { value: 'alerts', label: '告警配置' },
        ]}
      />

      {activeTab === 'project' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">项目目标样本量</h3>
            {projectData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={projectData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="sample_size" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty message="暂无项目数据" />
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">工单完成趋势（近 30 天）</h3>
            {dailyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="completed" stroke="#22c55e" name="完成" strokeWidth={2} />
                  <Line type="monotone" dataKey="created" stroke="#3b82f6" name="创建" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Empty message="暂无趋势数据" />
            )}
          </div>
        </div>
      )}

      {activeTab === 'workorder' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">工单状态分布</h3>
            {woStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={woStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {woStatusData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty message="暂无工单数据" />
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">人员工单分配</h3>
            {(analytics?.by_assignee || []).length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={(analytics?.by_assignee || []).map((d: any) => ({
                  name: `#${d.assigned_to}`,
                  total: d.total,
                  completed: d.completed,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" fill="#3b82f6" name="总量" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" fill="#22c55e" name="完成" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty message="暂无人员数据" />
            )}
          </div>
        </div>
      )}

      {activeTab === 'fiveM' && (
        <div className="space-y-6">
          {/* 5M1E Overview Chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">人机料法环资源状态</h3>
            {fiveMData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={fiveMData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 14, fontWeight: 'bold' }} width={40} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="available" fill="#22c55e" name="可用/合规" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="warning" fill="#f59e0b" name="预警" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty message="暂无资源数据" />
            )}
          </div>

          {/* 5M Detail Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {statusOverview && (
              <>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-semibold text-slate-700">人</span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between"><span>总人数</span><span className="font-medium">{statusOverview.personnel?.total ?? 0}</span></div>
                    <div className="flex justify-between"><span>合格</span><span className="font-medium text-green-600">{statusOverview.personnel?.available ?? 0}</span></div>
                    <div className="flex justify-between"><span>GCP到期</span><span className="font-medium text-amber-600">{statusOverview.personnel?.gcp_expiring ?? 0}</span></div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Wrench className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-semibold text-slate-700">机</span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between"><span>总设备</span><span className="font-medium">{statusOverview.equipment?.total ?? 0}</span></div>
                    <div className="flex justify-between"><span>在用</span><span className="font-medium text-green-600">{statusOverview.equipment?.active ?? 0}</span></div>
                    <div className="flex justify-between"><span>校准到期</span><span className="font-medium text-amber-600">{statusOverview.equipment?.calibration_expiring ?? 0}</span></div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-semibold text-slate-700">料</span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between"><span>总产品</span><span className="font-medium">{statusOverview.material?.total ?? 0}</span></div>
                    <div className="flex justify-between"><span>库存</span><span className="font-medium text-green-600">{statusOverview.material?.in_stock ?? 0}</span></div>
                    <div className="flex justify-between"><span>即将过期</span><span className="font-medium text-amber-600">{statusOverview.material?.expiring_soon ?? 0}</span></div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-semibold text-slate-700">法</span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between"><span>总SOP</span><span className="font-medium">{statusOverview.method?.total_sops ?? 0}</span></div>
                    <div className="flex justify-between"><span>有效</span><span className="font-medium text-green-600">{statusOverview.method?.effective ?? 0}</span></div>
                    <div className="flex justify-between"><span>待审核</span><span className="font-medium text-amber-600">{statusOverview.method?.under_review ?? 0}</span></div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Thermometer className="w-4 h-4 text-teal-500" />
                    <span className="text-sm font-semibold text-slate-700">环</span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between"><span>场地数</span><span className="font-medium">{statusOverview.environment?.total_venues ?? 0}</span></div>
                    <div className="flex justify-between"><span>合规率</span><span className="font-medium text-green-600">{statusOverview.environment?.recent_compliance_rate ?? 100}%</span></div>
                    <div className="flex justify-between"><span>不合规</span><span className="font-medium text-amber-600">{statusOverview.environment?.non_compliant ?? 0}</span></div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* S5-5: KPI 绩效 Tab */}
      {activeTab === 'kpi' && <KpiPanel kpiRes={kpiRes} dateFrom={dateFrom} dateTo={dateTo} protocols={protocols} />}

      {/* P3-4: 告警配置 Tab */}
      {activeTab === 'alerts' && <AlertConfigPanel />}
    </div>
  )
}

function KpiPanel({ kpiRes, dateFrom, dateTo, protocols }: {
  kpiRes: any; dateFrom: string; dateTo: string; protocols: any[]
}) {
  const [compareMode, setCompareMode] = useState(false)
  const [compareDimension, setCompareDimension] = useState<'person' | 'project' | 'period'>('person')
  const [compareItemA, setCompareItemA] = useState('')
  const [compareItemB, setCompareItemB] = useState('')

  const { data: kpiResA } = useQuery({
    queryKey: ['analytics', 'kpi-compare-a', compareDimension, compareItemA, dateFrom, dateTo],
    queryFn: () => workorderApi.analyticsKpi({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      ...(compareDimension === 'person' ? { assigned_to: Number(compareItemA) } : {}),
      ...(compareDimension === 'project' ? { protocol_id: Number(compareItemA) } : {}),
    }),
    enabled: compareMode && !!compareItemA,
  })

  const { data: kpiResB } = useQuery({
    queryKey: ['analytics', 'kpi-compare-b', compareDimension, compareItemB, dateFrom, dateTo],
    queryFn: () => workorderApi.analyticsKpi({
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      ...(compareDimension === 'person' ? { assigned_to: Number(compareItemB) } : {}),
      ...(compareDimension === 'project' ? { protocol_id: Number(compareItemB) } : {}),
    }),
    enabled: compareMode && !!compareItemB,
  })

  const kpi = kpiRes?.data
  const details = kpi?.details

  const kpiCards = [
    { label: '按时完成率', value: `${kpi?.on_time_completion_rate ?? 0}%`, color: 'green' as const },
    { label: '质量审计通过率', value: `${kpi?.quality_audit_pass_rate ?? 0}%`, color: 'blue' as const },
    { label: '异常发生率', value: `${kpi?.exception_rate ?? 0}%`, color: kpi?.exception_rate && kpi.exception_rate > 10 ? 'red' as const : 'green' as const },
    { label: '设备利用率', value: `${kpi?.equipment_utilization ?? 0}%`, color: 'amber' as const },
    { label: '人均工单量', value: `${kpi?.avg_workorders_per_person ?? 0}`, color: 'blue' as const },
    { label: '平均周转(小时)', value: kpi?.avg_turnaround_hours != null ? `${kpi.avg_turnaround_hours}` : '-', color: 'purple' as const },
  ]

  const compareData = (kpiResA?.data && kpiResB?.data) ? [
    { name: '按时完成率', A: kpiResA.data.on_time_completion_rate, B: kpiResB.data.on_time_completion_rate },
    { name: '质量通过率', A: kpiResA.data.quality_audit_pass_rate, B: kpiResB.data.quality_audit_pass_rate },
    { name: '设备利用率', A: kpiResA.data.equipment_utilization, B: kpiResB.data.equipment_utilization },
    { name: '异常率', A: kpiResA.data.exception_rate, B: kpiResB.data.exception_rate },
  ] : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 flex-1">
          {kpiCards.map((card) => (
            <StatCard key={card.label} label={card.label} value={card.value} color={card.color} icon={<TrendingUp className="w-5 h-5" />} />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-700">KPI 对比分析</h3>
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`min-h-10 px-3 py-1.5 text-xs rounded-lg transition-colors ${compareMode ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            data-testid="compare-mode-toggle"
          >
            {compareMode ? '关闭对比' : '对比模式'}
          </button>
        </div>

        {compareMode && (
          <div className="space-y-3 mb-4">
            <div className="flex flex-wrap gap-3 items-center">
              <label className="text-xs text-slate-500">对比维度：</label>
              {(['person', 'project', 'period'] as const).map(dim => (
                <button
                  key={dim}
                  onClick={() => { setCompareDimension(dim); setCompareItemA(''); setCompareItemB('') }}
                  className={`min-h-9 px-2 py-1 text-xs rounded ${compareDimension === dim ? 'bg-primary-100 text-primary-700' : 'bg-slate-50 text-slate-500'}`}
                  data-testid={`compare-dim-${dim}`}
                >
                  {dim === 'person' ? '按人' : dim === 'project' ? '按项目' : '按周期'}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              {compareDimension === 'project' ? (
                <>
                  <select className="text-sm min-h-11 border border-slate-200 rounded-lg px-3 py-1.5 flex-1" value={compareItemA} onChange={e => setCompareItemA(e.target.value)} data-testid="compare-project-a" title="选择项目 A">
                    <option value="">选择项目 A</option>
                    {protocols.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                  <select className="text-sm min-h-11 border border-slate-200 rounded-lg px-3 py-1.5 flex-1" value={compareItemB} onChange={e => setCompareItemB(e.target.value)} data-testid="compare-project-b" title="选择项目 B">
                    <option value="">选择项目 B</option>
                    {protocols.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </>
              ) : compareDimension === 'person' ? (
                <>
                  <input type="number" className="text-sm min-h-11 border border-slate-200 rounded-lg px-3 py-1.5 flex-1" placeholder="人员ID A" value={compareItemA} onChange={e => setCompareItemA(e.target.value)} />
                  <input type="number" className="text-sm min-h-11 border border-slate-200 rounded-lg px-3 py-1.5 flex-1" placeholder="人员ID B" value={compareItemB} onChange={e => setCompareItemB(e.target.value)} />
                </>
              ) : (
                <>
                  <select title="选择周期 A" className="text-sm min-h-11 border border-slate-200 rounded-lg px-3 py-1.5 flex-1" value={compareItemA} onChange={e => setCompareItemA(e.target.value)}>
                    <option value="">周期 A</option>
                    <option value="this_week">本周</option>
                    <option value="last_week">上周</option>
                    <option value="this_month">本月</option>
                    <option value="last_month">上月</option>
                  </select>
                  <select title="选择周期 B" className="text-sm min-h-11 border border-slate-200 rounded-lg px-3 py-1.5 flex-1" value={compareItemB} onChange={e => setCompareItemB(e.target.value)}>
                    <option value="">周期 B</option>
                    <option value="this_week">本周</option>
                    <option value="last_week">上周</option>
                    <option value="this_month">本月</option>
                    <option value="last_month">上月</option>
                  </select>
                </>
              )}
            </div>
            {compareData.length > 0 && (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={compareData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="A" fill="#3b82f6" name="对象 A" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="B" fill="#22c55e" name="对象 B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {details && !compareMode && (
          <div className="space-y-4">
          <h3 className="text-base font-semibold text-slate-700">KPI明细数据</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-slate-800">{details.total_workorders}</div>
              <div className="text-xs text-slate-500 mt-1">总工单数</div>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{details.completed_workorders}</div>
              <div className="text-xs text-slate-500 mt-1">已完成</div>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{details.on_time_completed}</div>
              <div className="text-xs text-slate-500 mt-1">按时完成</div>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <div className="text-2xl font-bold text-amber-600">{details.total_exceptions}</div>
              <div className="text-xs text-slate-500 mt-1">异常总数</div>
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AlertConfigPanel() {
  const queryClient = useQueryClient()
  const [newAlert, setNewAlert] = useState({ alert_type: '', threshold: '', level: 'warning', is_enabled: true })
  const [showAddForm, setShowAddForm] = useState(false)

  const { data: configsRes } = useQuery({
    queryKey: ['workorder', 'alert-configs'],
    queryFn: () => workorderApi.alertConfigs(),
  })

  const saveMutation = useMutation({
    mutationFn: (data: { alert_type: string; threshold: number; level: string; is_enabled: boolean }) =>
      workorderApi.createAlertConfig(data),
    onSuccess: () => {
      setShowAddForm(false)
      setNewAlert({ alert_type: '', threshold: '', level: 'warning', is_enabled: true })
      queryClient.invalidateQueries({ queryKey: ['workorder', 'alert-configs'] })
    },
  })

  const handleSaveAlert = () => {
    if (!newAlert.alert_type || !newAlert.threshold) return
    saveMutation.mutate({
      alert_type: newAlert.alert_type,
      threshold: Number(newAlert.threshold),
      level: newAlert.level,
      is_enabled: newAlert.is_enabled,
    })
  }

  const configs = Array.isArray(configsRes?.data) ? configsRes.data : []

  const ALERT_TYPE_LABELS: Record<string, string> = {
    workorder_overdue: '工单逾期',
    workload_imbalance: '负载不均',
    equipment_calibration: '设备校准',
    subject_no_show: '受试者缺席',
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6" data-testid="alert-config-panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-slate-600" />
          <h3 className="text-base font-semibold text-slate-700">告警阈值配置</h3>
        </div>
        <PermissionGuard permission="execution.analytics.manage">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex min-h-10 items-center gap-1 px-3 py-1.5 text-xs bg-primary-50 text-primary-600 hover:bg-primary-100 rounded-lg"
            data-testid="add-alert-btn"
          >
            <Plus className="w-3.5 h-3.5" /> 新增告警
          </button>
        </PermissionGuard>
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3" data-testid="add-alert-form">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select
              className="text-sm min-h-11 border border-slate-200 rounded-lg px-3 py-2"
              value={newAlert.alert_type}
              onChange={e => setNewAlert(prev => ({ ...prev, alert_type: e.target.value }))}
              title="告警类型"
            >
              <option value="">选择类型</option>
              {Object.entries(ALERT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input
              type="number"
              className="text-sm min-h-11 border border-slate-200 rounded-lg px-3 py-2"
              placeholder="阈值"
              value={newAlert.threshold}
              onChange={e => setNewAlert(prev => ({ ...prev, threshold: e.target.value }))}
              title="告警阈值"
            />
            <select
              className="text-sm min-h-11 border border-slate-200 rounded-lg px-3 py-2"
              value={newAlert.level}
              onChange={e => setNewAlert(prev => ({ ...prev, level: e.target.value }))}
              title="告警级别"
            >
              <option value="info">信息</option>
              <option value="warning">警告</option>
              <option value="critical">严重</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="xs" onClick={() => setShowAddForm(false)}>取消</Button>
            <Button
              variant="primary"
              size="xs"
              onClick={handleSaveAlert}
              disabled={!newAlert.alert_type || !newAlert.threshold || saveMutation.isPending}
            >
              {saveMutation.isPending ? '保存中...' : '保存'}
            </Button>
          </div>
          {saveMutation.isError && <p className="text-xs text-red-600">保存失败，请重试</p>}
        </div>
      )}

      {configs.length === 0 ? (
        <Empty message="暂无告警配置" />
      ) : (
        <div className="space-y-2">
          {configs.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${c.is_enabled ? 'bg-green-500' : 'bg-slate-300'}`} />
                <span className="text-sm text-slate-700">{ALERT_TYPE_LABELS[c.alert_type] || c.alert_type}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>阈值: {c.threshold}</span>
                <span>级别: {c.level}</span>
                <span>{c.is_enabled ? '已启用' : '已禁用'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
