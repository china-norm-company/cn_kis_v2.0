/**
 * 扫码出库组件 — M4 跨工作台集成
 *
 * 评估台扫码页集成，通过条码扫描快速出库耗材
 * 注：后端需支持通过条码解析 consumable_id，或提供 /material/consumables/issue-by-barcode 接口
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import { ScanLine, Package, CheckCircle, AlertTriangle } from 'lucide-react'

interface MaterialScanIssueProps {
  onComplete?: () => void
}

export function MaterialScanIssue({ onComplete }: MaterialScanIssueProps) {
  const queryClient = useQueryClient()
  const [barcode, setBarcode] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const issueMutation = useMutation({
    mutationFn: async (data: { barcode: string; quantity: number }) => {
      // 尝试通过条码查找耗材：先列出耗材，按 code 匹配
      const listRes = await materialApi.listConsumables({ keyword: data.barcode, page_size: 10 })
      const items = (listRes as any)?.data?.items ?? []
      const match = items.find((c: any) => c.code === data.barcode || String(c.id) === data.barcode)
      if (!match) {
        throw new Error('未找到匹配的耗材，请检查条码')
      }
      return materialApi.issueConsumable(match.id, {
        quantity: data.quantity,
        operator_name: '评估人员',
        purpose: `扫码出库: ${data.barcode}`,
      })
    },
    onSuccess: () => {
      setResult({ success: true, message: '出库成功' })
      queryClient.invalidateQueries({ queryKey: ['material'] })
      setBarcode('')
      setQuantity(1)
      onComplete?.()
    },
    onError: (err: Error) => {
      setResult({ success: false, message: err?.message || '出库失败，请检查条码或库存' })
    },
  })

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <ScanLine className="w-4 h-4" />扫码出库
      </h3>

      <div className="space-y-3">
        <div>
          <label htmlFor="material-scan-barcode" className="text-sm text-slate-600">耗材条码</label>
          <input
            id="material-scan-barcode"
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="扫描或输入条码"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            autoFocus
            aria-label="耗材条码"
          />
        </div>
        <div>
          <label htmlFor="material-scan-quantity" className="text-sm text-slate-600">出库数量</label>
          <input
            id="material-scan-quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            aria-label="出库数量"
          />
        </div>
      </div>

      <button
        onClick={() => barcode && issueMutation.mutate({ barcode, quantity })}
        disabled={!barcode || issueMutation.isPending}
        className="w-full px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Package className="w-4 h-4" />确认出库
      </button>

      {result && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result.success ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {result.message}
        </div>
      )}
    </div>
  )
}
