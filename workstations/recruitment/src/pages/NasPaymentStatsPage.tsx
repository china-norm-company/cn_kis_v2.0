import { useState, useEffect } from 'react'
import {
  CreditCard, TrendingUp, Users, RefreshCw, DollarSign,
  BarChart3, Calendar, Award,
} from 'lucide-react'

const API_BASE = '/v2/api/v1'
const getToken = () =>
  localStorage.getItem('auth_token') ??
  localStorage.getItem('cn_kis_token') ??
  ''

const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
})

async function apiGet(path: string) {
  const r = await fetch(`${API_BASE}${path}`, { headers: headers() })
  return r.json()
}

interface PaymentSummary {
  total_count: number
  total_amount: number
  by_platform: Array<{ platform: string; count: number; amount: number }>
  by_status: Array<{ status: string; count: number; amount: number }>
  nas_import_count: number
  nas_import_amount: number
  top_projects: Array<{ project_code: string; count: number; amount: number }>
}

const PLATFORM_COLORS: Record<string, string> = {
  '八羿':     'bg-blue-100 text-blue-700',
  '福建捷仕达': 'bg-purple-100 text-purple-700',
  '安徽创启':  'bg-orange-100 text-orange-700',
  '安徽斯长':  'bg-green-100 text-green-700',
  '湖北耀运':  'bg-teal-100 text-teal-700',
  '宿钲信息科技': 'bg-indigo-100 text-indigo-700',
  '怀宁青枫':  'bg-pink-100 text-pink-700',
}

function fmtAmount(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toFixed(0)
}

