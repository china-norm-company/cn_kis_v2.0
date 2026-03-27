/**
 * 工单执行记录表单（简化版）- 基本信息 + 产品操作记录，与 KIS 对齐：周期建议、图示/使用图示
 */
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import * as ReactDOM from 'react-dom'
import { productDistributionApi } from '@cn-kis/api-client'
import { useFeishuContext } from '@cn-kis/feishu-sdk'
import { Button } from '@cn-kis/ui-kit'
import { Plus, Save, Trash2 } from 'lucide-react'
import type {
  ExecutionRecordCreate,
  ProductOperationItemCreate,
  ExecutionRecordDetail,
} from './types'
import { EXECUTION_CYCLE_OPTIONS } from './constants'

export { EXECUTION_CYCLE_OPTIONS }

const PRODUCT_OPERATION_OPTIONS = [
  { value: 'distribution', label: '发放' },
  { value: 'inspection', label: '检查' },
  { value: 'recovery', label: '回收' },
  { value: 'site_use', label: '现场使用' },
]

function formatOperationTimeDisplay(value: string | null | undefined): string {
  if (value == null || value === '') return '—'
  const s = String(value).trim().replace('T', ' ')
  return s.length >= 16 ? s.slice(0, 16) : s.length >= 10 ? s.slice(0, 10) : s
}

interface ProductRow {
  id: string
  backendId?: number
  is_selected: number
  stage: string
  execution_cycle: string
  product_code: string
  product_name: string
  bottle_sequence: string
  product_operation_type: string
  diagram: string
  usage_diagram: string
  distribution_weight: number | null
  inspection_weight: number | null
  recovery_weight: number | null
  diary_distribution: boolean
  diary_inspection: boolean
  diary_recovery: boolean
  operator_name: string
  operation_time: string
}

function toCreateProduct(p: ProductRow): ProductOperationItemCreate & { id?: number; usage_diagram_file_id?: number | null } {
  const raw = p.product_operation_type?.trim()
  const pot = raw && ['distribution', 'inspection', 'recovery', 'site_use'].includes(raw) ? raw : null
  const dist = pot === 'distribution'
  const insp = pot === 'inspection'
  const rec = pot === 'recovery'
  const usageDiagramId = p.usage_diagram.trim() ? parseInt(p.usage_diagram.trim(), 10) : undefined
  const out: ProductOperationItemCreate & { id?: number; usage_diagram_file_id?: number | null } = {
    stage: p.stage,
    execution_cycle: p.execution_cycle || null,
    product_code: p.product_code,
    product_name: p.product_name,
    bottle_sequence: p.bottle_sequence || null,
    is_selected: p.is_selected,
    product_operation_type: pot as ProductOperationItemCreate['product_operation_type'],
    product_distribution: p.is_selected === 0 ? false : dist,
    product_inspection: p.is_selected === 0 ? false : insp,
    product_recovery: p.is_selected === 0 ? false : rec,
    distribution_weight: p.is_selected === 0 ? null : (p.distribution_weight ?? null),
    inspection_weight: p.is_selected === 0 ? null : (p.inspection_weight ?? null),
    recovery_weight: p.is_selected === 0 ? null : (p.recovery_weight ?? null),
    diary_distribution: p.is_selected === 0 ? false : p.diary_distribution,
    diary_inspection: p.is_selected === 0 ? false : p.diary_inspection,
    diary_recovery: p.is_selected === 0 ? false : p.diary_recovery,
  }
  if (p.backendId != null && Number.isFinite(p.backendId)) out.id = p.backendId
  if (Number.isFinite(usageDiagramId)) out.usage_diagram_file_id = usageDiagramId
  return out
}

export interface ExecutionRecordFormProps {
  workOrderId?: string
  relatedProjectNo?: string
  projectName?: string
  usageMethod?: string | null
  usageFrequency?: string | null
  precautions?: string | null
  initialExecution?: ExecutionRecordDetail | null
  onSave: (payload: ExecutionRecordCreate) => void
  onCancel?: () => void
  submitError?: string | null
}

