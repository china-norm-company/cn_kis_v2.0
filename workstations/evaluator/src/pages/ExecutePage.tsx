import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, User, FlaskConical, Package, BookOpen,
  AlertTriangle, MessageCircle, Play, CheckCircle,
  XCircle, Pause, RefreshCw, Clock, ChevronRight,
} from 'lucide-react'
import { workorderApi, evaluatorApi, safetyApi, equipmentApi } from '@cn-kis/api-client'
import type { ExperimentStep } from '@cn-kis/api-client'
import { DetectionForm } from '../components/DetectionForm'
import type { DetectionResultData } from '../components/DetectionForm'
import { InstrumentDetectionPanel } from '../components/InstrumentDetectionPanel'
import { SignatureDialog } from '../components/SignatureDialog'
import { WorkOrderComments } from '../components/WorkOrderComments'

const PHASE_TABS = [
  { key: 'accept', label: '接受' },
  { key: 'prepare', label: '准备' },
  { key: 'execute', label: '执行' },
  { key: 'complete', label: '完成' },
] as const

type Phase = typeof PHASE_TABS[number]['key']

export function ExecutePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const workOrderId = Number(id)

  const [activePhase, setActivePhase] = useState<Phase>('accept')
  const [showSOP, setShowSOP] = useState(false)
  const [showExceptionDialog, setShowExceptionDialog] = useState(false)
  const [showSignatureDialog, setShowSignatureDialog] = useState(false)
  const [showDetectionForm, setShowDetectionForm] = useState<number | null>(null)
  const [showAEReportDialog, setShowAEReportDialog] = useState(false)
  const [aeForm, setAeForm] = useState({ description: '', severity: 'mild', relation: 'possible' })
  const [equipmentWarning, setEquipmentWarning] = useState<string | null>(null)

  // Fetch work order detail
  const { data: woRes, isLoading } = useQuery({
    queryKey: ['workorder', workOrderId],
    queryFn: () => workorderApi.get(workOrderId),
    enabled: !!workOrderId,
  })
  const wo = (woRes as any)?.data

  const dashboardQuery = useQuery({
    queryKey: ['evaluator', 'dashboard'],
    queryFn: () => evaluatorApi.dashboard(),
    staleTime: 5 * 60 * 1000,
  })
  const role = ((dashboardQuery.data as any)?.data?.role) ?? 'instrument_operator'

  // Fetch steps
  const { data: stepsRes, refetch: refetchSteps } = useQuery({
    queryKey: ['evaluator', 'steps', workOrderId],
    queryFn: () => evaluatorApi.getSteps(workOrderId),
    enabled: !!workOrderId,
  })
  const steps: ExperimentStep[] = ((stepsRes as any)?.data?.items ?? []) as ExperimentStep[]

  // Fetch exceptions
  const { data: excRes } = useQuery({
    queryKey: ['evaluator', 'exceptions', workOrderId],
    queryFn: () => evaluatorApi.getExceptions(workOrderId),
    enabled: !!workOrderId,
  })
  const exceptions = ((excRes as any)?.data?.items ?? []) as any[]

  // Auto-detect phase from status
  useEffect(() => {
    if (!wo) return
    const status = wo.status
    if (status === 'pending' || status === 'assigned') setActivePhase('accept')
    else if (status === 'in_progress' && steps.length === 0) setActivePhase('prepare')
    else if (status === 'in_progress') setActivePhase('execute')
    else if (status === 'completed' || status === 'review' || status === 'approved') setActivePhase('complete')
  }, [wo?.status, steps.length])

  // Check equipment calibration status
  useEffect(() => {
    if (!wo) return
    const resources = wo.resources ?? []
    const equipIds = resources.filter((r: any) => r.resource_type === 'equipment').map((r: any) => r.resource_id)
    if (equipIds.length === 0) return
    Promise.all(equipIds.map((eid: number) => equipmentApi.getLedgerDetail(eid).catch(() => null))).then((results) => {
      for (const res of results) {
        const equip = (res as any)?.data
        if (!equip) continue
        const cal = equip.calibration
        if (cal?.status === 'expired') {
          setEquipmentWarning(`设备 "${equip.name}" 校准已过期（${cal.next_calibration_date || '未知'}），请勿使用！`)
          return
        }
        if (cal?.days_until_expiry !== undefined && cal.days_until_expiry <= 7) {
          setEquipmentWarning(`设备 "${equip.name}" 校准将在 ${cal.days_until_expiry} 天内过期，请及时安排校准。`)
        }
      }
    })
  }, [wo])

  const handleAEReport = async () => {
    if (!aeForm.description.trim()) return
    try {
      await safetyApi.createAdverseEvent({
        enrollment_id: wo?.enrollment_id || 0,
        description: aeForm.description,
        start_date: new Date().toISOString().split('T')[0],
        severity: aeForm.severity,
        relation: aeForm.relation,
        work_order_id: workOrderId,
      })
      setShowAEReportDialog(false)
      setAeForm({ description: '', severity: 'mild', relation: 'possible' })
    } catch { /* handled by api client */ }
  }

  // Mutations
  const acceptMutation = useMutation({
    mutationFn: () => evaluatorApi.acceptWorkOrder(workOrderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workorder', workOrderId] })
      setActivePhase('prepare')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => evaluatorApi.rejectWorkOrder(workOrderId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workorder', workOrderId] })
      navigate('/dashboard')
    },
  })

  const prepareMutation = useMutation({
    mutationFn: () => evaluatorApi.prepareWorkOrder(workOrderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workorder', workOrderId] })
    },
  })

  const initStepsMutation = useMutation({
    mutationFn: () => evaluatorApi.initSteps(workOrderId),
    onSuccess: () => {
      refetchSteps()
      setActivePhase('execute')
    },
  })

  const pauseMutation = useMutation({
    mutationFn: (reason: string) => evaluatorApi.pauseWorkOrder(workOrderId, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workorder', workOrderId] }),
  })

  const resumeMutation = useMutation({
    mutationFn: () => evaluatorApi.resumeWorkOrder(workOrderId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workorder', workOrderId] }),
  })

  const startStepMutation = useMutation({
    mutationFn: (stepId: number) => evaluatorApi.startStep(stepId),
    onSuccess: () => refetchSteps(),
  })

  const completeStepMutation = useMutation({
    mutationFn: ({ stepId, data }: { stepId: number; data?: any }) =>
      evaluatorApi.completeStep(stepId, data),
    onSuccess: () => {
      refetchSteps()
      setShowDetectionForm(null)
    },
  })

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">加载中...</div>
  }

  if (!wo) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <p>工单不存在或无权访问</p>
        <button onClick={() => navigate('/dashboard')} className="mt-2 text-indigo-600 text-sm">返回面板</button>
      </div>
    )
  }

  const statusLabels: Record<string, string> = {
    pending: '待处理', assigned: '已分配', in_progress: '进行中',
    completed: '已完成', review: '待审核', approved: '已批准',
    rejected: '已拒绝', cancelled: '已取消',
  }

  const resources = wo.resources ?? []
  const checklist = wo.checklist_items ?? []
  const completedSteps = steps.filter((s) => s.status === 'completed' || s.status === 'skipped').length
  const progressPercent = steps.length > 0 ? Math.round(completedSteps / steps.length * 100) : 0
  const sopDocs = Array.from(
    new Set(
      [
        wo?.sop_url,
        wo?.sop,
        ...(Array.isArray(wo?.sop_urls) ? wo.sop_urls : []),
        ...resources.flatMap((r: any) => [r?.sop_url, r?.sop, r?.document_url, r?.resource_item_sop_url]),
      ]
        .filter((v) => typeof v === 'string')
        .map((v) => String(v).trim())
        .filter((v) => v.length > 0),
    ),
  )

  return (
    <div className="space-y-4 md:space-y-5">
      {/* 设备校准警告 */}
      {equipmentWarning && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span className="text-sm font-medium">{equipmentWarning}</span>
        </div>
      )}

      {/* 工单头部 */}
      <div className="flex items-start gap-3 sm:gap-4">
        <button onClick={() => navigate(-1)} title="返回" aria-label="返回" className="min-h-11 min-w-11 p-2 hover:bg-slate-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-800 truncate">{wo.title}</h2>
            <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">
              {statusLabels[wo.status] ?? wo.status}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5 truncate">{wo.description || `WO#${wo.id}`}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        {/* 左侧信息面板 (1/3) */}
        <div className="space-y-4">
          {/* 受试者卡片 */}
          <InfoCard title="受试者信息" icon={<User className="w-4 h-4 text-indigo-500" />}>
            <InfoRow label="编号" value={wo.subject_name ?? wo.enrollment_id ?? '-'} />
            <InfoRow label="皮肤类型" value={wo.subject_skin_type ?? '-'} />
            <InfoRow label="风险等级" value={wo.subject_risk_level ?? '-'} />
            <InfoRow label="协议" value={wo.protocol_title ?? '-'} />
            <InfoRow label="访视节点" value={wo.visit_node_name ?? '-'} />
          </InfoCard>

          {/* 检测方法卡片 */}
          <InfoCard title="检测方法" icon={<FlaskConical className="w-4 h-4 text-indigo-500" />}>
            <InfoRow label="活动" value={wo.activity_name ?? '-'} />
            <InfoRow label="类型" value={wo.work_order_type ?? '-'} />
            <InfoRow label="预约时间" value={wo.due_date ? new Date(wo.due_date).toLocaleString('zh-CN') : '-'} />
          </InfoCard>

          {/* 所需资源 */}
          {resources.length > 0 && (
            <InfoCard title="所需资源" icon={<Package className="w-4 h-4 text-indigo-500" />}>
              {resources.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0">
                  <span className="text-xs text-slate-600">
                    {r.resource_category_name}: {r.resource_item_name ?? '未指定'}
                  </span>
                  <span className="text-xs text-slate-400">x{r.required_quantity}</span>
                </div>
              ))}
            </InfoCard>
          )}

          {/* 快捷操作 */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1.5">
            <button
              onClick={() => setShowSOP(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
            >
              <BookOpen className="w-4 h-4" />查看 SOP
            </button>
            <button
              onClick={() => setShowExceptionDialog(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
            >
              <AlertTriangle className="w-4 h-4" />上报异常
            </button>
            <button
              onClick={() => setShowAEReportDialog(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-lg font-medium"
            >
              <AlertTriangle className="w-4 h-4" />上报不良反应
            </button>
            {wo.status === 'in_progress' && (
              <button
                onClick={() => {
                  const reason = prompt('请输入暂停原因')
                  if (reason) pauseMutation.mutate(reason)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 rounded-lg"
              >
                <Pause className="w-4 h-4" />暂停工单
              </button>
            )}
            <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
              <MessageCircle className="w-4 h-4" />联系上级
            </button>
          </div>
        </div>

        {/* 右侧阶段面板 (2/3) */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200">
            {/* 阶段 Tab */}
            <div className="flex overflow-x-auto border-b border-slate-200">
              {PHASE_TABS.map((tab, idx) => (
                <button
                  key={tab.key}
                  onClick={() => setActivePhase(tab.key)}
                  className={`shrink-0 min-h-11 px-4 text-sm font-medium transition-colors relative ${
                    activePhase === tab.key
                      ? 'text-indigo-700 bg-indigo-50/50'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="mr-1 text-xs text-slate-300">{idx + 1}.</span>
                  {tab.label}
                  {activePhase === tab.key && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
              ))}
            </div>

            {/* Tab 内容 */}
            <div className="p-6 min-h-[400px]">
              {/* ===== 接受阶段 ===== */}
              {activePhase === 'accept' && (
                <div className="space-y-6">
                  <h3 className="text-base font-semibold text-slate-800">确认接受工单</h3>
                  <p className="text-sm text-slate-500">
                    请查看左侧工单信息（受试者、检测方法、所需资源）后确认。
                  </p>

                  <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-2">
                    <p><span className="text-slate-400">工单标题：</span>{wo.title}</p>
                    <p><span className="text-slate-400">工单类型：</span>{wo.work_order_type}</p>
                    <p><span className="text-slate-400">预约日期：</span>{wo.scheduled_date ?? wo.due_date ?? '-'}</p>
                    <p><span className="text-slate-400">所需资源：</span>{resources.length} 项</p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => acceptMutation.mutate()}
                      disabled={acceptMutation.isPending}
                      className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <CheckCircle className="w-4 h-4" />接受工单
                    </button>
                    <button
                      onClick={() => {
                        const reason = prompt('请输入拒绝原因')
                        if (reason) rejectMutation.mutate(reason)
                      }}
                      disabled={rejectMutation.isPending}
                      className="flex items-center gap-2 px-6 py-2.5 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />拒绝
                    </button>
                  </div>
                </div>
              )}

              {/* ===== 准备阶段 ===== */}
              {activePhase === 'prepare' && (
                <PreparePhase
                  wo={wo}
                  resources={resources}
                  onPrepareComplete={() => prepareMutation.mutate()}
                  onInitSteps={() => initStepsMutation.mutate()}
                  isPreparing={prepareMutation.isPending}
                  isInitializing={initStepsMutation.isPending}
                />
              )}

              {/* ===== 执行阶段 ===== */}
              {activePhase === 'execute' && (
                <div className="space-y-6">
                  <ExecutePhase
                    steps={steps}
                    progressPercent={progressPercent}
                    onStartStep={(stepId) => startStepMutation.mutate(stepId)}
                    onCompleteStep={(stepId) => {
                      const step = steps.find(s => s.id === stepId)
                      if (step && (step.step_name.includes('检测') || step.step_name.includes('数据采集'))) {
                        setShowDetectionForm(stepId)
                      } else {
                        completeStepMutation.mutate({ stepId })
                      }
                    }}
                    isStarting={startStepMutation.isPending}
                    isCompleting={completeStepMutation.isPending}
                  />
                  {role === 'instrument_operator' && (
                    <InstrumentDetectionPanel workOrderId={workOrderId} resources={resources} />
                  )}
                </div>
              )}

              {/* ===== 完成阶段 ===== */}
              {activePhase === 'complete' && (
                <CompletePhase
                  wo={wo}
                  steps={steps}
                  exceptions={exceptions}
                  progressPercent={progressPercent}
                  onRequestSignature={() => setShowSignatureDialog(true)}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 工单评论 */}
      <WorkOrderComments workOrderId={workOrderId} />

      {/* SOP 侧滑面板 */}
      {showSOP && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" onClick={() => setShowSOP(false)} />
          <div className="w-[92vw] max-w-96 bg-white shadow-xl p-4 md:p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">SOP 文档</h3>
              <button onClick={() => setShowSOP(false)} title="关闭 SOP 面板" aria-label="关闭 SOP 面板" className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="text-sm text-slate-500">
              {sopDocs.length > 0 ? (
                <div className="space-y-2">
                  {sopDocs.map((url, idx) => (
                    <a
                      key={`${url}-${idx}`}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-indigo-600 hover:underline break-all"
                    >
                      {`SOP 文档 ${idx + 1}`}
                    </a>
                  ))}
                </div>
              ) : (
                <p>当前工单未配置 SOP 文档，请联系项目管理员补齐配置。</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 异常上报对话框 */}
      {showExceptionDialog && (
        <ExceptionDialog
          workOrderId={workOrderId}
          onClose={() => {
            setShowExceptionDialog(false)
            queryClient.invalidateQueries({ queryKey: ['evaluator', 'exceptions', workOrderId] })
          }}
        />
      )}

      {/* AE 快速上报对话框 */}
      {showAEReportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-[480px] max-h-[90vh] overflow-y-auto p-4 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-red-700">上报不良反应</h3>
              <button onClick={() => setShowAEReportDialog(false)} title="关闭不良反应上报" aria-label="关闭不良反应上报" className="p-1 hover:bg-slate-100 rounded">
                <XCircle className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">事件描述 *</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  rows={3}
                  value={aeForm.description}
                  onChange={(e) => setAeForm({ ...aeForm, description: e.target.value })}
                  placeholder="描述不良反应症状..."
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">严重程度</label>
                  <select aria-label="不良反应严重程度" className="w-full border rounded-lg px-3 py-2 text-sm" value={aeForm.severity}
                    onChange={(e) => setAeForm({ ...aeForm, severity: e.target.value })}>
                    <option value="mild">轻度</option>
                    <option value="moderate">中度</option>
                    <option value="severe">重度</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">因果关系</label>
                  <select aria-label="不良反应因果关系" className="w-full border rounded-lg px-3 py-2 text-sm" value={aeForm.relation}
                    onChange={(e) => setAeForm({ ...aeForm, relation: e.target.value })}>
                    <option value="unrelated">无关</option>
                    <option value="possible">可能有关</option>
                    <option value="probable">很可能有关</option>
                    <option value="certain">肯定有关</option>
                  </select>
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
                <p>受试者: {wo?.subject_name || wo?.enrollment_id || '-'}</p>
                <p>工单: WO#{workOrderId}</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                  onClick={() => setShowAEReportDialog(false)}
                >取消</button>
                <button
                  className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                  onClick={handleAEReport}
                  disabled={!aeForm.description.trim()}
                >提交 AE 上报</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSignatureDialog && (
        <SignatureDialog
          resourceType="work_order"
          resourceId={String(workOrderId)}
          resourceName={wo.title}
          onSuccess={() => {
            setShowSignatureDialog(false)
            queryClient.invalidateQueries({ queryKey: ['workorder', workOrderId] })
          }}
          onCancel={() => setShowSignatureDialog(false)}
        />
      )}

      {showDetectionForm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-[600px] max-h-[85vh] overflow-y-auto p-4 md:p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">检测数据录入</h3>
            <DetectionForm
              detectionName={steps.find(s => s.id === showDetectionForm)?.step_name ?? '检测'}
              onSubmit={(data: DetectionResultData) => {
                completeStepMutation.mutate({
                  stepId: showDetectionForm,
                  data: { execution_data: data },
                })
              }}
              isSubmitting={completeStepMutation.isPending}
            />
            <button
              onClick={() => setShowDetectionForm(null)}
              className="mt-3 w-full text-center text-sm text-slate-500 hover:text-slate-700"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 子组件
// ============================================================================
function InfoCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
        {icon}{title}
      </h4>
      <div className="space-y-1.5 text-sm">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start">
      <span className="text-slate-400 w-16 shrink-0">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  )
}

function PreparePhase({
  wo, resources, onPrepareComplete, onInitSteps, isPreparing, isInitializing,
}: {
  wo: any; resources: any[]; onPrepareComplete: () => void; onInitSteps: () => void
  isPreparing: boolean; isInitializing: boolean
}) {
  const [checks, setChecks] = useState<Record<string, boolean>>({})

  const items = [
    { key: 'equipment', label: '仪器就绪', desc: '仪器已开机预热、校准有效、探头清洁' },
    { key: 'environment', label: '环境就绪', desc: '检测室温湿度在控制范围内' },
    { key: 'consumables', label: '耗材就绪', desc: '所需耗材已备齐且在有效期内' },
    { key: 'subject', label: '受试者就绪', desc: '受试者已签到且已完成环境适应' },
    { key: 'qualification', label: '资质确认', desc: '本人具备该检测方法的执行资质' },
  ]

  const allChecked = items.every((item) => checks[item.key])

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-slate-800">执行前准备</h3>
      <p className="text-sm text-slate-500">逐项确认准备条件，全部通过后方可开始执行。</p>

      <div className="space-y-3">
        {items.map((item) => (
          <label
            key={item.key}
            className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={checks[item.key] ?? false}
              onChange={(e) => setChecks((prev) => ({ ...prev, [item.key]: e.target.checked }))}
              className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <p className="text-sm font-medium text-slate-700">{item.label}</p>
              <p className="text-xs text-slate-400">{item.desc}</p>
            </div>
            <div className="ml-auto">
              {checks[item.key] ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-slate-200" />
              )}
            </div>
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => {
            onPrepareComplete()
            onInitSteps()
          }}
          disabled={!allChecked || isPreparing || isInitializing}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          <Play className="w-4 h-4" />
          {isInitializing ? '初始化步骤...' : '开始执行'}
        </button>
      </div>
    </div>
  )
}

function ExecutePhase({
  steps, progressPercent, onStartStep, onCompleteStep, isStarting, isCompleting,
}: {
  steps: ExperimentStep[]; progressPercent: number
  onStartStep: (id: number) => void; onCompleteStep: (id: number) => void
  isStarting: boolean; isCompleting: boolean
}) {
  if (steps.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400">
        <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">请先完成准备阶段以初始化执行步骤</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800">检测执行</h3>
        <span className="text-sm text-slate-500">进度 {progressPercent}%</span>
      </div>

      {/* 进度条 */}
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* 步骤列表 */}
      <div className="space-y-3">
        {steps.map((step, idx) => {
          const isCurrent = step.status === 'in_progress'
          const isDone = step.status === 'completed' || step.status === 'skipped'
          const canStart = step.status === 'pending' && (idx === 0 || steps[idx - 1]?.status === 'completed' || steps[idx - 1]?.status === 'skipped')

          return (
            <div
              key={step.id}
              className={`rounded-lg border p-4 ${
                isCurrent ? 'border-indigo-300 bg-indigo-50/50' :
                isDone ? 'border-green-200 bg-green-50/30' :
                'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    isDone ? 'bg-green-100 text-green-700' :
                    isCurrent ? 'bg-indigo-100 text-indigo-700' :
                    'bg-slate-100 text-slate-400'
                  }`}>
                    {isDone ? <CheckCircle className="w-4 h-4" /> : step.step_number}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${isDone ? 'text-green-700' : isCurrent ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {step.step_name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{step.step_description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {step.estimated_duration_minutes > 0 && (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />{step.estimated_duration_minutes}min
                    </span>
                  )}
                  {isDone && step.actual_duration_minutes != null && (
                    <span className="text-xs text-green-600">
                      实际 {step.actual_duration_minutes}min
                    </span>
                  )}
                  {canStart && (
                    <button
                      onClick={() => onStartStep(step.id)}
                      disabled={isStarting}
                      className="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      开始
                    </button>
                  )}
                  {isCurrent && (
                    <button
                      onClick={() => onCompleteStep(step.id)}
                      disabled={isCompleting}
                      className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      完成
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CompletePhase({
  wo, steps, exceptions, progressPercent, onRequestSignature,
}: {
  wo: any; steps: ExperimentStep[]; exceptions: any[]; progressPercent: number
  onRequestSignature?: () => void
}) {
  const completedCount = steps.filter((s) => s.status === 'completed').length
  const skippedCount = steps.filter((s) => s.status === 'skipped').length
  const totalDuration = steps.reduce((sum, s) => sum + (s.actual_duration_minutes ?? 0), 0)

  return (
    <div className="space-y-6">
      <h3 className="text-base font-semibold text-slate-800">执行完成</h3>

      {/* 执行总结 */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '完成步骤', value: `${completedCount}/${steps.length}`, color: 'text-green-600' },
          { label: '跳过步骤', value: skippedCount, color: 'text-amber-600' },
          { label: '总耗时', value: `${totalDuration} min`, color: 'text-blue-600' },
          { label: '异常记录', value: exceptions.length, color: exceptions.length > 0 ? 'text-red-600' : 'text-green-600' },
        ].map((stat) => (
          <div key={stat.label} className="bg-slate-50 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500">{stat.label}</p>
            <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* 进度完成度 */}
      <div className="bg-slate-50 rounded-lg p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-600">数据完整度</span>
          <span className="text-slate-700 font-medium">{progressPercent}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${progressPercent === 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 异常记录列表 */}
      {exceptions.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">异常记录</h4>
          <div className="space-y-2">
            {exceptions.map((exc: any) => (
              <div key={exc.id} className="p-3 rounded-lg border border-red-100 bg-red-50/50 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-red-700">{exc.exception_type}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    exc.severity === 'critical' ? 'bg-red-100 text-red-700' :
                    exc.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {exc.severity}
                  </span>
                </div>
                <p className="text-slate-600 mt-1">{exc.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {progressPercent === 100 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-green-700">所有步骤已完成</p>
          <p className="text-xs text-green-600 mt-1">请确认数据无误后进行电子签名</p>
          {onRequestSignature && (
            <button
              onClick={onRequestSignature}
              className="mt-3 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              电子签名确认
            </button>
          )}
        </div>
      )}

      {progressPercent < 100 && (
        <div className="bg-slate-50 rounded-lg p-4 text-center text-slate-400">
          <p className="text-sm">质量审计结果区域</p>
          <p className="text-xs mt-1">完成所有步骤后自动校验</p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// 异常上报对话框
// ============================================================================
function ExceptionDialog({ workOrderId, onClose }: { workOrderId: number; onClose: () => void }) {
  const [type, setType] = useState('technical_issue')
  const [severity, setSeverity] = useState('medium')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!description.trim()) return
    setSubmitting(true)
    try {
      await evaluatorApi.reportException(workOrderId, {
        exception_type: type,
        severity,
        description,
      })
      onClose()
    } catch {
      alert('上报失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-[480px] p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">上报异常</h3>

        <div>
          <label className="text-sm text-slate-600 mb-1 block">异常类型</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="异常类型"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            <option value="technical_issue">技术问题</option>
            <option value="equipment_failure">设备故障</option>
            <option value="environment_issue">环境异常</option>
            <option value="subject_issue">受试者问题</option>
            <option value="quality_issue">质量问题</option>
            <option value="resource_unavailable">资源不可用</option>
            <option value="delay">延迟</option>
            <option value="other">其他</option>
          </select>
        </div>

        <div>
          <label className="text-sm text-slate-600 mb-1 block">严重程度</label>
          <div className="flex gap-2">
            {[
              { value: 'low', label: '低', color: 'bg-blue-100 text-blue-700' },
              { value: 'medium', label: '中', color: 'bg-amber-100 text-amber-700' },
              { value: 'high', label: '高', color: 'bg-orange-100 text-orange-700' },
              { value: 'critical', label: '严重', color: 'bg-red-100 text-red-700' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSeverity(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  severity === opt.value ? opt.color : 'bg-slate-100 text-slate-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-slate-600 mb-1 block">异常描述</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="请详细描述异常情况..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!description.trim() || submitting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? '提交中...' : '确认上报'}
          </button>
        </div>
      </div>
    </div>
  )
}