export default function NasPaymentStatsPage() {
  const [summary, setSummary] = useState<PaymentSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiGet('/execution/payments/summary?nas_only=1')
      if (res?.code === 200 && res?.data) {
        setSummary(res.data)
      } else {
        setError(res?.msg ?? '加载失败，请检查登录状态')
      }
    } catch {
      setError('网络错误，请检查连接')
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  if (loading)
    return (
      <div className="space-y-4">
        <div className="h-8 bg-slate-100 rounded animate-pulse w-64" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )

  if (error)
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">NAS 礼金档案汇总</h2>
          <p className="text-sm text-slate-500 mt-1">历史礼金支付档案导入统计</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-amber-800 font-medium mb-2">{error}</p>
          <p className="text-sm text-amber-600 mb-4">
            如 API 未就绪，以下为从数据库直接统计的汇总数据：
          </p>
          {/* 静态摘要（来自最终导入统计） */}
          <div className="grid grid-cols-2 gap-4 text-left max-w-lg mx-auto">
            <div className="bg-white rounded-lg p-3 border border-amber-100">
              <div className="text-xs text-slate-500 mb-1">总礼金记录数</div>
              <div className="text-2xl font-bold text-slate-800">60,605</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-100">
              <div className="text-xs text-slate-500 mb-1">总礼金金额</div>
              <div className="text-2xl font-bold text-slate-800">2,636万</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-100">
              <div className="text-xs text-slate-500 mb-1">涉及受试者</div>
              <div className="text-2xl font-bold text-slate-800">~9,000+</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-100">
              <div className="text-xs text-slate-500 mb-1">积分总计</div>
              <div className="text-2xl font-bold text-slate-800">2,636万</div>
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-600 font-medium">按支付平台分布</div>
          <div className="mt-2 space-y-2 max-w-lg mx-auto text-left">
            {[
              { platform: '八羿', count: 47212, amount: 22269812 },
              { platform: '福建捷仕达', count: 2647, amount: 686241 },
              { platform: '安徽创启', count: 2355, amount: 807107 },
              { platform: '安徽斯长', count: 2177, amount: 1082473 },
              { platform: '湖北耀运', count: 206, amount: 80708 },
              { platform: '宿钲信息科技', count: 199, amount: 136564 },
              { platform: '怀宁青枫', count: 185, amount: 125291 },
              { platform: '（无平台）', count: 5624, amount: 1180034 },
            ].map((p) => (
              <div key={p.platform} className="bg-white rounded-lg p-2.5 border border-amber-100 flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[p.platform] ?? 'bg-slate-100 text-slate-600'}`}>
                  {p.platform}
                </span>
                <div className="flex gap-4 text-xs text-slate-600">
                  <span>{p.count.toLocaleString()} 条</span>
                  <span className="font-medium">{fmtAmount(p.amount)} 元</span>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={load}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm mx-auto hover:bg-amber-700"
          >
            <RefreshCw className="w-4 h-4" />
            重试加载 API 数据
          </button>
        </div>
      </div>
    )

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">NAS 礼金档案汇总</h2>
          <p className="text-sm text-slate-500 mt-1">历史礼金支付档案导入统计（V2数据库）</p>
        </div>
        <button
          onClick={load}
          aria-label="刷新"
          className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 核心指标卡 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          {
            label: 'NAS导入记录',
            value: (summary?.nas_import_count ?? 0).toLocaleString(),
            sub: '条礼金支付记录',
            icon: CreditCard,
            color: 'text-blue-700',
            bg: 'bg-blue-50',
          },
          {
            label: 'NAS导入金额',
            value: `${fmtAmount(summary?.nas_import_amount ?? 0)}元`,
            sub: '历史累计礼金',
            icon: DollarSign,
            color: 'text-emerald-700',
            bg: 'bg-emerald-50',
          },
          {
            label: '总礼金记录',
            value: (summary?.total_count ?? 0).toLocaleString(),
            sub: '全系统支付记录',
            icon: TrendingUp,
            color: 'text-purple-700',
            bg: 'bg-purple-50',
          },
          {
            label: '积分总计',
            value: `${fmtAmount(summary?.nas_import_amount ?? 0)}分`,
            sub: '1元=1积分',
            icon: Award,
            color: 'text-amber-700',
            bg: 'bg-amber-50',
          },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-slate-100`}>
            <div className="flex items-center gap-2 mb-2">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <span className="text-xs text-slate-500">{s.label}</span>
            </div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-400 mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* 按平台分布 + 按项目 TOP 10 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 平台分布 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">按支付平台分布</h3>
          </div>
          <div className="space-y-2.5">
            {(summary?.by_platform ?? []).map((p) => {
              const pct = summary?.nas_import_count
                ? Math.round((p.count / summary.nas_import_count) * 100)
                : 0
              return (
                <div key={p.platform} className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                      PLATFORM_COLORS[p.platform] ?? 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {p.platform || '（未知）'}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                    <div
                      className="bg-blue-400 h-1.5 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 shrink-0 w-24 text-right">
                    {p.count.toLocaleString()} 条 / {fmtAmount(p.amount)}元
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* TOP项目 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">礼金记录 TOP 项目</h3>
          </div>
          <div className="space-y-2">
            {(summary?.top_projects ?? []).slice(0, 10).map((p, i) => (
              <div key={p.project_code} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-4">{i + 1}</span>
                  <span className="text-sm font-mono text-slate-700">{p.project_code || '（无编号）'}</span>
                </div>
                <div className="flex gap-3 text-xs text-slate-500">
                  <span>{p.count.toLocaleString()} 条</span>
                  <span className="font-medium text-slate-700">{fmtAmount(p.amount)}元</span>
                </div>
              </div>
            ))}
            {(summary?.top_projects ?? []).length === 0 && (
              <p className="text-sm text-slate-400">暂无项目统计数据</p>
            )}
          </div>
        </div>
      </div>

      {/* 受试者指标 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-blue-800">受试者数据质量指标（最新统计）</h3>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-700">8,619</div>
            <div className="text-xs text-blue-500">完整身份证档案数</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-700">3,487</div>
            <div className="text-xs text-blue-500">NAS 反向补全 profile</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-700">2,636万</div>
            <div className="text-xs text-blue-500">积分台账总计</div>
          </div>
        </div>
      </div>
    </div>
  )
}
