import { useState, useEffect, useCallback } from 'react'
import { BarChart3, RefreshCw, Activity, AlertCircle, TrendingUp, Clock, Eye } from 'lucide-react'
import { governanceApi } from '@cn-kis/api-client'

const WORKSTATIONS = [
  { key: 'governance', label: '鹿鸣·治理台', color: 'bg-emerald-500' },
  { key: 'data-platform', label: '洞明·数据台', color: 'bg-purple-500' },
  { key: 'secretary', label: '子衿·秘书台', color: 'bg-blue-500' },
  { key: 'research', label: '格物·研究台', color: 'bg-indigo-500' },
  { key: 'finance', label: '钱衡·财务台', color: 'bg-green-500' },
  { key: 'control-plane', label: '统一平台', color: 'bg-cyan-500' },
  { key: 'reception', label: '迎宾·接待台', color: 'bg-rose-500' },
  { key: 'evaluator', label: '量化·评估台', color: 'bg-orange-500' },
  { key: 'material', label: '物资·管理台', color: 'bg-amber-500' },
  { key: 'facility', label: '场所·设施台', color: 'bg-teal-500' },
  { key: 'quality', label: '质控·稽查台', color: 'bg-red-500' },
  { key: 'safety', label: '安全·AE台', color: 'bg-pink-500' },
  { key: 'recruitment', label: '招募·入组台', color: 'bg-violet-500' },
  { key: 'workflow', label: '协同·工作流', color: 'bg-sky-500' },
  { key: 'closeout', label: '结项·总结台', color: 'bg-lime-500' },
  { key: 'ethics', label: '御史·伦理台', color: 'bg-fuchsia-500' },
  { key: 'equipment', label: '器械·设备台', color: 'bg-yellow-500' },
]

interface PageViewStat {
  page: string
  workstation: string
  views: number
  avg_duration_s: number
}

interface AuditEntry {
  id: number
  action: string
  resource_type: string
  created_at: string
}

