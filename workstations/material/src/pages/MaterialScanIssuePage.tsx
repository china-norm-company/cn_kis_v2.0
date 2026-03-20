/**
 * 物料台 - 扫码出库页
 *
 * 支持：
 * 1. 扫描资产码（二维码）→ smart-resolve → 资产使用/出库
 * 2. 扫描耗材条形码 → 直接出库
 * 3. 批量扫码出库
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi, qrcodeApi } from '@cn-kis/api-client'
import { ScanLine, Package, CheckCircle, AlertTriangle, List } from 'lucide-react'

interface IssueRecord {
  barcode: string
  name: string
  quantity: number
  success: boolean
  message: string
}

export function MaterialScanIssuePage() {
  const queryClient = useQueryClient()
  const [scanInput, setScanInput] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [records, setRecords] = useState<IssueRecord[]>([])
  const [lastResult, setLastResult] = useState<{ success: boolean; message: string } | null>(null)

  const issueMutation = useMutation({
    mutationFn: async (data: { input: string; quantity: number }) => {
      const raw = data.input.trim()

      // 尝试作为 QR 二维码解析（资产码）
      if (raw.includes('/qr/') || /^[a-f0-9]{8,16}$/.test(raw)) {
        const match = raw.match(/\/qr\/([a-f0-9]{8,})/)
        const hash = match ? match[1] : raw
        try {
          const qrRes = await qrcodeApi.smartResolve(hash, 'material') as any
          const qrData = qrRes?.data
          if (qrData?.recommended_action === 'material_issue') {
            const assetId = qrData.action_data?.asset_id
            return { type: 'asset', label: qrData.entity?.label ?? raw, assetId }
          }
        } catch { /* 非二维码，继续尝试条形码 */ }
      }

      // 作为耗材条形码查找
      const listRes = await materialApi.listConsumables({ keyword: raw, page_size: 10 })
      const items = (listRes as any)?.data?.items ?? []
      const match = items.find(
        (c: any) => c.code === raw || c.barcode === raw || String(c.id) === raw,
      )
      if (!match) {
        throw new Error(`未找到耗材「${raw}」，请检查条码`)
      }
      await materialApi.issueConsumable(match.id, {
        quantity: data.quantity,
        operator_name: '物料人员',
        purpose: `扫码出库: ${raw}`,
      })
      return { type: 'consumable', label: match.name || raw }
    },
    onSuccess: (res: any) => {
      const label = res?.label ?? scanInput
      const record: IssueRecord = {
        barcode: scanInput,
        name: label,
        quantity,
        success: true,
        message: '出库成功',
      }
      setRecords(prev => [record, ...prev])
      setLastResult({ success: true, message: `「${label}」出库成功` })
      queryClient.invalidateQueries({ queryKey: ['material'] })
      setScanInput('')
      setQuantity(1)
    },
    onError: (err: Error) => {
      const record: IssueRecord = {
        barcode: scanInput,
        name: scanInput,
        quantity,
        success: false,
        message: err?.message || '出库失败',
      }
      setRecords(prev => [record, ...prev])
      setLastResult({ success: false, message: err?.message || '出库失败' })
      setScanInput('')
    },
  })

  const handleIssue = () => {
    if (!scanInput.trim()) return
    setLastResult(null)
    issueMutation.mutate({ input: scanInput, quantity })
  }

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <ScanLine className="w-6 h-6 text-emerald-600" />
        <div>
          <h2 className="text-lg font-semibold text-slate-800">扫码出库</h2>
          <p className="text-sm text-slate-500">支持资产二维码和耗材条形码</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">扫描或输入条码/二维码</label>
            <input
              type="text"
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleIssue()}
              placeholder="扫码枪扫描，或手动输入..."
              autoFocus
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-500 shrink-0">出库数量</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={e => setQuantity(Math.max(1, Number(e.target.value)))}
              aria-label="出库数量"
              placeholder="1"
              className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <button
          onClick={handleIssue}
          disabled={!scanInput.trim() || issueMutation.isPending}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"
        >
          <Package className="w-4 h-4" />
          {issueMutation.isPending ? '处理中...' : '确认出库'}
        </button>

        {lastResult && (
          <div
            className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              lastResult.success
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {lastResult.success
              ? <CheckCircle className="w-4 h-4 shrink-0" />
              : <AlertTriangle className="w-4 h-4 shrink-0" />}
            {lastResult.message}
          </div>
        )}
      </div>

      {records.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <List className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">
              本次出库记录 ({records.length} 条)
            </span>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {records.map((r, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-2.5 rounded-lg text-xs ${
                  r.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {r.success
                    ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                  <span className="font-medium">{r.name}</span>
                  <span className="text-xs opacity-70">×{r.quantity}</span>
                </div>
                <span className="opacity-70">{r.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
