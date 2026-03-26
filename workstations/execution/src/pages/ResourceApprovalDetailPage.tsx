/**
 * 资源审核详情页
 *
 * 展示5个板块：项目基础信息、场地计划、访视计划、设备计划、评估计划
 * 底部提供审核通过、驳回操作。
 * 路由：/scheduling/resource-approval/:demandId
 */
import { useState } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { visitApi } from '@cn-kis/api-client'
import { Badge, Button, Empty, Card, Modal } from '@cn-kis/ui-kit'
import { ArrowLeft, CheckCircle, XCircle, Plus, Edit2, FileText, MapPin, Calendar, Cpu, Users } from 'lucide-react'

interface VisitNodeOut {
  id: number
  plan_id: number
  name: string
  code: string
  baseline_day: number
  window_before: number
  window_after: number
  status: string
  order: number
  create_time: string
}

interface VisitPlanDetail {
  id: number
  protocol_id: number
  name: string
  description: string
  status: string
  nodes: VisitNodeOut[]
  create_time: string
  update_time: string
}

interface ProtocolInfo {
  code: string
  sample_size: number
  research_purpose: string
  execution_period: string
}

interface FacilityPlan {
  facility_requirement: string
  temperature: string
  humidity: string
  /** 场地类型：暗室 | 温控 | 评估室 | 沙龙室 | 洗发间 */
  facility_type: string
}

interface VisitPlan {
  sample_group: string
  visit_timepoints: string[]
  same_day_test_timepoints: string[]
  visit_order: number
  visit_type: string
  allowed_window_period: string
}

interface EquipmentPlan {
  id: string
  test_indicator_type: 'probe' | 'image'
  test_equipment: string
  test_site: string
  /** 测试点位，数字 */
  test_point: number
  equipment_visit_timepoints: string[]
}

interface EvaluationPlan {
  evaluator_category: string
  indicator_category: string
  indicator: string
  evaluation_visit_timepoints: string[]
}

/** 各模块前4列统一宽度，保证项目基础信息/场地/访视/设备/评估之间垂直对齐 */
const COL_WIDTH_PX = 200
const GRID_COLS_4 = `${COL_WIDTH_PX}px ${COL_WIDTH_PX}px ${COL_WIDTH_PX}px ${COL_WIDTH_PX}px`
const GRID_COLS_6 = `${COL_WIDTH_PX}px ${COL_WIDTH_PX}px ${COL_WIDTH_PX}px ${COL_WIDTH_PX}px minmax(200px, 1fr) minmax(200px, 1fr)`

const VISIT_TIMEPOINTS = [
  'T-4w', 'T-3w', 'T-2w', 'T-1w', 'T0', 'Timm', 'T5min', 'T15min', 'T30min',
  'T1h', 'T2h', 'T3h', 'T4h', 'T6h', 'T8h', 'T10h', 'T12h', 'T14h', 'T16h',
  'T20h', 'T24h', 'T48h', 'T72h', 'T1d', 'T2d', 'T3d', 'T4d', 'T5d',
  'T1w', 'T2w', 'T3w', 'T4w', 'T5w', 'T6w', 'T8w', 'T12w'
]

