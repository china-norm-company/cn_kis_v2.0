/**
 * 设备台 - 资产码扫码使用登记页
 *
 * 功能：
 * 1. 扫描设备上的资产码，查询设备信息（校准状态、维保状态）
 * 2. 一键开始使用登记（记录 who/when/which device）
 * 3. 结束使用，生成使用记录
 */
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qrcodeApi, equipmentApi } from '@cn-kis/api-client'
import type { QRCodeRecord } from '@cn-kis/api-client'
import { ScanLine, Cpu, CheckCircle, AlertTriangle, Play, Square } from 'lucide-react'

export function AssetScanUsagePage() {
  const queryClient = useQueryClient()
  const [scanInput, setScanInput] = useState('')
  const [assetInfo, setAssetInfo] = useState<QRCodeRecord | null>(null)
  const [scanError, setScanError] = useState('')
  const [activeUsageId, setActiveUsageId] = useState<number | null>(null)
  const [usageStarted, setUsageStarted] = useState(false)

  const handleScan = async (raw: string) => {
    if (!raw.trim()) return
    setScanError('')
    setAssetInfo(null)
    setUsageStarted(false)
    setActiveUsageId(null)
    try {
      const res = await qrcodeApi.smartResolve(raw.trim(), 'equipment') as any
      const data = res?.data
      if (!data) { setScanError('二维码无效'); return }

      const action = data.recommended_action
      if (action === 'asset_use') {
        setAssetInfo(data.entity)
      } else {
        setScanError(`该二维码不是资产码（类型：${data.entity?.entity_type ?? '未知'}）`)
      }
    } catch {
      setScanError('解析失败，请重试')
    }
    setScanInput('')
  }

  const startMutation = useMutation({
    mutationFn: (resourceItemId: number) =>
      equipmentApi.registerUsage({ equipment_id: resourceItemId, usage_type: 'manual' }),
    onSuccess: (res: any) => {
      setActiveUsageId(res?.data?.id ?? null)
      setUsageStarted(true)
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
    },
  })

  const endMutation = useMutation({
    mutationFn: (usageId: number) => equipmentApi.endUsage(usageId),
    onSuccess: () => {
      setUsageStarted(false)
      setActiveUsageId(null)
      setAssetInfo(null)
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
    },
  })

  const detail = assetInfo?.entity_detail as Record<string, unknown> | undefined
  const isCalibrationExpired =
    detail?.next_calibration_date &&
    new Date(detail.next_calibration_date as string) < new Date()

  return (
    <div className="space-y-5 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <ScanLine className="w-6 h-6 text-cyan-600" />
        <div>
          <h2 className="text-lg font-semibold text-slate-800">扫码使用登记</h2>
          <p className="text-sm text-slate-500">扫描设备上的资产二维码快速登记使用</p>
        </div>
      </div>

      {!usageStarted && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleScan(scanInput)}
              placeholder="扫码枪扫描设备上的资产码..."
              autoFocus
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <button
              onClick={() => handleScan(scanInput)}
              disabled={!scanInput.trim()}
              className="px-4 py-2 bg-cyan-600 text-white text-sm rounded-lg disabled:opacity-50"
            >
              查询
            </button>
          </div>

          {scanError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4" />{scanError}
            </div>
          )}

          {assetInfo && detail && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Cpu className="w-5 h-5 text-cyan-600" />
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    {detail.name as string}
                  </div>
                  <div className="text-xs text-slate-500">
                    {detail.code as string} · 状态：{detail.status as string}
                  </div>
                </div>
              </div>

              {isCalibrationExpired && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded p-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  校准已过期（{detail.next_calibration_date as string}），请联系设备管理员
                </div>
              )}

              {!isCalibrationExpired && (
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded p-2">
                  <CheckCircle className="w-3.5 h-3.5" />
                  校准有效期至：{detail.next_calibration_date as string || '未设置'}
                </div>
              )}

              <button
                onClick={() => startMutation.mutate(assetInfo.entity_id)}
                disabled={startMutation.isPending || !!isCalibrationExpired}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-cyan-600 text-white text-sm rounded-lg hover:bg-cyan-700 disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                {startMutation.isPending ? '登记中...' : '开始使用'}
              </button>
            </div>
          )}
        </div>
      )}

      {usageStarted && assetInfo && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-green-700 font-semibold">
            <CheckCircle className="w-5 h-5" />
            使用中：{assetInfo.label}
          </div>
          <p className="text-sm text-green-600">设备使用已登记，请在使用完成后点击结束</p>
          <button
            onClick={() => activeUsageId && endMutation.mutate(activeUsageId)}
            disabled={endMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <Square className="w-4 h-4" />
            {endMutation.isPending ? '结束中...' : '结束使用'}
          </button>
        </div>
      )}
    </div>
  )
}
