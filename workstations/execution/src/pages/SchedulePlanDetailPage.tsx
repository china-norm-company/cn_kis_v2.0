/**
 * 排程详情页
 *
 * 结构：计划概要 + 排程方案推荐 + 槽位列表 + 检测冲突 + 发布（预留接口，后续对接工单）
 * 路由：/scheduling/plan/:planId
 */
import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { schedulingApi } from '@cn-kis/api-client'
import type { SchedulePlan, ScheduleSlot } from '@cn-kis/api-client'
import { Button, Card, Empty, Modal, Badge } from '@cn-kis/ui-kit'
import { ArrowLeft, Calendar, List, AlertTriangle, Send, Lightbulb } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { clsx } from 'clsx'

const STATUS_LABEL: Record<string, string> = {
  draft: '待排程',
  generated: '已排程',
  published: '已发布',
  cancelled: '已取消',
}

const SLOT_STATUS_LABEL: Record<string, string> = {
  planned: '已排程',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消',
  conflict: '冲突',
}

export default function SchedulePlanDetailPage() {
  const { planId } = useParams<{ planId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const id = planId ? parseInt(planId, 10) : NaN
  const state = (location.state as { protocol_code?: string; protocol_title?: string }) ?? {}

  const { data: planRes, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['scheduling', 'plan', id],
    queryFn: () => schedulingApi.getPlan(id),
    enabled: Number.isInteger(id) && id > 0,
  })

  // 兼容：api 返回 axios response 时 payload 在 res.data.data；若中间层已解包则可能在 res.data
  const body = (planRes as any)?.data ?? planRes
  const planPayload = (body && typeof body === 'object' && 'data' in body)
    ? (body as { data?: SchedulePlan & { slots?: ScheduleSlot[] } }).data
    : (body as SchedulePlan & { slots?: ScheduleSlot[] } | null)
  const plan = planPayload && typeof planPayload === 'object' && 'id' in planPayload
    ? { ...planPayload, slots: planPayload.slots ?? [] }
    : null
  const slots: ScheduleSlot[] = plan?.slots ?? []

  const [showConflicts, setShowConflicts] = useState(false)
  const [conflictsList, setConflictsList] = useState<Array<{ type: string; severity: string; slot_id: number; message: string }>>([])

  const detectConflictsMutation = useMutation({
    mutationFn: (pid: number) => schedulingApi.detectConflicts(pid),
    onSuccess: (res) => {
      setConflictsList((res?.data as any) ?? [])
      setShowConflicts(true)
    },
  })

  const publishMutation = useMutation({
    mutationFn: (pid: number) => schedulingApi.publishPlan(pid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling'] })
      setShowConflicts(false)
      // 预留：后续对接工单
    },
  })

  if (!Number.isInteger(id) || id <= 0) {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500 dark:text-slate-400">无效的计划 ID</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse text-slate-500 dark:text-slate-400">加载中...</div>
      </div>
    )
  }

  if (isError || !plan) {
    return (
      <div className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => navigate('/scheduling')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> 返回
          </Button>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            重试
          </Button>
        </div>
        <p className="mt-4 text-red-600 dark:text-red-400">{error instanceof Error ? error.message : '排程计划不存在或加载失败'}</p>
      </div>
    )
  }

  const executionPeriod = plan.start_date && plan.end_date ? `${plan.start_date} ~ ${plan.end_date}` : '-'
  const progressLabel = STATUS_LABEL[plan.status] ?? plan.status
  const protocolCode = state.protocol_code ?? (plan as any).protocol_code ?? '-'
  const protocolTitle = state.protocol_title ?? (plan as any).protocol_title ?? plan.name ?? '-'

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* 返回 */}
      <div>
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回排程管理
        </Button>
      </div>

      {/* 1. 计划概要 */}
      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">计划概要</h2>
          <Badge variant={plan.status === 'published' ? 'success' : plan.status === 'draft' ? 'warning' : 'default'} size="sm">
            {progressLabel}
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">项目编号</span>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{protocolCode}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">项目名称</span>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate" title={protocolTitle}>{protocolTitle}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">执行周期</span>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{executionPeriod}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">排程进度</span>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{progressLabel}</p>
          </div>
        </div>
      </Card>

      {/* 2. 排程方案推荐 */}
      <Card className="p-4 md:p-5">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500 dark:text-amber-400" />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">排程方案推荐</h2>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          推荐方案将根据资源看板与宏观排程（项目的执行时间线）计算生成，P1 接入设备分级耗时后开放。采用推荐方案后可在此页槽位列表中微调，再执行冲突检测与发布。
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
          发布动作为预留接口，后续对接工单。
        </p>
      </Card>

      {/* 3. 槽位列表 */}
      <Card className="p-4 md:p-5">
        <div className="flex items-center gap-2">
          <List className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">槽位列表</h2>
        </div>
        {slots.length === 0 ? (
          <Empty className="py-8" message="暂无时间槽，请先在排程计划列表点击「开始排程」生成" />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className={clsx('border-b', isDark ? 'border-slate-700' : 'border-slate-200')}>
                  <th className="py-2 pr-4 text-left font-medium text-slate-600 dark:text-slate-400">访视节点</th>
                  <th className="py-2 pr-4 text-left font-medium text-slate-600 dark:text-slate-400">排程日期</th>
                  <th className="py-2 pr-4 text-left font-medium text-slate-600 dark:text-slate-400">开始时间</th>
                  <th className="py-2 pr-4 text-left font-medium text-slate-600 dark:text-slate-400">结束时间</th>
                  <th className="py-2 pr-4 text-left font-medium text-slate-600 dark:text-slate-400">执行人ID</th>
                  <th className="py-2 pr-4 text-left font-medium text-slate-600 dark:text-slate-400">状态</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => (
                  <tr
                    key={s.id}
                    className={clsx('border-b', isDark ? 'border-slate-700/50' : 'border-slate-100')}
                  >
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{s.visit_node_name || '-'}</td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{s.scheduled_date}</td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{s.start_time || '-'}</td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{s.end_time || '-'}</td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{s.assigned_to_id ?? '-'}</td>
                    <td className="py-2 pr-4">
                      <Badge
                        variant={s.status === 'conflict' ? 'error' : s.status === 'completed' ? 'success' : 'default'}
                        size="sm"
                      >
                        {SLOT_STATUS_LABEL[s.status] ?? s.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 4. 检测冲突 + 5. 发布 */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => detectConflictsMutation.mutate(id)}
          disabled={detectConflictsMutation.isPending || slots.length === 0}
        >
          <AlertTriangle className="w-4 h-4 mr-1" /> 检测冲突
        </Button>
        <Button
          variant="primary"
          onClick={() => publishMutation.mutate(id)}
          disabled={publishMutation.isPending || plan.status === 'published'}
        >
          <Send className="w-4 h-4 mr-1" /> 发布排程
        </Button>
        <span className="text-xs text-slate-500 dark:text-slate-400">发布后预留对接工单</span>
      </div>

      {/* 冲突结果弹窗 */}
      <Modal
        open={showConflicts}
        onClose={() => setShowConflicts(false)}
        title="冲突检测结果"
      >
        <div className="max-h-80 overflow-y-auto">
          {conflictsList.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">未发现冲突</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {conflictsList.map((c, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                  <span className="text-slate-700 dark:text-slate-300">{c.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  )
}
