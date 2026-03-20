import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, StatCard, Badge, ClawQuickPanel, useClawQuickActions, DigitalWorkerSuggestionBar } from '@cn-kis/ui-kit'
import type { QuickAction } from '@cn-kis/ui-kit'
import { materialApi, clawRegistryApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import type { ExpiryAlertItem, ProductItem, ConsumableItem } from '@cn-kis/api-client'
import { Package, AlertTriangle, CalendarClock, ArrowRightLeft, Clock } from 'lucide-react'

const clawFetcher = (key: string) => clawRegistryApi.getByWorkstation(key)

export function DashboardPage() {
  const claw = useClawQuickActions('material', clawFetcher)
  const handleClawAction = useCallback((a: QuickAction) => {
    const params = new URLSearchParams({
      skill: a.skill,
      ...(a.script && { script: a.script }),
      action: a.id,
    })
    window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}`), '_blank')
  }, [])

  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ['material', 'dashboard'],
    queryFn: () => materialApi.dashboard(),
  })

  const { data: productStatsData } = useQuery({
    queryKey: ['material', 'product-stats'],
    queryFn: () => materialApi.getProductStats(),
  })

  const { data: expiryData } = useQuery({
    queryKey: ['material', 'expiry-alerts'],
    queryFn: () => materialApi.getExpiryAlerts(),
  })

  const { data: txStatsData } = useQuery({
    queryKey: ['material', 'transaction-stats'],
    queryFn: () => materialApi.getTransactionStats(),
  })

  const { data: productsData } = useQuery({
    queryKey: ['material', 'products', 'expiring'],
    queryFn: () =>
      materialApi.listProducts({
        expiry_status: 'expiring',
        page: 1,
        page_size: 20,
      }),
  })

  const { data: consumablesData } = useQuery({
    queryKey: ['material', 'consumables', 'low-stock'],
    queryFn: () => materialApi.listConsumables({ page: 1, page_size: 50 }),
  })

  const { data: consumableStatsData } = useQuery({
    queryKey: ['material', 'consumable-stats'],
    queryFn: () => materialApi.getConsumableStats(),
  })

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'material'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('material'),
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []

  const dash = dashData?.data
  const productStats = productStatsData?.data ?? dash?.products
  const consumableStats = consumableStatsData?.data ?? dash?.consumables ?? {}
  const expiryAlerts = expiryData?.data
  const txStats = txStatsData?.data ?? dash?.transactions

  const productTypes =
    ((productStats as { total_products?: number })?.total_products ?? 0) +
    ((consumableStats as { total_types?: number })?.total_types ?? 0)
  const inventoryAlert =
    (consumableStats as { low_stock_count?: number })?.low_stock_count ?? 0
  const expiryAlertCount =
    (expiryAlerts as { stats?: { red_count?: number; orange_count?: number; yellow_count?: number } })?.stats
      ? (expiryAlerts.stats.red_count ?? 0) +
        (expiryAlerts.stats.orange_count ?? 0) +
        (expiryAlerts.stats.yellow_count ?? 0)
      : (productStats as { expiring_soon?: number; expired?: number })?.expiring_soon ?? 0
  const recentTx =
    (txStats as { today_inbound?: number; today_outbound?: number })?.today_inbound ?? 0 +
    ((txStats as { today_outbound?: number })?.today_outbound ?? 0)

  const expiryList: Array<{ name: string; expiry_date: string; days_remaining: number }> = []
  if (expiryAlerts) {
    const alerts = expiryAlerts as { red?: ExpiryAlertItem[]; orange?: ExpiryAlertItem[]; yellow?: ExpiryAlertItem[] }
    ;[...(alerts.red ?? []), ...(alerts.orange ?? []), ...(alerts.yellow ?? [])]
      .slice(0, 15)
      .forEach((a) => {
        expiryList.push({
          name: a.material_name ?? '-',
          expiry_date: a.expiry_date ?? '-',
          days_remaining: a.days_remaining ?? 0,
        })
      })
  }
  if (expiryList.length === 0 && productsData?.data?.items) {
    const items = (productsData.data as { items?: ProductItem[] }).items ?? []
    items
      .filter((p) => p.expiry_date)
      .sort(
        (a, b) =>
          new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime(),
      )
      .slice(0, 10)
      .forEach((p) => {
        const d = new Date(p.expiry_date!)
        const days = Math.floor((d.getTime() - Date.now()) / 86400000)
        expiryList.push({
          name: p.name ?? '-',
          expiry_date: p.expiry_date ?? '-',
          days_remaining: days,
        })
      })
  }

  const lowStockList: Array<{ name: string; current_stock: number; min_stock: number }> =
    []
  const consumables = (consumablesData?.data as { items?: ConsumableItem[] })?.items ?? []
  consumables
    .filter((c) => c.current_stock <= (c.safety_stock ?? 0))
    .slice(0, 10)
    .forEach((c) => {
      lowStockList.push({
        name: c.name ?? '-',
        current_stock: c.current_stock ?? 0,
        min_stock: c.safety_stock ?? 0,
      })
    })

  if (dashLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Clock className="w-5 h-5 animate-spin mr-2" /> 正在加载仪表盘...
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-lg font-bold text-slate-800 md:text-2xl">物料管理概览</h1>
      <DigitalWorkerSuggestionBar items={suggestions} loading={suggestionsLoading} />
      <ClawQuickPanel workstationKey="material" actions={claw.actions} loading={claw.loading} error={claw.error} onAction={handleClawAction} compact />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="物料种类"
          value={productTypes}
          icon={<Package className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="库存预警"
          value={inventoryAlert}
          icon={<AlertTriangle className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          title="效期预警"
          value={expiryAlertCount}
          icon={<CalendarClock className="w-6 h-6" />}
          color="red"
        />
        <StatCard
          title="近期出入库"
          value={recentTx}
          icon={<ArrowRightLeft className="w-6 h-6" />}
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 md:gap-6">
        <Card>
          <div className="p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              效期预警列表
            </h2>
            {expiryList.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                暂无效期预警
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {expiryList.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50"
                  >
                    <span className="font-medium text-slate-700 truncate flex-1 mr-2">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-3 text-sm shrink-0">
                      <span className="text-slate-500">{item.expiry_date}</span>
                      <Badge
                        variant={
                          item.days_remaining < 0
                            ? 'error'
                            : item.days_remaining <= 30
                              ? 'warning'
                              : 'success'
                        }
                      >
                        {item.days_remaining < 0
                          ? `已过期 ${Math.abs(item.days_remaining)} 天`
                          : `剩余 ${item.days_remaining} 天`}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              低库存预警
            </h2>
            {lowStockList.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                暂无低库存预警
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {lowStockList.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50"
                  >
                    <span className="font-medium text-slate-700 truncate flex-1 mr-2">
                      {item.name}
                    </span>
                    <div className="flex items-center gap-3 text-sm shrink-0">
                      <span className="text-slate-600">
                        当前: {item.current_stock}
                      </span>
                      <span className="text-amber-600">
                        最低: {item.min_stock}
                      </span>
                      <Badge variant="warning" size="sm">
                        库存不足
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
