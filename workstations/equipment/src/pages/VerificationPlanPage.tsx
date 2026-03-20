import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { equipmentApi } from '@cn-kis/api-client'
import type { VerificationPlan, VerificationPlanListItem, VerificationRecord } from '@cn-kis/api-client'
import { CalendarClock, AlertTriangle, Plus, X, ChevronLeft, ChevronRight, Upload, ClipboardList, Download } from 'lucide-react'

const RESULT_STYLES: Record<string, string> = {
  pass: 'bg-green-50 text-green-700',
  fail: 'bg-red-50 text-red-600',
  conditional: 'bg-amber-50 text-amber-700',
}
const RESULT_LABELS: Record<string, string> = { pass: '通过', fail: '不通过', conditional: '有条件通过' }

export function VerificationPlanPage() {
  const queryClient = useQueryClient()
  const [equipmentFilter, setEquipmentFilter] = useState('')
  const [resultFilter, setResultFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [planKeyword, setPlanKeyword] = useState('')
  const [planPage, setPlanPage] = useState(1)

  const { data: planData } = useQuery({
    queryKey: ['equipment', 'verification-plan'],
    queryFn: () => equipmentApi.getVerificationPlan(),
  })

  const { data: planListData, isLoading: planListLoading, isError: planListError, error: planListErr } = useQuery({
    queryKey: ['equipment', 'verification-plan-list', { planKeyword, planPage }],
    queryFn: () => equipmentApi.listVerificationPlans({ keyword: planKeyword || undefined, page: planPage, page_size: 50 }),
  })

  const { data: listData, isLoading } = useQuery({
    queryKey: ['equipment', 'verifications', { equipmentFilter, resultFilter, page }],
    queryFn: () => equipmentApi.listVerifications({
      equipment_id: equipmentFilter ? Number(equipmentFilter) : undefined,
      result: resultFilter || undefined,
      page,
      page_size: 20,
    }),
  })

  const plan = (planData as any)?.data as VerificationPlan | undefined
  const planList = (planListData as any)?.data as { items: VerificationPlanListItem[]; total: number; page: number } | undefined
  const planItems = planList?.items ?? []
  const planTotalPages = Math.ceil((planList?.total ?? 0) / 50)
  const list = (listData as any)?.data as { items: VerificationRecord[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  const alerts = [
    { label: '已逾期', value: plan?.overdue?.count ?? '--', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: '7日内到期', value: plan?.due_in_7_days?.count ?? '--', icon: CalendarClock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: '本月待核查', value: plan?.due_this_month?.count ?? '--', icon: CalendarClock, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: '待办核查工单', value: plan?.pending_work_orders?.count ?? '--', icon: ClipboardList, color: 'text-cyan-600', bg: 'bg-cyan-50' },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">核查计划</h2>
          <p className="text-sm text-slate-500 mt-1">设备核查周期管理、到期提醒与核查记录</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 border border-cyan-600 text-cyan-600 rounded-lg text-sm font-medium hover:bg-cyan-50 transition-colors">
            <Upload className="w-4 h-4" />批量导入
          </button>
          <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 transition-colors">
            <Plus className="w-4 h-4" />新增核查
          </button>
        </div>
      </div>

      {/* 预警卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
        {alerts.map((a) => (
          <div key={a.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
            <div className={`p-2 rounded-lg ${a.bg} ${a.color}`}>
              <a.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm text-slate-500">{a.label}</p>
              <p className="text-xl font-bold text-slate-800">{a.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 已导入的核查计划列表 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h3 className="text-sm font-semibold text-slate-800 px-4 py-3 border-b border-slate-200">已导入的核查计划</h3>
        <div className="p-3 border-b border-slate-100">
          <input
            type="text"
            placeholder="搜索设备编号、名称、型号..."
            value={planKeyword}
            onChange={(e) => { setPlanKeyword(e.target.value); setPlanPage(1) }}
            className="w-full max-w-xs px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          />
        </div>
        {planListLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : planListError ? (
          <div className="p-8 text-center">
            <p className="text-sm text-red-600 mb-2">加载失败：{(planListErr as Error)?.message || '请检查网络或权限'}</p>
          </div>
        ) : planItems.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <CalendarClock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无核查计划，请先批量导入</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-3 py-2 font-medium text-slate-600">设备编号</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">设备名称</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">设备状态</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">设备规格/型号</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">出厂编号</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">核查周期(天)</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">上次核查时间</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">下次核查时间</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">核查提前提醒(天)</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">核查提醒人员</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">核查方法</th>
                </tr>
              </thead>
              <tbody>
                {planItems.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{p.code}</td>
                    <td className="px-3 py-2 text-slate-800">{p.name}</td>
                    <td className="px-3 py-2 text-slate-600">{p.status_display}</td>
                    <td className="px-3 py-2 text-slate-600">{p.model_number}</td>
                    <td className="px-3 py-2 text-slate-600">{p.serial_number}</td>
                    <td className="px-3 py-2 text-slate-600">{p.verification_cycle_days}</td>
                    <td className="px-3 py-2 text-slate-600">{p.last_verification_date}</td>
                    <td className="px-3 py-2 text-slate-700 font-medium">{p.next_verification_date}</td>
                    <td className="px-3 py-2 text-slate-600">{p.reminder_days}</td>
                    <td className="px-3 py-2 text-slate-600">{p.reminder_person}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate" title={p.verification_method}>{p.verification_method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {planTotalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100">
            <span className="text-sm text-slate-500">共 {planList?.total ?? 0} 条</span>
            <div className="flex gap-2">
              <button onClick={() => setPlanPage(p => Math.max(1, p - 1))} disabled={planPage === 1} className="p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm text-slate-600 px-2 flex items-center">{planPage} / {planTotalPages}</span>
              <button onClick={() => setPlanPage(p => Math.min(planTotalPages, p + 1))} disabled={planPage === planTotalPages} className="p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* 待办核查工单 */}
      {plan?.pending_work_orders && plan.pending_work_orders.count > 0 && (
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-cyan-800 mb-2">待办核查工单（下次到期日≤下月末，尚未发起）</h3>
          <p className="text-xs text-cyan-600 mb-3">每月初可收到：核查期剩余约1个月的设备需发起工单</p>
          <div className="space-y-2 mb-3">
            {plan.pending_work_orders.items.map((eq) => (
              <div key={eq.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{eq.name} <span className="text-slate-400 font-mono">({eq.code})</span></span>
                <span className="text-cyan-600 text-xs">到期日: {eq.next_verification_date}</span>
              </div>
            ))}
          </div>
          <PendingVerificationWorkOrdersActions
            items={plan.pending_work_orders.items}
            onSuccess={() => queryClient.invalidateQueries({ queryKey: ['equipment'] })}
          />
        </div>
      )}

      {/* 逾期设备列表 */}
      {plan?.overdue && plan.overdue.count > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-red-700 mb-2">逾期未核查设备（需立即处理）</h3>
          <div className="space-y-2">
            {plan.overdue.items.map((eq) => (
              <div key={eq.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{eq.name} <span className="text-slate-400 font-mono">({eq.code})</span></span>
                <span className="text-red-600 text-xs">到期日: {eq.next_verification_date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 筛选 */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <select value={resultFilter} onChange={e => { setResultFilter(e.target.value); setPage(1) }}
          aria-label="筛选核查结果"
          className="min-h-11 shrink-0 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500">
          <option value="">全部结果</option>
          <option value="pass">通过</option>
          <option value="fail">不通过</option>
          <option value="conditional">有条件通过</option>
        </select>
      </div>

      {/* 核查记录表格 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h3 className="text-sm font-semibold text-slate-800 px-4 py-3 border-b border-slate-200">核查记录</h3>
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <CalendarClock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无核查记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">设备</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">核查日期</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">下次到期</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">核查人</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">结果</th>
                </tr>
              </thead>
              <tbody>
                {items.map(c => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{c.equipment_name}</div>
                      <div className="text-xs text-slate-400 font-mono">{c.equipment_code}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.verification_date}</td>
                    <td className="px-4 py-3 text-slate-600">{c.next_due_date}</td>
                    <td className="px-4 py-3 text-slate-600">{c.verifier || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${RESULT_STYLES[c.result] || ''}`}>
                        {RESULT_LABELS[c.result] || c.result}
                      </span>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-slate-500">共 {list?.total ?? 0} 条记录</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} title="上一页" className="min-h-10 min-w-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm text-slate-600 px-3">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} title="下一页" className="min-h-10 min-w-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* 批量导入弹窗 */}
      {showImport && (
        <ImportVerificationPlanModal onClose={() => setShowImport(false)} onSuccess={() => {
          setShowImport(false)
          queryClient.invalidateQueries({ queryKey: ['equipment'] })
        }} />
      )}

      {/* 新增核查弹窗 */}
      {showCreate && <CreateVerificationModal onClose={() => setShowCreate(false)} onSuccess={() => {
        setShowCreate(false)
        queryClient.invalidateQueries({ queryKey: ['equipment'] })
      }} />}
    </div>
  )
}

function PendingVerificationWorkOrdersActions({ items, onSuccess }: { items: Array<{ id: number; name: string; code: string; next_verification_date: string }>; onSuccess: () => void }) {
  const [selected, setSelected] = useState<number[]>(items.map(i => i.id))
  const mutation = useMutation({
    mutationFn: () => equipmentApi.createVerificationWorkOrders(selected),
    onSuccess: () => onSuccess(),
    onError: (err: any) => alert(err?.message || '发起失败'),
  })
  const toggle = (id: number) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const toggleAll = () => setSelected(s => s.length === items.length ? [] : items.map(i => i.id))
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={selected.length === items.length} onChange={toggleAll} />
        <span>全选</span>
      </label>
      {items.map(eq => (
        <label key={eq.id} className="flex items-center gap-1 text-xs cursor-pointer">
          <input type="checkbox" checked={selected.includes(eq.id)} onChange={() => toggle(eq.id)} />
          <span>{eq.code}</span>
        </label>
      ))}
      <button
        onClick={() => mutation.mutate()}
        disabled={selected.length === 0 || mutation.isPending}
        className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50"
      >
        {mutation.isPending ? '发起中...' : `批量发起 ${selected.length} 个工单`}
      </button>
    </div>
  )
}

function ImportVerificationPlanModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<{ total: number; success: number; failed: number; errors: Array<{ row: number; code: string; message: string }> } | null>(null)

  const mutation = useMutation({
    mutationFn: (f: File) => equipmentApi.importVerificationPlan(f),
    onSuccess: (res: any) => {
      const data = res?.data ?? res
      setResult({
        total: data.total ?? 0,
        success: data.success ?? 0,
        failed: data.failed ?? 0,
        errors: data.errors ?? [],
      })
      if ((data.success ?? 0) > 0) {
        queryClient.invalidateQueries({ queryKey: ['equipment'] })
      }
    },
    onError: (err: any) => {
      setResult({ total: 0, success: 0, failed: 0, errors: [{ row: 0, code: '', message: err?.message || '导入失败' }] })
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[92vw] max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">批量导入核查计划</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          支持 .xlsx 格式。必填：设备编号、下次核查时间。请使用标准表头或下载模板填写。
        </p>
        <button
          type="button"
          onClick={async () => {
            try {
              await equipmentApi.downloadVerificationPlanTemplate()
            } catch (e: any) {
              alert(e?.message || '下载失败，请检查权限或网络')
            }
          }}
          className="inline-flex items-center gap-2 text-sm text-cyan-600 hover:text-cyan-700 mb-4"
        >
          <Download className="w-4 h-4" />下载导入模板
        </button>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">选择文件</span>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null) }}
              className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100" />
          </label>
          {result && (
            <div className="p-3 bg-slate-50 rounded-lg text-sm">
              <div className="font-medium text-slate-700 mb-2">导入结果</div>
              <div className="text-slate-600">共 {result.total} 条，成功 {result.success} 条，失败 {result.failed} 条</div>
              {result.errors.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto text-red-600 text-xs">
                  {result.errors.slice(0, 10).map((e, i) => <div key={i}>第{e.row}行 {e.code ? `[${e.code}] ` : ''}{e.message}</div>)}
                  {result.errors.length > 10 && <div>... 还有 {result.errors.length - 10} 条错误</div>}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">{result ? '关闭' : '取消'}</button>
          <button onClick={() => file && mutation.mutate(file)} disabled={!file || mutation.isPending}
            className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50">
            {mutation.isPending ? '导入中...' : '开始导入'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateVerificationModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    equipment_id: '', verification_date: '', next_due_date: '',
    verifier: '', result: 'pass', method_notes: '', notes: '',
  })
  const [error, setError] = useState('')

  const { data: eqData } = useQuery({
    queryKey: ['equipment', 'ledger', 'all'],
    queryFn: () => equipmentApi.listLedger({ page_size: 200 }),
  })
  const equipments = ((eqData as any)?.data?.items ?? []) as Array<{ id: number; name: string; code: string }>

  const mutation = useMutation({
    mutationFn: () => equipmentApi.createVerification({
      equipment_id: Number(form.equipment_id),
      verification_date: form.verification_date,
      next_due_date: form.next_due_date,
      verifier: form.verifier,
      result: form.result,
      method_notes: form.method_notes,
      notes: form.notes,
    }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '创建失败'),
  })

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[92vw] max-w-[500px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">新增核查记录</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">设备 *</span>
            <select title="选择设备" value={form.equipment_id} onChange={e => set('equipment_id', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
              <option value="">请选择设备</option>
              {equipments.map(e => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">核查日期 *</span>
              <input type="date" title="核查日期" value={form.verification_date} onChange={e => set('verification_date', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">下次到期日 *</span>
              <input type="date" title="下次到期日" value={form.next_due_date} onChange={e => set('next_due_date', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">核查人</span>
            <input title="核查人" value={form.verifier} onChange={e => set('verifier', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">结果</span>
            <select title="核查结果" value={form.result} onChange={e => set('result', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
              <option value="pass">通过</option>
              <option value="fail">不通过</option>
              <option value="conditional">有条件通过</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">方法说明</span>
            <input title="方法说明" value={form.method_notes} onChange={e => set('method_notes', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">备注</span>
            <textarea title="备注" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <div className="pt-2 flex gap-3">
            <button onClick={onClose} className="min-h-11 flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
            <button onClick={() => mutation.mutate()} disabled={!form.equipment_id || !form.verification_date || !form.next_due_date || mutation.isPending}
              className="min-h-11 flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50 transition-colors">
              {mutation.isPending ? '提交中...' : '提交'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
