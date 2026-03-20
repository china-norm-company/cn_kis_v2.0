import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { InventoryItem, InventoryCheck, StorageZoneOverview } from '@cn-kis/api-client'
import { Warehouse, ChevronLeft, ChevronRight, ClipboardCheck, Thermometer, Droplets, BarChart3 } from 'lucide-react'

const ZONE_CONFIG: Record<string, { label: string; temp: string; color: string; bgCard: string; borderCard: string; textCard: string }> = {
  cold_storage: { label: '冷藏区', temp: '2-8°C', color: 'cyan', bgCard: 'bg-cyan-50', borderCard: 'border-cyan-200', textCard: 'text-cyan-700' },
  cool_storage: { label: '阴凉区', temp: '≤20°C', color: 'blue', bgCard: 'bg-blue-50', borderCard: 'border-blue-200', textCard: 'text-blue-700' },
  room_storage: { label: '常温区', temp: '10-30°C', color: 'amber', bgCard: 'bg-amber-50', borderCard: 'border-amber-200', textCard: 'text-amber-700' },
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  normal: { label: '正常', className: 'bg-green-50 text-green-700 border-green-200' },
  low_stock: { label: '库存不足', className: 'bg-red-50 text-red-600 border-red-200' },
  locked: { label: '已锁定', className: 'bg-slate-50 text-slate-500 border-slate-200' },
}

