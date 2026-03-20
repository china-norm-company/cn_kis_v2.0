/**
 * 协议关联样品概览 — M4 跨工作台集成
 *
 * 在研究台协议详情中展示关联样品统计与产品
 */
import { useQuery } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import { FlaskConical, Package } from 'lucide-react'

interface ProtocolSampleOverviewProps {
  protocolId: number
  projectCode: string
}

export function ProtocolSampleOverview({ protocolId, projectCode }: ProtocolSampleOverviewProps) {
  const { data: sampleData } = useQuery({
    queryKey: ['material', 'sample-stats', projectCode],
    queryFn: () => materialApi.getSampleStats(),
  })
  const stats = (sampleData as any)?.data

  const { data: productData } = useQuery({
    queryKey: ['material', 'products', projectCode],
    queryFn: () => materialApi.listProducts({ page_size: 50 }),
  })
  const products = (productData as any)?.data?.items ?? []

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <FlaskConical className="w-4 h-4" />关联样品概览
      </h3>

      {stats && (
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: '样品总数', value: stats.total, color: 'text-slate-800' },
            { label: '在库', value: stats.in_stock, color: 'text-green-600' },
            { label: '已分发', value: stats.distributed, color: 'text-blue-600' },
            { label: '已回收', value: stats.returned, color: 'text-amber-600' },
            { label: '已销毁', value: stats.destroyed, color: 'text-red-600' },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 rounded-lg p-3 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-slate-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {products.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
            <Package className="w-3 h-3" />关联产品
          </h4>
          <div className="space-y-1">
            {products.slice(0, 5).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-100">
                <span>{p.name}</span>
                <span className="text-slate-500">{p.batch_number || p.code || '-'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
