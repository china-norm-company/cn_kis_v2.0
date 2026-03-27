import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { SearchableSelect, type SearchableOption } from './SearchableSelect'
import {
  FALLBACK_BUSINESS_SEGMENTS,
  FALLBACK_DEMAND_STAGE_OPTIONS,
  FALLBACK_RESEARCH_GROUPS,
  FALLBACK_SALES_STAGE_OPTIONS,
} from '../constants/opportunityFormFallback'

interface FormMeta {
  next_code_preview: string
  sales_stage_options?: { value: string; label: string }[]
  research_groups: string[]
  business_segments: string[]
  demand_stage_options: string[]
  server_time: string
}

interface ClientRow {
  id: number
  name: string
}

interface OwnerRow {
  id: number
  display_name: string
  username: string
}

/** 与后端 _opportunity_to_dict 对齐，用于编辑回填 */
interface OpportunityDetail {
  id: number
  code: string
  client_id: number
  stage: string
  estimated_amount: string
  probability: number
  owner_id: number | null
  research_group: string
  business_segment: string
  key_opportunity: boolean
  client_pm: string
  client_contact_info: string
  client_department_line: string
  is_decision_maker: string
  actual_decision_maker: string
  actual_decision_maker_department_line: string
  actual_decision_maker_level: string
  demand_stages: string[]
  project_detail: Record<string, string>
  necessity_pct: number | null
  urgency_pct: number | null
  uniqueness_pct: number | null
  planned_start_date: string
  demand_name: string
  sales_amount_total: string
  sales_by_year: Record<string, string>
  remark: string
  cancel_reason: string
  lost_reason: string
  create_time: string
}

const sectionCls = 'rounded-xl border border-slate-200 bg-slate-50/80 p-4'
const labelCls = 'mb-1 block text-xs font-medium text-slate-600'
const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400'
const subheading = 'mb-2 text-sm font-semibold text-slate-800'
/** 小项两列 */
const grid2 = 'grid grid-cols-1 gap-3 sm:grid-cols-2'
const errMsgCls = 'mt-1 text-xs text-red-600'
const MSG_FILL = '请填写'
const MSG_REDO = '请重新填写'
const MSG_SALES_SUM = '请重新填写，需等于下两项之和'

/** 校验错误时按页面从上到下的滚动顺序 */
const VALIDATION_FIELD_ORDER = [
  'clientId',
  'ownerId',
  'salesStage',
  'cancelReason',
  'lostReason',
  'researchGroup',
  'businessSegment',
  'amount',
  'salesTotal',
  'salesCurrentYear',
  'salesNextYear',
  'actualDecisionMaker',
  'actualDmDeptLine',
  'actualDmLevel',
  'demandName',
  'productType',
  'sampleName',
  'sampleType',
] as const

function fieldWrapId(key: string) {
  return `opp-field-${key}`
}

/** 避免将 Django 调试 HTML 页当作错误文案展示 */
function friendlyOpportunityWriteError(e: unknown): string {
  if (!(e instanceof Error)) return '保存失败'
  const m = e.message
  if (/<!DOCTYPE|Server Error|<html|<HEAD|<body/i.test(m)) {
    return '保存失败：服务器异常（未返回结构化错误）。请确认后端已执行数据库迁移并与前端 API 版本一致。'
  }
  return m
}

function formatIsoLocal(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN')
}

/** 预估金额 / 销售额：隐藏步进箭头；样式与 inputCls 一致 */
const numberAmountInputCls = `${inputCls} [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`

function PctRow({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  disabled?: boolean
}) {
  const n = value === undefined ? 0 : value
  return (
    <div className={disabled ? 'pointer-events-none opacity-50' : ''}>
      <div className="mb-1 flex justify-between text-xs text-slate-600">
        <span>{label}</span>
        <span>{value === undefined ? '未设置' : `${value}%`}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={n}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-600"
      />
      <button type="button" disabled={disabled} className="mt-1 text-xs text-blue-600 hover:underline disabled:opacity-50" onClick={() => onChange(undefined)}>
        清除
      </button>
    </div>
  )
}

export type OpportunityFormProps = {
  mode: 'create' | 'edit'
  variant?: 'modal' | 'page'
  opportunityId?: string
  onClose?: () => void
  onCancel?: () => void
  onSaved?: () => void
}

