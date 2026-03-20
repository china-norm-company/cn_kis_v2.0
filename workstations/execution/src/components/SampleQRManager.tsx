/**
 * 样品码管理组件（执行台版本）
 *
 * CRC 在工单执行中使用：
 * 1. 为受试者本次访视生成样品码
 * 2. 打印样品标签（管上贴码）
 * 3. 扫码确认样品已贴码（转运交接）
 */
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { qrcodeApi } from '@cn-kis/api-client'
import type { QRCodeRecord } from '@cn-kis/api-client'
import { TestTube, Printer, CheckCircle, AlertTriangle, Plus } from 'lucide-react'

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1'

function qrcodeImageUrl(qrData: string) {
  return `${API_BASE}/qrcode/image?data=${encodeURIComponent(qrData)}`
}

interface SampleQRManagerProps {
  subjectId: number
  workOrderId: number
  sampleIds?: number[]
}

export function SampleQRManager({ subjectId, workOrderId, sampleIds = [] }: SampleQRManagerProps) {
  const [scanInput, setScanInput] = useState('')
  const [verifyResult, setVerifyResult] = useState<'ok' | 'fail' | null>(null)
  const [verifyLabel, setVerifyLabel] = useState('')

  const { data: sampleQRRes, refetch } = useQuery({
    queryKey: ['sample-qrcodes', workOrderId],
    queryFn: () => qrcodeApi.list({ entity_type: 'sample', is_active: true }),
    enabled: sampleIds.length > 0,
  })
  const allSampleQRs: QRCodeRecord[] = ((sampleQRRes as any)?.data?.items ?? []).filter(
    (r: QRCodeRecord) => sampleIds.includes(r.entity_id),
  )

  const batchMutation = useMutation({
    mutationFn: () =>
      qrcodeApi.batchGenerate({ entity_type: 'sample', entity_ids: sampleIds }),
    onSuccess: () => refetch(),
  })

  const handlePrint = (qr: QRCodeRecord) => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html><head><title>样品码 - ${qr.label}</title>
      <style>
        body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: monospace; }
        img { width: 160px; height: 160px; }
        .label { margin: 8px 0 2px; font-size: 13px; font-weight: bold; }
        .sub { font-size: 11px; color: #666; }
      </style></head>
      <body onload="window.print()">
        <img src="${qrcodeImageUrl(qr.qr_data)}" />
        <div class="label">${qr.label}</div>
        <div class="sub">WO#${workOrderId} · 受试者#${subjectId}</div>
      </body></html>
    `)
    win.document.close()
  }

  const handleVerify = async () => {
    if (!scanInput.trim()) return
    setVerifyResult(null)
    try {
      const res = await qrcodeApi.resolve(scanInput.trim()) as any
      const data = res?.data as QRCodeRecord
      if (data && data.entity_type === 'sample' && sampleIds.includes(data.entity_id)) {
        setVerifyResult('ok')
        setVerifyLabel(data.label)
      } else {
        setVerifyResult('fail')
        setVerifyLabel('')
      }
    } catch {
      setVerifyResult('fail')
    }
    setScanInput('')
  }

  if (sampleIds.length === 0) return null

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TestTube className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-semibold text-slate-700">样品追踪码</span>
          <span className="text-xs text-slate-400">({sampleIds.length} 管)</span>
        </div>
        <div className="flex gap-2">
          {allSampleQRs.length < sampleIds.length && (
            <button
              onClick={() => batchMutation.mutate()}
              disabled={batchMutation.isPending}
              className="flex items-center gap-1 text-xs px-2.5 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" />
              生成码
            </button>
          )}
          {allSampleQRs.length > 0 && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1 text-xs px-2.5 py-1 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
            >
              <Printer className="w-3 h-3" />
              打印
            </button>
          )}
        </div>
      </div>

      {allSampleQRs.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {allSampleQRs.map((qr) => (
            <div key={qr.id} className="border border-slate-100 rounded-lg p-2 text-center">
              <img src={qrcodeImageUrl(qr.qr_data)} alt={qr.label} className="w-16 h-16 mx-auto" />
              <div className="text-xs text-slate-600 mt-1 truncate">{qr.label}</div>
              <button onClick={() => handlePrint(qr)} className="text-xs text-purple-600 mt-0.5">
                打印
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={scanInput}
          onChange={e => setScanInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleVerify()}
          placeholder="扫码枪扫描样品管，确认贴码正确..."
          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button
          onClick={handleVerify}
          disabled={!scanInput.trim()}
          className="px-3 py-2 bg-purple-600 text-white text-xs rounded-lg disabled:opacity-50"
        >
          验证
        </button>
      </div>

      {verifyResult === 'ok' && (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded px-3 py-2">
          <CheckCircle className="w-3.5 h-3.5" />
          {verifyLabel} 验证通过
        </div>
      )}
      {verifyResult === 'fail' && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 rounded px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          样品码不匹配，请检查
        </div>
      )}
    </div>
  )
}