export default function ResourceApprovalDetailPage() {
  const { demandId } = useParams<{ demandId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const id = demandId ? Number(demandId) : 0
  /** 从列表跳转时传入的项目编号（URL 参数优先，避免 state 丢失） */
  const listProtocolCode = (searchParams.get('protocol_code') || (location.state as { protocol_code?: string } | null)?.protocol_code) || undefined

  const [showEquipmentModal, setShowEquipmentModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [editingEquipment, setEditingEquipment] = useState<EquipmentPlan | null>(null)
  const [equipmentForm, setEquipmentForm] = useState<Partial<EquipmentPlan>>({
    test_indicator_type: 'probe',
    test_equipment: '',
    test_site: '',
    test_point: undefined,
    equipment_visit_timepoints: [],
  })

  // Mock data - 后续对接真实API
  const [equipmentList, setEquipmentList] = useState<EquipmentPlan[]>([
    {
      id: '1',
      test_indicator_type: 'probe',
      test_equipment: '皮肤水分测试仪',
      test_site: '前臂',
      test_point: 1,
      equipment_visit_timepoints: ['T0', 'T1h', 'T2h'],
    },
  ])

  const { data: demandRes, isLoading: demandLoading } = useQuery({
    queryKey: ['visit', 'resource-demand', id],
    queryFn: () => visitApi.getResourceDemandById(id),
    enabled: !!id,
  })

  // 兼容接口返回 { data: demand } 或 直接返回 body 且 demand 在 body.data
  const body = demandRes as { data?: { visit_plan_id?: number; status?: string; demand_details?: unknown }; status?: string } | undefined
  const demand = body?.data ?? (demandRes as any)?.data?.data
  const visitPlanId = demand?.visit_plan_id
  const demandStatus = demand?.status ?? ''

  const { data: planRes, isLoading: planLoading } = useQuery({
    queryKey: ['visit', 'plan', visitPlanId],
    queryFn: () => visitApi.getPlan(visitPlanId!),
    enabled: !!visitPlanId,
  })

  const plan = (planRes?.data as unknown as VisitPlanDetail) ?? null

  // 无 URL/state 时从列表接口按 demandId 取项目编号（直链打开详情时）
  const { data: listRes } = useQuery({
    queryKey: ['visit', 'resource-approval-list-for-code', id],
    queryFn: () => visitApi.listResourceApprovalList({ page: 1, page_size: 100 }),
    enabled: !!id && !listProtocolCode,
  })
  const listItems = (listRes?.data as { items?: Array<{ demand_id: number; protocol_code?: string }> })?.items ?? []
  const codeFromList = listItems.find((r) => r.demand_id === id)?.protocol_code

  const displayProtocolCode = listProtocolCode || codeFromList

  // Mock data - 后续从 demand.demand_details 或 protocol 获取；项目编号优先用列表传入值
  const protocolInfo: ProtocolInfo = {
    code: displayProtocolCode ?? (plan?.protocol_id ? `C${plan.protocol_id.toString().padStart(9, '0')}` : null) ?? '-',
    sample_size: 80,
    research_purpose: '评估抗衰精华的临床安全性和有效性',
    execution_period: '2024-01-01 ~ 2024-06-30',
  }

  const facilityPlan: FacilityPlan = {
    facility_requirement: '独立测试室，面积≥20㎡',
    temperature: '22±2℃',
    humidity: '50±10%',
    facility_type: '暗室',
  }

  const visitPlan: VisitPlan = {
    sample_group: '试验组',
    visit_timepoints: ['T0', 'T1w', 'T2w', 'T4w', 'T8w', 'T12w'],
    same_day_test_timepoints: ['T0', 'Timm', 'T1h', 'T2h', 'T4h', 'T6h'],
    visit_order: 1,
    visit_type: '常规访视',
    allowed_window_period: '±1天',
  }

  const evaluationPlan: EvaluationPlan = {
    evaluator_category: '评估专家（皮肤类）',
    indicator_category: '功效性',
    indicator: '皮肤水分含量',
    evaluation_visit_timepoints: ['T0', 'T1w', 'T2w', 'T4w'],
  }

  const approveMutation = useMutation({
    mutationFn: () => visitApi.approveResourceDemand(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visit'] })
      queryClient.invalidateQueries({ queryKey: ['scheduling'] })
      setShowApproveConfirm(false)
      navigate('/scheduling', { replace: true })
    },
    onError: (err: Error) => {
      alert(err?.message || '审核通过失败，请重试')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => visitApi.rejectResourceDemand(id, { reject_reason: reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visit'] })
      setShowRejectModal(false)
      setRejectReason('')
      navigate('/scheduling', { replace: true })
    },
    onError: (err: Error) => {
      alert(err?.message || '驳回失败，请重试')
    },
  })

  const handleRejectSubmit = () => {
    const reason = rejectReason.trim()
    if (!reason) {
      alert('请填写驳回原因')
      return
    }
    rejectMutation.mutate(reason)
  }

  const handleApproveConfirm = () => {
    setShowApproveConfirm(true)
  }

  const handleApproveSubmit = () => {
    approveMutation.mutate()
  }

  const isLoading = demandLoading || (!!visitPlanId && planLoading)
  /** 有 demandId 且需求已加载完成即可点；仅已审批/已驳回时禁用。若为草稿，后端会返回提示 */
  const canApprove = !!id && !demandLoading && demandStatus !== 'approved' && demandStatus !== 'rejected'

  const handleAddEquipment = () => {
    setEditingEquipment(null)
    setEquipmentForm({
      test_indicator_type: 'probe',
      test_equipment: '',
      test_site: '',
      test_point: undefined,
      equipment_visit_timepoints: [],
    })
    setShowEquipmentModal(true)
  }

  const handleEditEquipment = (equipment: EquipmentPlan) => {
    setEditingEquipment(equipment)
    setEquipmentForm(equipment)
    setShowEquipmentModal(true)
  }

  const handleSaveEquipment = () => {
    if (!equipmentForm.test_equipment || !equipmentForm.test_site) {
      alert('请填写必填项')
      return
    }
    const testPoint = equipmentForm.test_point ?? 0
    const payload: Partial<EquipmentPlan> = { ...equipmentForm, test_point: testPoint }
    if (editingEquipment) {
      setEquipmentList(list => list.map(eq => eq.id === editingEquipment.id ? { ...payload, id: editingEquipment.id } as EquipmentPlan : eq))
    } else {
      setEquipmentList(list => [...list, { ...payload, id: Date.now().toString() } as EquipmentPlan])
    }
    setShowEquipmentModal(false)
  }

  if (!id) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <Empty message="缺少资源需求 ID" />
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>返回排程管理</Button>
      </div>
    )
  }

  if (isLoading && !plan) {
    return (
      <div className="flex items-center justify-center min-h-[320px] text-slate-500">
        加载中...
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-24">
      {/* 返回 + 标题 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            title="返回排程管理"
            onClick={() => navigate('/scheduling')}
            className="min-h-11 min-w-11 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-[#3b434e] dark:hover:bg-slate-700"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 md:text-xl">资源审核</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">访视计划与资源需求详情</p>
          </div>
        </div>
        {demandStatus && (
          <Badge variant={demandStatus === 'submitted' ? 'warning' : 'default'}>
            {demandStatus === 'draft' ? '草稿' : demandStatus === 'submitted' ? '已提交' : demandStatus}
          </Badge>
        )}
      </div>

      {/* 1. 项目基础信息 */}
      <Card 
        title={
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>项目基础信息</span>
          </div>
        }
        variant="bordered"
      >
        <div className="overflow-x-auto">
          <div className="grid gap-x-0 gap-y-4" style={{ gridTemplateColumns: GRID_COLS_4 }}>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">项目编号</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 font-medium min-h-[20px] flex items-center justify-center">{protocolInfo.code}</div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">样本量</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 font-medium min-h-[20px] flex items-center justify-center">{protocolInfo.sample_size}</div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">研究目的</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 min-h-[20px] flex items-center justify-center break-words">{protocolInfo.research_purpose}</div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">执行周期</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 min-h-[20px] flex items-center justify-center">{protocolInfo.execution_period}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. 场地计划 */}
      <Card 
        title={
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>场地计划</span>
          </div>
        }
        variant="bordered"
      >
        <div className="overflow-x-auto">
          <div className="grid gap-x-0 gap-y-4" style={{ gridTemplateColumns: GRID_COLS_4 }}>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">场地要求</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 min-h-[20px] flex items-center justify-center break-words">{facilityPlan.facility_requirement}</div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">温度</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 min-h-[20px] flex items-center justify-center">{facilityPlan.temperature}</div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">湿度</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 min-h-[20px] flex items-center justify-center">{facilityPlan.humidity}</div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">场地类型</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 min-h-[20px] flex items-center justify-center">{facilityPlan.facility_type}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* 3. 访视计划 */}
      <Card 
        title={
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>访视计划</span>
          </div>
        }
        variant="bordered"
      >
        <div className="overflow-x-auto">
          <div className="grid gap-x-0 gap-y-4" style={{ gridTemplateColumns: GRID_COLS_6 }}>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">样本组别</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 font-medium whitespace-nowrap min-h-[20px] flex items-center justify-center">{visitPlan.sample_group}</div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">访视顺序</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 font-medium whitespace-nowrap min-h-[20px] flex items-center justify-center">{visitPlan.visit_order}</div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">访视类型</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 font-medium whitespace-nowrap min-h-[20px] flex items-center justify-center">{visitPlan.visit_type}</div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">允许超窗期</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 font-medium whitespace-nowrap min-h-[20px] flex items-center justify-center">{visitPlan.allowed_window_period}</div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">访视时间点</div>
              <div className="flex flex-wrap gap-1.5 min-h-[20px] items-center justify-center">
                {visitPlan.visit_timepoints.length > 0 ? (
                  visitPlan.visit_timepoints.map((tp) => (
                    <Badge key={tp} variant="info" size="sm">{tp}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                )}
              </div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">当日测试时间点</div>
              <div className="flex flex-wrap gap-1.5 min-h-[20px] items-center justify-center">
                {visitPlan.same_day_test_timepoints.length > 0 ? (
                  visitPlan.same_day_test_timepoints.map((tp) => (
                    <Badge key={tp} variant="info" size="sm">{tp}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 4. 设备计划 */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>设备计划</span>
          </div>
        }
        variant="bordered"
        actions={
          <Button size="xs" variant="primary" onClick={handleAddEquipment} className="whitespace-nowrap px-3">
            <Plus className="w-3 h-3 mr-1" /> 新增设备
          </Button>
        }
      >
        {equipmentList.length === 0 ? (
          <div className="py-8">
            <Empty message="暂无设备计划" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: `${COL_WIDTH_PX}px` }} />
                <col style={{ width: `${COL_WIDTH_PX}px` }} />
                <col style={{ width: `${COL_WIDTH_PX}px` }} />
                <col style={{ width: `${COL_WIDTH_PX}px` }} />
                {/* 与访视计划第5列（访视时间点）同宽：各占 (100% - 800px) / 2 */}
                <col style={{ width: 'calc((100% - 800px) / 2)' }} />
                <col style={{ width: 'calc((100% - 800px) / 2)' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 dark:border-b-[#3b434e]">
                  <th className="px-4 py-3 text-center text-sm font-medium text-slate-600 dark:text-slate-400">测试指标</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-slate-600 dark:text-slate-400">测试设备</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-slate-600 dark:text-slate-400">测试部位</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-slate-600 dark:text-slate-400">测试点位</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-slate-600 dark:text-slate-400">设备访视时间点</th>
                  <th className="px-4 py-3 text-center text-sm font-medium text-slate-600 dark:text-slate-400">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#3b434e]">
                {equipmentList.map((eq) => (
                  <tr key={eq.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-4 text-sm font-medium text-slate-800 dark:text-slate-200 text-center">
                      <div className="flex justify-center">
                        <Badge variant={eq.test_indicator_type === 'probe' ? 'info' : 'default'} size="sm">
                          {eq.test_indicator_type === 'probe' ? '探头类' : '图像类'}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-800 dark:text-slate-200 text-center">{eq.test_equipment}</td>
                    <td className="px-4 py-4 text-sm text-slate-800 dark:text-slate-200 text-center">{eq.test_site}</td>
                    <td className="px-4 py-4 text-sm text-slate-800 dark:text-slate-200 text-center">{eq.test_point != null ? eq.test_point : '-'}</td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex flex-wrap gap-1.5 justify-center">
                        {eq.equipment_visit_timepoints.length > 0 ? (
                          eq.equipment_visit_timepoints.map((tp) => (
                            <Badge key={tp} variant="info" size="sm">{tp}</Badge>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex justify-center">
                        <button
                          type="button"
                          onClick={() => handleEditEquipment(eq)}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-primary-600 hover:bg-primary-50 hover:text-primary-700 dark:text-primary-400 dark:hover:bg-primary-500/20 dark:hover:text-primary-300 transition-colors"
                          title="更换设备"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 5. 评估计划 */}
      <Card 
        title={
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>评估计划</span>
          </div>
        }
        variant="bordered"
      >
        <div className="overflow-x-auto">
          <div className="grid gap-x-0 gap-y-4" style={{ gridTemplateColumns: GRID_COLS_4 }}>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">评估人员类别</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 font-medium whitespace-nowrap min-h-[20px] flex items-center justify-center">{evaluationPlan.evaluator_category}</div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">评估指标类别</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 font-medium whitespace-nowrap min-h-[20px] flex items-center justify-center">{evaluationPlan.indicator_category}</div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">评估指标</div>
              <div className="text-sm text-slate-900 dark:text-slate-100 whitespace-nowrap min-h-[20px] flex items-center justify-center">{evaluationPlan.indicator}</div>
            </div>
            <div className="space-y-1 text-center min-w-0">
              <div className="text-sm text-slate-500 dark:text-slate-400 h-5 flex items-center justify-center">评估访视时间点</div>
              <div className="flex flex-wrap gap-1.5 min-h-[20px] items-center justify-center">
                {evaluationPlan.evaluation_visit_timepoints.length > 0 ? (
                  evaluationPlan.evaluation_visit_timepoints.map((tp) => (
                    <Badge key={tp} variant="info" size="sm">{tp}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 dark:text-slate-500">-</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 设备新增/编辑 Modal */}
      <Modal
        isOpen={showEquipmentModal}
        onClose={() => setShowEquipmentModal(false)}
        title={editingEquipment ? '更换设备' : '新增设备'}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowEquipmentModal(false)}>取消</Button>
            <Button variant="primary" onClick={handleSaveEquipment}>保存</Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              测试指标类型 <span className="text-red-500">*</span>
            </label>
            <select
              value={equipmentForm.test_indicator_type}
              onChange={(e) => setEquipmentForm({ ...equipmentForm, test_indicator_type: e.target.value as 'probe' | 'image' })}
              className="w-full min-h-11 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:focus:ring-primary-400"
            >
              <option value="probe">探头类</option>
              <option value="image">图像类</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              测试设备 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={equipmentForm.test_equipment}
              onChange={(e) => setEquipmentForm({ ...equipmentForm, test_equipment: e.target.value })}
              className="w-full min-h-11 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:focus:ring-primary-400"
              placeholder="请输入测试设备名称"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                测试部位 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={equipmentForm.test_site}
                onChange={(e) => setEquipmentForm({ ...equipmentForm, test_site: e.target.value })}
                className="w-full min-h-11 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:focus:ring-primary-400"
                placeholder="如：前臂"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">测试点位</label>
              <input
                type="number"
                min={0}
                value={equipmentForm.test_point ?? ''}
                onChange={(e) => setEquipmentForm({ ...equipmentForm, test_point: e.target.value === '' ? undefined : e.target.valueAsNumber })}
                className="w-full min-h-11 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:focus:ring-primary-400"
                placeholder="如：1"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">设备访视时间点</label>
            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg p-4 bg-slate-50 dark:border-[#3b434e] dark:bg-slate-800">
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                {VISIT_TIMEPOINTS.map((tp) => (
                  <label key={tp} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={equipmentForm.equipment_visit_timepoints?.includes(tp)}
                      onChange={(e) => {
                        const current = equipmentForm.equipment_visit_timepoints || []
                        if (e.target.checked) {
                          setEquipmentForm({ ...equipmentForm, equipment_visit_timepoints: [...current, tp] })
                        } else {
                          setEquipmentForm({ ...equipmentForm, equipment_visit_timepoints: current.filter(t => t !== tp) })
                        }
                      }}
                      className="rounded border-slate-300 dark:border-[#3b434e] text-primary-600 focus:ring-primary-500 focus:ring-2"
                    />
                    <span className="text-xs text-slate-700 dark:text-slate-300 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{tp}</span>
                  </label>
                ))}
              </div>
            </div>
            {equipmentForm.equipment_visit_timepoints && equipmentForm.equipment_visit_timepoints.length > 0 && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                已选择 {equipmentForm.equipment_visit_timepoints.length} 个时间点
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* 驳回原因弹框 */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => !rejectMutation.isPending && (setShowRejectModal(false), setRejectReason(''))}
        title="驳回原因"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowRejectModal(false)}
              disabled={rejectMutation.isPending}
            >
              取消
            </Button>
            <Button
              variant="primary"
              onClick={handleRejectSubmit}
              disabled={rejectMutation.isPending || !rejectReason.trim()}
            >
              {rejectMutation.isPending ? '提交中...' : '提交'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">填写驳回原因后提交，访视计划将退回研究台。</p>
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="请输入驳回原因（必填）"
          rows={5}
          className="w-full border border-slate-200 dark:border-[#3b434e] rounded-lg px-3 py-2.5 text-sm placeholder:text-slate-400 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </Modal>

      {/* 审核通过二次确认 */}
      <Modal
        isOpen={showApproveConfirm}
        onClose={() => !approveMutation.isPending && setShowApproveConfirm(false)}
        title="确认通过"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowApproveConfirm(false)}
              disabled={approveMutation.isPending}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                handleApproveSubmit()
              }}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? '处理中...' : '确认通过'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">确认通过后，该资源需求将标记为已审核，并可在排程计划中以待排程状态进行排程。</p>
      </Modal>

      {/* 底部固定操作区 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-t-[#3b434e] p-4 flex flex-wrap items-center justify-end gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <Button
          variant="secondary"
          onClick={() => navigate('/scheduling')}
          className="min-h-11"
        >
          返回
        </Button>
        <Button
          variant="secondary"
          className="min-h-11 whitespace-nowrap"
          onClick={() => setShowRejectModal(true)}
          disabled={rejectMutation.isPending}
        >
          <XCircle className="w-4 h-4 mr-1" /> 驳回
        </Button>
        <Button
          variant="primary"
          className="min-h-11 whitespace-nowrap"
          onClick={handleApproveConfirm}
          disabled={!canApprove || approveMutation.isPending}
          title={!canApprove ? (demandStatus === 'approved' || demandStatus === 'rejected' ? '已审批或已驳回' : '') : ''}
        >
          <CheckCircle className="w-4 h-4 mr-1" /> 审核通过
        </Button>
      </div>
    </div>
  )
}
