import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, Badge, DataTable, Empty, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { Package, Calendar } from 'lucide-react'

interface Client {
  id: number
  name: string
  [key: string]: unknown
}

interface ProductLine {
  id: number
  brand: string
  category: string
  sub_category: string
  price_tier: string
  annual_sku_count: number
  typical_claims: string[]
  [key: string]: unknown
}

interface InnovationItem {
  id: number
  year: number
  season: string
  product_concept: string
  innovation_type: string
  status: string
  our_opportunity: string
  [key: string]: unknown
}

const categoryMap: Record<string, string> = {
  skincare: '护肤',
  makeup: '彩妆',
  haircare: '护发',
  bodycare: '身体护理',
  suncare: '防晒',
  fragrance: '香水',
  oralcare: '口腔护理',
  babycare: '婴童护理',
}

const priceTierMap: Record<string, string> = {
  luxury: '奢侈',
  premium: '高端',
  mid: '中端',
  mass: '大众',
}

const innovationStatusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' }> = {
  intelligence: { label: '情报', variant: 'info' },
  confirmed: { label: '已确认', variant: 'primary' },
  engaged: { label: '已介入', variant: 'warning' },
  project_created: { label: '已立项', variant: 'success' },
}

export function ProductLinePage() {
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const [filterCategory, setFilterCategory] = useState('')

  const { data: clientsData } = useQuery({
    queryKey: ['crm', 'clients', 'list'],
    queryFn: () => api.get<{ items: Client[]; total: number }>('/crm/clients/list', { params: { page: 1, page_size: 200 } }),
  })

  const { data: productLinesData, isLoading: productLinesLoading } = useQuery({
    queryKey: ['crm', 'clients', selectedClientId, 'product-lines'],
    queryFn: () => api.get<{ items: ProductLine[] }>(`/crm/clients/${selectedClientId}/product-lines`),
    enabled: !!selectedClientId,
  })

  const { data: innovationData, isLoading: innovationLoading } = useQuery({
    queryKey: ['crm', 'clients', selectedClientId, 'innovation-calendar'],
    queryFn: () => api.get<{ items: InnovationItem[] }>(`/crm/clients/${selectedClientId}/innovation-calendar`),
    enabled: !!selectedClientId,
  })

  const clients = clientsData?.data?.items ?? []
  const productLines = productLinesData?.data?.items ?? []
  const innovationItems = innovationData?.data?.items ?? []

  const filteredProductLines = filterCategory
    ? productLines.filter((pl) => pl.category === filterCategory)
    : productLines

  const categories = Array.from(new Set(productLines.map((pl) => pl.category))).filter(Boolean)

  const columns: Column<ProductLine>[] = [
    { key: 'brand', title: '品牌', width: 120 },
    {
      key: 'category',
      title: '品类',
      width: 100,
      render: (val) => categoryMap[val as string] || String(val || '-'),
    },
    { key: 'sub_category', title: '子品类', width: 120, render: (val) => val ? String(val) : '-' },
    {
      key: 'price_tier',
      title: '价格带',
      width: 100,
      render: (val) => {
        const tier = val as string
        return tier ? priceTierMap[tier] || tier : '-'
      },
    },
    {
      key: 'annual_sku_count',
      title: '年SKU数',
      width: 100,
      align: 'center',
      render: (val) => val ? String(val) : '0',
    },
    {
      key: 'typical_claims',
      title: '典型宣称',
      render: (val) => {
        const claims = val as string[]
        if (!claims || claims.length === 0) return '-'
        return (
          <div className="flex flex-wrap gap-1">
            {claims.map((claim, idx) => (
              <Badge key={idx} variant="default" size="sm">
                {claim}
              </Badge>
            ))}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">产品线概览</h1>
      </div>

      <Card>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700 whitespace-nowrap">选择客户：</label>
            <select
              value={selectedClientId ?? ''}
              onChange={(e) => setSelectedClientId(e.target.value ? Number(e.target.value) : null)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm flex-1 max-w-xs"
              aria-label="选择客户"
            >
              <option value="">请选择客户</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>

            {selectedClientId && categories.length > 0 && (
              <>
                <label className="text-sm font-medium text-slate-700 whitespace-nowrap ml-4">品类筛选：</label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
                  aria-label="品类筛选"
                >
                  <option value="">全部品类</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {categoryMap[cat] || cat}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {selectedClientId ? (
            <>
              <div className="mt-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-slate-500" />
                  产品线列表
                </h2>
                {filteredProductLines.length > 0 ? (
                  <DataTable<ProductLine>
                    columns={columns}
                    data={filteredProductLines}
                    loading={productLinesLoading}
                    emptyText="暂无产品线数据"
                  />
                ) : (
                  <Empty message={productLinesLoading ? '加载中...' : '暂无产品线数据'} />
                )}
              </div>

              <div className="mt-8">
                <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-slate-500" />
                  创新日历
                </h2>
                {innovationItems.length > 0 ? (
                  <div className="relative ml-4">
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-slate-200" />
                    {innovationItems.map((item) => {
                      const statusInfo = innovationStatusMap[item.status] || { label: item.status, variant: 'default' as const }
                      return (
                        <div key={item.id} className="relative pl-6 pb-6">
                          <div className="absolute left-[-5px] w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                          <div className="bg-white rounded-lg border border-slate-200 p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-800">
                                  {item.year}年 {item.season || ''}
                                </span>
                                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <div className="text-sm text-slate-700">
                                <span className="font-medium">产品概念：</span>
                                {item.product_concept || '-'}
                              </div>
                              {item.innovation_type && (
                                <div className="text-sm text-slate-600">
                                  <span className="font-medium">创新类型：</span>
                                  {item.innovation_type}
                                </div>
                              )}
                              {item.our_opportunity && (
                                <div className="text-sm text-slate-600">
                                  <span className="font-medium">我们的机会：</span>
                                  {item.our_opportunity}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <Empty message={innovationLoading ? '加载中...' : '暂无创新日历数据'} />
                )}
              </div>
            </>
          ) : (
            <Empty
              title="请选择客户"
              description="请从下拉菜单中选择一个客户以查看其产品线和创新日历"
            />
          )}
        </div>
      </Card>
    </div>
  )
}
