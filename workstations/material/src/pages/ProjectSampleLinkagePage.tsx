import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { ProductItem } from '@cn-kis/api-client'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Link2,
  Plus,
  RotateCcw,
  Search,
  UserPlus,
} from 'lucide-react'

import { CreateProductModal, STUDY_PROJECT_TYPE_OPTIONS } from '../components/CreateProductModal'

const PAGE_SIZE = 10

type DraftFilters = {
  keyword: string
  product_type: string
  storage_condition: string
  expiry_status: string
  inbound_status: string
  listed: string
  study_project_type: string
}

const emptyDraft: DraftFilters = {
  keyword: '',
  product_type: '',
  storage_condition: '',
  expiry_status: '',
  inbound_status: '',
  listed: '',
  study_project_type: '',
}

type MainTab = 'list' | 'link'

function toListParams(applied: DraftFilters, page: number, pageSize: number) {
  let expiry_status = applied.expiry_status
  let stock_kind = ''
  if (applied.inbound_status === 'expired') {
    expiry_status = 'expired'
  } else if (applied.inbound_status === 'in_stock') {
    stock_kind = 'has_in_stock'
  } else if (applied.inbound_status === 'empty') {
    stock_kind = 'no_instances'
  } else if (applied.inbound_status === 'out') {
    stock_kind = 'no_in_stock'
  }

  let protocol_bound = ''
  if (applied.listed === 'yes') protocol_bound = 'yes'
  if (applied.listed === 'no') protocol_bound = 'no'

  return {
    keyword: applied.keyword || undefined,
    product_type: applied.product_type || undefined,
    storage_condition: applied.storage_condition || undefined,
    expiry_status: expiry_status || undefined,
    protocol_bound: protocol_bound || undefined,
    stock_kind: stock_kind || undefined,
    study_project_type: applied.study_project_type || undefined,
    page,
    page_size: pageSize,
  }
}

function formatProjectNo(product: ProductItem) {
  if (product.protocol_id != null) {
    return `PRJ-${String(product.protocol_id).padStart(4, '0')}`
  }
  return '—'
}

function formatInboundStatus(product: ProductItem) {
  if (product.status === 'expired') return '已过期'
  if ((product.in_stock_count ?? 0) > 0) return '已入库'
  if ((product.sample_count ?? 0) === 0) return '未入库'
  return '已出库'
}

function prodDate(product: ProductItem) {
  if (!product.create_time) return '—'
  return product.create_time.slice(0, 10)
}

