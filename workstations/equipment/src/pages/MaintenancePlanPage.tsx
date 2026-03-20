import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { equipmentApi } from '@cn-kis/api-client'
import type { MaintenancePlan, MaintenancePlanListItem, MaintenanceOrder } from '@cn-kis/api-client'
import { CalendarClock, AlertTriangle, X, ChevronLeft, ChevronRight, Upload, ClipboardList, Download } from 'lucide-react'

export function MaintenancePlanPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [showImport, setShowImport] = useState(false)
  const [planKeyword, setPlanKeyword] = useState('')
  const [planPage, setPlanPage] = useState(1)
  const [recordsPage, setRecordsPage] = useState(1)

  const { data: planData } = useQuery({
    queryKey: ['equipment', 'maintenance-plan'],
    queryFn: () => equipmentApi.getMaintenancePlan(),
  })

  const { data: planListData, isLoading: planListLoading, isError: planListError, error: planListErr } = useQuery({
    queryKey: ['equipment', 'maintenance-plan-list', { planKeyword, planPage }],
    queryFn: () => equipmentApi.listMaintenancePlans({ keyword: planKeyword || undefined, page: planPage, page_size: 50 }),
  })

  const { data: recordsData, isLoading: recordsLoading } = useQuery({
    queryKey: ['equipment', 'maintenance-records-preventive', { recordsPage }],
    queryFn: () => equipmentApi.listMaintenance({
      maintenance_type: 'preventive',
      status: 'completed',
      page: recordsPage,
      page_size: 20,
    }),
  })

  const plan = (planData as any)?.data as MaintenancePlan | undefined
  const planList = (planListData as any)?.data as { items: MaintenancePlanListItem[]; total: number; page: number } | undefined
  const planItems = planList?.items ?? []
  const planTotalPages = Math.ceil((planList?.total ?? 0) / 50)
  const recordsList = (recordsData as any)?.data as { items: MaintenanceOrder[]; total: number } | undefined
  const recordsItems = recordsList?.items ?? []
  const recordsTotalPages = Math.ceil((recordsList?.total ?? 0) / 20)

  const alerts = [
    { label: '已逾期', value: plan?.overdue?.count ?? '--', icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: '7日内到期', value: plan?.due_in_7_days?.count ?? '--', icon: CalendarClock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: '本月待维护', value: plan?.due_this_month?.count ?? '--', icon: CalendarClock, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: '待办维护工单', value: plan?.pending_work_orders?.count ?? '--', icon: ClipboardList, color: 'text-cyan-600', bg: 'bg-cyan-50' },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">维护计划</h2>
          <p className="text-sm text-slate-500 mt-1">设备维护周期管理、到期提醒与预防性维护记录</p>
        </div>
        <button onClick={() => setShowImport(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 border border-cyan-600 text-cyan-600 rounded-lg text-sm font-medium hover:bg-cyan-50 transition-colors">
          <Upload className="w-4 h-4" />批量导入
        </button>
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

      {/* 已导入的维护计划列表 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h3 className="text-sm font-semibold text-slate-800 px-4 py-3 border-b border-slate-200">已导入的维护计划</h3>
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
            <p className="text-sm">暂无维护计划，请先批量导入</p>
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
                  <th className="text-left px-3 py-2 font-medium text-slate-600">维护周期(天)</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">上次维护时间</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">下次维护时间</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">维护提前提醒(天)</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">维护提醒人员</th>
                  <th className="text-left px-3 py-2 font-medium text-slate-600">维护方法</th>
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
                    <td className="px-3 py-2 text-slate-600">{p.maintenance_cycle_days}</td>
                    <td className="px-3 py-2 text-slate-600">{p.last_maintenance_date}</td>
                    <td className="px-3 py-2 text-slate-700 font-medium">{p.next_maintenance_date}</td>
                    <td className="px-3 py-2 text-slate-600">{p.reminder_days}</td>
                    <td className="px-3 py-2 text-slate-600">{p.reminder_person}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate" title={p.maintenance_method}>{p.maintenance_method}</td>
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

      {/* 待办维护工单 */}
      {plan?.pending_work_orders && plan.pending_work_orders.count > 0 && (
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-cyan-800 mb-2">待办维护工单（下次到期日≤下月末，尚未发起）</h3>
          <p className="text-xs text-cyan-600 mb-3">每月初可收到：维护期剩余约1个月的设备需发起工单，完成工单后自动生成维护记录</p>
          <div className="space-y-2 mb-3">
            {plan.pending_work_orders.items.map((eq) => (
              <div key={eq.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{eq.name} <span className="text-slate-400 font-mono">({eq.code})</span></span>
                <span className="text-cyan-600 text-xs">到期日: {eq.next_maintenance_date}</span>
              </div>
            ))}
          </div>
          <PendingMaintenanceWorkOrdersActions
            items={plan.pending_work_orders.items}
            onSuccess={() => queryClient.invalidateQueries({ queryKey: ['equipment'] })}
          />
        </div>
      )}

      {/* 逾期设备列表 */}
      {plan?.overdue && plan.overdue.count > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-red-700 mb-2">逾期未维护设备（需立即处理）</h3>
          <div className="space-y-2">
            {plan.overdue.items.map((eq) => (
              <div key={eq.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{eq.name} <span className="text-slate-400 font-mono">({eq.code})</span></span>
                <span className="text-red-600 text-xs">到期日: {eq.next_maintenance_date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 预防性维护记录（由完成工单自动生成） */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <h3 className="text-sm font-semibold text-slate-800 px-4 py-3 border-b border-slate-200">预防性维护记录</h3>
        <p className="text-xs text-slate-500 px-4 py-2 border-b border-slate-100">维护记录在完成预防性维护工单时自动生成，请前往「维护工单」页面处理</p>
        {recordsLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : recordsItems.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <CalendarClock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无预防性维护记录</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">设备</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">维护日期</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">下次维护</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">维护人</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">结果</th>
                </tr>
              </thead>
              <tbody>
                {recordsItems.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{m.equipment_name}</div>
                      <div className="text-xs text-slate-400 font-mono">{m.equipment_code}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{m.maintenance_date}</td>
                    <td className="px-4 py-3 text-slate-600">{m.next_maintenance_date || '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{m.performed_by || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={m.result_notes}>{m.result_notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 分页 */}
      {recordsTotalPages > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-slate-500">共 {recordsList?.total ?? 0} 条记录</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setRecordsPage(p => Math.max(1, p - 1))} disabled={recordsPage === 1} title="上一页" className="min-h-10 min-w-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm text-slate-600 px-3">{recordsPage} / {recordsTotalPages}</span>
            <button onClick={() => setRecordsPage(p => Math.min(recordsTotalPages, p + 1))} disabled={recordsPage === recordsTotalPages} title="下一页" className="min-h-10 min-w-10 p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* 批量导入弹窗 */}
      {showImport && (
        <ImportMaintenancePlanModal onClose={() => setShowImport(false)} onSuccess={() => {
          setShowImport(false)
          queryClient.invalidateQueries({ queryKey: ['equipment'] })
        }} />
      )}
    </div>
  )
}

function PendingMaintenanceWorkOrdersActions({ items, onSuccess }: { items: Array<{ id: number; name: string; code: string; next_maintenance_date: string }>; onSuccess: () => void }) {
  const [selected, setSelected] = useState<number[]>(items.map(i => i.id))
  const mutation = useMutation({
    mutationFn: () => equipmentApi.createMaintenanceWorkOrders(selected),
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

function ImportMaintenancePlanModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<{ total: number; success: number; failed: number; errors: Array<{ row: number; code: string; message: string }> } | null>(null)

  const mutation = useMutation({
    mutationFn: (f: File) => equipmentApi.importMaintenancePlan(f),
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
          <h3 className="text-lg font-semibold">批量导入维护计划</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          支持 .xlsx 格式。必填：设备编号、下次维护时间。请使用标准表头或下载模板填写。
        </p>
        <button
          type="button"
          onClick={async () => {
            try {
              await equipmentApi.downloadMaintenancePlanTemplate()
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
