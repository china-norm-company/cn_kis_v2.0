/**
 * CRC主管仪表盘 — 多项目交付指挥中心
 *
 * 展示所有活跃项目的交付进度、CRC团队负载矩阵、待处理决策队列、风险预警聚合。
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { workorderApi, schedulingApi } from '@cn-kis/api-client'
import { StatCard, Badge, Empty, Modal, Button } from '@cn-kis/ui-kit'
import {
  LayoutDashboard, Users, AlertTriangle, CheckCircle,
  ClipboardList, CalendarClock, ShieldAlert, TrendingUp,
  Send, FileText, ThumbsUp, ThumbsDown, ToggleLeft, ToggleRight,
} from 'lucide-react'

const SEVERITY_CONFIG: Record<string, { label: string; color: 'error' | 'warning' | 'default' }> = {
  critical: { label: '严重', color: 'error' },
  high: { label: '高', color: 'error' },
  medium: { label: '中', color: 'warning' },
  low: { label: '低', color: 'default' },
}

const ALERT_LEVEL_CONFIG: Record<string, { color: 'error' | 'warning' | 'default' }> = {
  critical: { color: 'error' },
  high: { color: 'error' },
  medium: { color: 'warning' },
  low: { color: 'default' },
}

export default function CRCSupervisorDashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [reportModal, setReportModal] = useState<{ protocolId: number; title: string } | null>(null)
  const [approvalModal, setApprovalModal] = useState<{ id: number; workOrderId: number; action: 'approve' | 'reject'; title: string } | null>(null)
  const [approvalNote, setApprovalNote] = useState('')
  const [autoReportToggles, setAutoReportToggles] = useState<Record<number, boolean>>({})

  const { data: dashRes, isLoading } = useQuery({
    queryKey: ['workorder', 'crc-dashboard'],
    queryFn: () => workorderApi.crcDashboard(),
    refetchInterval: 60_000,
  })

  const { data: schedRes } = useQuery({
    queryKey: ['scheduling', 'cross-project-overview'],
    queryFn: () => schedulingApi.crossProjectOverview(),
    refetchInterval: 120_000,
  })

  const reportQuery = useQuery({
    queryKey: ['workorder', 'progress-report', reportModal?.protocolId],
    queryFn: () => workorderApi.generateProgressReport(reportModal!.protocolId),
    enabled: !!reportModal,
  })

  const sendReportMutation = useMutation({
    mutationFn: (protocolId: number) => workorderApi.sendProgressReport(protocolId, {}),
    onSuccess: () => setReportModal(null),
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => workorderApi.approve(id),
    onSuccess: () => {
      setApprovalModal(null)
      setApprovalNote('')
      queryClient.invalidateQueries({ queryKey: ['workorder', 'crc-dashboard'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (id: number) => workorderApi.reject(id),
    onSuccess: () => {
      setApprovalModal(null)
      setApprovalNote('')
      queryClient.invalidateQueries({ queryKey: ['workorder', 'crc-dashboard'] })
    },
  })

  const autoReportMutation = useMutation({
    mutationFn: ({ protocolId, enabled }: { protocolId: number; enabled: boolean }) =>
      workorderApi.sendProgressReport(protocolId, { chat_id: enabled ? 'auto' : '' }),
    onSuccess: (_, vars) => {
      setAutoReportToggles(prev => ({ ...prev, [vars.protocolId]: vars.enabled }))
    },
  })

  const dashboard = dashRes?.data
  const schedOverview = schedRes?.data

  if (isLoading) {
    return <div className="text-sm text-slate-400 p-6">加载中...</div>
  }

  const summary = dashboard?.summary
  const projects = dashboard?.project_progress ?? []
  const workload = dashboard?.crc_workload ?? []
  const decisions = dashboard?.pending_decisions ?? []
  const alerts = dashboard?.risk_alerts ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">多项目交付指挥中心</h2>
        <p className="text-sm text-slate-500 mt-1">CRC主管 — 全局项目交付监控与团队管理</p>
      </div>

      {/* KPI 概览 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="总工单数"
          value={summary?.total_work_orders ?? 0}
          icon={<ClipboardList className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          label="今日排程"
          value={summary?.today_scheduled ?? 0}
          icon={<CalendarClock className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          label="活跃工单"
          value={summary?.active_work_orders ?? 0}
          icon={<TrendingUp className="w-5 h-5" />}
          color="amber"
        />
        <StatCard
          label="今日完成"
          value={summary?.completed_today ?? 0}
          icon={<CheckCircle className="w-5 h-5" />}
          color="green"
        />
      </div>

      {/* 项目进度 + CRC负载 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 项目交付进度 */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-700 mb-4">项目交付进度</h3>
          {projects.length === 0 ? (
            <Empty message="暂无活跃项目" />
          ) : (
            <div className="space-y-3">
              {projects.map((p) => (
                <div key={p.protocol_id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 truncate flex-1">{p.protocol_title}</span>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const enabled = !autoReportToggles[p.protocol_id]
                          autoReportMutation.mutate({ protocolId: p.protocol_id, enabled })
                        }}
                        className="text-slate-400 hover:text-primary-600 transition-colors"
                        title={autoReportToggles[p.protocol_id] ? '关闭自动通报' : '开启自动通报'}
                        data-testid={`auto-report-toggle-${p.protocol_id}`}
                      >
                        {autoReportToggles[p.protocol_id]
                          ? <ToggleRight className="w-4 h-4 text-primary-600" />
                          : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setReportModal({ protocolId: p.protocol_id, title: p.protocol_title })
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 text-xs text-primary-600 bg-primary-50 hover:bg-primary-100 rounded transition-colors"
                        data-testid={`report-btn-${p.protocol_id}`}
                      >
                        <Send className="w-3 h-3" /> 通报
                      </button>
                      <span className="text-slate-500">{p.completion_rate}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(p.completion_rate, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>完成 {p.completed}/{p.total}</span>
                    <span>进行中 {p.in_progress}</span>
                    <span>待处理 {p.pending}</span>
                    {p.overdue > 0 && (
                      <span className="text-red-500">逾期 {p.overdue}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CRC团队负载矩阵 */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-700 mb-4">CRC团队负载</h3>
          {workload.length === 0 ? (
            <Empty message="暂无团队负载数据" />
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-5 gap-2 text-xs text-slate-400 font-medium px-2">
                <span>成员</span>
                <span className="text-center">活跃</span>
                <span className="text-center">项目</span>
                <span className="text-center">今日</span>
                <span className="text-center">逾期</span>
              </div>
              {workload.map((w) => (
                <div
                  key={w.user_id}
                  className="grid grid-cols-5 gap-2 items-center text-sm p-2 rounded-lg hover:bg-slate-50"
                >
                  <span className="text-slate-700 truncate">{w.user_name}</span>
                  <span className="text-center font-medium">{w.active_count}</span>
                  <span className="text-center">{w.project_count}</span>
                  <span className="text-center">{w.today_count}</span>
                  <span className={`text-center ${w.overdue_count > 0 ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                    {w.overdue_count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 待处理决策 + 风险预警 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 待处理决策队列 */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-semibold text-slate-700">待处理决策</h3>
            {decisions.length > 0 && (
              <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                {decisions.length} 项
              </span>
            )}
          </div>
          {decisions.length === 0 ? (
            <Empty message="暂无待处理决策" />
          ) : (
            <div className="space-y-2">
              {decisions.map((d) => {
                const severity = SEVERITY_CONFIG[d.severity] || SEVERITY_CONFIG.low
                return (
                  <div
                    key={`${d.type}-${d.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => navigate(`/workorders/${d.work_order_id}`)}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={severity.color}>{severity.label}</Badge>
                        <span className="text-sm text-slate-700 truncate">{d.title}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 truncate">{d.description}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <button
                        onClick={() => setApprovalModal({ id: d.id, workOrderId: d.work_order_id, action: 'approve', title: d.title })}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                        title="批准"
                        data-testid={`approve-btn-${d.work_order_id}`}
                      >
                        <ThumbsUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setApprovalModal({ id: d.id, workOrderId: d.work_order_id, action: 'reject', title: d.title })}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="拒绝"
                        data-testid={`reject-btn-${d.work_order_id}`}
                      >
                        <ThumbsDown className="w-4 h-4" />
                      </button>
                      <span className="text-xs text-slate-400">
                        {d.created_at?.split('T')[0]}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 风险预警 */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            <h3 className="text-base font-semibold text-slate-700">风险预警</h3>
          </div>
          {alerts.length === 0 ? (
            <Empty message="暂无风险预警" />
          ) : (() => {
            const SOURCE_LABELS: Record<string, string> = {
              workorder: '工单',
              resource: '设备',
              lab_personnel: '人员',
              material: '物料',
              facility: '设施',
              config: '自定义',
            }
            const grouped = alerts.reduce<Record<string, typeof alerts>>((acc, a) => {
              const src = (a as any).source || 'workorder'
              if (!acc[src]) acc[src] = []
              acc[src].push(a)
              return acc
            }, {})
            return (
              <div className="space-y-3">
                {Object.entries(grouped).map(([src, items]) => (
                  <div key={src}>
                    {Object.keys(grouped).length > 1 && (
                      <div className="text-xs text-slate-400 mb-1 font-medium">{SOURCE_LABELS[src] || src}</div>
                    )}
                    <div className="space-y-1">
                      {items.map((a, i) => {
                        const level = ALERT_LEVEL_CONFIG[a.level] || ALERT_LEVEL_CONFIG.low
                        return (
                          <div
                            key={i}
                            className="flex items-center justify-between p-3 rounded-lg bg-slate-50"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant={level.color}>{a.level}</Badge>
                              <span className="text-sm text-slate-700">{a.message}</span>
                            </div>
                            <span className="text-sm font-bold text-slate-600">{a.count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* 跨项目排程冲突概要 */}
          {schedOverview && schedOverview.total_conflicts > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="flex items-center gap-2 text-sm">
                <CalendarClock className="w-4 h-4 text-amber-600" />
                <span className="text-amber-800 font-medium">
                  {schedOverview.total_plans} 个排程计划中存在 {schedOverview.total_conflicts} 个冲突
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 进展通报 Modal */}
      {reportModal && (
        <Modal isOpen={true} title={`进展通报 — ${reportModal.title}`} onClose={() => setReportModal(null)}>
          {reportQuery.isLoading ? (
            <div className="text-sm text-slate-400 py-8 text-center">生成报告中...</div>
          ) : reportQuery.data?.data ? (() => {
            const r = reportQuery.data.data
            return (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-blue-50 rounded-lg text-center">
                    <div className="text-lg font-bold text-blue-700">{r.workorder_summary.today_completed}/{r.workorder_summary.today_total}</div>
                    <div className="text-xs text-blue-600">今日完成</div>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg text-center">
                    <div className="text-lg font-bold text-green-700">{r.workorder_summary.overall_completion_rate}%</div>
                    <div className="text-xs text-green-600">总体完成率</div>
                  </div>
                </div>
                {r.highlights.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-1">亮点</h4>
                    <ul className="text-xs text-slate-600 space-y-1">
                      {r.highlights.map((h, i) => <li key={i}>• {h}</li>)}
                    </ul>
                  </div>
                )}
                {r.issues.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-1">待解决</h4>
                    <ul className="text-xs text-red-600 space-y-1">
                      {r.issues.map((issue, i) => <li key={i}>• {issue}</li>)}
                    </ul>
                  </div>
                )}
                {r.exceptions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-1">异常事件</h4>
                    <div className="space-y-1">
                      {r.exceptions.map((ex) => (
                        <div key={ex.id} className="text-xs p-2 bg-amber-50 rounded">
                          <Badge variant={ex.severity === 'high' ? 'error' : 'warning'}>{ex.severity}</Badge>
                          <span className="ml-2 text-slate-700">{ex.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-1">明日预览</h4>
                  <p className="text-xs text-slate-600">
                    {r.tomorrow_preview.date} 排程 {r.tomorrow_preview.total_scheduled} 项，涉及 {r.tomorrow_preview.subjects_count} 名受试者
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <Button variant="secondary" onClick={() => setReportModal(null)}>关闭</Button>
                  <Button
                    variant="primary"
                    onClick={() => sendReportMutation.mutate(reportModal.protocolId)}
                    disabled={sendReportMutation.isPending}
                  >
                    <Send className="w-4 h-4 mr-1" />
                    {sendReportMutation.isPending ? '发送中...' : '发送到飞书'}
                  </Button>
                </div>
              </div>
            )
          })() : (
            <div className="text-sm text-slate-400 py-8 text-center">无法生成报告</div>
          )}
        </Modal>
      )}

      {/* 审批确认 Modal */}
      {approvalModal && (
        <Modal
          isOpen={true}
          title={`${approvalModal.action === 'approve' ? '批准' : '拒绝'}确认`}
          onClose={() => { setApprovalModal(null); setApprovalNote('') }}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-700">{approvalModal.title}</p>
            <textarea
              className="w-full border border-slate-200 rounded-lg p-3 text-sm"
              rows={3}
              placeholder="备注（可选）"
              value={approvalNote}
              onChange={e => setApprovalNote(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setApprovalModal(null); setApprovalNote('') }}>取消</Button>
              <Button
                variant={approvalModal.action === 'approve' ? 'primary' : 'secondary'}
                onClick={() => {
                  if (approvalModal.action === 'approve') {
                    approveMutation.mutate(approvalModal.workOrderId)
                  } else {
                    rejectMutation.mutate(approvalModal.workOrderId)
                  }
                }}
                disabled={approveMutation.isPending || rejectMutation.isPending}
              >
                {approvalModal.action === 'approve' ? '确认批准' : '确认拒绝'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
