/**
 * 工单物料领用 Tab — M4 跨工作台集成
 *
 * 在工单详情中展示耗材领用能力，连接度支·物料台
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import { Package, Plus } from 'lucide-react'

interface WorkOrderMaterialTabProps {
  workOrderId: number
  projectCode: string
}

export function WorkOrderMaterialTab({ workOrderId, projectCode }: WorkOrderMaterialTabProps) {
  const queryClient = useQueryClient()
  const [showIssueModal, setShowIssueModal] = useState(false)
  const [selectedConsumable, setSelectedConsumable] = useState<number | null>(null)
  const [issueQuantity, setIssueQuantity] = useState(1)

  const { data: consumablesData } = useQuery({
    queryKey: ['material', 'consumables', { project_code: projectCode }],
    queryFn: () => materialApi.listConsumables({ page_size: 100 }),
  })
  const consumables = (consumablesData as any)?.data?.items ?? []

  const issueMutation = useMutation({
    mutationFn: (data: { consumable_id: number; quantity: number }) =>
      materialApi.issueConsumable(data.consumable_id, {
        quantity: data.quantity,
        operator_name: '当前用户',
        purpose: `工单 #${workOrderId} 领用`,
        work_order_id: workOrderId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material'] })
      setShowIssueModal(false)
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Package className="w-4 h-4" />物料领用
        </h3>
        <button
          onClick={() => setShowIssueModal(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-3 h-3 inline mr-1" />领用耗材
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="text-left py-2">耗材名称</th>
            <th className="text-left py-2">类别</th>
            <th className="text-right py-2">库存</th>
            <th className="text-right py-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {consumables.map((item: any) => (
            <tr key={item.id} className="border-b border-slate-100">
              <td className="py-2">{item.name}</td>
              <td className="py-2 text-slate-500">{item.category}</td>
              <td className="py-2 text-right">{item.current_stock} {item.unit}</td>
              <td className="py-2 text-right">
                <button
                  onClick={() => { setSelectedConsumable(item.id); setShowIssueModal(true) }}
                  className="text-blue-600 hover:text-blue-800 text-xs"
                >
                  领用
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showIssueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">耗材领用</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-slate-600">耗材</label>
                <select
                  value={selectedConsumable ?? ''}
                  onChange={(e) => setSelectedConsumable(Number(e.target.value) || null)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">请选择</option>
                  {consumables.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name} (库存: {c.current_stock})</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="wo-material-quantity" className="text-sm text-slate-600">数量</label>
                <input
                  id="wo-material-quantity"
                  type="number"
                  min={1}
                  value={issueQuantity}
                  onChange={(e) => setIssueQuantity(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  aria-label="领用数量"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowIssueModal(false)} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg">取消</button>
              <button
                onClick={() => selectedConsumable && issueMutation.mutate({ consumable_id: selectedConsumable, quantity: issueQuantity })}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                disabled={!selectedConsumable || issueMutation.isPending}
              >
                确认领用
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
