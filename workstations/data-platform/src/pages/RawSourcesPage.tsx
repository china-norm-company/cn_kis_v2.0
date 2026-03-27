import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Database, AlertTriangle, CheckCircle } from 'lucide-react'
import { dataPlatformApi } from '@cn-kis/api-client'

const SOURCE_LABELS: Record<string, string> = {
  mail: '飞书邮件', im: '飞书消息', doc: '飞书文档',
  approval: '飞书审批', calendar: '飞书日历', task: '飞书任务',
}

const INJECTION_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:  { label: '待注入', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  injected: { label: '已注入', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  skipped:  { label: '已跳过', color: 'text-slate-500 bg-slate-50 border-slate-200' },
  conflict: { label: '有冲突', color: 'text-red-700 bg-red-50 border-red-200' },
  failed:   { label: '失败',   color: 'text-red-700 bg-red-50 border-red-200' },
}

function BarChart({ data, total }: { data: Record<string, number>; total: number }) {
  if (!data || total === 0) return <p className="text-xs text-slate-400">暂无数据</p>
  return (
    <div className="space-y-2">
      {Object.entries(data)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([key, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-600 truncate max-w-[60%]">{SOURCE_LABELS[key] || key}</span>
                <span className="text-slate-500 shrink-0">{count.toLocaleString()} ({pct}%)</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full">
                <div className="h-1.5 bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
    </div>
  )
}

export function RawSourcesPage() {
  const [data, setData] = useState<any>(null)
  const [conflicts, setConflicts] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(() => {
    setLoading(true)
    Promise.allSettled([
      dataPlatformApi.rawSourcesOverview(),
      dataPlatformApi.conflictsSummary(),
    ]).then(([rawRes, conflictsRes]) => {
      if (rawRes.status === 'fulfilled') setData((rawRes.value as any)?.data ?? null)
      if (conflictsRes.status === 'fulfilled') setConflicts((conflictsRes.value as any)?.data ?? null)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  return (
    <div className="space-y-5">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">外部原始来源治理</h2>
          <p className="text-sm text-slate-500 mt-1">LIMS、易快报、飞书等外部来源的原始数据采集状态与冲突治理</p>
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

      {/* 汇总卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'LIMS 原始记录', value: data?.lims?.total, color: 'text-rose-700' },
          { label: '易快报原始记录', value: data?.ekuaibao?.total, color: 'text-amber-700' },
          { label: '飞书上下文', value: data?.feishu?.total, color: 'text-indigo-700' },
          { label: '接入候选待审', value: data?.candidates?.pending, color: 'text-blue-700' },
        ].map(item => (
          <div key={item.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            {loading ? (
              <div className="h-8 bg-slate-100 rounded animate-pulse mx-auto w-1/2 mb-1" />
            ) : (
              <p className={`text-2xl font-bold ${item.color}`}>
                {item.value != null ? item.value.toLocaleString() : '—'}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>

      {/* 三列来源详情 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LIMS */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-rose-600" />
            <span className="text-sm font-semibold text-slate-700">LIMS 实验室系统</span>
            <span className="ml-auto text-xs text-slate-400">总计 {data?.lims?.total?.toLocaleString() ?? '—'}</span>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-400 mb-2">按模块分布</p>
              <BarChart data={data?.lims?.by_module ?? {}} total={data?.lims?.total ?? 0} />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-2">注入状态</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(data?.lims?.injection_status ?? {}).map(([status, count]) => {
                  const cfg = INJECTION_STATUS_LABELS[status] ?? { label: status, color: 'text-slate-500 bg-slate-50 border-slate-200' }
                  return (
                    <div key={status} className={`text-xs px-2 py-1 rounded border font-medium ${cfg.color}`}>
                      {cfg.label}：{String(count)}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 易快报 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-slate-700">易快报费控系统</span>
            <span className="ml-auto text-xs text-slate-400">总计 {data?.ekuaibao?.total?.toLocaleString() ?? '—'}</span>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-2">按单据类型分布</p>
            <BarChart data={data?.ekuaibao?.by_record_type ?? {}} total={data?.ekuaibao?.total ?? 0} />
          </div>
        </div>

        {/* 飞书 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-semibold text-slate-700">飞书上下文</span>
            <span className="ml-auto text-xs text-slate-400">总计 {data?.feishu?.total?.toLocaleString() ?? '—'}</span>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-2">按来源类型分布</p>
            <BarChart data={data?.feishu?.by_source_type ?? {}} total={data?.feishu?.total ?? 0} />
          </div>
        </div>
      </div>

      {/* 冲突治理 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* LIMS 冲突 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <span className="text-sm font-semibold text-slate-700">LIMS 数据冲突</span>
          </div>
          {loading ? (
            <div className="h-16 bg-slate-100 rounded animate-pulse" />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-center mb-3">
                {[
                  { label: '总计', value: conflicts?.lims?.total, color: 'text-slate-800' },
                  { label: '待审核', value: conflicts?.lims?.pending, color: 'text-amber-600' },
                  { label: '已解决', value: conflicts?.lims?.resolved, color: 'text-emerald-600' },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 rounded-lg p-2">
                    <p className={`text-lg font-bold ${item.color}`}>{item.value ?? '—'}</p>
                    <p className="text-xs text-slate-400">{item.label}</p>
                  </div>
                ))}
              </div>
              {Object.keys(conflicts?.lims?.by_type ?? {}).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(conflicts?.lims?.by_type ?? {}).map(([type, cnt]) => (
                    <span key={type} className="text-[10px] bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded border border-rose-100">
                      {type}: {String(cnt)}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 易快报冲突 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-slate-700">易快报数据冲突</span>
          </div>
          {loading ? (
            <div className="h-16 bg-slate-100 rounded animate-pulse" />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 text-center mb-3">
                {[
                  { label: '总计', value: conflicts?.ekuaibao?.total, color: 'text-slate-800' },
                  { label: '待审核', value: conflicts?.ekuaibao?.pending, color: 'text-amber-600' },
                  { label: '已解决', value: conflicts?.ekuaibao?.resolved, color: 'text-emerald-600' },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 rounded-lg p-2">
                    <p className={`text-lg font-bold ${item.color}`}>{item.value ?? '—'}</p>
                    <p className="text-xs text-slate-400">{item.label}</p>
                  </div>
                ))}
              </div>
              {Object.keys(conflicts?.ekuaibao?.by_type ?? {}).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(conflicts?.ekuaibao?.by_type ?? {}).map(([type, cnt]) => (
                    <span key={type} className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded border border-amber-100">
                      {type}: {String(cnt)}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 最近未解决冲突 */}
      {conflicts?.recent_pending?.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">最近未解决冲突（前 10 条）</h3>
          <div className="space-y-2">
            {conflicts.recent_pending.map((c: any) => (
              <div key={`${c.source}-${c.id}`} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg text-xs">
                <span className={`px-1.5 py-0.5 rounded font-medium shrink-0 ${c.source === 'lims' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                  {c.source === 'lims' ? 'LIMS' : '易快报'}
                </span>
                <span className="text-slate-600 truncate flex-1">{c.module}</span>
                <span className="text-slate-500 shrink-0">{c.conflict_type}</span>
                <span className="text-slate-400 shrink-0">
                  相似度 {Math.round((c.similarity_score ?? 0) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
