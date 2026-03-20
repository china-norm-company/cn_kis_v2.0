import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { labPersonnelApi } from '@cn-kis/api-client'
import type { RiskItem, RiskStats } from '@cn-kis/api-client'
import { AlertTriangle, ShieldAlert, RefreshCw, CheckCircle2 } from 'lucide-react'

const RISK_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'cert_expiry', label: '证书到期' },
  { value: 'single_point', label: '单点依赖' },
  { value: 'overload', label: '过度疲劳' },
  { value: 'skill_decay', label: '能力萎缩' },
  { value: 'quality_decline', label: '质量下滑' },
  { value: 'turnover', label: '人员流失' },
  { value: 'capacity_bottleneck', label: '产能瓶颈' },
  { value: 'training_debt', label: '培训欠账' },
]

const LEVEL_OPTIONS = [
  { value: '', label: '全部等级' },
  { value: 'red', label: '红色 — 立即行动' },
  { value: 'yellow', label: '黄色 — 一周内' },
  { value: 'blue', label: '蓝色 — 月度关注' },
]

export function RiskAlertPage() {
  const [typeFilter, setTypeFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')

  const { data: riskData, refetch: refetchRisks } = useQuery({
    queryKey: ['lab-personnel', 'risks', { typeFilter, levelFilter }],
    queryFn: () => labPersonnelApi.getRisks({
      ...(typeFilter ? { risk_type: typeFilter } : {}),
      ...(levelFilter ? { level: levelFilter } : {}),
    }),
  })
  const risks = ((riskData as any)?.data as { items: RiskItem[] } | undefined)?.items ?? []

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['lab-personnel', 'risk-stats'],
    queryFn: () => labPersonnelApi.getRiskStats(),
  })
  const stats = (statsData as any)?.data as RiskStats | undefined

  const levelBadge = (level: string, display: string) => {
    const cls: Record<string, string> = {
      red: 'bg-red-100 text-red-700 border-red-200',
      yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      blue: 'bg-blue-100 text-blue-700 border-blue-200',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${cls[level] || 'bg-slate-100 text-slate-600'}`}>{display}</span>
  }

  const statusBadge = (status: string, display: string) => {
    const cls: Record<string, string> = {
      open: 'bg-red-50 text-red-600',
      acknowledged: 'bg-yellow-50 text-yellow-600',
      resolved: 'bg-green-50 text-green-600',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[status] || 'bg-slate-100 text-slate-600'}`}>{display}</span>
  }

  const riskCardBorder = (level: string) => {
    if (level === 'red') return 'border-l-4 border-l-red-500'
    if (level === 'yellow') return 'border-l-4 border-l-yellow-500'
    return 'border-l-4 border-l-blue-400'
  }

  async function handleScan() {
    setScanning(true)
    setScanMsg('')
    try {
      const res = await labPersonnelApi.triggerRiskScan()
      const result = (res as any)?.data
      await refetchRisks()
      await refetchStats()
      setScanMsg(`扫描完成，发现 ${result?.new_risks ?? 0} 个新风险`)
      setTimeout(() => setScanMsg(''), 5000)
    } finally {
      setScanning(false)
    }
  }

  async function handleAcknowledge(riskId: number) {
    await labPersonnelApi.acknowledgeRisk(riskId)
    await refetchRisks()
  }

  const statCards = [
    { key: 'red', label: '红色风险', value: stats?.by_level?.red ?? 0, color: 'text-red-600', bg: 'bg-red-50' },
    { key: 'yellow', label: '黄色风险', value: stats?.by_level?.yellow ?? 0, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { key: 'blue', label: '蓝色风险', value: stats?.by_level?.blue ?? 0, color: 'text-blue-600', bg: 'bg-blue-50' },
    { key: 'resolved', label: '本月已解决', value: stats?.resolved_this_month ?? 0, color: 'text-green-600', bg: 'bg-green-50' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">风险预警</h2>
          <p className="text-sm text-slate-500 mt-1">8类风险规则自动扫描 — 证书到期、单点依赖、疲劳、能力萎缩、质量、流失、产能、培训</p>
        </div>
        <button onClick={handleScan} disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />{scanning ? '扫描中...' : '立即扫描'}
        </button>
      </div>

      {/* Scan Result Message */}
      {scanMsg && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm font-medium" data-section="scan-result">
          {scanMsg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map(s => (
          <div key={s.key} className={`rounded-xl border border-slate-200 p-4 ${s.bg}`} data-stat={s.key}>
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" aria-label="风险类型">
          {RISK_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" aria-label="风险等级">
          {LEVEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Risk List */}
      <div className="space-y-3" data-section="risk-list">
        {risks.map(risk => (
          <div key={risk.id} className={`risk-card bg-white rounded-xl border border-slate-200 p-4 ${riskCardBorder(risk.level)}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className={`w-5 h-5 ${risk.level === 'red' ? 'text-red-500' : risk.level === 'yellow' ? 'text-yellow-500' : 'text-blue-500'}`} />
                <h3 className="font-medium text-slate-800">{risk.title}</h3>
              </div>
              <div className="flex items-center gap-2">
                {levelBadge(risk.level, risk.level_display)}
                {statusBadge(risk.status, risk.status_display)}
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-2">{risk.description}</p>
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400">
                <span>{risk.risk_type_display}</span>
                {risk.related_staff_name && <span> · 关联: {risk.related_staff_name}</span>}
                <span> · {risk.create_time}</span>
              </div>
              {risk.status === 'open' && (
                <button onClick={() => handleAcknowledge(risk.id)} className="px-3 py-1 text-xs font-medium text-violet-600 border border-violet-200 rounded-lg hover:bg-violet-50 transition-colors">
                  确认风险
                </button>
              )}
              {risk.status === 'resolved' && risk.action_taken && (
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="w-3 h-3" />{risk.action_taken}
                </div>
              )}
            </div>
          </div>
        ))}
        {risks.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-400">暂无风险预警</p>
          </div>
        )}
      </div>
    </div>
  )
}