export function ProjectSampleLinkagePage() {
  const queryClient = useQueryClient()
  const [mainTab, setMainTab] = useState<MainTab>('list')
  const [showCreate, setShowCreate] = useState(false)
  const [draft, setDraft] = useState<DraftFilters>(emptyDraft)
  const [applied, setApplied] = useState<DraftFilters>(emptyDraft)
  const [page, setPage] = useState(1)
  const [jumpInput, setJumpInput] = useState('')
  const [linkRow, setLinkRow] = useState<ProductItem | null>(null)
  const [linkPhone, setLinkPhone] = useState('')
  const [linkName, setLinkName] = useState('')
  const [tabProductId, setTabProductId] = useState('')
  const [tabPhone, setTabPhone] = useState('')
  const [tabName, setTabName] = useState('')

  const linkMutation = useMutation({
    mutationFn: async (payload: { productId: number; phone: string; name?: string }) => {
      const phone = payload.phone.replace(/\D/g, '')
      if (phone.length !== 11) throw new Error('请输入11位手机号')
      return materialApi.linkProductSubject(payload.productId, {
        phone,
        name: payload.name?.trim() || undefined,
      })
    },
    onSuccess: (res) => {
      const data = (res as { data?: { dispensing_no?: string; phone?: string } } | undefined)?.data
      queryClient.invalidateQueries({ queryKey: ['material'] })
      queryClient.invalidateQueries({ queryKey: ['material', 'project-sample-links'] })
      setLinkRow(null)
      setLinkPhone('')
      setLinkName('')
      setTabProductId('')
      setTabPhone('')
      setTabName('')
      alert(`已关联并发放成功。分发单 ${data?.dispensing_no ?? ''}，手机号 ${data?.phone ?? ''} 可在小程序「我的产品」中查看。`)
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : '关联失败，请稍后重试'
      alert(message)
    },
  })

  const { data: listData, isLoading } = useQuery({
    queryKey: ['material', 'project-sample-links', applied, page],
    queryFn: () => materialApi.listProducts(toListParams(applied, page, PAGE_SIZE)),
  })

  const { data: pickListData, isLoading: pickLoading } = useQuery({
    queryKey: ['material', 'project-sample-links', applied, 'pick-products'],
    queryFn: () => materialApi.listProducts(toListParams(applied, 1, 500)),
    enabled: mainTab === 'link',
  })

  const raw = (listData as { data?: { items: ProductItem[]; total: number } })?.data
  const items = raw?.items ?? []
  const total = raw?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const pickRaw = (pickListData as { data?: { items: ProductItem[]; total: number } })?.data
  const pickItems = pickRaw?.items ?? []

  const handleQuery = () => {
    setApplied({ ...draft })
    setPage(1)
  }

  const handleReset = () => {
    setDraft(emptyDraft)
    setApplied(emptyDraft)
    setPage(1)
    setJumpInput('')
  }

  const exportRows = useMemo(() => items, [items])

  const handleExport = () => {
    try {
      const headers = [
        '项目编号',
        '项目名称',
        '项目类型',
        '样品编号',
        '样品名称',
        '样品数量',
        '样品规格',
        '是否关联项目',
        '储存环境',
        '生产日期',
        '生产批号',
        '有效期',
        '入库状态',
      ]
      const lines = exportRows.map((row) =>
        [
          formatProjectNo(row),
          row.protocol_name || '',
          row.study_project_type_display || '',
          row.code,
          row.name || '',
          String(row.sample_count ?? 0),
          row.specification || '',
          row.protocol_id ? '是' : '否',
          row.storage_condition || '',
          prodDate(row),
          row.batch_number || '',
          row.expiry_date || '',
          formatInboundStatus(row),
        ]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(','),
      )
      const blob = new Blob(['\uFEFF' + [headers.join(','), ...lines].join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `项目样品关联_${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      alert('导出失败，请稍后重试')
    }
  }

  const doJump = () => {
    const next = Number.parseInt(jumpInput, 10)
    if (!Number.isFinite(next) || next < 1) return
    setPage(Math.min(totalPages, Math.max(1, next)))
    setJumpInput('')
  }

  const startIndex = total === 0 ? 0 : (page - 1) * PAGE_SIZE

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 md:text-xl">
            <Link2 className="h-5 w-5 text-amber-600" />
            项目样品关联
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            项目与样品台账的关联视图；可直接登记带项目属性的产品，并按手机号关联受试者后生成分发单。
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'list'}
          onClick={() => setMainTab('list')}
          className={`rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            mainTab === 'list'
              ? 'border-amber-600 bg-white text-amber-800'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          样品列表
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'link'}
          onClick={() => setMainTab('link')}
          className={`inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            mainTab === 'link'
              ? 'border-amber-600 bg-white text-amber-800'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <UserPlus className="h-4 w-4" />
          关联受试者
        </button>
      </div>

      {mainTab === 'link' && (
        <div className="space-y-4 rounded-b-xl rounded-tr-xl border border-slate-200 border-t-0 bg-white p-5 shadow-sm md:p-6">
          <p className="text-sm text-slate-600">
            选择要关联的样品，填写受试者手机号。若库中不存在该手机号，会自动创建受试者并生成已发放分发单，小程序「我的产品」可见。
          </p>
          <div className="grid max-w-xl gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">样品</label>
              <select
                value={tabProductId}
                onChange={(e) => setTabProductId(e.target.value)}
                disabled={pickLoading || pickItems.length === 0}
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-800 disabled:opacity-60"
              >
                <option value="">
                  {pickLoading ? '加载中…' : pickItems.length === 0 ? '当前筛选下无产品，请先切回列表调整筛选或新建产品' : '请选择样品'}
                </option>
                {pickItems.map((product) => (
                  <option key={product.id} value={String(product.id)}>
                    {product.code} - {product.name}
                    {product.protocol_name ? `（${product.protocol_name}）` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">手机号（11 位）</label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="与小程序登录手机号一致"
                value={tabPhone}
                onChange={(e) => setTabPhone(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">姓名（选填）</label>
              <input
                type="text"
                placeholder="新建受试者时使用"
                value={tabName}
                onChange={(e) => setTabName(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={linkMutation.isPending || !tabProductId || tabPhone.replace(/\D/g, '').length !== 11}
                onClick={() =>
                  linkMutation.mutate({
                    productId: Number(tabProductId),
                    phone: tabPhone,
                    name: tabName,
                  })
                }
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-600 px-5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {linkMutation.isPending ? '提交中…' : '确认关联并发放'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTabPhone('')
                  setTabName('')
                }}
                className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                清空表单
              </button>
            </div>
          </div>
        </div>
      )}

      {mainTab === 'list' && (
        <>
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索项目名称、样品编号/名称、批号、委托方…"
                  value={draft.keyword}
                  onChange={(e) => setDraft((current) => ({ ...current, keyword: e.target.value }))}
                  className="min-h-11 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <select
                value={draft.product_type}
                onChange={(e) => setDraft((current) => ({ ...current, product_type: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
                aria-label="产品类型"
              >
                <option value="">全部类型</option>
                <option value="test_sample">测试样品</option>
                <option value="placebo">对照品</option>
                <option value="standard">标准品</option>
              </select>
              <input
                type="text"
                placeholder="储存环境（模糊）"
                value={draft.storage_condition}
                onChange={(e) => setDraft((current) => ({ ...current, storage_condition: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm"
              />
              <select
                value={draft.expiry_status}
                onChange={(e) => setDraft((current) => ({ ...current, expiry_status: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm"
                aria-label="效期"
              >
                <option value="">全部效期</option>
                <option value="active">有效</option>
                <option value="expired">已过期</option>
              </select>
              <select
                value={draft.inbound_status}
                onChange={(e) => setDraft((current) => ({ ...current, inbound_status: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm"
                aria-label="入库状态"
              >
                <option value="">全部入库状态</option>
                <option value="in_stock">已入库（有在库实物）</option>
                <option value="empty">未入库（无样品实例）</option>
                <option value="out">已出库（有实例但无在库）</option>
                <option value="expired">已过期（产品效期）</option>
              </select>
              <select
                value={draft.listed}
                onChange={(e) => setDraft((current) => ({ ...current, listed: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm"
                aria-label="是否关联项目"
              >
                <option value="">关联项目（全部）</option>
                <option value="yes">已关联</option>
                <option value="no">未关联</option>
              </select>
              <select
                value={draft.study_project_type}
                onChange={(e) => setDraft((current) => ({ ...current, study_project_type: e.target.value }))}
                className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm"
                aria-label="项目类型筛选"
              >
                <option value="">全部项目类型</option>
                {STUDY_PROJECT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleQuery}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700"
              >
                <Search className="h-4 w-4" />
                查询
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" />
                重置
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-amber-200 px-4 text-sm font-medium text-amber-800 hover:bg-amber-50"
              >
                <Plus className="h-4 w-4" />
                新建
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                导出
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {isLoading ? (
              <div className="p-10 text-center text-slate-400">加载中...</div>
            ) : items.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <Link2 className="mx-auto mb-2 h-10 w-10 opacity-40" />
                <p className="text-sm">暂无数据，请调整筛选或新建产品</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1440px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-2 py-2 text-left font-medium text-slate-600">序号</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">项目编号</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">项目名称</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">项目类型</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">样品编号</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">样品名称</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">样品数量</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">样品规格</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">是否关联项目</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">储存环境</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">生产日期</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">生产批号</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">有效期</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">入库状态</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-600">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row, index) => (
                      <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                        <td className="px-2 py-2 text-slate-600">{startIndex + index + 1}</td>
                        <td className="px-2 py-2 font-mono text-xs text-slate-700">{formatProjectNo(row)}</td>
                        <td className="max-w-[220px] truncate px-2 py-2 text-slate-800" title={row.protocol_name || ''}>
                          {row.protocol_name || '—'}
                        </td>
                        <td className="px-2 py-2 text-slate-700">{row.study_project_type_display || '—'}</td>
                        <td className="px-2 py-2 font-mono text-xs">{row.code}</td>
                        <td className="max-w-[180px] truncate px-2 py-2 text-slate-800" title={row.name}>
                          {row.name}
                        </td>
                        <td className="px-2 py-2">{row.sample_count ?? 0}</td>
                        <td className="px-2 py-2 text-slate-600">{row.specification || '—'}</td>
                        <td className="px-2 py-2">{row.protocol_id ? '是' : '否'}</td>
                        <td className="max-w-[140px] truncate px-2 py-2 text-slate-600" title={row.storage_condition || ''}>
                          {row.storage_condition || '—'}
                        </td>
                        <td className="px-2 py-2">{prodDate(row)}</td>
                        <td className="px-2 py-2 font-mono text-xs">{row.batch_number || '—'}</td>
                        <td className="px-2 py-2">{row.expiry_date || '—'}</td>
                        <td className="px-2 py-2">{formatInboundStatus(row)}</td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => setLinkRow(row)}
                            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-amber-200 px-3 text-xs font-medium text-amber-800 hover:bg-amber-50"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            关联受试者
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {total > 0 && (
            <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>共 {total} 条，每页 {PAGE_SIZE} 条</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 disabled:opacity-40 hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </button>
                <span className="px-2">{page} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 disabled:opacity-40 hover:bg-slate-50"
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </button>
                <label className="inline-flex items-center gap-2">
                  <span className="text-slate-500">跳转至</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={jumpInput}
                    onChange={(e) => setJumpInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && doJump()}
                    className="min-h-9 w-16 rounded-lg border border-slate-200 px-2 text-center"
                    aria-label="跳转页码"
                    placeholder="页码"
                  />
                  <span className="text-slate-500">页</span>
                  <button
                    type="button"
                    onClick={doJump}
                    className="min-h-9 rounded-lg border border-amber-200 px-3 text-sm text-amber-800 hover:bg-amber-50"
                  >
                    跳转
                  </button>
                </label>
              </div>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateProductModal
          variant="project"
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            queryClient.invalidateQueries({ queryKey: ['material'] })
            queryClient.invalidateQueries({ queryKey: ['material', 'project-sample-links'] })
            setPage(1)
          }}
        />
      )}

      {linkRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="link-subject-title"
        >
          <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <h3 id="link-subject-title" className="text-base font-semibold text-slate-800">
              关联受试者（小程序签收）
            </h3>
            <p className="text-sm text-slate-500">
              样品：{linkRow.code} {linkRow.name}
              <br />
              将为此手机号创建或匹配受试者，并生成一条「已发放」的分发单，与小程序「我的产品」同源。
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">手机号（11位）</label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="13800138000"
                value={linkPhone}
                onChange={(e) => setLinkPhone(e.target.value)}
                className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">姓名（选填）</label>
              <input
                type="text"
                placeholder="新建受试者时使用"
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setLinkRow(null)
                  setLinkPhone('')
                  setLinkName('')
                }}
                className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={linkMutation.isPending || linkPhone.replace(/\D/g, '').length !== 11}
                onClick={() =>
                  linkMutation.mutate({
                    productId: linkRow.id,
                    phone: linkPhone,
                    name: linkName,
                  })
                }
                className="min-h-10 rounded-lg bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {linkMutation.isPending ? '提交中…' : '确认关联'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
