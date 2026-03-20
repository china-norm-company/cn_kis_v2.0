/**
 * 样品管理 - 样品领用台账 + 领用退库记录，新建/编辑（与 KIS 一致）
 */
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { productDistributionApi } from '@cn-kis/api-client'
import { Card, Button, Modal, Badge, Tabs, Select } from '@cn-kis/ui-kit'
import {
  Plus,
  Save,
  ShoppingCart,
  RotateCcw,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Search,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import type {
  SampleRequestListItem,
  SampleRequestCreate,
  SampleLedgerItem,
  WorkOrderListItem,
} from './types'

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]
const DEFAULT_PAGE_SIZE = 20

function LedgerStatusBadge({ status }: { status: SampleLedgerItem['project_close_status'] }) {
  const iconClass = 'h-2.5 w-2.5 mr-0.5 shrink-0'
  switch (status) {
    case 'pending_return':
      return (
        <Badge className="text-xs font-normal !bg-orange-500 !text-white">
          <AlertCircle className={`${iconClass} text-white`} />
          待退库
        </Badge>
      )
    case 'completed':
      return (
        <Badge className="text-xs font-normal !bg-green-500 !text-white">
          <CheckCircle2 className={`${iconClass} text-white`} />
          已完成
        </Badge>
      )
    case 'abnormal':
      return <Badge variant="error" className="text-xs font-normal">异常</Badge>
    default:
      return <Badge variant="default" className="text-xs">{String(status)}</Badge>
  }
}