export function InventoryPage() {
  const queryClient = useQueryClient()
  const [zoneFilter, setZoneFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  // Zone overview
  const { data: overviewData } = useQuery({
    queryKey: ['material', 'inventory-overview'],
    queryFn: () => materialApi.getInventoryOverview(),
  })
  const overview = (overviewData as any)?.data as {
    cold_storage: StorageZoneOverview
    cool_storage: StorageZoneOverview
    room_storage: StorageZoneOverview
  } | undefined

  // Inventory list
  const { data: listData, isLoading } = useQuery({
    queryKey: ['material', 'inventory', { zoneFilter, statusFilter, page }],
    queryFn: () => materialApi.listInventory({
      zone: zoneFilter || undefined,
      status: statusFilter || undefined,
      page,
      page_size: 20,
    }),
  })
  const list = (listData as any)?.data as { items: InventoryItem[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  // Last check result
  const { data: checkData } = useQuery({
    queryKey: ['material', 'inventory-check'],
    queryFn: () => materialApi.getInventoryCheck(),
  })
  const lastCheck = (checkData as any)?.data as InventoryCheck | undefined

  // Start check mutation
  const startCheckMut = useMutation({
    mutationFn: () => materialApi.startInventoryCheck(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['material'] }),
  })

  const zoneEntries = overview ? [
    { key: 'cold_storage', data: overview.cold_storage },
    { key: 'cool_storage', data: overview.cool_storage },
    { key: 'room_storage', data: overview.room_storage },
  ] : []

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">库存管理</h2>
          <p className="text-sm text-slate-500 mt-1">实时库存数量、盘点记录与库位管理</p>
        </div>
        <button
          onClick={() => startCheckMut.mutate()}
          disabled={startCheckMut.isPending}
          className="flex min-h-11 items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          <ClipboardCheck className="w-4 h-4" />
          {startCheckMut.isPending ? '发起中...' : '发起盘点'}
        </button>
      </div>

      {/* Zone overview cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 md:gap-4">
        {zoneEntries.map(({ key, data }) => {
          const cfg = ZONE_CONFIG[key]
          return (
            <div key={key} className={`rounded-xl border p-5 ${cfg.bgCard} ${cfg.borderCard}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-base font-semibold ${cfg.textCard}`}>{cfg.label}</h3>
                <span className={`text-xs ${cfg.textCard} opacity-70`}>{cfg.temp}</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 flex items-center gap-1">
                    <BarChart3 className="w-3.5 h-3.5" />物料数
                  </span>
                  <span className={`font-bold ${cfg.textCard}`}>{data.item_count}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 flex items-center gap-1">
                    <Thermometer className="w-3.5 h-3.5" />温度
                  </span>
                  <span className="text-slate-800">{data.temperature}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 flex items-center gap-1">
                    <Droplets className="w-3.5 h-3.5" />湿度
                  </span>
                  <span className="text-slate-800">{data.humidity}</span>
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>容量使用</span>
                    <span>{data.capacity_usage}</span>
                  </div>
                  <div className="w-full bg-white/60 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${key === 'cold_storage' ? 'bg-cyan-500' : key === 'cool_storage' ? 'bg-blue-500' : 'bg-amber-500'}`}
                      style={{ width: data.capacity_usage }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <select
          value={zoneFilter}
          onChange={(e) => { setZoneFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="温区筛选"
        >
          <option value="">全部温区</option>
          <option value="cold_storage">冷藏区</option>
          <option value="cool_storage">阴凉区</option>
          <option value="room_storage">常温区</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="shrink-0 min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="库存状态筛选"
        >
          <option value="">全部状态</option>
          <option value="normal">正常</option>
          <option value="low_stock">库存不足</option>
          <option value="locked">已锁定</option>
        </select>
      </div>

      {/* Inventory table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Warehouse className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无库存数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">物料名称</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">编码</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">批号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">库位</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">温区</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">数量</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const statusCfg = STATUS_STYLES[item.status]
                const zoneKeyMap: Record<string, string> = { cold: 'cold_storage', cool: 'cool_storage', room: 'room_storage' }
                const zoneCfg = ZONE_CONFIG[zoneKeyMap[item.zone] || item.zone]
                return (
                  <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{item.material_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.material_code}</td>
                    <td className="px-4 py-3 text-slate-600">{item.batch_number}</td>
                    <td className="px-4 py-3 text-slate-600">{item.location}</td>
                    <td className="px-4 py-3">
                      {zoneCfg ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${zoneCfg.bgCard} ${zoneCfg.textCard}`}>
                          {zoneCfg.label}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">{item.zone}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">
                      {item.quantity} <span className="text-slate-400 font-normal">{item.unit}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusCfg?.className || 'bg-slate-50 text-slate-600'}`}>
                        {statusCfg?.label || item.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Pagination */}
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

      {/* Last check result */}
      {lastCheck && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-amber-600" />
            最近盘点结果
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <div>
              <p className="text-xs text-slate-500">盘点日期</p>
              <p className="text-sm font-medium text-slate-800 mt-0.5">{lastCheck.check_date}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">盘点人</p>
              <p className="text-sm font-medium text-slate-800 mt-0.5">{lastCheck.checker}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">盘点品项</p>
              <p className="text-sm font-medium text-slate-800 mt-0.5">{lastCheck.total_items}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">一致 / 差异</p>
              <p className="text-sm font-medium mt-0.5">
                <span className="text-green-600">{lastCheck.matched_items}</span>
                {' / '}
                <span className={lastCheck.discrepancy_items > 0 ? 'text-red-600 font-bold' : 'text-slate-600'}>
                  {lastCheck.discrepancy_items}
                </span>
              </p>
            </div>
          </div>

          {lastCheck.discrepancy_items > 0 && lastCheck.discrepancies.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-red-600 mb-2">差异明细</h4>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-red-50">
                    <th className="text-left px-3 py-2 font-medium text-slate-600">物料名称</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">系统数量</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">实际数量</th>
                    <th className="text-right px-3 py-2 font-medium text-slate-600">差异</th>
                    <th className="text-left px-3 py-2 font-medium text-slate-600">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {lastCheck.discrepancies.map((d, idx) => (
                    <tr key={idx} className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-800">{d.material_name}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{d.expected}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{d.actual}</td>
                      <td className={`px-3 py-2 text-right font-bold ${d.difference < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                        {d.difference > 0 ? '+' : ''}{d.difference}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{d.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