export function FeatureUsagePage() {
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])
  const [pageViews, setPageViews] = useState<PageViewStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'workstation' | 'pages'>('workstation')

  const fetchData = useCallback(() => {
    setLoading(true)
    setError(null)
    // 获取近 500 条审计日志（埋点事件的 resource_type 格式为 workstation.page）
    governanceApi.listAuditLogs({ page: 1, page_size: 500 })
      .then((res: any) => {
        const items: AuditEntry[] = res?.data?.items ?? []
        setAuditLogs(items)

        // 解析页面级埋点（resource_type = "workstation.page"）
        const pageMap: Record<string, { views: number; durations: number[] }> = {}
        items.forEach(log => {
          const rt = log.resource_type || ''
          // 页面级埋点格式：workstation.page（如 governance.dashboard）
          if (rt.includes('.') && !rt.startsWith('t_')) {
            const [ws, ...pageParts] = rt.split('.')
            const page = pageParts.join('/')
            const key = `${ws}::${page}`
            if (!pageMap[key]) pageMap[key] = { views: 0, durations: [] }
            pageMap[key].views += 1
          }
        })

        const pvStats: PageViewStat[] = Object.entries(pageMap)
          .map(([key, data]) => {
            const [ws, page] = key.split('::')
            return {
              workstation: ws,
              page: `/${page}`,
              views: data.views,
              avg_duration_s: 0,
            }
          })
          .sort((a, b) => b.views - a.views)

        setPageViews(pvStats)
      })
      .catch(() => setError('审计数据加载失败'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // 工作台维度统计
  const countByWs: Record<string, number> = {}
  auditLogs.forEach(log => {
    const rt = log.resource_type || ''
    // 埋点格式：workstation.page（如 governance.dashboard）
    // 传统格式：workstation（如 governance）或 resource_name（如 governance_dashboard）
    const ws = rt.includes('.') && !rt.startsWith('t_')
      ? rt.split('.')[0]
      : rt
    if (ws) countByWs[ws] = (countByWs[ws] || 0) + 1
  })

  const workstationsWithData = WORKSTATIONS.map(ws => ({
    ...ws,
    count: countByWs[ws.key] || 0,
  })).sort((a, b) => b.count - a.count)

  const maxCount = Math.max(1, ...workstationsWithData.map(w => w.count))
  const totalLogs = auditLogs.length
  const activeCount = workstationsWithData.filter(w => w.count > 0).length

  // 按日统计趋势（近 7 天）
  const todayStr = new Date().toLocaleDateString('zh-CN')
  const dayStats: Record<string, number> = {}
  auditLogs.forEach(log => {
    const d = new Date(log.created_at).toLocaleDateString('zh-CN')
    dayStats[d] = (dayStats[d] || 0) + 1
  })
  const trendDays = Object.entries(dayStats).sort(([a], [b]) => a.localeCompare(b)).slice(-7)
  const maxDayCount = Math.max(1, ...trendDays.map(([, v]) => v))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">功能使用分析</h2>
          <p className="text-sm text-slate-500 mt-1">基于审计日志 + 前端页面埋点统计（近 500 条）</p>
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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* 汇总统计卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{totalLogs}</p>
          <p className="text-sm text-slate-500 mt-1">事件样本</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{activeCount}</p>
          <p className="text-sm text-slate-500 mt-1">活跃工作台</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{pageViews.length}</p>
          <p className="text-sm text-slate-500 mt-1">页面访问记录</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{dayStats[todayStr] ?? 0}</p>
          <p className="text-sm text-slate-500 mt-1">今日事件</p>
        </div>
      </div>

      {/* 7 天趋势迷你图 */}
      {trendDays.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">近 7 天活动趋势</span>
          </div>
          <div className="flex items-end gap-1 h-16">
            {trendDays.map(([day, cnt]) => (
              <div key={day} className="flex-1 flex flex-col items-center gap-0.5">
                <div
                  className="w-full bg-indigo-500 rounded-t transition-all"
                  style={{ height: `${Math.max(4, (cnt / maxDayCount) * 56)}px` }}
                  title={`${day}: ${cnt} 次`}
                />
                <span className="text-[9px] text-slate-400 leading-none">
                  {day.split('/').slice(1).join('/')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 标签栏 */}
      <div className="flex gap-1 border-b border-slate-200">
        {[
          { key: 'workstation', label: '工作台维度', icon: <BarChart3 size={14} /> },
          { key: 'pages', label: `页面级埋点 ${pageViews.length > 0 ? `(${pageViews.length})` : ''}`, icon: <Eye size={14} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 工作台频次条形图 */}
      {activeTab === 'workstation' && (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">工作台操作频次</h3>
            <span className="text-xs text-slate-400 ml-auto">resource_type 前缀匹配</span>
          </div>
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-32 h-4 bg-slate-100 rounded" />
                  <div className="flex-1 h-4 bg-slate-100 rounded" />
                  <div className="w-8 h-4 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5 space-y-2.5">
              {workstationsWithData.map(ws => (
                <div key={ws.key} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-36 shrink-0 truncate" title={ws.label}>
                    {ws.label}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`${ws.color} h-full rounded-full transition-all duration-500`}
                      style={{ width: ws.count > 0 ? `${Math.max(4, (ws.count / maxCount) * 100)}%` : '0%' }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 w-8 text-right shrink-0">
                    {ws.count > 0 ? ws.count : '–'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 页面级埋点 */}
      {activeTab === 'pages' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">页面访问明细</h3>
            <span className="text-xs text-slate-400 ml-auto">来自前端 usePageTracking hook</span>
          </div>
          {pageViews.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-400">
              <Clock className="w-8 h-8 mx-auto mb-2 text-slate-200" />
              <p className="text-sm">暂无页面级埋点数据</p>
              <p className="text-xs mt-1">
                前端埋点 SDK 已部署（usePageTracking），数据将在用户访问各工作台后自动积累
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pageViews.map((pv, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3">
                  <span className="text-xs w-6 text-slate-300 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-slate-700 font-mono">{pv.page}</code>
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                        {pv.workstation}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Eye size={11} />
                      {pv.views}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 埋点说明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Activity className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-blue-800 mb-1">前端埋点已启用（Wave 5）</h4>
            <p className="text-xs text-blue-700 leading-relaxed">
              鹿鸣·治理台（Governance）和洞明（Data Platform）工作台已接入 usePageTracking hook，每次路由变更和页面离开时自动上报事件。
              数据通过 POST /audit/track 写入审计日志，resource_type 格式为 workstation.page（如 governance.dashboard）。
            </p>
            <p className="text-xs text-blue-600 mt-1.5">
              其他工作台可在 AppLayout.tsx 中添加
              <code className="bg-blue-100 px-1 mx-1 rounded">usePageTracking('workstation-key')</code>
              一行代码即可接入。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
