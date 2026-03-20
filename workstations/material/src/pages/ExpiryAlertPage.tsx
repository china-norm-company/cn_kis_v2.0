import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { ExpiryAlerts, ExpiryAlertItem } from '@cn-kis/api-client'
import { AlertTriangle, ShieldAlert, Clock, Eye, X } from 'lucide-react'

export function ExpiryAlertPage() {
  const queryClient = useQueryClient()
  const [handleId, setHandleId] = useState<number | null>(null)

  // Expiry alerts data
  const { data: alertsData, isLoading } = useQuery({
    queryKey: ['material', 'expiry-alerts'],
    queryFn: () => materialApi.getExpiryAlerts(),
  })
  const alerts = (alertsData as any)?.data as ExpiryAlerts | undefined

  const redItems = alerts?.red ?? []
  const orangeItems = alerts?.orange ?? []
  const yellowItems = alerts?.yellow ?? []

  const levelCards = [
    {
      label: '红色预警',
      desc: '7天内到期/已过期',
      count: alerts?.stats?.red_count ?? '--',
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: <ShieldAlert className="w-6 h-6 text-red-500" />,
    },
    {
      label: '橙色预警',
      desc: '30天内到期',
      count: alerts?.stats?.orange_count ?? '--',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      text: 'text-orange-700',
      icon: <AlertTriangle className="w-6 h-6 text-orange-500" />,
    },
    {
      label: '黄色预警',
      desc: '90天内到期',
      count: alerts?.stats?.yellow_count ?? '--',
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-700',
      icon: <Clock className="w-6 h-6 text-yellow-500" />,
    },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">效期预警</h2>
        <p className="text-sm text-slate-500 mt-1">产品与耗材的效期监控、过期提醒与处理</p>
      </div>

      {/* Alert level cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 md:gap-4">
        {levelCards.map((card) => (
          <div key={card.label} className={`rounded-xl border p-5 ${card.bg} ${card.border}`}>
            <div className="flex items-center justify-between mb-2">
              {card.icon}
              <span className={`text-3xl font-bold ${card.text}`}>{card.count}</span>
            </div>
            <h3 className={`text-base font-semibold ${card.text}`}>{card.label}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{card.desc}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">加载中...</div>
      ) : (
        <>
          {/* Red alerts section */}
          <AlertSection
            title="红色预警（已过期/7天内）"
            titleColor="text-red-700"
            borderColor="border-red-200"
            items={redItems}
            level="red"
            onHandle={setHandleId}
          />

          {/* Orange alerts section */}
          <AlertSection
            title="橙色预警（30天内）"
            titleColor="text-orange-700"
            borderColor="border-orange-200"
            items={orangeItems}
            level="orange"
            onHandle={setHandleId}
          />

          {/* Yellow alerts section */}
          <AlertSection
            title="黄色预警（90天内）"
            titleColor="text-yellow-700"
            borderColor="border-yellow-200"
            items={yellowItems}
            level="yellow"
            onHandle={setHandleId}
          />
        </>
      )}

      {/* Handle alert modal */}
      {handleId && (
        <HandleAlertModal
          id={handleId}
          onClose={() => setHandleId(null)}
          onSuccess={() => {
            setHandleId(null)
            queryClient.invalidateQueries({ queryKey: ['material'] })
          }}
        />
      )}
    </div>
  )
}


// ============================================================================
// Alert Section
// ============================================================================
function AlertSection({
  title,
  titleColor,
  borderColor,
  items,
  level,
  onHandle,
}: {
  title: string
  titleColor: string
  borderColor: string
  items: ExpiryAlertItem[]
  level: 'red' | 'orange' | 'yellow'
  onHandle: (id: number) => void
}) {
  if (items.length === 0) {
    return (
      <div className={`bg-white rounded-xl border ${borderColor} p-6`}>
        <h3 className={`text-base font-semibold ${titleColor} mb-3`}>{title}</h3>
        <p className="text-sm text-slate-400 text-center py-4">暂无预警项</p>
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-xl border ${borderColor} overflow-hidden`}>
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className={`text-base font-semibold ${titleColor}`}>{title}</h3>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="text-left px-4 py-3 font-medium text-slate-600">物料名称</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">编码</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">批号</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">到期日</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">剩余天数</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">存储位置</th>
            <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
            <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 font-medium text-slate-800">{item.material_name}</td>
              <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.material_code}</td>
              <td className="px-4 py-3 text-slate-600">{item.batch_number}</td>
              <td className="px-4 py-3 text-slate-600">{item.expiry_date}</td>
              <td className="px-4 py-3 text-right">
                <DaysRemainingBadge days={item.days_remaining} />
              </td>
              <td className="px-4 py-3 text-slate-600">{item.location || '-'}</td>
              <td className="px-4 py-3">
                <StatusBadge level={level} status={item.status} display={item.status_display} />
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onHandle(item.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100 transition-colors border border-amber-200"
                >
                  <Eye className="w-3.5 h-3.5" />处置
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}


// ============================================================================
// Days Remaining Badge
// ============================================================================
function DaysRemainingBadge({ days }: { days: number }) {
  let className = 'text-yellow-600 font-medium'
  if (days < 0) {
    className = 'text-red-600 font-bold'
  } else if (days < 7) {
    className = 'text-red-600 font-medium'
  } else if (days <= 30) {
    className = 'text-orange-600 font-medium'
  }

  return (
    <span className={`text-sm ${className}`}>
      {days < 0 ? `已过期 ${Math.abs(days)} 天` : `${days} 天`}
    </span>
  )
}


// ============================================================================
// Status Badge
// ============================================================================
function StatusBadge({ level, status, display }: { level: string; status: string; display: string }) {
  let className = 'bg-slate-50 text-slate-600 border-slate-200'

  if (status === 'locked' || level === 'red') {
    className = 'bg-red-50 text-red-600 border-red-200'
  } else if (level === 'orange') {
    className = 'bg-orange-50 text-orange-600 border-orange-200'
  } else if (level === 'yellow') {
    className = 'bg-yellow-50 text-yellow-700 border-yellow-200'
  }

  const label = status === 'locked' ? '已锁定' : level === 'orange' ? '即将过期' : level === 'yellow' ? '关注' : display

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${className}`}>
      {label}
    </span>
  )
}


// ============================================================================
// Handle Alert Modal
// ============================================================================
function HandleAlertModal({ id, onClose, onSuccess }: { id: number; onClose: () => void; onSuccess: () => void }) {
  const [action, setAction] = useState<'lock' | 'destroy_request' | 'extend_evaluate'>('lock')
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => materialApi.handleExpiryAlert(id, {
      action,
      remarks: remarks || undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '处置失败'),
  })

  const actions = [
    { value: 'lock' as const, label: '锁定禁止出库', desc: '锁定该批次物料，禁止出库使用' },
    { value: 'destroy_request' as const, label: '申请销毁', desc: '发起销毁审批流程' },
    { value: 'extend_evaluate' as const, label: '延期评估', desc: '申请效期延长评估' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[92vw] max-w-[480px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">效期处置</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <div className="space-y-3">
            <span className="text-sm font-medium text-slate-700">处置方式</span>
            {actions.map((a) => (
              <label
                key={a.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  action === a.value ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="action"
                  value={a.value}
                  checked={action === a.value}
                  onChange={() => setAction(a.value)}
                  className="mt-0.5 accent-amber-600"
                />
                <div>
                  <div className="text-sm font-medium text-slate-800">{a.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{a.desc}</div>
                </div>
              </label>
            ))}
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">备注</span>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="可选备注信息"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <div className="pt-2 flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '处理中...' : '确认处置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
