import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { equipmentApi } from '@cn-kis/api-client'
import type { EquipmentItem, EquipmentDetail } from '@cn-kis/api-client'
import { Monitor, Plus, Search, Filter, ChevronLeft, ChevronRight, X, Eye, Trash2 } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  idle: 'bg-slate-50 text-slate-600 border-slate-200',
  maintenance: 'bg-amber-50 text-amber-700 border-amber-200',
  calibrating: 'bg-blue-50 text-blue-700 border-blue-200',
  retired: 'bg-red-50 text-red-600 border-red-200',
  reserved: 'bg-purple-50 text-purple-700 border-purple-200',
}

const CAL_STATUS_STYLES: Record<string, string> = {
  valid: 'text-green-600 bg-green-50',
  expiring: 'text-amber-600 bg-amber-50',
  urgent: 'text-red-600 bg-red-50',
  overdue: 'text-white bg-red-600',
  unknown: 'text-slate-400 bg-slate-50',
}

function CalibrationBadge({ info }: { info: EquipmentItem['calibration_info'] }) {
  if (info.status === 'unknown') return <span className="text-xs text-slate-400">未校准</span>
  const style = CAL_STATUS_STYLES[info.status] || ''
  const label = info.status === 'overdue'
    ? `逾期 ${Math.abs(info.days_remaining ?? 0)} 天`
    : info.status === 'urgent'
      ? `${info.days_remaining} 天后到期`
      : info.status === 'expiring'
        ? `${info.days_remaining} 天后到期`
        : `${info.days_remaining} 天`
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style}`}>{label}</span>
}

function StatusBadge({ status, display }: { status: string; display: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[status] || 'bg-slate-50 text-slate-600'}`}>
      {display}
    </span>
  )
}

function fmtPlanDate(s: string | null | undefined) {
  if (!s) return '—'
  const t = String(s).slice(0, 10)
  return t || '—'
}

function fmtCycleDays(n: number | null | undefined) {
  if (n == null || n <= 0) return '—'
  return `${n} 天`
}