const inputCls = 'h-9 w-full rounded-lg border border-slate-200 px-3 text-sm'
const errCls = 'border-red-500'

export function ExecutionRecordForm({
  workOrderId,
  relatedProjectNo,
  projectName,
  usageMethod,
  usageFrequency,
  precautions,
  initialExecution,
  onSave,
  onCancel,
  submitError,
}: ExecutionRecordFormProps) {
  const { user } = useFeishuContext()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false)
  const [subjectRd, setSubjectRd] = useState('')
  const [subjectInitials, setSubjectInitials] = useState('')
  const [screeningNo, setScreeningNo] = useState('')
  const [executionDate, setExecutionDate] = useState(() => new Date().toISOString().split('T')[0])
  const [exceptionType, setExceptionType] = useState('')
  const [exceptionDescription, setExceptionDescription] = useState('')
  const [remark, setRemark] = useState('')
  const [products, setProducts] = useState<ProductRow[]>([])
  const [stageOptions, setStageOptions] = useState<{ value: string; label: string }[]>([])
  const [exceptionOptions, setExceptionOptions] = useState<{ value: string; label: string }[]>([])
  const [productOptions, setProductOptions] = useState<{ product_code: string; product_name: string }[]>([])
  const [cycleSuggestOpenId, setCycleSuggestOpenId] = useState<string | null>(null)
  const [cycleSuggestRect, setCycleSuggestRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const cycleTriggerRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const lastPointerDownTarget = useRef<EventTarget | null>(null)

  useLayoutEffect(() => {
    if (!cycleSuggestOpenId) {
      setCycleSuggestRect(null)
      return
    }
    const el = cycleTriggerRefs.current[cycleSuggestOpenId]
    if (!el) {
      setCycleSuggestRect(null)
      return
    }
    const rect = el.getBoundingClientRect()
    setCycleSuggestRect({ top: rect.bottom, left: rect.left, width: rect.width })
  }, [cycleSuggestOpenId])

  useEffect(() => {
    productDistributionApi.getExecutionStageEnums().then((d: any) => setStageOptions(d?.options ?? [])).catch(() => setStageOptions([]))
    productDistributionApi.getExceptionTypeEnums().then((d: any) => setExceptionOptions(d?.options ?? [])).catch(() => setExceptionOptions([]))
  }, [])

  useEffect(() => {
    if (relatedProjectNo?.trim()) {
      productDistributionApi.getProjectProducts(relatedProjectNo.trim()).then((d: any) => setProductOptions(d?.list ?? [])).catch(() => setProductOptions([]))
    } else setProductOptions([])
  }, [relatedProjectNo])

  useEffect(() => {
    const handler = (e: PointerEvent) => { lastPointerDownTarget.current = e.target }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [])

  useEffect(() => {
    if (initialExecution) {
      setSubjectRd(initialExecution.subject_rd)
      setSubjectInitials(initialExecution.subject_initials)
      setScreeningNo(initialExecution.screening_no ?? '')
      const raw = initialExecution.execution_date ?? new Date().toISOString().split('T')[0]
      setExecutionDate(raw && raw.length >= 10 ? raw.slice(0, 10) : raw)
      setExceptionType((initialExecution as any).exception_type ?? '')
      setExceptionDescription((initialExecution as any).exception_description ?? '')
      setRemark(initialExecution.remark ?? '')
      const opTimeFmt = (t: string | null | undefined) => (t && t.length >= 19 ? t.slice(0, 19).replace('T', ' ') : t || '')
      const executionOperator = (initialExecution as any).operator_name ?? ''
      setProducts(
        (initialExecution.products ?? []).map((p: any, i: number) => {
          const pot = p.product_operation_type ?? (p.product_distribution === 1 ? 'distribution' : p.product_inspection === 1 ? 'inspection' : p.product_recovery === 1 ? 'recovery' : '')
          const opTime = p.operation_time ?? p.created_at ?? ''
          const opName = (p.operator_name ?? executionOperator ?? '').trim() || '—'
          const backendId = p.id != null && Number.isFinite(Number(p.id)) ? Number(p.id) : undefined
          return {
            id: `p-${i}-${p.product_code}`,
            backendId,
            is_selected: p.is_selected ?? 0,
            stage: p.stage ?? 't0',
            execution_cycle: p.execution_cycle ?? '',
            product_code: p.product_code ?? '',
            product_name: p.product_name ?? '',
            bottle_sequence: p.bottle_sequence ?? '',
            product_operation_type: pot || '',
            diagram: '',
            usage_diagram: (p.usage_diagram_file_id != null ? String(p.usage_diagram_file_id) : '') || '',
            distribution_weight: p.distribution_weight ?? null,
            inspection_weight: p.inspection_weight ?? null,
            recovery_weight: p.recovery_weight ?? null,
            diary_distribution: p.diary_distribution === 1,
            diary_inspection: p.diary_inspection === 1,
            diary_recovery: p.diary_recovery === 1,
            operator_name: opName,
            operation_time: opTimeFmt(opTime) || '—',
          }
        })
      )
    } else setProducts([])
  }, [initialExecution])

  const addProduct = () => {
    const operationTime = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
    const operatorName = (user?.name ?? '').trim() || '—'
    setProducts((prev) => [
      ...prev,
      {
        id: `p-${Date.now()}`,
        is_selected: 0,
        stage: stageOptions[0]?.value ?? 't0',
        execution_cycle: '',
        product_code: '',
        product_name: '',
        bottle_sequence: '',
        product_operation_type: '',
        diagram: '',
        usage_diagram: '',
        distribution_weight: null,
        inspection_weight: null,
        recovery_weight: null,
        diary_distribution: false,
        diary_inspection: false,
        diary_recovery: false,
        operator_name: operatorName,
        operation_time: operationTime,
      },
    ])
  }

  const removeProduct = (id: string) => setProducts((prev) => prev.filter((p) => p.id !== id))

  const updateProduct = (id: string, field: keyof ProductRow, value: unknown) => {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }

  const setProductOpType = (id: string, type: string) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              product_operation_type: type,
              product_distribution: type === 'distribution',
              product_inspection: type === 'inspection',
              product_recovery: type === 'recovery',
            }
          : p
      )
    )
  }

  const setSelected = (id: string, value: number) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        if (value === 1) return { ...p, is_selected: value }
        // 是否选择=否时清空：图示、产品操作、使用图示、三个称重、日记
        return {
          ...p,
          is_selected: 0,
          diagram: '',
          product_operation_type: '',
          usage_diagram: '',
          distribution_weight: null,
          inspection_weight: null,
          recovery_weight: null,
          diary_distribution: false,
          diary_inspection: false,
          diary_recovery: false,
        }
      })
    )
  }

  const setDiaryType = (id: string, type: 'distribution' | 'inspection' | 'recovery' | 'none') => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              diary_distribution: type === 'distribution',
              diary_inspection: type === 'inspection',
              diary_recovery: type === 'recovery',
            }
          : p
      )
    )
  }

  const selectProduct = (id: string, code: string) => {
    const found = productOptions.find((x) => x.product_code === code)
    if (found) {
      setProducts((prev) =>
        prev.map((p) => (
          p.id === id
            ? { ...p, product_code: found.product_code, product_name: found.product_name }
            : p
        ))
      )
    }
  }

  /** 称重是否已填且有效（与 KIS 一致：根据产品操作、日记判定必填项） */
  const isWeightFilled = (v: number | null | undefined): boolean =>
    v != null && !Number.isNaN(Number(v))

  const handleSubmit = () => {
    setHasTriedSubmit(true)
    const e: Record<string, string> = {}
    if (!workOrderId || !relatedProjectNo) e.work_order = '请选择工单/项目'
    if (!subjectInitials.trim()) e.subject_initials = '请填写姓名首字母'
    if (!screeningNo.trim()) e.screening_no = '请填写受试者SC号'
    const selected = products.filter((p) => p.is_selected === 1)
    selected.forEach((p) => {
      if (!p.product_code?.trim() || !p.product_name?.trim()) e[`selected_${p.id}_product`] = '请选择产品'
      const hasOp = p.product_operation_type && ['distribution', 'inspection', 'recovery', 'site_use'].includes(p.product_operation_type)
      if ((p.product_code || p.product_name) && !hasOp) e[`op_${p.id}`] = '请选择产品操作'
      /** 日记必选：发放/检查/回收至少选一项 */
      if (!p.diary_distribution && !p.diary_inspection && !p.diary_recovery) e[`diary_${p.id}`] = '请选择日记（发放/检查/回收至少选一项）'
      /** 与 KIS 一致：产品操作=发放或日记=发放 → 发放称重必填；检查/回收同理 */
      const needDist = p.product_operation_type === 'distribution' || p.diary_distribution
      const needInsp = p.product_operation_type === 'inspection' || p.diary_inspection
      const needRec = p.product_operation_type === 'recovery' || p.diary_recovery
      if (needDist && !isWeightFilled(p.distribution_weight)) e[`weight_${p.id}_dist`] = '请填写发放称重'
      if (needInsp && !isWeightFilled(p.inspection_weight)) e[`weight_${p.id}_insp`] = '请填写检查称重'
      if (needRec && !isWeightFilled(p.recovery_weight)) e[`weight_${p.id}_rec`] = '请填写回收称重'
    })
    setErrors(e)
    if (Object.keys(e).length > 0) return
    const operatorDisplayName = (user?.name ?? '').trim() || null
    const payload: ExecutionRecordCreate = {
      work_order_id: workOrderId!,
      related_project_no: relatedProjectNo!,
      subject_rd: subjectRd.trim() || '',
      subject_initials: subjectInitials.trim(),
      screening_no: screeningNo.trim(),
      execution_date: executionDate || null,
      exception_type: exceptionType || null,
      exception_description: exceptionDescription.trim() || null,
      remark: remark.trim() || null,
      operator_name: operatorDisplayName,
      products: products.filter((p) => p.product_code?.trim() && p.product_name?.trim()).map(toCreateProduct),
    }
    onSave(payload)
  }

  return (
    <div className="space-y-4 min-h-0 overflow-visible">
      {workOrderId && relatedProjectNo && (usageMethod || usageFrequency || precautions) && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 shadow-md">
          <h3 className="text-base font-semibold text-slate-800 mb-2">项目要求</h3>
          <div className="space-y-2 text-sm">
            {usageMethod && <div><span className="text-slate-500">【使用方法】</span><div className="mt-0.5 whitespace-pre-wrap rounded border border-slate-200 bg-white p-2">{usageMethod}</div></div>}
            {usageFrequency && <div><span className="text-slate-500">【使用频率】</span><div className="mt-0.5 whitespace-pre-wrap rounded border border-slate-200 bg-white p-2">{usageFrequency}</div></div>}
            {precautions && <div><span className="text-slate-500">【注意事项】</span><div className="mt-0.5 whitespace-pre-wrap rounded border border-slate-200 bg-white p-2">{precautions}</div></div>}
          </div>
        </div>
      )}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-md">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold text-slate-800">基本信息</h3>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSubmit} disabled={!workOrderId || !relatedProjectNo}>
              <span className="inline-flex items-center whitespace-nowrap gap-1.5"><Save className="h-4 w-4 shrink-0" />保存</span>
            </Button>
            {onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>取消</Button>}
          </div>
        </div>
        {submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-3" role="alert">{submitError}</div>
        )}
        {hasTriedSubmit && errors.work_order && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-3" data-field="work_order">{errors.work_order}</div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">项目编号</label>
            <input className={`${inputCls} bg-slate-100`} value={relatedProjectNo ?? ''} readOnly placeholder="请在上方选择项目" />
          </div>
          <div>
            <label className="text-xs text-slate-500">项目名称</label>
            <input className={`${inputCls} bg-slate-100`} value={projectName ?? ''} readOnly placeholder="选择项目后自动带出" />
          </div>
          <div data-field="screening_no">
            <label className="text-xs text-slate-500">受试者SC号 <span className="text-red-500">*</span></label>
            <input
              className={`${inputCls} ${errors.screening_no ? errCls : ''}`}
              value={screeningNo}
              onChange={(e) => setScreeningNo(e.target.value)}
              placeholder="请输入受试者SC号"
            />
            {errors.screening_no && <p className="text-sm text-red-600">{errors.screening_no}</p>}
          </div>
          <div data-field="subject_initials">
            <label className="text-xs text-slate-500">姓名首字母 <span className="text-red-500">*</span></label>
            <input className={`${inputCls} ${errors.subject_initials ? errCls : ''}`} value={subjectInitials} onChange={(e) => setSubjectInitials(e.target.value.toUpperCase().slice(0, 10))} placeholder="姓名首字母" />
            {errors.subject_initials && <p className="text-sm text-red-600">{errors.subject_initials}</p>}
          </div>
          <div data-field="subject_rd">
            <label className="text-xs text-slate-500">受试者RD号（选填）</label>
            <input className={`${inputCls} ${errors.subject_rd ? errCls : ''}`} value={subjectRd} onChange={(e) => setSubjectRd(e.target.value)} placeholder="无则可不填" />
            {errors.subject_rd && <p className="text-sm text-red-600">{errors.subject_rd}</p>}
          </div>
          <div>
            <label className="text-xs text-slate-500">操作日期</label>
            <input type="date" className={inputCls} value={executionDate} onChange={(e) => setExecutionDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-md" data-field="product_records">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base font-semibold text-slate-800">产品操作记录</h3>
          <Button variant="outline" size="sm" onClick={addProduct}>
            <span className="inline-flex items-center whitespace-nowrap gap-1.5"><Plus className="h-4 w-4 shrink-0" />添加产品</span>
          </Button>
        </div>
        {hasTriedSubmit && (() => {
          const rowsWithErrors = products
            .map((p, idx) => ({ p, rowIndex: idx + 1 }))
            .filter(({ p }) => p.is_selected === 1 && (errors[`op_${p.id}`] || errors[`diary_${p.id}`] || errors[`weight_${p.id}_dist`] || errors[`weight_${p.id}_insp`] || errors[`weight_${p.id}_rec`]))
          if (rowsWithErrors.length === 0) return null
          return (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-3 space-y-1" role="alert">
              {rowsWithErrors.map(({ p, rowIndex }) => {
                const msgs: string[] = []
                if (errors[`op_${p.id}`]) msgs.push(errors[`op_${p.id}`])
                if (errors[`diary_${p.id}`]) msgs.push(errors[`diary_${p.id}`])
                if (errors[`weight_${p.id}_dist`]) msgs.push(errors[`weight_${p.id}_dist`])
                if (errors[`weight_${p.id}_insp`]) msgs.push(errors[`weight_${p.id}_insp`])
                if (errors[`weight_${p.id}_rec`]) msgs.push(errors[`weight_${p.id}_rec`])
                return (
                  <div key={p.id}>
                    第{rowIndex}条操作记录填写异常：{msgs.join('、')}
                  </div>
                )
              })}
            </div>
          )
        })()}
        <div className="min-w-0 overflow-x-auto overflow-y-hidden -mx-1 px-1">
          <table className="w-full text-sm min-w-[1100px] border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left p-2 w-[90px] min-w-[90px] whitespace-nowrap">阶段</th>
                <th className="text-left p-2 w-[100px] min-w-[100px] whitespace-nowrap">周期</th>
                <th className="text-left p-2 min-w-[165px] whitespace-nowrap">产品编号/产品名称</th>
                <th className="text-left p-2 w-[90px] min-w-[90px] whitespace-nowrap">产品瓶序</th>
                <th className="text-left p-2 w-[100px] min-w-[100px] whitespace-nowrap">是否选择 <span className="text-red-700">*</span></th>
                <th className="text-left p-2 w-[90px] min-w-[90px] whitespace-nowrap">图示</th>
                <th className="text-left p-2 w-[110px] min-w-[110px] whitespace-nowrap">产品操作 <span className="text-red-500">*</span></th>
                <th className="text-left p-2 w-[90px] min-w-[90px] whitespace-nowrap">使用图示</th>
                <th className="text-left p-2 w-[88px] min-w-[88px] whitespace-nowrap">发放称重 (g) <span className="text-red-500">*</span></th>
                <th className="text-left p-2 w-[88px] min-w-[88px] whitespace-nowrap">检查称重 (g) <span className="text-red-500">*</span></th>
                <th className="text-left p-2 w-[88px] min-w-[88px] whitespace-nowrap">回收称重 (g) <span className="text-red-500">*</span></th>
                <th className="text-left p-2 min-w-[100px] whitespace-nowrap">日记 <span className="text-red-700">*</span></th>
                <th className="text-left p-2 w-[80px] min-w-[80px] text-slate-400 whitespace-nowrap">操作人</th>
                <th className="text-left p-2 w-[100px] min-w-[100px] text-slate-400 whitespace-nowrap">操作时间</th>
                <th className="text-left p-2 w-[60px] min-w-[60px] whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr><td colSpan={15} className="p-4 text-center text-slate-500">请点击「添加产品」</td></tr>
              ) : (
                products.map((p) => {
                  const keyword = (p.execution_cycle ?? '').trim().toLowerCase()
                  const cycleFiltered = keyword === '' ? EXECUTION_CYCLE_OPTIONS : EXECUTION_CYCLE_OPTIONS.filter((opt) => opt.toLowerCase().includes(keyword))
                  /** 是否选择=否时，仅以下可编辑：阶段、周期、产品、瓶序；图示、产品操作、使用图示、称重、日记禁用（与 KIS 一致） */
                  const selectionDisabled = p.is_selected !== 1
                  const onlyDist = p.product_operation_type === 'distribution'
                  const onlyInsp = p.product_operation_type === 'inspection'
                  const onlyRec = p.product_operation_type === 'recovery'
                  /** 称重可填与产品操作、日记一致：发放称重=产品操作发放或日记发放；检查/回收同理 */
                  const canEditDistWeight = onlyDist || p.diary_distribution
                  const canEditInspWeight = onlyInsp || p.diary_inspection
                  const canEditRecWeight = onlyRec || p.diary_recovery
                  return (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="p-2 min-w-[90px]">
                        <select className={`${inputCls} h-8 w-full min-w-[112px]`} value={p.stage} onChange={(e) => updateProduct(p.id, 'stage', e.target.value)}>
                          {stageOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className="p-2 relative min-w-[90px]">
                        <div ref={(el) => { cycleTriggerRefs.current[p.id] = el }} className="relative">
                          <input
                            className={`${inputCls} h-8 w-full min-w-[100px]`}
                            value={p.execution_cycle}
                            onChange={(e) => updateProduct(p.id, 'execution_cycle', e.target.value)}
                            onFocus={() => setCycleSuggestOpenId(p.id)}
                            placeholder="周期"
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        <select
                          className={`${inputCls} h-8 w-full ${errors[`selected_${p.id}_product`] ? errCls : ''}`}
                          value={p.product_code}
                          onChange={(e) => selectProduct(p.id, e.target.value)}
                        >
                          <option value="">请选择</option>
                          {productOptions.map((o) => (
                            <option key={o.product_code} value={o.product_code}>
                              {o.product_code} / {o.product_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input className={`${inputCls} h-8`} value={p.bottle_sequence} onChange={(e) => updateProduct(p.id, 'bottle_sequence', e.target.value)} placeholder="瓶序" />
                      </td>
                      <td className="p-2">
                        <div className="flex flex-col gap-1">
                          <label className="inline-flex items-center gap-1 text-xs cursor-pointer text-slate-800 [&_input]:accent-slate-700">
                            <input type="radio" name={`sel-${p.id}`} checked={p.is_selected === 1} onChange={() => setSelected(p.id, 1)} />是
                          </label>
                          <label className="inline-flex items-center gap-1 text-xs cursor-pointer text-slate-800 [&_input]:accent-slate-700">
                            <input type="radio" name={`sel-${p.id}`} checked={p.is_selected === 0} onChange={() => setSelected(p.id, 0)} />否
                          </label>
                        </div>
                      </td>
                      <td className={`p-2 ${selectionDisabled ? 'opacity-50' : ''}`}>
                        <input className={`${inputCls} h-8`} value={p.diagram} onChange={(e) => updateProduct(p.id, 'diagram', e.target.value)} placeholder="图示" disabled={selectionDisabled} />
                      </td>
                      <td className={`p-2 ${selectionDisabled ? 'opacity-50' : ''}`}>
                        <select className={`${inputCls} h-8 w-full ${errors[`op_${p.id}`] ? errCls : ''}`} value={p.product_operation_type} onChange={(e) => setProductOpType(p.id, e.target.value)} disabled={selectionDisabled}>
                          <option value="">请选择</option>
                          {PRODUCT_OPERATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      <td className={`p-2 ${selectionDisabled ? 'opacity-50' : ''}`}>
                        <input className={`${inputCls} h-8`} value={p.usage_diagram} onChange={(e) => updateProduct(p.id, 'usage_diagram', e.target.value)} placeholder="使用图示" disabled={selectionDisabled} />
                      </td>
                      <td className={`p-2 ${selectionDisabled ? 'opacity-50' : ''}`}>
                        <input type="number" min={0} step="0.01" className={`${inputCls} h-8 w-full max-w-[80px] ${canEditDistWeight && errors[`weight_${p.id}_dist`] ? errCls : ''} ${!canEditDistWeight ? 'bg-slate-100 cursor-not-allowed' : ''}`} value={p.distribution_weight ?? ''} onChange={(e) => updateProduct(p.id, 'distribution_weight', e.target.value ? parseFloat(e.target.value) : null)} placeholder="称重（g）" disabled={selectionDisabled || !canEditDistWeight} title={!canEditDistWeight ? '未选择产品操作或日记中的发放，无需填写' : undefined} />
                      </td>
                      <td className={`p-2 ${selectionDisabled ? 'opacity-50' : ''}`}>
                        <input type="number" min={0} step="0.01" className={`${inputCls} h-8 w-full max-w-[80px] ${canEditInspWeight && errors[`weight_${p.id}_insp`] ? errCls : ''} ${!canEditInspWeight ? 'bg-slate-100 cursor-not-allowed' : ''}`} value={p.inspection_weight ?? ''} onChange={(e) => updateProduct(p.id, 'inspection_weight', e.target.value ? parseFloat(e.target.value) : null)} placeholder="称重（g）" disabled={selectionDisabled || !canEditInspWeight} title={!canEditInspWeight ? '未选择产品操作或日记中的检查，无需填写' : undefined} />
                      </td>
                      <td className={`p-2 ${selectionDisabled ? 'opacity-50' : ''}`}>
                        <input type="number" min={0} step="0.01" className={`${inputCls} h-8 w-full max-w-[80px] ${canEditRecWeight && errors[`weight_${p.id}_rec`] ? errCls : ''} ${!canEditRecWeight ? 'bg-slate-100 cursor-not-allowed' : ''}`} value={p.recovery_weight ?? ''} onChange={(e) => updateProduct(p.id, 'recovery_weight', e.target.value ? parseFloat(e.target.value) : null)} placeholder="称重（g）" disabled={selectionDisabled || !canEditRecWeight} title={!canEditRecWeight ? '未选择产品操作或日记中的回收，无需填写' : undefined} />
                      </td>
                      <td className={`p-2 ${selectionDisabled ? 'opacity-50' : ''}`}>
                        <div className="flex flex-col gap-1">
                          <label className="sr-only"><input type="radio" name={`diary-${p.id}`} checked={!p.diary_distribution && !p.diary_inspection && !p.diary_recovery} onChange={() => setDiaryType(p.id, 'none')} disabled={selectionDisabled} aria-hidden />—</label>
                          <label className="inline-flex items-center gap-1 text-xs cursor-pointer text-slate-800 [&_input]:accent-slate-700"><input type="radio" name={`diary-${p.id}`} checked={p.diary_distribution} onChange={() => setDiaryType(p.id, 'distribution')} disabled={selectionDisabled} />发放</label>
                          <label className="inline-flex items-center gap-1 text-xs cursor-pointer text-slate-800 [&_input]:accent-slate-700"><input type="radio" name={`diary-${p.id}`} checked={p.diary_inspection} onChange={() => setDiaryType(p.id, 'inspection')} disabled={selectionDisabled} />检查</label>
                          <label className="inline-flex items-center gap-1 text-xs cursor-pointer text-slate-800 [&_input]:accent-slate-700"><input type="radio" name={`diary-${p.id}`} checked={p.diary_recovery} onChange={() => setDiaryType(p.id, 'recovery')} disabled={selectionDisabled} />回收</label>
                        </div>
                      </td>
                      <td className="p-2 text-slate-500 text-xs whitespace-nowrap tabular-nums">{p.operator_name || '—'}</td>
                      <td className="p-2 text-slate-500 text-xs whitespace-nowrap tabular-nums">{formatOperationTimeDisplay(p.operation_time)}</td>
                      <td className="p-2">
                        <Button variant="ghost" size="sm" className="h-7 px-1 text-red-600" onClick={() => removeProduct(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-amber-100 bg-amber-50 p-4 shadow-md">
        <h3 className="text-base font-semibold text-slate-800 mb-3">异常信息（选填）</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500">异常类型</label>
            <select className={inputCls} value={exceptionType} onChange={(e) => setExceptionType(e.target.value)}>
              <option value="">请选择</option>
              {exceptionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">异常描述</label>
            <textarea className={`${inputCls} min-h-[60px] py-2`} value={exceptionDescription} onChange={(e) => setExceptionDescription(e.target.value)} placeholder="选填" rows={2} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-md">
        <h3 className="text-base font-semibold text-slate-800 mb-3">备注</h3>
        <textarea className={`${inputCls} min-h-[80px] py-2`} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="备注（可选）" rows={3} />
      </div>

      {typeof document !== 'undefined' && cycleSuggestOpenId && cycleSuggestRect && (() => {
        const p = products.find((pr) => pr.id === cycleSuggestOpenId)
        if (!p) return null
        const kw = (p.execution_cycle ?? '').trim().toLowerCase()
        const filtered = kw === '' ? EXECUTION_CYCLE_OPTIONS : EXECUTION_CYCLE_OPTIONS.filter((o) => o.toLowerCase().includes(kw))
        return ReactDOM.createPortal(
          <>
            <div className="fixed inset-0 z-[100]" aria-hidden onClick={() => setCycleSuggestOpenId(null)} onMouseDown={() => setCycleSuggestOpenId(null)} />
            <div
              className="fixed z-[101] max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1"
              style={{ top: cycleSuggestRect.top + 4, left: cycleSuggestRect.left, width: cycleSuggestRect.width, minWidth: 120 }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {filtered.length === 0 ? <div className="px-3 py-2 text-slate-500 text-xs">无匹配</div> : filtered.map((opt) => (
                <button key={opt} type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100" onClick={() => { updateProduct(cycleSuggestOpenId!, 'execution_cycle', opt); setCycleSuggestOpenId(null) }}>
                  {opt}
                </button>
              ))}
            </div>
          </>,
          document.body
        )
      })()}
    </div>
  )
}