export function OpportunityForm({
  mode,
  variant = 'modal',
  opportunityId,
  onClose,
  onCancel,
  onSaved,
}: OpportunityFormProps) {
  const qc = useQueryClient()
  const [clientId, setClientId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [salesStage, setSalesStage] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [lostReason, setLostReason] = useState('')
  const [researchGroup, setResearchGroup] = useState('')
  const [businessSegment, setBusinessSegment] = useState('')
  /** 重点商机：下拉，默认否 */
  const [keyOpportunity, setKeyOpportunity] = useState<'yes' | 'no'>('no')
  const [clientPm, setClientPm] = useState('')
  const [clientContact, setClientContact] = useState('')
  const [deptLine, setDeptLine] = useState('')
  /** 是否为决策人：是 / 否 / 未知；选「否」时展示实际决策人相关字段 */
  const [isDecisionMaker, setIsDecisionMaker] = useState('')
  const [actualDecisionMaker, setActualDecisionMaker] = useState('')
  const [actualDmDeptLine, setActualDmDeptLine] = useState('')
  const [actualDmLevel, setActualDmLevel] = useState('')
  const [amount, setAmount] = useState('')
  /** 赢单时：销售额、分年度销售额（与后端 sales_by_year 年份一致） */
  const [salesTotal, setSalesTotal] = useState('')
  const [salesCurrentYear, setSalesCurrentYear] = useState('0')
  const [salesNextYear, setSalesNextYear] = useState('0')
  /** 赢单时填写过销售额，或赢单→取消/输单时仍展示三字段 */
  const [salesTouchedFromWon, setSalesTouchedFromWon] = useState(false)
  const prevStageRef = useRef(salesStage)
  const salesSnapshotRef = useRef({ salesTotal, salesCurrentYear, salesNextYear })
  salesSnapshotRef.current = { salesTotal, salesCurrentYear, salesNextYear }
  const [demandName, setDemandName] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [demandStages, setDemandStages] = useState<string[]>([])
  const [nec, setNec] = useState<number | undefined>(undefined)
  const [urg, setUrg] = useState<number | undefined>(undefined)
  const [uniq, setUniq] = useState<number | undefined>(undefined)
  const [remark, setRemark] = useState('')

  const [productType, setProductType] = useState('')
  const [productStage, setProductStage] = useState('')
  const [projectInitiator, setProjectInitiator] = useState('')
  const [experimentPurpose, setExperimentPurpose] = useState('')
  const [experimentType, setExperimentType] = useState('')
  const [hasSample, setHasSample] = useState<'yes' | 'no' | ''>('')
  const [sampleName, setSampleName] = useState('')
  const [sampleType, setSampleType] = useState('')
  const [sampleInfo, setSampleInfo] = useState('')
  const [testInfo, setTestInfo] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [testLocation, setTestLocation] = useState('')
  const [ethicsReq, setEthicsReq] = useState<'yes' | 'no' | ''>('')
  const [hgracReq, setHgracReq] = useState<'yes' | 'no' | ''>('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const amountInputRef = useRef<HTMLInputElement>(null)
  const salesTotalInputRef = useRef<HTMLInputElement>(null)
  const salesCyInputRef = useRef<HTMLInputElement>(null)
  const salesNyInputRef = useRef<HTMLInputElement>(null)

  const { data: meta } = useQuery({
    queryKey: ['crm-opp-form-meta'],
    queryFn: async () => {
      const res = await api.get<FormMeta>('/crm/opportunities/form-meta')
      return res.data
    },
  })

  const { data: clientPayload } = useQuery({
    queryKey: ['opportunity-clients'],
    queryFn: async () => {
      const res = await api.get<{ items: ClientRow[] }>('/crm/clients/list', {
        params: { page: 1, page_size: 500 },
      })
      return res.data
    },
  })

  const { data: ownerPayload } = useQuery({
    queryKey: ['crm-opp-owners'],
    queryFn: async () => {
      const res = await api.get<{ items: OwnerRow[] }>('/crm/opportunities/owner-candidates', {
        params: { limit: 120, q: '' },
      })
      return res.data
    },
  })

  const {
    data: opp,
    isLoading: oppLoading,
    isError: oppDetailError,
  } = useQuery({
    queryKey: ['crm', 'opportunity', opportunityId, 'form'],
    queryFn: async () => {
      const res = await api.get<OpportunityDetail>(`/crm/opportunities/${opportunityId}`)
      if (res.code !== 200) throw new Error(res.msg || '加载失败')
      return res.data
    },
    enabled: mode === 'edit' && !!opportunityId,
  })

  const researchGroups = useMemo(
    () => (meta?.research_groups?.length ? meta.research_groups : FALLBACK_RESEARCH_GROUPS),
    [meta?.research_groups],
  )
  const businessSegments = useMemo(
    () => (meta?.business_segments?.length ? meta.business_segments : FALLBACK_BUSINESS_SEGMENTS),
    [meta?.business_segments],
  )
  const demandStageOptions = useMemo(
    () => (meta?.demand_stage_options?.length ? meta.demand_stage_options : FALLBACK_DEMAND_STAGE_OPTIONS),
    [meta?.demand_stage_options],
  )

  const clientOptions: SearchableOption[] = useMemo(
    () => (clientPayload?.items ?? []).map((c) => ({ id: c.id, label: c.name })),
    [clientPayload?.items],
  )
  const ownerOptions: SearchableOption[] = useMemo(
    () =>
      (ownerPayload?.items ?? []).map((a) => ({
        id: a.id,
        label: `${a.display_name}${a.username && a.username !== a.display_name ? ` (${a.username})` : ''}`,
      })),
    [ownerPayload?.items],
  )

  const salesStageOptions = useMemo(
    () => (meta?.sales_stage_options?.length ? meta.sales_stage_options : FALLBACK_SALES_STAGE_OPTIONS),
    [meta?.sales_stage_options],
  )

  const salesStageSelectOptions = useMemo(
    () => [
      { id: '', label: '请选择' },
      ...salesStageOptions.map((o) => ({ id: o.value, label: o.label })),
    ],
    [salesStageOptions],
  )
  const researchGroupSelectOptions = useMemo(
    () => [
      { id: '', label: '请选择' },
      ...researchGroups.map((g) => ({ id: g, label: g })),
    ],
    [researchGroups],
  )
  const businessSegmentSelectOptions = useMemo(
    () => [
      { id: '', label: '请选择' },
      ...businessSegments.map((g) => ({ id: g, label: g })),
    ],
    [businessSegments],
  )
  const keyOpportunityOptions = useMemo(
    () => [
      { id: 'no', label: '否' },
      { id: 'yes', label: '是' },
    ],
    [],
  )
  const ynTripleOptions = useMemo(
    () => [
      { id: '', label: '请选择' },
      { id: 'yes', label: '是' },
      { id: 'no', label: '否' },
    ],
    [],
  )
  const decisionMakerOptions = useMemo(
    () => [
      { id: '', label: '请选择' },
      { id: 'yes', label: '是' },
      { id: 'no', label: '否' },
      { id: 'unknown', label: '未知' },
    ],
    [],
  )

  const isTerminal = salesStage === 'cancelled' || salesStage === 'lost'
  const showSalesFields =
    salesStage === 'won' || (isTerminal && salesTouchedFromWon)
  const calendarYear = useMemo(() => new Date().getFullYear(), [])

  useEffect(() => {
    if (mode !== 'edit' || !opp) return
    const o = opp
    const y = new Date().getFullYear()
    const by = o.sales_by_year || {}

    setClientId(String(o.client_id))
    setOwnerId(o.owner_id != null ? String(o.owner_id) : '')
    setSalesStage(o.stage || '')
    setCancelReason(o.cancel_reason || '')
    setLostReason(o.lost_reason || '')
    setResearchGroup(o.research_group || '')
    setBusinessSegment(o.business_segment || '')
    setKeyOpportunity(o.key_opportunity ? 'yes' : 'no')
    setClientPm(o.client_pm || '')
    setClientContact(o.client_contact_info || '')
    setDeptLine(o.client_department_line || '')
    setIsDecisionMaker(o.is_decision_maker || '')
    setActualDecisionMaker(o.actual_decision_maker || '')
    setActualDmDeptLine(o.actual_decision_maker_department_line || '')
    setActualDmLevel(o.actual_decision_maker_level || '')
    setAmount(
      o.estimated_amount != null && o.estimated_amount !== '' ? String(o.estimated_amount) : '',
    )
    setSalesTotal(o.sales_amount_total ? String(o.sales_amount_total) : '')
    setSalesCurrentYear(by[String(y)] != null ? String(by[String(y)]) : '0')
    setSalesNextYear(by[String(y + 1)] != null ? String(by[String(y + 1)]) : '0')
    const hadSales =
      (o.sales_amount_total != null &&
        String(o.sales_amount_total).trim() !== '' &&
        Number(o.sales_amount_total) > 0) ||
      Object.values(by).some((v) => v && String(v).trim() !== '' && Number(v) > 0)
    setSalesTouchedFromWon(
      o.stage === 'won' || ((o.stage === 'cancelled' || o.stage === 'lost') && hadSales),
    )
    setDemandName(o.demand_name || '')
    setPlannedStart(
      o.planned_start_date ? String(o.planned_start_date).slice(0, 10) : '',
    )
    setDemandStages(Array.isArray(o.demand_stages) ? [...o.demand_stages] : [])
    setNec(o.necessity_pct ?? undefined)
    setUrg(o.urgency_pct ?? undefined)
    setUniq(o.uniqueness_pct ?? undefined)
    setRemark(o.remark || '')

    const pd = o.project_detail || {}
    setProductType(String(pd.product_type ?? ''))
    setProductStage(String(pd.product_stage ?? ''))
    setProjectInitiator(String(pd.project_initiator ?? ''))
    setExperimentPurpose(String(pd.experiment_purpose ?? ''))
    setExperimentType(String(pd.experiment_type ?? ''))
    const hs = String(pd.has_sample ?? '')
    setHasSample(hs === 'yes' || hs === 'no' ? (hs as 'yes' | 'no') : '')
    setSampleName(String(pd.sample_name ?? ''))
    setSampleType(String(pd.sample_type ?? ''))
    setSampleInfo(String(pd.sample_info ?? ''))
    setTestInfo(String(pd.test_info ?? ''))
    setFollowUp(String(pd.follow_up_period ?? ''))
    setTestLocation(String(pd.test_location ?? ''))
    const er = String(pd.ethics_required ?? '')
    setEthicsReq(er === 'yes' || er === 'no' ? (er as 'yes' | 'no') : '')
    const hr = String(pd.human_genetic_resource_required ?? '')
    setHgracReq(hr === 'yes' || hr === 'no' ? (hr as 'yes' | 'no') : '')
  }, [mode, opp])

  /** 条件渲染后 ref 才存在，需在布局后绑定非 passive 的 wheel 以禁止滚轮改值 */
  useLayoutEffect(() => {
    const inputs = [
      amountInputRef.current,
      salesTotalInputRef.current,
      salesCyInputRef.current,
      salesNyInputRef.current,
    ].filter((el): el is HTMLInputElement => el != null)
    const cleanups = inputs.map((el) => {
      const fn = (e: WheelEvent) => {
        e.preventDefault()
      }
      el.addEventListener('wheel', fn, { passive: false })
      return () => el.removeEventListener('wheel', fn)
    })
    return () => {
      cleanups.forEach((c) => c())
    }
  }, [showSalesFields, salesStage])

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      client_id: Number(clientId),
      stage: salesStage,
      commercial_owner_id: Number(ownerId),
      probability: 0,
    }
    if (isTerminal) {
      payload.estimated_amount = '0'
      payload.demand_name = ''
      payload.research_group = ''
      payload.business_segment = ''
      payload.key_opportunity = false
      payload.client_pm = ''
      payload.client_contact_info = ''
      payload.client_department_line = ''
      payload.is_decision_maker = ''
      payload.actual_decision_maker = ''
      payload.actual_decision_maker_department_line = ''
      payload.actual_decision_maker_level = ''
      payload.demand_stages = []
      payload.remark = undefined
      payload.planned_start_date = undefined
      payload.project_detail = {}
      payload.necessity_pct = undefined
      payload.urgency_pct = undefined
      payload.uniqueness_pct = undefined
      if (salesStage === 'cancelled') payload.cancel_reason = cancelReason.trim()
      if (salesStage === 'lost') payload.lost_reason = lostReason.trim()
    } else {
      payload.estimated_amount = amount.trim()
      payload.demand_name = demandName.trim()
      payload.planned_start_date = plannedStart.trim() || undefined
      if (salesStage === 'won') {
        payload.sales_amount_total = salesTotal.trim()
        payload.sales_amount_current_year = salesCurrentYear.trim()
        payload.sales_amount_next_year = salesNextYear.trim()
      }
      payload.research_group = researchGroup
      payload.business_segment = businessSegment
      payload.key_opportunity = keyOpportunity === 'yes'
      payload.client_pm = clientPm
      payload.client_contact_info = clientContact
      payload.client_department_line = deptLine
      payload.is_decision_maker = isDecisionMaker
      payload.actual_decision_maker = isDecisionMaker === 'no' ? actualDecisionMaker.trim() : ''
      payload.actual_decision_maker_department_line =
        isDecisionMaker === 'no' ? actualDmDeptLine.trim() : ''
      payload.actual_decision_maker_level = isDecisionMaker === 'no' ? actualDmLevel.trim() : ''
      payload.demand_stages = demandStages
      payload.remark = remark.trim() || undefined
      payload.project_detail = {
        product_type: productType.trim(),
        product_stage: productStage.trim(),
        project_initiator: projectInitiator.trim(),
        experiment_purpose: experimentPurpose.trim(),
        experiment_type: experimentType.trim(),
        has_sample: hasSample,
        sample_name: hasSample === 'yes' ? sampleName.trim() : '',
        sample_type: hasSample === 'yes' ? sampleType.trim() : '',
        sample_info: sampleInfo.trim(),
        test_info: testInfo.trim(),
        follow_up_period: followUp.trim(),
        test_location: testLocation.trim(),
        ethics_required: ethicsReq,
        human_genetic_resource_required: hgracReq,
      }
      payload.necessity_pct = nec
      payload.urgency_pct = urg
      payload.uniqueness_pct = uniq
    }
    return payload
  }

  const createMut = useMutation({
    mutationFn: async () => {
      try {
        await api.post('/crm/opportunities/create', buildPayload())
      } catch (e: unknown) {
        throw new Error(friendlyOpportunityWriteError(e))
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['opportunity-stats'] })
      qc.invalidateQueries({ queryKey: ['crm-opp-form-meta'] })
      onClose?.()
    },
  })

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!opportunityId) throw new Error('无效 ID')
      try {
        await api.put(`/crm/opportunities/${opportunityId}`, buildPayload())
      } catch (e: unknown) {
        throw new Error(friendlyOpportunityWriteError(e))
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['opportunity-stats'] })
      qc.invalidateQueries({ queryKey: ['crm-opp-form-meta'] })
      if (opportunityId) {
        qc.invalidateQueries({ queryKey: ['crm', 'opportunity', opportunityId] })
      }
      onSaved?.()
    },
  })

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['crm-opp-form-meta'] })
  }, [qc])

  useEffect(() => {
    if (isDecisionMaker !== 'no') {
      setActualDecisionMaker('')
      setActualDmDeptLine('')
      setActualDmLevel('')
    }
  }, [isDecisionMaker])

  useEffect(() => {
    /** 编辑模式：保留数据库中的三项销售额，不因阶段切换自动清空 */
    if (mode === 'edit') return

    const prev = prevStageRef.current
    prevStageRef.current = salesStage
    const { salesTotal: st, salesCurrentYear: cy, salesNextYear: ny } = salesSnapshotRef.current

    if (salesStage === 'won') return

    if (prev === 'won' && (salesStage === 'cancelled' || salesStage === 'lost')) {
      const hasSales = st.trim() !== '' || Number(cy) > 0 || Number(ny) > 0
      if (hasSales) {
        setSalesTouchedFromWon(true)
        return
      }
    }

    if (isTerminal && salesTouchedFromWon) return

    setSalesTotal('')
    setSalesCurrentYear('0')
    setSalesNextYear('0')
    setSalesTouchedFromWon(false)
  }, [salesStage, isTerminal, salesTouchedFromWon, mode])

  const clearFieldError = useCallback((key: string) => {
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const buildValidationErrors = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!clientId.trim()) e.clientId = MSG_FILL
    if (!ownerId.trim()) e.ownerId = MSG_FILL
    if (!salesStage) e.salesStage = MSG_FILL

    if (isTerminal) {
      if (salesStage === 'cancelled' && !cancelReason.trim()) e.cancelReason = MSG_FILL
      if (salesStage === 'lost' && !lostReason.trim()) e.lostReason = MSG_FILL
      return e
    }

    if (!researchGroup) e.researchGroup = MSG_FILL
    if (!businessSegment) e.businessSegment = MSG_FILL

    const estRaw = amount.trim()
    if (estRaw === '') e.amount = MSG_FILL
    else {
      const est = Number(estRaw)
      if (Number.isNaN(est) || est < 0) e.amount = MSG_REDO
    }

    if (!productType.trim()) e.productType = MSG_FILL
    if (hasSample === 'yes') {
      if (!sampleName.trim()) e.sampleName = MSG_FILL
      if (!sampleType.trim()) e.sampleType = MSG_FILL
    }
    if (isDecisionMaker === 'no') {
      if (!actualDecisionMaker.trim()) e.actualDecisionMaker = MSG_FILL
      if (!actualDmDeptLine.trim()) e.actualDmDeptLine = MSG_FILL
      if (!actualDmLevel.trim()) e.actualDmLevel = MSG_FILL
    }
    if (!demandName.trim()) e.demandName = MSG_FILL

    if (salesStage === 'won') {
      const st = salesTotal.trim()
      const cy = salesCurrentYear.trim()
      const ny = salesNextYear.trim()
      if (st === '') e.salesTotal = MSG_FILL
      else if (Number.isNaN(Number(st))) e.salesTotal = MSG_REDO
      if (cy === '') e.salesCurrentYear = MSG_FILL
      else if (Number.isNaN(Number(cy))) e.salesCurrentYear = MSG_REDO
      if (ny === '') e.salesNextYear = MSG_FILL
      else if (Number.isNaN(Number(ny))) e.salesNextYear = MSG_REDO

      if (
        !e.salesTotal &&
        !e.salesCurrentYear &&
        !e.salesNextYear &&
        st !== '' &&
        cy !== '' &&
        ny !== ''
      ) {
        const a = Number(st)
        const ncy = Number(cy)
        const nny = Number(ny)
        if (!Number.isNaN(a) && !Number.isNaN(ncy) && !Number.isNaN(nny) && Math.abs(a - (ncy + nny)) > 0.009) {
          e.salesTotal = MSG_SALES_SUM
        }
      }
    }

    return e
  }

  const toggleStage = (s: string) => {
    setDemandStages((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  const handleSave = () => {
    const errors = buildValidationErrors()
    setFieldErrors(errors)
    const errKeys = Object.keys(errors)
    if (errKeys.length > 0) {
      setTimeout(() => {
        const first = VALIDATION_FIELD_ORDER.find((k) => k in errors)
        if (first) {
          document.getElementById(fieldWrapId(first))?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 0)
      return
    }
    if (mode === 'edit') {
      updateMut.mutate()
    } else {
      createMut.mutate()
    }
  }

  const saving = createMut.isPending || updateMut.isPending
  const saveError = createMut.isError || updateMut.isError
  const saveErrMsg =
    (createMut.error as Error | undefined)?.message ||
    (updateMut.error as Error | undefined)?.message ||
    '保存失败'

  if (mode === 'edit' && oppLoading) {
    return variant === 'page' ? (
      <div className="flex items-center justify-center gap-2 p-12 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> 加载中…
      </div>
    ) : (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    )
  }

  if (mode === 'edit' && oppDetailError) {
    return (
      <div className="p-6 text-center text-sm text-red-600">商机不存在或无法加载</div>
    )
  }

  const formCard = (
    <div
      className={
        variant === 'modal'
          ? 'max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl'
          : 'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'
      }
      onClick={variant === 'modal' ? (e) => e.stopPropagation() : undefined}
    >
      {variant === 'modal' ? (
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {mode === 'edit' ? '编辑商机' : '新建商机'}
          </h3>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>
            关闭
          </button>
        </div>
      ) : null}

      <div className="space-y-4 p-5">
          {/* 商机编号 + 客户名称 同一行两大块 */}
          <div className={sectionCls}>
            <div className={grid2}>
              <div>
                <h4 className={subheading}>商机编号</h4>
                <label className={labelCls}>
                  {mode === 'edit' ? '编号（系统分配，不可改）' : '编号（保存时按序生成，不可改）'}
                </label>
                <input
                  readOnly
                  value={mode === 'edit' && opp ? opp.code || '' : meta?.next_code_preview ?? ''}
                  placeholder="系统自动生成"
                  className={`${inputCls} bg-slate-100 text-slate-700 placeholder:text-slate-400`}
                />
              </div>
              <div id={fieldWrapId('clientId')}>
                <h4 className={subheading}>客户名称</h4>
                <label className={labelCls}>客户（必填）</label>
                <SearchableSelect
                  value={clientId}
                  onChange={(v) => {
                    setClientId(v)
                    clearFieldError('clientId')
                  }}
                  options={clientOptions}
                  placeholder="搜索并选择客户"
                  emptyHint="暂无客户，请先在客户档案中创建"
                  searchable
                  searchPlaceholder="输入关键字筛选客户…"
                />
                {fieldErrors.clientId && <p className={errMsgCls}>{fieldErrors.clientId}</p>}
              </div>
            </div>
          </div>

          <div className={sectionCls}>
            <h4 className="mb-3 text-sm font-semibold text-slate-800">我方信息</h4>
            <div className="space-y-3">
              <div className={grid2}>
                <div id={fieldWrapId('ownerId')}>
                  <label className={labelCls}>商务负责人（必填）</label>
                  <SearchableSelect
                    value={ownerId}
                    onChange={(v) => {
                      setOwnerId(v)
                      clearFieldError('ownerId')
                    }}
                    options={ownerOptions}
                    placeholder="搜索并选择负责人"
                    emptyHint="暂无账号"
                    searchable
                    searchPlaceholder="输入关键字筛选负责人…"
                  />
                  {fieldErrors.ownerId && <p className={errMsgCls}>{fieldErrors.ownerId}</p>}
                </div>
                <div id={fieldWrapId('salesStage')}>
                  <label className={labelCls}>销售阶段（必填）</label>
                  <SearchableSelect
                    value={salesStage}
                    onChange={(v) => {
                      setSalesStage(v)
                      clearFieldError('salesStage')
                    }}
                    options={salesStageSelectOptions}
                    placeholder="请选择"
                    emptyHint="暂无选项"
                    searchable={false}
                  />
                  {fieldErrors.salesStage && <p className={errMsgCls}>{fieldErrors.salesStage}</p>}
                </div>
              </div>
              {salesStage === 'cancelled' && (
                <div id={fieldWrapId('cancelReason')}>
                  <label className={labelCls}>取消原因（必填）</label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => {
                      setCancelReason(e.target.value)
                      clearFieldError('cancelReason')
                    }}
                    rows={3}
                    className={inputCls}
                    placeholder="请填写取消原因"
                  />
                  {fieldErrors.cancelReason && <p className={errMsgCls}>{fieldErrors.cancelReason}</p>}
                </div>
              )}
              {salesStage === 'lost' && (
                <div id={fieldWrapId('lostReason')}>
                  <label className={labelCls}>输单原因（必填）</label>
                  <textarea
                    value={lostReason}
                    onChange={(e) => {
                      setLostReason(e.target.value)
                      clearFieldError('lostReason')
                    }}
                    rows={3}
                    className={inputCls}
                    placeholder="请填写输单原因"
                  />
                  {fieldErrors.lostReason && <p className={errMsgCls}>{fieldErrors.lostReason}</p>}
                </div>
              )}
              <div className={grid2}>
                <div id={fieldWrapId('researchGroup')}>
                  <label className={labelCls}>研究组（必填）</label>
                  <SearchableSelect
                    value={researchGroup}
                    onChange={(v) => {
                      setResearchGroup(v)
                      clearFieldError('researchGroup')
                    }}
                    options={researchGroupSelectOptions}
                    placeholder="请选择"
                    emptyHint="暂无选项"
                    disabled={isTerminal}
                    searchable
                    searchPlaceholder="输入关键字筛选研究组…"
                  />
                  {fieldErrors.researchGroup && <p className={errMsgCls}>{fieldErrors.researchGroup}</p>}
                </div>
                <div id={fieldWrapId('businessSegment')}>
                  <label className={labelCls}>业务板块（必填）</label>
                  <SearchableSelect
                    value={businessSegment}
                    onChange={(v) => {
                      setBusinessSegment(v)
                      clearFieldError('businessSegment')
                    }}
                    options={businessSegmentSelectOptions}
                    placeholder="请选择"
                    emptyHint="暂无选项"
                    disabled={isTerminal}
                    searchable
                    searchPlaceholder="输入关键字筛选业务板块…"
                  />
                  {fieldErrors.businessSegment && <p className={errMsgCls}>{fieldErrors.businessSegment}</p>}
                </div>
              </div>
              <div className={grid2}>
                <div id={fieldWrapId('amount')}>
                  <label className={labelCls}>预估金额（元，必填）</label>
                  <input
                    ref={amountInputRef}
                    type="number"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value)
                      clearFieldError('amount')
                    }}
                    disabled={isTerminal}
                    className={numberAmountInputCls}
                    placeholder="整数或最多两位小数"
                  />
                  {fieldErrors.amount && <p className={errMsgCls}>{fieldErrors.amount}</p>}
                </div>
                {showSalesFields ? (
                  <div id={fieldWrapId('salesTotal')}>
                    <label className={labelCls}>销售额（元，必填）</label>
                    <input
                      ref={salesTotalInputRef}
                      type="number"
                      min={0}
                      step="0.01"
                      value={salesTotal}
                      onChange={(e) => {
                        setSalesTotal(e.target.value)
                        if (salesStage === 'won') setSalesTouchedFromWon(true)
                        clearFieldError('salesTotal')
                      }}
                      disabled={isTerminal}
                      className={numberAmountInputCls}
                      placeholder="须等于下两项之和"
                    />
                    {fieldErrors.salesTotal && <p className={errMsgCls}>{fieldErrors.salesTotal}</p>}
                  </div>
                ) : (
                  <div aria-hidden className="hidden min-h-[2.5rem] sm:block" />
                )}
              </div>
              {showSalesFields && (
                <div className={grid2}>
                  <div id={fieldWrapId('salesCurrentYear')}>
                    <label className={labelCls}>{`本年（${calendarYear}年）销售额（必填）`}</label>
                    <p className="mb-1 text-xs text-slate-500">当前年份：{calendarYear}</p>
                    <input
                      ref={salesCyInputRef}
                      type="number"
                      min={0}
                      step="0.01"
                      value={salesCurrentYear}
                      onChange={(e) => {
                        setSalesCurrentYear(e.target.value)
                        if (salesStage === 'won') setSalesTouchedFromWon(true)
                        clearFieldError('salesCurrentYear')
                        clearFieldError('salesTotal')
                      }}
                      disabled={isTerminal}
                      className={numberAmountInputCls}
                      placeholder="请输入金额"
                    />
                    {fieldErrors.salesCurrentYear && (
                      <p className={errMsgCls}>{fieldErrors.salesCurrentYear}</p>
                    )}
                  </div>
                  <div id={fieldWrapId('salesNextYear')}>
                    <label className={labelCls}>{`跨年（${calendarYear + 1}年）销售额（必填）`}</label>
                    <p className="mb-1 text-xs text-slate-500">对应年份：{calendarYear + 1}</p>
                    <input
                      ref={salesNyInputRef}
                      type="number"
                      min={0}
                      step="0.01"
                      value={salesNextYear}
                      onChange={(e) => {
                        setSalesNextYear(e.target.value)
                        if (salesStage === 'won') setSalesTouchedFromWon(true)
                        clearFieldError('salesNextYear')
                        clearFieldError('salesTotal')
                      }}
                      disabled={isTerminal}
                      className={numberAmountInputCls}
                      placeholder="请输入金额"
                    />
                    {fieldErrors.salesNextYear && (
                      <p className={errMsgCls}>{fieldErrors.salesNextYear}</p>
                    )}
                  </div>
                </div>
              )}
              <div className={grid2}>
                <div>
                  <label className={labelCls}>重点商机</label>
                  <SearchableSelect
                    value={keyOpportunity}
                    onChange={(v) => setKeyOpportunity((v === 'yes' ? 'yes' : 'no') as 'yes' | 'no')}
                    options={keyOpportunityOptions}
                    placeholder="请选择"
                    disabled={isTerminal}
                    searchable={false}
                    clearable={false}
                  />
                </div>
                <div>
                  <label className={labelCls}>创建时间</label>
                  <input
                    readOnly
                    value={
                      mode === 'edit' && opp ? formatIsoLocal(opp.create_time) : '保存时自动生成'
                    }
                    className={`${inputCls} bg-slate-100 text-slate-600`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={`${sectionCls} ${isTerminal ? 'pointer-events-none opacity-50' : ''}`}>
            <h4 className={subheading}>客户基础信息</h4>
            <div className="space-y-3">
              <div className={grid2}>
                <div>
                  <label className={labelCls}>PM</label>
                  <input
                    value={clientPm}
                    onChange={(e) => setClientPm(e.target.value)}
                    disabled={isTerminal}
                    className={inputCls}
                    placeholder="选填"
                  />
                </div>
                <div>
                  <label className={labelCls}>联系方式</label>
                  <input
                    value={clientContact}
                    onChange={(e) => setClientContact(e.target.value)}
                    disabled={isTerminal}
                    className={inputCls}
                    placeholder="选填"
                  />
                </div>
              </div>
              <div className={grid2}>
                <div>
                  <label className={labelCls}>部门 / 条线</label>
                  <input
                    value={deptLine}
                    onChange={(e) => setDeptLine(e.target.value)}
                    disabled={isTerminal}
                    className={inputCls}
                    placeholder="选填"
                  />
                </div>
                <div>
                  <label className={labelCls}>是否为决策人</label>
                  <SearchableSelect
                    value={isDecisionMaker}
                    onChange={(v) => {
                      setIsDecisionMaker(v)
                      clearFieldError('actualDecisionMaker')
                      clearFieldError('actualDmDeptLine')
                      clearFieldError('actualDmLevel')
                    }}
                    options={decisionMakerOptions}
                    placeholder="请选择"
                    emptyHint="暂无选项"
                    disabled={isTerminal}
                    searchable={false}
                  />
                </div>
              </div>
              {isDecisionMaker === 'no' && !isTerminal && (
                <>
                  <div className={grid2}>
                    <div id={fieldWrapId('actualDecisionMaker')}>
                      <label className={labelCls}>实际决策人（必填）</label>
                      <input
                        value={actualDecisionMaker}
                        onChange={(e) => {
                          setActualDecisionMaker(e.target.value)
                          clearFieldError('actualDecisionMaker')
                        }}
                        className={inputCls}
                        placeholder="请填写姓名或称呼"
                      />
                      {fieldErrors.actualDecisionMaker && (
                        <p className={errMsgCls}>{fieldErrors.actualDecisionMaker}</p>
                      )}
                    </div>
                    <div id={fieldWrapId('actualDmDeptLine')}>
                      <label className={labelCls}>实际决策人-部门/条线（必填）</label>
                      <input
                        value={actualDmDeptLine}
                        onChange={(e) => {
                          setActualDmDeptLine(e.target.value)
                          clearFieldError('actualDmDeptLine')
                        }}
                        className={inputCls}
                        placeholder="请填写部门或条线"
                      />
                      {fieldErrors.actualDmDeptLine && (
                        <p className={errMsgCls}>{fieldErrors.actualDmDeptLine}</p>
                      )}
                    </div>
                  </div>
                  <div className={grid2}>
                    <div id={fieldWrapId('actualDmLevel')}>
                      <label className={labelCls}>实际决策人-职级（必填）</label>
                      <input
                        value={actualDmLevel}
                        onChange={(e) => {
                          setActualDmLevel(e.target.value)
                          clearFieldError('actualDmLevel')
                        }}
                        className={inputCls}
                        placeholder="PM/VP"
                      />
                      {fieldErrors.actualDmLevel && <p className={errMsgCls}>{fieldErrors.actualDmLevel}</p>}
                    </div>
                    <div aria-hidden className="hidden sm:block" />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className={`${sectionCls} ${isTerminal ? 'pointer-events-none opacity-50' : ''}`}>
            <h4 className={subheading}>客户需求</h4>
            <div className="space-y-3">
              <div className={grid2}>
                <div id={fieldWrapId('demandName')}>
                  <label className={labelCls}>需求名称（必填）</label>
                  <input
                    value={demandName}
                    onChange={(e) => {
                      setDemandName(e.target.value)
                      clearFieldError('demandName')
                    }}
                    disabled={isTerminal}
                    className={inputCls}
                    placeholder="请填写需求名称"
                  />
                  {fieldErrors.demandName && <p className={errMsgCls}>{fieldErrors.demandName}</p>}
                </div>
                <div>
                  <label className={labelCls}>预计启动时间（选填）</label>
                  <input
                    type="date"
                    value={plannedStart}
                    onChange={(e) => setPlannedStart(e.target.value)}
                    disabled={isTerminal}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className={grid2}>
                <div id={fieldWrapId('productType')}>
                  <label className={labelCls}>产品类型（必填）</label>
                  <input
                    value={productType}
                    onChange={(e) => {
                      setProductType(e.target.value)
                      clearFieldError('productType')
                    }}
                    disabled={isTerminal}
                    className={inputCls}
                  />
                  {fieldErrors.productType && <p className={errMsgCls}>{fieldErrors.productType}</p>}
                </div>
                <div>
                  <label className={labelCls}>产品阶段</label>
                  <input
                    value={productStage}
                    onChange={(e) => setProductStage(e.target.value)}
                    disabled={isTerminal}
                    className={inputCls}
                    placeholder="选填"
                  />
                </div>
              </div>
              <div className={grid2}>
                <div>
                  <label className={labelCls}>项目发起方（选填）</label>
                  <input
                    value={projectInitiator}
                    onChange={(e) => setProjectInitiator(e.target.value)}
                    disabled={isTerminal}
                    className={inputCls}
                    placeholder="选填"
                  />
                </div>
                <div>
                  <label className={labelCls}>实验目的（选填）</label>
                  <input
                    value={experimentPurpose}
                    onChange={(e) => setExperimentPurpose(e.target.value)}
                    disabled={isTerminal}
                    className={inputCls}
                    placeholder="选填"
                  />
                </div>
              </div>
              <div className={grid2}>
                <div>
                  <label className={labelCls}>实验类型（选填）</label>
                  <input
                    value={experimentType}
                    onChange={(e) => setExperimentType(e.target.value)}
                    disabled={isTerminal}
                    className={inputCls}
                    placeholder="选填"
                  />
                </div>
                <div>
                  <label className={labelCls}>是否已有样品</label>
                  <SearchableSelect
                    value={hasSample}
                    onChange={(v) => {
                      setHasSample(v as 'yes' | 'no' | '')
                      clearFieldError('sampleName')
                      clearFieldError('sampleType')
                    }}
                    options={ynTripleOptions}
                    placeholder="请选择"
                    disabled={isTerminal}
                    searchable={false}
                  />
                </div>
              </div>
              <div className={grid2}>
                <div>
                  <label className={labelCls}>样本信息（选填）</label>
                  <input
                    value={sampleInfo}
                    onChange={(e) => setSampleInfo(e.target.value)}
                    disabled={isTerminal}
                    className={inputCls}
                    placeholder="选填"
                  />
                </div>
                <div>
                  <label className={labelCls}>测试信息（选填）</label>
                  <input
                    value={testInfo}
                    onChange={(e) => setTestInfo(e.target.value)}
                    disabled={isTerminal}
                    className={inputCls}
                    placeholder="选填"
                  />
                </div>
              </div>
              {hasSample === 'yes' && (
                <div className={grid2}>
                  <div id={fieldWrapId('sampleName')}>
                    <label className={labelCls}>样品名称</label>
                    <input
                      value={sampleName}
                      onChange={(e) => {
                        setSampleName(e.target.value)
                        clearFieldError('sampleName')
                      }}
                      disabled={isTerminal}
                      className={inputCls}
                    />
                    {fieldErrors.sampleName && <p className={errMsgCls}>{fieldErrors.sampleName}</p>}
                  </div>
                  <div id={fieldWrapId('sampleType')}>
                    <label className={labelCls}>样品类型</label>
                    <input
                      value={sampleType}
                      onChange={(e) => {
                        setSampleType(e.target.value)
                        clearFieldError('sampleType')
                      }}
                      disabled={isTerminal}
                      className={inputCls}
                    />
                    {fieldErrors.sampleType && <p className={errMsgCls}>{fieldErrors.sampleType}</p>}
                  </div>
                </div>
              )}
              <div className={grid2}>
                <div>
                  <label className={labelCls}>随访周期</label>
                  <input
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                    disabled={isTerminal}
                    className={inputCls}
                    placeholder="选填"
                  />
                </div>
                <div>
                  <label className={labelCls}>测试地点</label>
                  <input
                    value={testLocation}
                    onChange={(e) => setTestLocation(e.target.value)}
                    disabled={isTerminal}
                    className={inputCls}
                    placeholder="选填"
                  />
                </div>
              </div>
              <div className={grid2}>
                <div>
                  <label className={labelCls}>是否需要伦理</label>
                  <SearchableSelect
                    value={ethicsReq}
                    onChange={(v) => setEthicsReq(v as 'yes' | 'no' | '')}
                    options={ynTripleOptions}
                    placeholder="请选择"
                    disabled={isTerminal}
                    searchable={false}
                  />
                </div>
                <div>
                  <label className={labelCls}>是否需要人遗</label>
                  <SearchableSelect
                    value={hgracReq}
                    onChange={(v) => setHgracReq(v as 'yes' | 'no' | '')}
                    options={ynTripleOptions}
                    placeholder="请选择"
                    disabled={isTerminal}
                    searchable={false}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>需求阶段（可多选）</label>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
                  {demandStageOptions.map((s) => (
                    <label key={s} className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={demandStages.includes(s)}
                        onChange={() => toggleStage(s)}
                        disabled={isTerminal}
                        className="mt-0.5 shrink-0"
                      />
                      <span className="leading-snug">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={`${sectionCls} ${isTerminal ? 'pointer-events-none opacity-50' : ''}`}>
            <h4 className={subheading}>商机评分</h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <PctRow label="必要性（选填）" value={nec} onChange={setNec} disabled={isTerminal} />
              <PctRow label="紧迫性（选填）" value={urg} onChange={setUrg} disabled={isTerminal} />
              <PctRow label="唯一性（选填）" value={uniq} onChange={setUniq} disabled={isTerminal} />
            </div>
          </div>

          <div className={`${sectionCls} ${isTerminal ? 'pointer-events-none opacity-50' : ''}`}>
            <h4 className={subheading}>备注</h4>
            <label className={labelCls}>选填</label>
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={3}
              disabled={isTerminal}
              className={inputCls}
              placeholder="补充说明…"
            />
          </div>

          {saveError && <p className="text-sm text-red-600">{saveErrMsg}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            onClick={variant === 'page' ? onCancel : onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
    </div>
  )

  if (variant === 'page') {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            onClick={onCancel}
          >
            返回
          </button>
          <h1 className="text-xl font-bold text-slate-800">编辑商机</h1>
        </div>
        {formCard}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      {formCard}
    </div>
  )
}
