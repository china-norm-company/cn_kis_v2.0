import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, StatCard, Badge, DataTable, type Column, Empty } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { AlertTriangle, Info, AlertCircle, CheckCircle2, XCircle, Bell } from 'lucide-react'
import { useState } from 'react'

interface Alert {
  id: number
  client_name: string
  client_id: number
  alert_type: 'churn_risk' | 'revenue_decline' | 'contact_gap' | 'complaint_surge' | 'competitor_threat' | 'payment_overdue' | 'key_person_change' | 'contract_expiring'
  severity: 'info' | 'warning' | 'critical'
  description: string
  suggested_action: string
  resolved: boolean
  resolved_note: string | null
  acknowledged: boolean
  create_time: string
  [key: string]: unknown
}

const alertTypeMap: Record<string, string> = {
  churn_risk: '流失风险',
  revenue_decline: '收入下降',
  contact_gap: '联系中断',
  complaint_surge: '投诉激增',
  competitor_threat: '竞争威胁',
  payment_overdue: '回款逾期',
  key_person_change: '关键人变动',
  contract_expiring: '合同到期',
}

const severityMap: Record<string, { label: string; variant: 'default' | 'warning' | 'error' }> = {
  info: { label: '信息', variant: 'default' },
  warning: { label: '警告', variant: 'warning' },
  critical: { label: '严重', variant: 'error' },
}

export function AlertCenterPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [filterAlertType, setFilterAlertType] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterResolved, setFilterResolved] = useState<boolean | ''>('')

  const { data, isLoading } = useQuery({
    queryKey: ['crm-alerts', page, pageSize, filterAlertType, filterSeverity, filterResolved],
    queryFn: () =>
      api.get<{ items: Alert[]; total: number }>('/crm/alerts/list', {
        params: {
          page,
          page_size: pageSize,
          ...(filterAlertType ? { alert_type: filterAlertType } : {}),
          ...(filterSeverity ? { severity: filterSeverity } : {}),
          ...(filterResolved !== '' ? { resolved: filterResolved } : {}),
        },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['crm-alerts-stats'],
    queryFn: () =>
      api.get<{
        total_unresolved: number
        by_severity: { info: number; warning: number; critical: number }
      }>('/crm/alerts/stats'),
  })

  const acknowledgeMutation = useMutation({
    mutationFn: (id: number) => api.put(`/crm/alerts/${id}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['crm-alerts-stats'] })
    },
  })

  const resolveMutation = useMutation({
    mutationFn: ({ id, resolved_note }: { id: number; resolved_note: string }) =>
      api.put(`/crm/alerts/${id}/resolve`, { resolved_note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-alerts'] })
      queryClient.invalidateQueries({ queryKey: ['crm-alerts-stats'] })
    },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data?.by_severity ?? { info: 0, warning: 0, critical: 0 }

  const handleResolve = (alert: Alert) => {
    const note = prompt('请输入处理说明：')
    if (note !== null) {
      resolveMutation.mutate({ id: alert.id, resolved_note: note })
    }
  }

  const columns: Column<Alert>[] = [
    {
      key: 'client_name',
      title: '客户名称',
      width: 150,
      render: (val) => val ? String(val) : '-',
    },
    {
      key: 'alert_type',
      title: '预警类型',
      width: 120,
      render: (val) => alertTypeMap[val as string] || String(val),
    },
    {
      key: 'severity',
      title: '严重程度',
      width: 100,
      render: (val) => {
        const info = severityMap[val as string]
        return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
      },
    },
    {
      key: 'description',
      title: '描述',
      render: (val) => val ? String(val) : '-',
    },
    {
      key: 'suggested_action',
      title: '建议行动',
      width: 200,
      render: (val) => val ? String(val) : '-',
    },
    {
      key: 'create_time',
      title: '创建时间',
      width: 150,
      render: (val) => val ? new Date(String(val)).toLocaleString('zh-CN') : '-',
    },
    {
      key: 'id' as any,
      title: '操作',
      width: 180,
      render: (_, row) => {
        const alert = row!
        if (alert.resolved) {
          return <span className="text-slate-400 text-sm">已处理</span>
        }
        return (
          <div className="flex gap-2">
            {!alert.acknowledged && (
              <button
                onClick={() => acknowledgeMutation.mutate(alert.id)}
                disabled={acknowledgeMutation.isPending}
                className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 disabled:opacity-50"
              >
                确认
              </button>
            )}
            <button
              onClick={() => handleResolve(alert)}
              disabled={resolveMutation.isPending}
              className="px-3 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100 disabled:opacity-50"
            >
              处理
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">预警中心</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="未处理预警"
          value={statsData?.data?.total_unresolved ?? 0}
          icon={<Bell className="w-6 h-6" />}
        />
        <StatCard
          title="信息级"
          value={stats.info ?? 0}
          icon={<Info className="w-6 h-6" />}
        />
        <StatCard
          title="警告级"
          value={stats.warning ?? 0}
          icon={<AlertTriangle className="w-6 h-6" />}
        />
        <StatCard
          title="严重级"
          value={stats.critical ?? 0}
          icon={<AlertCircle className="w-6 h-6" />}
        />
      </div>

      <div className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 p-3">
        <select
          value={filterAlertType}
          onChange={(e) => {
            setFilterAlertType(e.target.value)
            setPage(1)
          }}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
          aria-label="预警类型筛选"
        >
          <option value="">全部类型</option>
          {Object.entries(alertTypeMap).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={filterSeverity}
          onChange={(e) => {
            setFilterSeverity(e.target.value)
            setPage(1)
          }}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
          aria-label="严重程度筛选"
        >
          <option value="">全部严重程度</option>
          {Object.entries(severityMap).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={filterResolved === false}
            onChange={(e) => setFilterResolved(e.target.checked ? false : '')}
            className="w-4 h-4"
          />
          仅未处理
        </label>
      </div>

      <Card>
        <div className="p-1">
          <DataTable<Alert>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无预警数据"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
        </div>
      </Card>
    </div>
  )
}