export function SampleRequestTab() {
  const queryClient = useQueryClient()
  const [subTab, setSubTab] = useState<'ledger' | 'records'>('ledger')
  const [keyword, setKeyword] = useState('')
  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerPageSize, setLedgerPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [ordersPage, setOrdersPage] = useState(1)
  const [ordersPageSize, setOrdersPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [showDialog, setShowDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFormLoading, setEditFormLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [formData, setFormData] = useState<Partial<SampleRequestCreate>>({
    operation_date: new Date().toISOString().split('T')[0],
    operation_type: 'receive',
    unit: '支',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false)
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const kw = keyword.trim() || undefined

  const { data: ledgerData, isLoading: ledgerLoading, error: ledgerError } = useQuery({
    queryKey: ['product-distribution', 'orders-ledger', { page: ledgerPage, pageSize: ledgerPageSize, keyword: kw }],
    queryFn: () =>
      productDistributionApi.getOrdersLedger({
        page: ledgerPage,
        pageSize: ledgerPageSize,
        keyword: kw,
      }),
  })
  const { data: ordersData, isLoading: ordersLoading, error: ordersError } = useQuery({
    queryKey: ['product-distribution', 'sample-orders', { page: ordersPage, pageSize: ordersPageSize, keyword: kw }],
    queryFn: () =>
      productDistributionApi.getSampleOrders({
        page: ordersPage,
        pageSize: ordersPageSize,
        keyword: kw,
      }),
  })
  const { data: workOrdersData, refetch: refetchWorkOrders, isFetching: workOrdersFetching } = useQuery({
    queryKey: ['product-distribution', 'workorders-all'],
    queryFn: () => productDistributionApi.getAllWorkOrders(),
  })

  const ledgerList: SampleLedgerItem[] = (ledgerData as { list?: SampleLedgerItem[] } | undefined)?.list ?? []
  const ledgerTotal = (ledgerData as { total?: number } | undefined)?.total ?? 0
  const requests: SampleRequestListItem[] = (ordersData as { list?: SampleRequestListItem[] } | undefined)?.list ?? []
  const ordersTotal = (ordersData as { total?: number } | undefined)?.total ?? 0
  const workOrders: WorkOrderListItem[] = (() => {
    const d = workOrdersData as unknown as { list?: unknown; total?: number } | undefined
    if (d && Array.isArray(d.list)) return d.list as WorkOrderListItem[]
    if (Array.isArray(workOrdersData)) return workOrdersData as WorkOrderListItem[]
    return []
  })()

  const ledgerTotalPages = Math.max(1, Math.ceil(ledgerTotal / ledgerPageSize))
  const ordersTotalPages = Math.max(1, Math.ceil(ordersTotal / ordersPageSize))

  useEffect(() => {
    setLedgerPage(1)
    setOrdersPage(1)
  }, [keyword])

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['product-distribution', 'orders-ledger'] })
    queryClient.invalidateQueries({ queryKey: ['product-distribution', 'sample-orders'] })
  }

  const openNew = () => {
    setEditingId(null)
    setErrors({})
    setHasTriedSubmit(false)
    setFormData({
      operation_date: new Date().toISOString().split('T')[0],
      operation_type: 'receive',
      unit: '支',
      related_project_no: '',
      project_name: undefined,
      project_start_date: undefined,
      project_end_date: undefined,
      supervisor: undefined,
    })
    refetchWorkOrders()
    setShowDialog(true)
  }

  const openEdit = (r: SampleRequestListItem) => {
    setEditingId(r.id)
    setErrors({})
    setHasTriedSubmit(false)
    setShowDialog(true)
    setEditFormLoading(true)
    productDistributionApi
      .getSampleOrder(Number(r.id))
      .then((detail: any) => {
        setFormData({
          operation_type: detail.operation_type,
          operation_date: detail.operation_date,
          related_project_no: detail.related_project_no,
          project_name: detail.project_name ?? undefined,
          project_start_date: detail.project_start_date ?? undefined,
          project_end_date: detail.project_end_date ?? undefined,
          supervisor: detail.supervisor ?? undefined,
          product_name: detail.product_name,
          product_code: detail.product_code,
          quantity: detail.quantity,
          unit: detail.unit ?? '支',
          purpose: detail.purpose,
          remark: detail.remark ?? undefined,
        })
      })
      .catch(() => {
        setShowDialog(false)
        setEditingId(null)
        setToastMessage({ type: 'error', text: '记录详情加载失败' })
      })
      .finally(() => setEditFormLoading(false))
  }

  const handleSubmit = async () => {
    setHasTriedSubmit(true)
    const e: Record<string, string> = {}
    if (!formData.operation_date) e.operation_date = '请选择'
    if (!formData.related_project_no?.trim()) e.related_project_no = '请选择项目'
    if (!formData.product_name?.trim()) e.product_name = '请填写产品名称'
    if (!formData.product_code?.trim()) e.product_code = '请填写产品编号'
    if (formData.quantity == null || formData.quantity <= 0) e.quantity = '请填写产品数量'
    if (!formData.purpose?.trim()) e.purpose = '请填写用途'
    setErrors(e)
    if (Object.keys(e).length > 0) return

    const payload = {
      operation_type: formData.operation_type!,
      operation_date: formData.operation_date!,
      related_project_no: formData.related_project_no!.trim(),
      project_name: formData.project_name || null,
      project_start_date: formData.project_start_date ?? null,
      project_end_date: formData.project_end_date ?? null,
      supervisor: formData.supervisor ?? null,
      product_name: formData.product_name!.trim(),
      product_code: formData.product_code!.trim(),
      quantity: formData.quantity!,
      unit: formData.unit || null,
      purpose: formData.purpose!.trim(),
      remark: formData.remark || null,
    }
    setSubmitLoading(true)
    try {
      if (editingId) {
        await productDistributionApi.updateSampleOrder(Number(editingId), payload)
      } else {
        await productDistributionApi.createSampleOrder(payload)
      }
      refresh()
      setShowDialog(false)
      setEditingId(null)
      setFormData({
        operation_date: new Date().toISOString().split('T')[0],
        operation_type: 'receive',
        unit: '支',
        related_project_no: '',
        project_name: undefined,
        project_start_date: undefined,
        project_end_date: undefined,
        supervisor: undefined,
      })
    } catch (err) {
      setToastMessage({ type: 'error', text: err instanceof Error ? err.message : '保存失败' })
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleExportRecords = async () => {
    const headers = [
      '操作日期', '操作类型', '项目编号', '项目名称', '督导', '产品名称', '产品编号', '数量', '单位', '用途', '操作人', '备注', '创建时间',
    ]
    const rows = requests.map((r) => [
      r.operation_date,
      r.operation_type === 'receive' ? '领用' : '退库',
      r.related_project_no,
      r.project_name ?? '',
      workOrders.find((w) => w.project_no === r.related_project_no)?.supervisor ?? '',
      r.product_name,
      r.product_code,
      String(r.quantity),
      r.unit ?? '',
      r.purpose,
      r.operator_name ?? '',
      r.remark ?? '',
      r.created_at,
    ])
    const date = new Date().toISOString().split('T')[0]
    try {
      await productDistributionApi.exportExcel({
        sheet_name: '样品领用记录',
        filename: `样品领用记录_${date}.xlsx`,
        headers,
        rows,
      })
    } catch (err) {
      setToastMessage({ type: 'error', text: err instanceof Error ? err.message : '导出失败' })
    }
  }

  const handleExportLedger = async () => {
    const headers = [
      '工单编号', '项目编号', '项目名称', '启动日期', '结束日期', '关闭状态', '产品名称', '产品编号', '单位',
      '累计领用', '累计退库', '累计发放', '累计回收', '待退库数量',
    ]
    const rows = ledgerList.map((l) => [
      workOrders.find((w) => w.project_no === l.related_project_no)?.work_order_no ?? '',
      l.related_project_no,
      l.project_name ?? '',
      l.project_start_date ?? '',
      l.project_end_date ?? '',
      l.project_close_status === 'completed' ? '已完成' : l.project_close_status === 'pending_return' ? '待退库' : l.project_close_status === 'abnormal' ? '异常' : '进行中',
      l.product_name,
      l.product_code,
      l.unit,
      String(l.total_received),
      String(l.total_returned),
      String(l.total_distributed),
      String(l.total_recovered),
      String(l.pending_return_qty),
    ])
    const date = new Date().toISOString().split('T')[0]
    try {
      await productDistributionApi.exportExcel({
        sheet_name: '样品领用台账',
        filename: `样品领用台账_${date}.xlsx`,
        headers,
        rows,
      })
    } catch (err) {
      setToastMessage({ type: 'error', text: err instanceof Error ? err.message : '导出失败' })
    }
  }

  const inputCls = 'h-9 w-full rounded-lg border border-slate-200 px-3 text-sm'
  const errCls = 'border-red-500'

  return (
    <div className="space-y-4">
      {toastMessage && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${toastMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}
          role="alert"
        >
          {toastMessage.text}
          <button type="button" className="ml-2 underline" onClick={() => setToastMessage(null)}>关闭</button>
        </div>
      )}
      {ledgerError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(ledgerError as Error).message}
        </div>
      )}
      {ordersError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {(ordersError as Error).message}
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索工单编号、项目、产品、操作人..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-9 w-full pl-8 rounded-lg border border-slate-200 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleExportLedger}>
            <span className="inline-flex items-center whitespace-nowrap gap-1.5">
              <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
              导出领用台账
            </span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportRecords}>
            <span className="inline-flex items-center whitespace-nowrap gap-1.5">
              <Download className="h-3.5 w-3.5 shrink-0" />
              导出领用记录
            </span>
          </Button>
          <Button size="sm" onClick={openNew}>
            <span className="inline-flex items-center whitespace-nowrap gap-1.5">
              <Plus className="h-3.5 w-3.5 shrink-0" />
              新建记录
            </span>
          </Button>
        </div>
      </div>

      <Tabs
        tabs={[
          { value: 'ledger', label: `样品领用台账 (${ledgerTotal})` },
          { value: 'records', label: `领用退库记录 (${ordersTotal})` },
        ]}
        value={subTab}
        onChange={(k) => setSubTab(k as 'ledger' | 'records')}
        className="mb-4"
      />

      {subTab === 'ledger' && (
        <Card variant="elevated" className="overflow-hidden">
          {ledgerLoading && <p className="px-2 py-1.5 text-slate-500 text-sm">加载中…</p>}
          {!ledgerLoading && ledgerList.length === 0 && (
            <p className="px-2 py-1.5 text-slate-500 text-sm">{keyword.trim() ? '未找到匹配' : '暂无台账数据'}</p>
          )}
          {!ledgerLoading && ledgerList.length > 0 && (
            <>
              <div className="overflow-x-auto sample-ledger-table">
                <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-2 py-1.5 font-medium">工单编号</th>
                      <th className="text-left px-2 py-1.5 font-medium">项目编号</th>
                      <th className="text-left px-2 py-1.5 font-medium">项目名称</th>
                      <th className="text-left px-2 py-1.5 font-medium">启动时间</th>
                      <th className="text-left px-2 py-1.5 font-medium">结束时间</th>
                      <th className="text-left px-2 py-1.5 font-medium">关闭状态</th>
                      <th className="text-left px-2 py-1.5 font-medium">产品名称</th>
                      <th className="text-left px-2 py-1.5 font-medium">产品编号</th>
                      <th className="text-left px-2 py-1.5 font-medium">单位</th>
                      <th className="text-center px-2 py-1.5 font-medium">领用</th>
                      <th className="text-center px-2 py-1.5 font-medium">退库</th>
                      <th className="text-center px-2 py-1.5 font-medium">发放</th>
                      <th className="text-center px-2 py-1.5 font-medium">回收</th>
                      <th className="text-center px-2 py-1.5 font-medium">待退库</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerList.map((l, idx) => (
                      <tr key={`${l.related_project_no}-${l.product_code}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-2 py-1.5 font-medium align-middle" style={{ minHeight: '2.5rem' }}>
                          {workOrders.find((w) => w.project_no === l.related_project_no)?.work_order_no ?? '—'}
                        </td>
                        <td className="px-2 py-1.5">{l.related_project_no}</td>
                        <td className="px-2 py-1.5 max-w-[160px] truncate" title={l.project_name ?? undefined}>{l.project_name ?? '—'}</td>
                        <td className="px-2 py-1.5">{l.project_start_date ?? '—'}</td>
                        <td className="px-2 py-1.5">{l.project_end_date ?? '—'}</td>
                        <td className="px-2 py-1.5"><LedgerStatusBadge status={l.project_close_status} /></td>
                        <td className="px-2 py-1.5 font-medium">{l.product_name}</td>
                        <td className="px-2 py-1.5">{l.product_code}</td>
                        <td className="px-2 py-1.5">{l.unit}</td>
                        <td className="px-2 py-1.5 text-center">{l.total_received}</td>
                        <td className="px-2 py-1.5 text-center">{l.total_returned}</td>
                        <td className="px-2 py-1.5 text-center">{l.total_distributed}</td>
                        <td className="px-2 py-1.5 text-center">{l.total_recovered}</td>
                        <td className="px-2 py-1.5 text-center">
                          <Badge className={l.pending_return_qty > 0 ? '!bg-orange-600 !text-white' : ''}>{l.pending_return_qty}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ledgerTotal > 0 && (
                <div className="flex items-center justify-between px-2 py-1.5 border-t border-slate-200">
                  <span className="text-sm text-slate-500">共 {ledgerTotal} 条，第 {ledgerPage} / {ledgerTotalPages} 页</span>
                  <div className="flex items-center gap-2">
                    <select value={ledgerPageSize} onChange={(e) => { setLedgerPageSize(Number(e.target.value)); setLedgerPage(1) }} className="h-9 w-[100px] rounded-lg border border-slate-200 px-2 text-sm">
                      {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} 条/页</option>)}
                    </select>
                    <Button variant="outline" size="sm" onClick={() => setLedgerPage((p) => Math.max(1, p - 1))} disabled={ledgerPage === 1} className="border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400 justify-center disabled:border-slate-200 disabled:text-slate-400">
                      <span className="inline-flex items-center whitespace-nowrap gap-1.5">
                        <ChevronLeft className="h-4 w-4 shrink-0" />上一页
                      </span>
                    </Button>
                    <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 text-sm text-slate-700 border border-slate-300 rounded">{ledgerPage}</span>
                    <Button variant="outline" size="sm" onClick={() => setLedgerPage((p) => Math.min(ledgerTotalPages, p + 1))} disabled={ledgerPage === ledgerTotalPages} className="border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400 justify-center disabled:border-slate-200 disabled:text-slate-400">
                      <span className="inline-flex items-center whitespace-nowrap gap-1.5">
                        下一页<ChevronRight className="h-4 w-4 shrink-0" />
                      </span>
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {subTab === 'records' && (
        <Card variant="elevated" className="overflow-hidden">
          {ordersLoading && <p className="px-2 py-1.5 text-slate-500 text-sm">加载中…</p>}
          {!ordersLoading && requests.length === 0 && (
            <p className="px-2 py-1.5 text-slate-500 text-sm">{keyword.trim() ? '未找到匹配' : '暂无记录'}</p>
          )}
          {!ordersLoading && requests.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-2 py-1.5 font-medium">工单号</th>
                      <th className="text-left px-2 py-1.5 font-medium">操作日期</th>
                      <th className="text-left px-2 py-1.5 font-medium">操作类型</th>
                      <th className="text-left px-2 py-1.5 font-medium">项目编号</th>
                      <th className="text-left px-2 py-1.5 font-medium">项目名称</th>
                      <th className="text-left px-2 py-1.5 font-medium">督导</th>
                      <th className="text-left px-2 py-1.5 font-medium">产品名称</th>
                      <th className="text-left px-2 py-1.5 font-medium">产品编号</th>
                      <th className="text-center px-2 py-1.5 font-medium">数量</th>
                      <th className="text-left px-2 py-1.5 font-medium">单位</th>
                      <th className="text-left px-2 py-1.5 font-medium">用途</th>
                      <th className="text-left px-2 py-1.5 font-medium">操作人</th>
                      <th className="text-left px-2 py-1.5 font-medium">备注</th>
                      <th className="text-right px-2 py-1.5 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...requests]
                      .sort((a, b) => new Date(b.operation_date).getTime() - new Date(a.operation_date).getTime())
                      .map((r) => (
                        <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-2 py-1.5 font-medium">
                            {workOrders.find((w) => w.project_no === r.related_project_no)?.work_order_no ?? '—'}
                          </td>
                          <td className="px-2 py-1.5">{r.operation_date}</td>
                          <td className="px-2 py-1.5">
                            {r.operation_type === 'receive' ? (
                              <Badge variant="primary" className="text-xs font-normal text-primary-700">
                                <ShoppingCart className="h-2.5 w-2.5 mr-0.5 shrink-0 inline text-primary-700" />
                                领用
                              </Badge>
                            ) : (
                              <Badge className="text-xs font-normal !bg-emerald-600 !text-white">
                                <RotateCcw className="h-2.5 w-2.5 mr-0.5 shrink-0 inline text-white" />
                                退库
                              </Badge>
                            )}
                          </td>
                          <td className="px-2 py-1.5 font-medium">{r.related_project_no}</td>
                          <td className="px-2 py-1.5 max-w-[160px] truncate" title={r.project_name ?? undefined}>{r.project_name ?? '—'}</td>
                          <td className="px-2 py-1.5">{r.supervisor ?? workOrders.find((w) => w.project_no === r.related_project_no)?.supervisor ?? '—'}</td>
                          <td className="px-2 py-1.5 font-medium">{r.product_name}</td>
                          <td className="px-2 py-1.5">{r.product_code}</td>
                          <td className="px-2 py-1.5 text-center">{r.quantity}</td>
                          <td className="px-2 py-1.5">{r.unit ?? '—'}</td>
                          <td className="px-2 py-1.5 max-w-[200px] truncate" title={r.purpose}>{r.purpose}</td>
                          <td className="px-2 py-1.5">{r.operator_name ?? '—'}</td>
                          <td className="px-2 py-1.5 max-w-[150px] truncate" title={r.remark ?? ''}>{r.remark ?? '—'}</td>
                          <td className="px-2 py-1.5 text-right">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => openEdit(r)}>
                              <span className="inline-flex items-center whitespace-nowrap gap-1.5">
                                <Pencil className="h-3 w-3 shrink-0" />编辑
                              </span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {ordersTotal > 0 && (
                <div className="flex items-center justify-between px-2 py-1.5 border-t border-slate-200">
                  <span className="text-sm text-slate-500">共 {ordersTotal} 条，第 {ordersPage} / {ordersTotalPages} 页</span>
                  <div className="flex items-center gap-2">
                    <select value={ordersPageSize} onChange={(e) => { setOrdersPageSize(Number(e.target.value)); setOrdersPage(1) }} className="h-9 w-[100px] rounded-lg border border-slate-200 px-2 text-sm">
                      {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} 条/页</option>)}
                    </select>
                    <Button variant="outline" size="sm" onClick={() => setOrdersPage((p) => Math.max(1, p - 1))} disabled={ordersPage === 1} className="border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400 justify-center disabled:border-slate-200 disabled:text-slate-400">
                      <span className="inline-flex items-center whitespace-nowrap gap-1.5">
                        <ChevronLeft className="h-4 w-4 shrink-0" />上一页
                      </span>
                    </Button>
                    <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 text-sm text-slate-700 border border-slate-300 rounded">{ordersPage}</span>
                    <Button variant="outline" size="sm" onClick={() => setOrdersPage((p) => Math.min(ordersTotalPages, p + 1))} disabled={ordersPage === ordersTotalPages} className="border-slate-300 text-slate-900 hover:bg-slate-50 hover:border-slate-400 justify-center disabled:border-slate-200 disabled:text-slate-400">
                      <span className="inline-flex items-center whitespace-nowrap gap-1.5">
                        下一页<ChevronRight className="h-4 w-4 shrink-0" />
                      </span>
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      <Modal
        open={showDialog}
        onClose={() => { if (!editFormLoading) { setShowDialog(false); setEditingId(null) } }}
        title={editingId ? '修改领用/退库记录' : '新建样品操作记录'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowDialog(false)} disabled={editFormLoading}>取消</Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitLoading || editFormLoading}>
              <span className="inline-flex items-center whitespace-nowrap gap-1.5">
                <Save className="h-3.5 w-3.5 shrink-0" />
                {submitLoading ? '保存中...' : '保存'}
              </span>
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-500 mb-3">
          {editingId ? '修改该条记录并保存' : '记录样品领用或退库信息'}
        </p>
        {editingId && editFormLoading ? (
          <div className="py-8 text-center text-sm text-slate-500">加载中...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">操作类型 <span className="text-red-500">*</span></label>
                <select
                  className={inputCls}
                  value={formData.operation_type ?? 'receive'}
                  onChange={(e) => setFormData((f) => ({ ...f, operation_type: e.target.value as 'receive' | 'return_to_stock' }))}
                >
                  <option value="receive">领用</option>
                  <option value="return_to_stock">退库</option>
                </select>
              </div>
              <div className="space-y-1.5" data-field="operation_date">
                <label className="text-xs font-medium text-slate-500">操作日期 <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  className={`${inputCls} ${hasTriedSubmit && errors.operation_date ? errCls : ''}`}
                  value={formData.operation_date ?? ''}
                  onChange={(e) => setFormData((f) => ({ ...f, operation_date: e.target.value }))}
                />
                {hasTriedSubmit && errors.operation_date && <p className="text-sm text-red-600">{errors.operation_date}</p>}
              </div>
              <div className="space-y-1.5 col-span-2" data-field="related_project_no">
                <label className="text-xs font-medium text-slate-500">项目编号 <span className="text-red-500">*</span></label>
                <Select
                  options={workOrders.map((wo) => ({
                    value: String(wo.project_no),
                    label: wo.project_name ? `${wo.project_no} - ${wo.project_name}` : String(wo.project_no),
                  }))}
                  placeholder={
                    workOrdersFetching
                      ? '加载中…'
                      : workOrders.length === 0
                        ? '暂无项目，请先在工单管理中创建工单'
                        : '请选择项目'
                  }
                  value={formData.related_project_no ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    const wo = workOrders.find((w) => String(w.project_no) === val)
                    setFormData((f) => ({
                      ...f,
                      related_project_no: val,
                      project_name: wo?.project_name ?? undefined,
                      project_start_date: wo?.project_start_date ?? undefined,
                      project_end_date: wo?.project_end_date ?? undefined,
                      supervisor: wo?.supervisor ?? undefined,
                    }))
                  }}
                  className={`${hasTriedSubmit && errors.related_project_no ? errCls : ''}`}
                  error={hasTriedSubmit ? errors.related_project_no : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">项目名称</label>
                <input className={`${inputCls} bg-slate-100`} value={formData.project_name ?? ''} readOnly placeholder="请先选择项目" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">督导</label>
                <input className={`${inputCls} bg-slate-100`} value={formData.supervisor ?? ''} readOnly placeholder="请先选择项目" />
              </div>
              <div className="space-y-1.5" data-field="product_name">
                <label className="text-xs font-medium text-slate-500">产品名称 <span className="text-red-500">*</span></label>
                <input
                  className={`${inputCls} ${hasTriedSubmit && errors.product_name ? errCls : ''}`}
                  value={formData.product_name ?? ''}
                  onChange={(e) => setFormData((f) => ({ ...f, product_name: e.target.value }))}
                  placeholder="输入产品名称"
                />
                {hasTriedSubmit && errors.product_name && <p className="text-sm text-red-600">{errors.product_name}</p>}
              </div>
              <div className="space-y-1.5" data-field="product_code">
                <label className="text-xs font-medium text-slate-500">产品编号 <span className="text-red-500">*</span></label>
                <input
                  className={`${inputCls} ${hasTriedSubmit && errors.product_code ? errCls : ''}`}
                  value={formData.product_code ?? ''}
                  onChange={(e) => setFormData((f) => ({ ...f, product_code: e.target.value }))}
                  placeholder="输入产品编号"
                />
                {hasTriedSubmit && errors.product_code && <p className="text-sm text-red-600">{errors.product_code}</p>}
              </div>
              <div className="space-y-1.5" data-field="quantity">
                <label className="text-xs font-medium text-slate-500">数量 <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  className={`${inputCls} ${hasTriedSubmit && errors.quantity ? errCls : ''}`}
                  value={formData.quantity ?? ''}
                  onChange={(e) => setFormData((f) => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                  placeholder="输入产品数量"
                />
                {hasTriedSubmit && errors.quantity && <p className="text-sm text-red-600">{errors.quantity}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">单位</label>
                <input
                  className={inputCls}
                  value={formData.unit ?? '支'}
                  onChange={(e) => setFormData((f) => ({ ...f, unit: e.target.value }))}
                  placeholder="单位"
                />
              </div>
            </div>
            <div className="space-y-1.5 border-t border-slate-200 pt-4" data-field="purpose">
              <label className="text-xs font-medium text-slate-500">用途 <span className="text-red-500">*</span></label>
              <textarea
                className={`${inputCls} min-h-[60px] py-2 ${hasTriedSubmit && errors.purpose ? errCls : ''}`}
                value={formData.purpose ?? ''}
                onChange={(e) => setFormData((f) => ({ ...f, purpose: e.target.value }))}
                placeholder="输入用途..."
                rows={2}
              />
              {hasTriedSubmit && errors.purpose && <p className="text-sm text-red-600">{errors.purpose}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-500">备注</label>
              <textarea
                className={`${inputCls} min-h-[60px] py-2`}
                value={formData.remark ?? ''}
                onChange={(e) => setFormData((f) => ({ ...f, remark: e.target.value }))}
                placeholder="选填"
                rows={2}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
