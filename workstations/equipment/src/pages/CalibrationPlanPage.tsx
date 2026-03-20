import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { equipmentApi } from '@cn-kis/api-client'
import type { CalibrationPlan, EquipmentCalibrationRecord as CalibrationRecord } from '@cn-kis/api-client'
import { CalendarClock, AlertTriangle, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

const RESULT_STYLES: Record<string, string> = {
  pass: 'bg-green-50 text-green-700',
  fail: 'bg-red-50 text-red-600',
  conditional: 'bg-amber-50 text-amber-700',
}
const RESULT_LABELS: Record<string, string> = { pass: '通过', fail: '不通过', conditional: '有条件通过' }

export function CalibrationPlanPage() {
  const queryClient = useQueryClient()
  const [equipmentFilter, setEquipmentFilter] = useState('')
  const [resultFilter, setResultFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)

  const { data: planData } = useQuery({
    queryKey: ['equipment', 'calibration-plan'],
    queryFn: () => equipmentApi.getCalibrationPlan(),
  })

  const { data: listData, isLoading } = useQuery({
    queryKey: ['equipment', 'calibrations', { equipmentFilter, resultFilter, page }],
    queryFn: () => equipmentApi.listCalibrations({
      equipment_id: equipmentFilter ? Number(equipmentFilter) : undefined,
      result: resultFilter || undefined,
      page,
      page_size: 20,
    }),
  })

  const plan = (planData as any)?.data as CalibrationPlan | undefined
  const list = (listData as any)?.data as { items: CalibrationRecord[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  const alerts = [
    { label: '已逾期', value: plan?.overdue?.count ?? '--', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: '7日内到期', value: plan?.due_in_7_days?.count ?? '--', icon: CalendarClock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: '本月待校准', value: plan?.due_this_month?.count ?? '--', icon: CalendarClock, color: 'text-blue-600', bg: 'bg-blue-50' },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">校准计划</h2>
          <p className="text-sm text-slate-500 mt-1">设备校准周期管理、到期提醒与校准记录</p>
        </div>
        <PermissionGuard permission="equipment.calibration.create">
          <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 transition-colors">
            <Plus className="w-4 h-4" />新增校准
          </button>
        </PermissionGuard>
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

      {/* 逾期设备列表 */}
      {plan?.overdue && plan.overdue.count > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-red-700 mb-2">逾期未校准设备（需立即处理）</h3>
          <div className="space-y-2">
            {plan.overdue.items.map((eq) => (
              <div key={eq.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{eq.name} <span className="text-slate-400 font-mono">({eq.code})</span></span>
                <span className="text-red-600 text-xs">到期日: {eq.next_calibration_date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 筛选 */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <select value={resultFilter} onChange={e => { setResultFilter(e.target.value); setPage(1) }}
          aria-label="筛选校准结果"
          className="min-h-11 shrink-0 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500">
          <option value="">全部结果</option>
          <option value="pass">通过</option>
          <option value="fail">不通过</option>
          <option value="conditional">有条件通过</option>
        </select>
      </div>

      {/* 校准记录表格 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <CalendarClock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无校准记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">设备</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">类型</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">校准日期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">下次到期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">校准人/机构</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">证书号</th>
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
                  <td className="px-4 py-3 text-slate-600">{c.calibration_type === 'internal' ? '内部' : '外部'}</td>
                  <td className="px-4 py-3 text-slate-600">{c.calibration_date}</td>
                  <td className="px-4 py-3 text-slate-600">{c.next_due_date}</td>
                  <td className="px-4 py-3 text-slate-600">{c.calibrator || '-'}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{c.certificate_no || '-'}</td>
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

      {/* 新增校准弹窗 */}
      {showCreate && <CreateCalibrationModal onClose={() => setShowCreate(false)} onSuccess={() => {
        setShowCreate(false)
        queryClient.invalidateQueries({ queryKey: ['equipment'] })
      }} />}
    </div>
  )
}

function CreateCalibrationModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    equipment_id: '', calibration_date: '', next_due_date: '',
    calibration_type: 'internal', calibrator: '', certificate_no: '', result: 'pass', notes: '',
  })
  const [error, setError] = useState('')

  const { data: eqData } = useQuery({
    queryKey: ['equipment', 'ledger', 'all'],
    queryFn: () => equipmentApi.listLedger({ page_size: 200 }),
  })
  const equipments = ((eqData as any)?.data?.items ?? []) as Array<{ id: number; name: string; code: string }>

  const mutation = useMutation({
    mutationFn: () => equipmentApi.createCalibration({
      equipment_id: Number(form.equipment_id),
      calibration_date: form.calibration_date,
      next_due_date: form.next_due_date,
      calibration_type: form.calibration_type,
      calibrator: form.calibrator,
      certificate_no: form.certificate_no,
      result: form.result,
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
          <h3 className="text-lg font-semibold">新增校准记录</h3>
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
              <span className="text-sm font-medium text-slate-700">校准日期 *</span>
              <input type="date" title="校准日期" value={form.calibration_date} onChange={e => set('calibration_date', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">下次到期日 *</span>
              <input type="date" title="下次到期日" value={form.next_due_date} onChange={e => set('next_due_date', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">校准类型</span>
              <select title="校准类型" value={form.calibration_type} onChange={e => set('calibration_type', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
                <option value="internal">内部校准</option>
                <option value="external">外部校准</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">结果</span>
              <select title="校准结果" value={form.result} onChange={e => set('result', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none">
                <option value="pass">通过</option>
                <option value="fail">不通过</option>
                <option value="conditional">有条件通过</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">校准人/机构</span>
            <input title="校准人或机构" value={form.calibrator} onChange={e => set('calibrator', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">证书编号</span>
            <input title="证书编号" value={form.certificate_no} onChange={e => set('certificate_no', e.target.value)} className="mt-1 min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">备注</span>
            <textarea title="备注" value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
          </label>

          <div className="pt-2 flex gap-3">
            <button onClick={onClose} className="min-h-11 flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">取消</button>
            <button onClick={() => mutation.mutate()} disabled={!form.equipment_id || !form.calibration_date || !form.next_due_date || mutation.isPending}
              className="min-h-11 flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50 transition-colors">
              {mutation.isPending ? '提交中...' : '提交'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