export function EquipmentLedgerPage() {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [calFilter, setCalFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)

  const { data: dashData } = useQuery({
    queryKey: ['equipment', 'dashboard'],
    queryFn: () => equipmentApi.dashboard(),
  })

  const { data: listData, isLoading } = useQuery({
    queryKey: ['equipment', 'ledger', { keyword, statusFilter, calFilter, page }],
    queryFn: () => equipmentApi.listLedger({
      keyword: keyword || undefined,
      status: statusFilter || undefined,
      calibration_status: calFilter || undefined,
      page,
      page_size: 20,
    }),
  })

  const db = (dashData as any)?.data as EquipmentDetail | undefined
  const summary = (db as any)?.summary
  const list = (listData as any)?.data as { items: EquipmentItem[]; total: number; page: number; page_size: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  const stats = [
    { label: '设备总数', value: summary?.total ?? '--', color: 'text-blue-700' },
    { label: '正常运行', value: summary?.active ?? '--', color: 'text-green-700' },
    { label: '校准到期', value: (dashData as any)?.data?.calibration_alerts?.due_in_30_days ?? '--', color: 'text-amber-700' },
    { label: '维修中', value: summary?.maintenance ?? '--', color: 'text-red-600' },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      {/* 标题 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">设备台账</h2>
          <p className="text-sm text-slate-500 mt-1">管理所有检测设备的完整生命周期信息</p>
        </div>
        <PermissionGuard permission="equipment.ledger.create">
          <button
            onClick={() => setShowCreate(true)}
            className="flex min-h-11 items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 transition-colors"
          >
            <Plus className="w-4 h-4" />新增设备
          </button>
        </PermissionGuard>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* 搜索与筛选 */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <div className="relative min-w-[220px] flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索设备名称、编号、型号..."
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          aria-label="设备状态筛选"
        >
          <option value="">全部状态</option>
          <option value="active">在用</option>
          <option value="idle">闲置</option>
          <option value="maintenance">维护中</option>
          <option value="calibrating">校准中</option>
          <option value="retired">已报废</option>
        </select>
        <select
          value={calFilter}
          onChange={(e) => { setCalFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          aria-label="校准状态筛选"
        >
          <option value="">校准状态</option>
          <option value="overdue">已逾期</option>
          <option value="expiring">30天内到期</option>
          <option value="valid">有效</option>
        </select>
      </div>

      {/* 设备表格 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Monitor className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无设备数据</p>
            <button onClick={() => setShowCreate(true)} className="mt-2 text-cyan-600 text-sm hover:underline">点击新增设备</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1520px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">设备编号</th>
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">名称</th>
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">名称分类</th>
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">类别</th>
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">状态</th>
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">位置</th>
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">下次校准</th>
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">下次核查</th>
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">下次维护</th>
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">校准周期</th>
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">核查周期</th>
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">维护周期</th>
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">校准</th>
                <th className="text-left px-3 py-3 font-medium text-slate-600 whitespace-nowrap">30天使用</th>
                <th className="text-right px-3 py-3 font-medium text-slate-600 whitespace-nowrap">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{item.code}</td>
                  <td className="px-3 py-3 min-w-[120px]">
                    <div className="font-medium text-slate-800">{item.name}</div>
                    {item.manufacturer && (
                      <div className="text-xs text-slate-400">{item.manufacturer} {item.model_number}</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-600 text-xs max-w-[140px]" title={item.name_classification || ''}>
                    {item.name_classification || '—'}
                  </td>
                  <td className="px-3 py-3 text-slate-600 text-xs whitespace-nowrap">{item.category_name || '—'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <StatusBadge status={item.status} display={item.status_display} />
                  </td>
                  <td className="px-3 py-3 text-slate-600 text-xs max-w-[100px]">{item.location || '—'}</td>
                  <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtPlanDate(item.next_calibration_date)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtPlanDate(item.next_verification_date)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtPlanDate(item.next_maintenance_date)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtCycleDays(item.calibration_cycle_days)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtCycleDays(item.verification_cycle_days)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{fmtCycleDays(item.maintenance_cycle_days)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <CalibrationBadge info={item.calibration_info} />
                  </td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{item.usage_count_30d} 次</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => setDetailId(item.id)}
                      className="p-1 text-slate-400 hover:text-cyan-600 transition-colors"
                      title="查看详情"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">共 {list?.total ?? 0} 条记录</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="上一页"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-600 px-3">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="下一页"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 新增设备抽屉 */}
      {showCreate && (
        <CreateEquipmentDrawer onClose={() => setShowCreate(false)} onSuccess={() => {
          setShowCreate(false)
          queryClient.invalidateQueries({ queryKey: ['equipment'] })
        }} />
      )}

      {/* 设备详情抽屉 */}
      {detailId && (
        <EquipmentDetailDrawer id={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  )
}


// ============================================================================
// 新增设备抽屉
// ============================================================================
function CreateEquipmentDrawer({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '', code: '', category_id: 0, location: '',
    manufacturer: '', model_number: '', serial_number: '',
    purchase_date: '', warranty_expiry: '', calibration_cycle_days: '',
  })
  const [error, setError] = useState('')

  const { data: catData } = useQuery({
    queryKey: ['resource', 'categories', 'equipment'],
    queryFn: () => import('@cn-kis/api-client').then(m => m.resourceApi.listCategories({ resource_type: 'equipment' })),
  })
  const categories = ((catData as any)?.data ?? []) as Array<{ id: number; name: string; code: string }>

  const mutation = useMutation({
    mutationFn: () => equipmentApi.createEquipment({
      ...form,
      category_id: form.category_id,
      calibration_cycle_days: form.calibration_cycle_days ? Number(form.calibration_cycle_days) : undefined,
      purchase_date: form.purchase_date || undefined,
      warranty_expiry: form.warranty_expiry || undefined,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '创建失败'),
  })

  const set = (key: string, val: string | number) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[480px] bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">新增设备</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">设备名称 *</span>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">设备编号 *</span>
            <input value={form.code} onChange={e => set('code', e.target.value)} placeholder="如 EQ-CORN-001"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">设备类别 *</span>
            <select value={form.category_id} onChange={e => set('category_id', Number(e.target.value))}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
              <option value={0}>请选择类别</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">制造商</span>
              <input value={form.manufacturer} onChange={e => set('manufacturer', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">型号</span>
              <input value={form.model_number} onChange={e => set('model_number', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">序列号</span>
            <input value={form.serial_number} onChange={e => set('serial_number', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">存放位置</span>
            <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="如 恒温恒湿室A"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">购入日期</span>
              <input type="date" value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">保修到期</span>
              <input type="date" value={form.warranty_expiry} onChange={e => set('warranty_expiry', e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">校准周期（天）</span>
            <input type="number" value={form.calibration_cycle_days} onChange={e => set('calibration_cycle_days', e.target.value)}
              placeholder="如 90"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <div className="pt-4 flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!form.name || !form.code || !form.category_id || mutation.isPending}
              className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '创建中...' : '创建设备'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ============================================================================
// 设备详情抽屉
// ============================================================================
function EquipmentDetailDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const [tab, setTab] = useState<'info' | 'calibration' | 'maintenance' | 'usage' | 'auth'>('info')

  const { data: detailData, isLoading } = useQuery({
    queryKey: ['equipment', 'detail', id],
    queryFn: () => equipmentApi.getLedgerDetail(id),
  })

  const detail = (detailData as any)?.data as EquipmentDetail | undefined

  const tabs = [
    { key: 'info', label: '基本信息' },
    { key: 'calibration', label: '校准历史' },
    { key: 'maintenance', label: '维护历史' },
    { key: 'usage', label: '使用记录' },
    { key: 'auth', label: '授权人员' },
  ] as const

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[92vw] max-w-[560px] bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">{detail?.name ?? '设备详情'}</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex gap-1">
            {tabs.map(t => (
              <button key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === t.key ? 'bg-cyan-50 text-cyan-700 font-medium' : 'text-slate-500 hover:text-slate-700'}`}
              >{t.label}</button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="text-center text-slate-400 py-8">加载中...</div>
          ) : !detail ? (
            <div className="text-center text-slate-400 py-8">设备不存在</div>
          ) : tab === 'info' ? (
            <div className="space-y-4">
              <InfoRow label="设备编号" value={detail.code} />
              <InfoRow label="名称分类" value={detail.name_classification || '—'} />
              <InfoRow label="类别路径" value={detail.category_path} />
              <InfoRow label="状态" value={detail.status_display} />
              <InfoRow label="存放位置" value={detail.location || '-'} />
              <InfoRow label="制造商" value={detail.manufacturer || '-'} />
              <InfoRow label="型号" value={detail.model_number || '-'} />
              <InfoRow label="序列号" value={detail.serial_number || '-'} />
              <InfoRow label="购入日期" value={detail.purchase_date || '-'} />
              <InfoRow label="保修到期" value={detail.warranty_expiry || '-'} />
              <InfoRow label="下次校准" value={fmtPlanDate(detail.next_calibration_date)} />
              <InfoRow label="下次核查" value={fmtPlanDate(detail.next_verification_date)} />
              <InfoRow label="下次维护" value={fmtPlanDate(detail.next_maintenance_date)} />
              <InfoRow label="校准周期" value={detail.calibration_cycle_days ? `${detail.calibration_cycle_days} 天` : '-'} />
              <InfoRow label="核查周期" value={detail.verification_cycle_days ? `${detail.verification_cycle_days} 天` : '-'} />
              <InfoRow label="维护周期" value={detail.maintenance_cycle_days ? `${detail.maintenance_cycle_days} 天` : '-'} />
              <InfoRow label="校准状态" value={
                detail.calibration_info.status === 'overdue' ? '❌ 已逾期' :
                detail.calibration_info.status === 'urgent' ? `⚠️ ${detail.calibration_info.days_remaining}天后到期` :
                detail.calibration_info.status === 'valid' ? `✅ 有效 (${detail.calibration_info.days_remaining}天)` :
                '未校准'
              } />
            </div>
          ) : tab === 'calibration' ? (
            <div className="space-y-3">
              {(detail.recent_calibrations ?? []).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无校准记录</p>
              ) : (detail.recent_calibrations as any[]).map((c: any, i: number) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{c.calibration_date}</span>
                    <span className={c.result === 'pass' ? 'text-green-600' : c.result === 'fail' ? 'text-red-600' : 'text-amber-600'}>
                      {c.result === 'pass' ? '通过' : c.result === 'fail' ? '不通过' : '有条件通过'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {c.calibrator && <span>校准人: {c.calibrator} | </span>}
                    下次到期: {c.next_due_date}
                    {c.certificate_no && <span> | 证书: {c.certificate_no}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : tab === 'maintenance' ? (
            <div className="space-y-3">
              {(detail.recent_maintenances ?? []).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无维护记录</p>
              ) : (detail.recent_maintenances as any[]).map((m: any, i: number) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{m.title || m.description?.substring(0, 30)}</span>
                    <StatusBadge status={m.status} display={m.status === 'pending' ? '待处理' : m.status === 'in_progress' ? '处理中' : m.status === 'completed' ? '已完成' : '已取消'} />
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{m.maintenance_date} | {m.maintenance_type === 'preventive' ? '预防性' : m.maintenance_type === 'corrective' ? '纠正性' : '紧急'}</div>
                </div>
              ))}
            </div>
          ) : tab === 'usage' ? (
            <div className="space-y-3">
              {(detail.recent_usages ?? []).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无使用记录</p>
              ) : (detail.recent_usages as any[]).map((u: any, i: number) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg flex justify-between">
                  <div>
                    <div className="text-sm font-medium">{u.operator_name || `操作员#${u.operator_id}`}</div>
                    <div className="text-xs text-slate-500">{u.usage_date} | {u.duration_minutes ? `${u.duration_minutes}分钟` : '进行中'}</div>
                  </div>
                  <span className="text-xs text-slate-400">{u.usage_type === 'workorder' ? '工单' : u.usage_type === 'manual' ? '手动' : '培训'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {(detail.authorizations ?? []).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无授权人员</p>
              ) : (detail.authorizations as any[]).map((a: any, i: number) => (
                <div key={i} className="p-3 bg-slate-50 rounded-lg flex justify-between items-center">
                  <div>
                    <div className="text-sm font-medium">{a.operator_name || `人员#${a.operator_id}`}</div>
                    <div className="text-xs text-slate-500">授权日期: {a.authorized_at}{a.expires_at ? ` | 到期: ${a.expires_at}` : ''}</div>
                  </div>
                  <span className="text-xs text-green-600">有效</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-sm text-slate-500 w-24 shrink-0">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  )
}
