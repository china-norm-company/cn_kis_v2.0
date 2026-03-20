import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, Users, Thermometer, Monitor, QrCode, Clock, ChevronRight, Microscope, Stethoscope } from 'lucide-react'
import { evaluatorApi, clawRegistryApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import type { EvaluatorDashboard } from '@cn-kis/api-client'
import { ClawQuickPanel, useClawQuickActions, DigitalWorkerSuggestionBar } from '@cn-kis/ui-kit'
import type { QuickAction } from '@cn-kis/ui-kit'

const clawFetcher = (key: string) => clawRegistryApi.getByWorkstation(key)

export function DashboardPage() {
  const navigate = useNavigate()
  const claw = useClawQuickActions('evaluator', clawFetcher)
  const handleClawAction = useCallback((a: QuickAction) => {
    const params = new URLSearchParams({
      skill: a.skill,
      ...(a.script && { script: a.script }),
      action: a.id,
    })
    window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}`), '_blank')
  }, [])

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['evaluator', 'dashboard'],
    queryFn: () => evaluatorApi.dashboard(),
    refetchInterval: 30_000,
  })

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'evaluator'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('evaluator'),
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []

  const db = (dashboard as any)?.data as EvaluatorDashboard | undefined

  const stats = db?.stats ?? { pending: 0, in_progress: 0, completed: 0, total: 0 }
  const workOrders = db?.work_orders ?? []
  const waitingSubjects = db?.waiting_subjects ?? []
  const env = db?.environment ?? { temperature: null, humidity: null, is_compliant: null }
  const instruments = db?.instruments ?? []
  const role = db?.role ?? 'instrument_operator'

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">工作面板</h2>
          <p className="text-sm text-slate-500 mt-1">今日工作总览与快捷操作</p>
        </div>
        <button
          onClick={() => navigate('/scan')}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          <QrCode className="w-4 h-4" />扫码执行
        </button>
      </div>

      <DigitalWorkerSuggestionBar items={suggestions} loading={suggestionsLoading} />
      <ClawQuickPanel workstationKey="evaluator" actions={claw.actions} loading={claw.loading} error={claw.error} onAction={handleClawAction} compact />

      {/* 今日进度统计 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 md:gap-4">
        {[
          { label: '待接受', value: stats.pending, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: '准备中', value: (stats as any).accepted ?? 0, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: '执行中', value: stats.in_progress, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: '已完成', value: stats.completed, color: 'text-green-600', bg: 'bg-green-50' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border border-slate-200 p-4 ${s.bg}`}>
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>
              {isLoading ? '--' : s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 md:gap-6">
        {/* 今日工单列表 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 xl:col-span-2">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">今日工单</h3>
          {isLoading ? (
            <div className="text-center py-8 text-slate-400 text-sm">加载中...</div>
          ) : workOrders.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <LayoutDashboard className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">今日暂无工单</p>
              <p className="text-xs mt-1 text-slate-300">等待调度员排程分配</p>
            </div>
          ) : (
            <div className="space-y-2">
              {workOrders.map((wo: any) => {
                const statusColor: Record<string, string> = {
                  pending: 'bg-blue-100 text-blue-700',
                  assigned: 'bg-blue-100 text-blue-700',
                  in_progress: 'bg-orange-100 text-orange-700',
                  completed: 'bg-green-100 text-green-700',
                  review: 'bg-amber-100 text-amber-700',
                  approved: 'bg-green-100 text-green-700',
                }
                return (
                  <button
                    key={wo.id}
                    onClick={() => navigate(`/execute/${wo.id}`)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-indigo-50 hover:border-indigo-200 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        {wo.due_date ? new Date(wo.due_date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{wo.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {wo.subject_name ?? ''} · {wo.protocol_title ?? ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${statusColor[wo.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {wo.status}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* 右侧信息栏 */}
        <div className="space-y-4">
          {/* 受试者等候队列 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <Users className="w-4 h-4 text-indigo-500" />受试者等候
              {waitingSubjects.length > 0 && (
                <span className="ml-auto text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  {waitingSubjects.length}
                </span>
              )}
            </h4>
            {waitingSubjects.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-4">暂无受试者等候</p>
            ) : (
              <div className="space-y-2">
                {waitingSubjects.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{s.name}</span>
                    <span className="text-xs text-slate-400">{s.checkin_time ?? '--'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 环境状态 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <Thermometer className="w-4 h-4 text-amber-500" />检测室环境
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-xs text-slate-400">温度</p>
                <p className="font-medium text-slate-700">
                  {env.temperature != null ? `${env.temperature} °C` : '-- °C'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">湿度</p>
                <p className="font-medium text-slate-700">
                  {env.humidity != null ? `${env.humidity} %RH` : '-- %RH'}
                </p>
              </div>
            </div>
            {env.is_compliant != null && (
              <div className={`mt-2 text-xs px-2 py-1 rounded ${env.is_compliant ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {env.is_compliant ? '环境达标' : '环境不合规'}
              </div>
            )}
          </div>

          {/* 仪器状态 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <Monitor className="w-4 h-4 text-emerald-500" />今日仪器
            </h4>
            {instruments.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-4">暂无仪器数据</p>
            ) : (
              <div className="space-y-2">
                {instruments.map((inst) => (
                  <div key={inst.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{inst.name}</span>
                    <span className={`text-xs ${inst.calibration_status === 'valid' ? 'text-green-600' : 'text-amber-600'}`}>
                      {inst.calibration_status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 角色差异化面板 */}
          {role === 'instrument_operator' && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                <Microscope className="w-4 h-4 text-cyan-500" />QC 快捷入口
              </h4>
              <button
                onClick={() => navigate('/execute/qc')}
                className="w-full text-left px-3 py-2 text-sm text-cyan-700 bg-cyan-50 rounded-lg hover:bg-cyan-100"
              >
                仪器日常 QC 检查
              </button>
            </div>
          )}

          {role === 'medical_evaluator' && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                <Stethoscope className="w-4 h-4 text-rose-500" />医学评估快捷
              </h4>
              <div className="space-y-1.5">
                <button className="w-full text-left px-3 py-2 text-sm text-rose-700 bg-rose-50 rounded-lg hover:bg-rose-100">
                  待评分工单
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-red-700 bg-red-50 rounded-lg hover:bg-red-100">
                  AE 不良事件上报
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
