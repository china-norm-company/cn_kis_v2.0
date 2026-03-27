/**
 * 工单管理 - 列表、新建、编辑、查看（与 KIS 样品发放工单管理一致）
 */
import { useState, useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { productDistributionApi } from '@cn-kis/api-client'
import { Card, Button, Modal, Badge } from '@cn-kis/ui-kit'
import { Plus, Eye, Pencil, Clock, Play, CheckCircle2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import type { WorkOrderListItem, WorkOrderDetail, WorkOrderCreate, ExecutionRecordDetail } from './types'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const DEFAULT_PAGE_SIZE = 20

const emptyForm: Partial<WorkOrderCreate> = {
  project_start_date: new Date().toISOString().split('T')[0],
  project_end_date: new Date().toISOString().split('T')[0],
  visit_count: 0,
  researcher: '',
  supervisor: '',
  usage_method: '',
  usage_frequency: '',
  precautions: '',
  project_requirements: '',
}

function ProgressBadge({ progress }: { progress: string }) {
  const iconClass = 'h-2 w-2 shrink-0 mr-0.5'
  const badgeClass = 'inline-flex items-center w-fit text-xs font-normal'
  switch (progress) {
    case 'not_started':
      return (
        <Badge variant="default" className={`${badgeClass} text-slate-500 border border-slate-300`}>
          <Clock className={`${iconClass} text-slate-500`} />
          未开始
        </Badge>
      )
    case 'in_progress':
      return (
        <Badge className={`${badgeClass} !bg-blue-600 !text-white`}>
          <Play className={`${iconClass} text-white`} />
          执行中
        </Badge>
      )
    case 'completed':
      return (
        <Badge className={`${badgeClass} !bg-green-600 !text-white`}>
          <CheckCircle2 className={`${iconClass} text-white`} />
          已完成
        </Badge>
      )
    default:
      return <Badge variant="default" className={badgeClass}>{String(progress)}</Badge>
  }
}

function WorkOrderForm({
  formData,
  setFormData,
  errors = {},
  hasTriedSubmit = false,
  readOnlyExecutionFields = false,
}: {
  formData: Partial<WorkOrderCreate>
  setFormData: Dispatch<SetStateAction<Partial<WorkOrderCreate>>>
  errors?: Record<string, string>
  hasTriedSubmit?: boolean
  /** 编辑工单时：项目主数据与执行台一致，禁止在物料台修改 */
  readOnlyExecutionFields?: boolean
}) {
  const inputCls = 'h-9 w-full rounded-lg border border-slate-200 px-3 text-sm'
  const errCls = 'border-red-500'
  const roCls = readOnlyExecutionFields ? 'bg-slate-50 text-slate-700 cursor-not-allowed' : ''
  return (
    <div className="space-y-4">
      {readOnlyExecutionFields && (
        <p className="text-xs text-slate-600 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
          项目编号、名称、日期、访视次数、研究员、督导 与执行台一致，请在<strong className="font-medium">执行台项目管理</strong>中维护。
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5" data-field="project_no">
          <label className="text-xs font-medium text-slate-500">
            项目编号 {!readOnlyExecutionFields && <span className="text-red-500">*</span>}
            {readOnlyExecutionFields && <span className="text-slate-400 font-normal">（只读）</span>}
          </label>
          <input
            className={`${inputCls} ${roCls} ${hasTriedSubmit && errors.project_no ? errCls : ''}`}
            value={formData.project_no ?? ''}
            onChange={(e) => setFormData((f) => ({ ...f, project_no: e.target.value }))}
            placeholder="输入项目编号"
            disabled={readOnlyExecutionFields}
          />
          {hasTriedSubmit && errors.project_no && <p className="text-sm text-red-600">{errors.project_no}</p>}
        </div>
        <div className="space-y-1.5" data-field="project_name">
          <label className="text-xs font-medium text-slate-500">
            项目名称 {!readOnlyExecutionFields && <span className="text-red-500">*</span>}
            {readOnlyExecutionFields && <span className="text-slate-400 font-normal">（只读）</span>}
          </label>
          <input
            className={`${inputCls} ${roCls} ${hasTriedSubmit && errors.project_name ? errCls : ''}`}
            value={formData.project_name ?? ''}
            onChange={(e) => setFormData((f) => ({ ...f, project_name: e.target.value }))}
            placeholder="输入项目名称"
            disabled={readOnlyExecutionFields}
          />
          {hasTriedSubmit && errors.project_name && <p className="text-sm text-red-600">{errors.project_name}</p>}
        </div>
        <div className="space-y-1.5" data-field="project_start_date">
          <label className="text-xs font-medium text-slate-500">
            项目启动日期 {!readOnlyExecutionFields && <span className="text-red-500">*</span>}
            {readOnlyExecutionFields && <span className="text-slate-400 font-normal">（只读）</span>}
          </label>
          <input
            type="date"
            className={`${inputCls} ${roCls} ${hasTriedSubmit && errors.project_start_date ? errCls : ''}`}
            value={formData.project_start_date ?? ''}
            onChange={(e) => setFormData((f) => ({ ...f, project_start_date: e.target.value }))}
            disabled={readOnlyExecutionFields}
          />
          {hasTriedSubmit && errors.project_start_date && <p className="text-sm text-red-600">{errors.project_start_date}</p>}
        </div>
        <div className="space-y-1.5" data-field="project_end_date">
          <label className="text-xs font-medium text-slate-500">
            项目结束日期 {!readOnlyExecutionFields && <span className="text-red-500">*</span>}
            {readOnlyExecutionFields && <span className="text-slate-400 font-normal">（只读）</span>}
          </label>
          <input
            type="date"
            className={`${inputCls} ${roCls} ${hasTriedSubmit && errors.project_end_date ? errCls : ''}`}
            value={formData.project_end_date ?? ''}
            onChange={(e) => setFormData((f) => ({ ...f, project_end_date: e.target.value }))}
            disabled={readOnlyExecutionFields}
          />
          {hasTriedSubmit && errors.project_end_date && <p className="text-sm text-red-600">{errors.project_end_date}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500">
            访视次数
            {readOnlyExecutionFields && <span className="text-slate-400 font-normal">（只读）</span>}
          </label>
          <input
            type="number"
            min={0}
            className={`${inputCls} ${roCls}`}
            value={formData.visit_count ?? ''}
            onChange={(e) => setFormData((f) => ({ ...f, visit_count: parseInt(e.target.value, 10) || 0 }))}
            placeholder="0"
            disabled={readOnlyExecutionFields}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500">
            研究员
            {readOnlyExecutionFields && <span className="text-slate-400 font-normal">（只读）</span>}
          </label>
          <input
            className={`${inputCls} ${roCls}`}
            value={formData.researcher ?? ''}
            onChange={(e) => setFormData((f) => ({ ...f, researcher: e.target.value }))}
            placeholder="输入研究员姓名"
            disabled={readOnlyExecutionFields}
          />
        </div>
        <div className="space-y-1.5 col-span-2 sm:col-span-1">
          <label className="text-xs font-medium text-slate-500">
            督导
            {readOnlyExecutionFields && <span className="text-slate-400 font-normal">（只读）</span>}
          </label>
          <input
            className={`${inputCls} ${roCls}`}
            value={formData.supervisor ?? ''}
            onChange={(e) => setFormData((f) => ({ ...f, supervisor: e.target.value }))}
            placeholder="输入督导姓名"
            disabled={readOnlyExecutionFields}
          />
        </div>
      </div>
      <div className="space-y-3 border-t border-slate-200 pt-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500">使用方法</label>
          <textarea
            className={`${inputCls} min-h-[80px] py-2`}
            value={formData.usage_method ?? ''}
            onChange={(e) => setFormData((f) => ({ ...f, usage_method: e.target.value }))}
            placeholder="输入产品使用方法..."
            rows={3}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500">使用频率</label>
          <textarea
            className={`${inputCls} min-h-[60px] py-2`}
            value={formData.usage_frequency ?? ''}
            onChange={(e) => setFormData((f) => ({ ...f, usage_frequency: e.target.value }))}
            placeholder="输入产品使用频率..."
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500">注意事项</label>
          <textarea
            className={`${inputCls} min-h-[60px] py-2`}
            value={formData.precautions ?? ''}
            onChange={(e) => setFormData((f) => ({ ...f, precautions: e.target.value }))}
            placeholder="输入注意事项..."
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500">其他项目要求</label>
          <textarea
            className={`${inputCls} min-h-[60px] py-2`}
            value={formData.project_requirements ?? ''}
            onChange={(e) => setFormData((f) => ({ ...f, project_requirements: e.target.value }))}
            placeholder="输入其他项目要求..."
            rows={2}
          />
        </div>
      </div>
    </div>
  )
}

const STAGE_LABELS: Record<string, string> = {
  washout: '洗脱期',
  t0: 'T0阶段',
  visit: '回访阶段',
}
const EXCEPTION_LABELS: Record<string, string> = {
  usage_error: '使用错误',
  diary_error: '日记错误',
  product_damage: '产品损坏',
  distribution_error: '发放错误',
  recovery_error: '回收错误',
  other: '其他',
}

function WorkOrderViewContent({
  detail,
  executionDetailsMap,
}: {
  detail: WorkOrderDetail
  executionDetailsMap: Record<string, ExecutionRecordDetail | null>
}) {
  const sortedExecutions = useMemo(
    () =>
      [...(detail.executions || [])].sort((a, b) =>
        (a.subject_rd || '').localeCompare(b.subject_rd || '', undefined, { numeric: true })
      ),
    [detail.executions]
  )

  const opLabel = (p: ExecutionRecordDetail['products'][0]) => {
    const opType = (p as { product_operation_type?: string | null }).product_operation_type
    if (opType === 'distribution') return '发放'
    if (opType === 'inspection') return '检查'
    if (opType === 'recovery') return '回收'
    if (opType === 'site_use') return '现场使用'
    if (p.product_distribution === 1) return '发放'
    if (p.product_inspection === 1) return '检查'
    if (p.product_recovery === 1) return '回收'
    return '—'
  }

  return (
    <div className="space-y-4">
      <Card variant="elevated" className="p-4">
        <h3 className="text-base font-semibold text-slate-800 mb-3">项目基本信息</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <span className="text-slate-500 text-xs">工单编号</span>
            <p className="font-medium text-slate-800">{detail.work_order_no}</p>
          </div>
          <div>
            <span className="text-slate-500 text-xs">项目编号</span>
            <p className="font-medium text-slate-800">{detail.project_no}</p>
          </div>
          <div className="col-span-2">
            <span className="text-slate-500 text-xs">项目名称</span>
            <p className="font-medium text-slate-800">{detail.project_name}</p>
          </div>
          <div>
            <span className="text-slate-500 text-xs">启动日期</span>
            <p>{detail.project_start_date}</p>
          </div>
          <div>
            <span className="text-slate-500 text-xs">结束日期</span>
            <p>{detail.project_end_date}</p>
          </div>
          <div>
            <span className="text-slate-500 text-xs">访视次数</span>
            <p>{detail.visit_count}</p>
          </div>
          <div>
            <span className="text-slate-500 text-xs">执行进展</span>
            <p><ProgressBadge progress={detail.execution_progress} /></p>
          </div>
          <div>
            <span className="text-slate-500 text-xs">研究员</span>
            <p>{detail.researcher ?? '—'}</p>
          </div>
          <div>
            <span className="text-slate-500 text-xs">督导</span>
            <p>{detail.supervisor ?? '—'}</p>
          </div>
        </div>
      </Card>
      {(detail.usage_method || detail.usage_frequency || detail.precautions || detail.project_requirements) && (
        <Card variant="elevated" className="p-4">
          <h3 className="text-base font-semibold text-slate-800 mb-3">项目要求</h3>
          <div className="space-y-3 text-sm">
            {detail.usage_method && (
              <div>
                <span className="text-slate-500 text-xs">使用方法</span>
                <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3 whitespace-pre-wrap">{detail.usage_method}</div>
              </div>
            )}
            {detail.usage_frequency && (
              <div>
                <span className="text-slate-500 text-xs">使用频率</span>
                <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3 whitespace-pre-wrap">{detail.usage_frequency}</div>
              </div>
            )}
            {detail.precautions && (
              <div>
                <span className="text-slate-500 text-xs">注意事项</span>
                <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3 whitespace-pre-wrap">{detail.precautions}</div>
              </div>
            )}
            {detail.project_requirements && (
              <div>
                <span className="text-slate-500 text-xs">其他项目要求</span>
                <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3 whitespace-pre-wrap">{detail.project_requirements}</div>
              </div>
            )}
          </div>
        </Card>
      )}
      <Card variant="elevated" className="p-4">
        <h3 className="text-base font-semibold text-slate-800 mb-3">执行记录</h3>
        {sortedExecutions.length > 0 ? (
          <div className="space-y-4">
            {sortedExecutions.map((ex, index) => {
              const fullRecord = executionDetailsMap[ex.id] ?? null
              const total = sortedExecutions.length
              const recordNum = index + 1
              const productCount = fullRecord?.products?.length ?? 0
              const dateStr = ex.execution_date && ex.execution_date.length >= 10 ? ex.execution_date.slice(0, 10) : ex.execution_date
              return (
                <Card key={ex.id} variant="elevated" className="p-4 border-l-4 border-l-blue-400">
                  <p className="text-sm font-medium text-slate-800">执行记录 #{recordNum}（共{total}条）</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    执行日期：{dateStr ?? '—'} · 受试者SC号：{fullRecord?.screening_no?.trim() || '—'} · 首字母：{ex.subject_initials} · 受试者RD：{(ex.subject_rd || '').trim() || '—'} · 操作人：{(ex as { operator_name?: string }).operator_name ?? '—'} · 产品数：{productCount}
                  </p>
                  <div className="mt-3 text-sm">
                    {fullRecord == null ? (
                      <div className="py-4 text-center text-slate-500 text-xs">加载执行记录详情...</div>
                    ) : fullRecord.products && fullRecord.products.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-slate-500">
                              <th className="text-left p-2">阶段</th>
                              <th className="text-left p-2">周期</th>
                              <th className="text-left p-2">产品编号/名称</th>
                              <th className="text-left p-2">瓶序</th>
                              <th className="text-left p-2">产品操作</th>
                              <th className="text-left p-2">称重(g)</th>
                              <th className="text-left p-2">日记</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fullRecord.products.map((p, pIndex) => (
                              <tr key={pIndex} className="border-b border-slate-100">
                                <td className="p-2">{STAGE_LABELS[p.stage] ?? p.stage}</td>
                                <td className="p-2">{p.execution_cycle ?? '-'}</td>
                                <td className="p-2">{p.product_code} {p.product_name}</td>
                                <td className="p-2">{p.bottle_sequence ?? '-'}</td>
                                <td className="p-2">
                                  {opLabel(p) !== '—' ? <Badge variant="default" size="sm">{opLabel(p)}</Badge> : <span className="text-slate-400">—</span>}
                                </td>
                                <td className="p-2">
                                  <div className="space-y-0.5">
                                    {(p.product_distribution === 1 || p.diary_distribution === 1) && (
                                      <div>发放：{p.distribution_weight != null ? Number(p.distribution_weight).toFixed(2) : '-'}</div>
                                    )}
                                    {(p.product_inspection === 1 || p.diary_inspection === 1) && (
                                      <div>检查：{p.inspection_weight != null ? Number(p.inspection_weight).toFixed(2) : '-'}</div>
                                    )}
                                    {(p.product_recovery === 1 || p.diary_recovery === 1) && (
                                      <div>回收：{p.recovery_weight != null ? Number(p.recovery_weight).toFixed(2) : '-'}</div>
                                    )}
                                    {!p.product_distribution && !p.product_inspection && !p.product_recovery && !p.diary_distribution && !p.diary_inspection && !p.diary_recovery && <span className="text-slate-400">—</span>}
                                  </div>
                                </td>
                                <td className="p-2">
                                  <div className="flex flex-wrap gap-1">
                                    {p.diary_distribution === 1 && <Badge variant="default" size="sm">发放</Badge>}
                                    {p.diary_inspection === 1 && <Badge variant="default" size="sm">检查</Badge>}
                                    {p.diary_recovery === 1 && <Badge variant="default" size="sm">回收</Badge>}
                                    {!p.diary_distribution && !p.diary_inspection && !p.diary_recovery && <span className="text-slate-400 text-xs">—</span>}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="py-2 text-slate-500 text-xs">暂无产品操作</div>
                    )}
                    {fullRecord != null && (fullRecord.exception_type || fullRecord.exception_description) && (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs">
                        {fullRecord.exception_type && (
                          <div>异常类型：{EXCEPTION_LABELS[fullRecord.exception_type] ?? fullRecord.exception_type}</div>
                        )}
                        {fullRecord.exception_description && <div>异常描述：{fullRecord.exception_description}</div>}
                      </div>
                    )}
                    {(ex as { remark?: string }).remark && (
                      <div className="mt-3">
                        <span className="text-slate-500 text-xs">备注</span>
                        <div className="mt-0.5 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">{(ex as { remark?: string }).remark}</div>
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-slate-500">暂无执行记录</div>
        )}
      </Card>
    </div>
  )
}

export function WorkOrderTab() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [keyword, setKeyword] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showView, setShowView] = useState(false)
  const [selectedDetail, setSelectedDetail] = useState<WorkOrderDetail | null>(null)
  const [editingRow, setEditingRow] = useState<WorkOrderListItem | null>(null)
  const [executionDetailsMap, setExecutionDetailsMap] = useState<Record<string, ExecutionRecordDetail | null>>({})
  const [viewLoading, setViewLoading] = useState(false)
  const [editFormLoading, setEditFormLoading] = useState(false)
  const [formData, setFormData] = useState<Partial<WorkOrderCreate>>({ ...emptyForm })
  const [submitLoading, setSubmitLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery<{
    list?: WorkOrderListItem[]
    total?: number
  }>({
    queryKey: ['product-distribution', 'workorders', { page, pageSize, keyword }],
    queryFn: async () =>
      (await productDistributionApi.getWorkOrders({
        page,
        pageSize,
        keyword: keyword.trim() || undefined,
      })) as {
        list?: WorkOrderListItem[]
        total?: number
      },
  })
  const list: WorkOrderListItem[] = data?.list ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['product-distribution', 'workorders'] })
    queryClient.invalidateQueries({ queryKey: ['product-distribution', 'workorders-all'] })
  }, [queryClient])

  useEffect(() => {
    setPage(1)
  }, [keyword])

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!formData.project_no?.trim()) e.project_no = '请填写项目编号'
    if (!formData.project_name?.trim()) e.project_name = '请填写项目名称'
    if (!formData.project_start_date) e.project_start_date = '请选择'
    if (!formData.project_end_date) e.project_end_date = '请选择'
    if (formData.project_start_date && formData.project_end_date && formData.project_end_date <= formData.project_start_date) {
      e.project_end_date = '须晚于启动日期'
    }
    return e
  }

  /** 编辑时项目主数据只读，仅校验可编辑区块（当前无可选必填项） */
  const validateForEdit = (): Record<string, string> => ({})

  const openCreate = () => {
    setErrors({})
    setHasTriedSubmit(false)
    setCreateError(null)
    setFormData({
      ...emptyForm,
      project_start_date: new Date().toISOString().split('T')[0],
      project_end_date: new Date().toISOString().split('T')[0],
    })
    setShowCreate(true)
  }

  const openEdit = (wo: WorkOrderListItem) => {
    setErrors({})
    setHasTriedSubmit(false)
    setEditError(null)
    setEditingRow(wo)
    setShowEdit(true)
    setEditFormLoading(true)
    productDistributionApi
      .getWorkOrder(Number(wo.id))
      .then((d: any) => {
        setFormData({
          project_no: d.project_no,
          project_name: d.project_name,
          project_start_date: d.project_start_date,
          project_end_date: d.project_end_date,
          visit_count: d.visit_count ?? 0,
          researcher: d.researcher ?? '',
          supervisor: d.supervisor ?? '',
          usage_method: d.usage_method ?? '',
          usage_frequency: d.usage_frequency ?? '',
          precautions: d.precautions ?? '',
          project_requirements: d.project_requirements ?? '',
        })
      })
      .catch(() => {
        setShowEdit(false)
        setEditingRow(null)
      })
      .finally(() => setEditFormLoading(false))
  }

  const openView = (id: string | number) => {
    setSelectedDetail(null)
    setExecutionDetailsMap({})
    setShowView(true)
    setViewLoading(true)
    productDistributionApi
      .getWorkOrder(Number(id))
      .then((d: any) => setSelectedDetail(d as WorkOrderDetail))
      .catch(() => setSelectedDetail(null))
      .finally(() => setViewLoading(false))
  }

  useEffect(() => {
    if (!selectedDetail?.executions?.length) {
      setExecutionDetailsMap({})
      return
    }
    const ids = selectedDetail.executions.map((ex) => ex.id)
    Promise.all(ids.map((id) => productDistributionApi.getExecutionOrder(Number(id))))
      .then((results) => {
        const map: Record<string, ExecutionRecordDetail | null> = {}
        ids.forEach((id, i) => {
          map[id] = (results[i] as ExecutionRecordDetail) ?? null
        })
        setExecutionDetailsMap(map)
      })
      .catch(() => setExecutionDetailsMap({}))
  }, [selectedDetail?.id, selectedDetail?.executions])

  const handleCreate = async () => {
    setHasTriedSubmit(true)
    const newErrors = validate()
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return
    const payload = {
      project_no: formData.project_no!.trim(),
      project_name: formData.project_name!.trim(),
      project_start_date: formData.project_start_date!,
      project_end_date: formData.project_end_date!,
      visit_count: formData.visit_count ?? 0,
      researcher: formData.researcher || null,
      supervisor: formData.supervisor || null,
      usage_method: formData.usage_method || null,
      usage_frequency: formData.usage_frequency || null,
      precautions: formData.precautions || null,
      project_requirements: formData.project_requirements || null,
    }
    setSubmitLoading(true)
    try {
      await productDistributionApi.createWorkOrder(payload)
      setCreateError(null)
      refresh()
      setShowCreate(false)
      setFormData({ ...emptyForm })
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '请稍后重试')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingRow) return
    setHasTriedSubmit(true)
    const newErrors = validateForEdit()
    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return
    const payload = {
      usage_method: formData.usage_method || null,
      usage_frequency: formData.usage_frequency || null,
      precautions: formData.precautions || null,
      project_requirements: formData.project_requirements || null,
    }
    setSubmitLoading(true)
    try {
      await productDistributionApi.updateWorkOrder(Number(editingRow.id), payload)
      setEditError(null)
      refresh()
      setShowEdit(false)
      const updatedId = editingRow.id
      setEditingRow(null)
      if (showView && selectedDetail?.id === updatedId) {
        productDistributionApi.getWorkOrder(Number(updatedId)).then((d: any) => setSelectedDetail(d as WorkOrderDetail)).catch(() => {})
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '请稍后重试')
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索项目编号、名称、研究员..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-9 w-full pl-8 rounded-lg border border-slate-200 text-sm"
          />
        </div>
        <Button size="sm" onClick={openCreate} className="shrink-0">
          <span className="inline-flex items-center whitespace-nowrap gap-1.5">
            <Plus className="h-3.5 w-3.5 shrink-0" />新建工单
          </span>
        </Button>
      </div>

      <Card variant="elevated" className="overflow-hidden">
        {error && <p className="px-2 py-1.5 text-red-600 text-sm">加载失败：{(error as Error).message}</p>}
        {isLoading && <p className="px-2 py-1.5 text-slate-500 text-sm">加载中…</p>}
        {!isLoading && !error && list.length === 0 && (
          <p className="px-2 py-1.5 text-slate-500 text-sm">
            {keyword.trim() ? '未找到匹配的工单' : '暂无工单，请点击「新建工单」创建'}
          </p>
        )}
        {!isLoading && !error && list.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-2 py-1.5 font-medium">项目编号</th>
                  <th className="text-left px-2 py-1.5 font-medium">项目名称</th>
                  <th className="text-left px-2 py-1.5 font-medium">启动日期</th>
                  <th className="text-left px-2 py-1.5 font-medium">结束日期</th>
                  <th className="text-center px-2 py-1.5 font-medium">访视</th>
                  <th className="text-left px-2 py-1.5 font-medium">研究员</th>
                  <th className="text-left px-2 py-1.5 font-medium">督导</th>
                  <th className="text-left px-2 py-1.5 font-medium">进展</th>
                  <th className="text-right px-2 py-1.5 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map((wo) => (
                  <tr key={wo.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-2 py-1.5">{wo.project_no}</td>
                    <td className="px-2 py-1.5 max-w-[160px] truncate" title={wo.project_name}>{wo.project_name}</td>
                    <td className="px-2 py-1.5">{wo.project_start_date}</td>
                    <td className="px-2 py-1.5">{wo.project_end_date}</td>
                    <td className="px-2 py-1.5 text-center">{wo.visit_count}</td>
                    <td className="px-2 py-1.5">{wo.researcher ?? '—'}</td>
                    <td className="px-2 py-1.5">{wo.supervisor ?? '—'}</td>
                    <td className="px-2 py-1.5"><ProgressBadge progress={wo.execution_progress} /></td>
                    <td className="px-2 py-1.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(wo)}>
                          <span className="inline-flex items-center whitespace-nowrap gap-1.5">
                            <Pencil className="h-3 w-3 shrink-0" />编辑
                          </span>
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openView(wo.id)}>
                          <span className="inline-flex items-center whitespace-nowrap gap-1.5">
                            <Eye className="h-3 w-3 shrink-0" />查看
                          </span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && total > 0 && (
          <div className="flex items-center justify-between px-2 py-1.5 border-t border-slate-200">
            <div className="text-sm text-slate-500">
              共 {total} 条，第 {page} / {totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="h-9 w-[100px] rounded-lg border border-slate-200 px-2 text-sm"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n} 条/页</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400 justify-center disabled:border-slate-200 disabled:text-slate-400">
                <span className="inline-flex items-center whitespace-nowrap gap-1.5">
                  <ChevronLeft className="h-4 w-4 shrink-0" />上一页
                </span>
              </Button>
              <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 text-sm text-slate-700 border border-slate-300 rounded">{page}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400 justify-center disabled:border-slate-200 disabled:text-slate-400">
                <span className="inline-flex items-center whitespace-nowrap gap-1.5">
                  下一页<ChevronRight className="h-4 w-4 shrink-0" />
                </span>
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 新建 */}
      <Modal
        open={showCreate}
        onClose={() => { setCreateError(null); setShowCreate(false) }}
        title="新建工单"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>取消</Button>
            <Button size="sm" onClick={handleCreate} disabled={submitLoading}>
              {submitLoading ? '提交中...' : '创建'}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {createError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{createError}</div>
          )}
          <WorkOrderForm formData={formData} setFormData={setFormData} errors={errors} hasTriedSubmit={hasTriedSubmit} />
        </div>
      </Modal>

      {/* 编辑 */}
      <Modal
        open={showEdit}
        onClose={() => { setEditingRow(null); setEditError(null); setShowEdit(false) }}
        title="编辑工单"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowEdit(false)}>取消</Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={submitLoading}>
              {submitLoading ? '保存中...' : '保存'}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {editError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</div>
          )}
          {editFormLoading ? (
            <div className="py-8 text-center text-sm text-slate-500">加载中...</div>
          ) : (
            <WorkOrderForm
              formData={formData}
              setFormData={setFormData}
              errors={errors}
              hasTriedSubmit={hasTriedSubmit}
              readOnlyExecutionFields
            />
          )}
        </div>
      </Modal>

      {/* 查看详情 */}
      <Modal
        open={showView}
        onClose={() => setShowView(false)}
        title="项目整体信息"
        size="xl"
        footer={
          <Button variant="outline" size="sm" onClick={() => setShowView(false)}>关闭</Button>
        }
      >
        <div className="space-y-2">
          {selectedDetail && (
            <p className="text-sm text-slate-500">
              {selectedDetail.project_name}（{selectedDetail.project_no}）
            </p>
          )}
          {viewLoading && !selectedDetail && <div className="py-8 text-center text-sm text-slate-500">加载中...</div>}
          {selectedDetail && <WorkOrderViewContent detail={selectedDetail} executionDetailsMap={executionDetailsMap} />}
          {!viewLoading && !selectedDetail && <div className="py-8 text-center text-sm text-slate-500">暂无数据</div>}
        </div>
      </Modal>
    </div>
  )
}
