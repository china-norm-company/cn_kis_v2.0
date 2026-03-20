import { useNavigate } from 'react-router-dom'
import type { SmartResolveAction, SmartResolveResult } from '@cn-kis/api-client'
import { SmartQRScanner } from '../components/SmartQRScanner'
import { MaterialScanIssue } from '../components/MaterialScanIssue'
import { QrCode } from 'lucide-react'

export function ScanPage() {
  const navigate = useNavigate()

  const handleAction = (
    action: SmartResolveAction,
    data: Record<string, unknown>,
    _result: SmartResolveResult,
  ) => {
    if (action === 'jump_to_workorder' && data.work_order_id) {
      navigate(`/execute/${data.work_order_id}`)
    }
  }

  const handleAlternativeAction = (
    action: SmartResolveAction,
    data: Record<string, unknown>,
  ) => {
    if (action === 'record_ae' && data.subject_id) {
      navigate(`/ae/new?subject_id=${data.subject_id}`)
    } else if (action === 'show_profile' && data.subject_id) {
      navigate(`/subjects/${data.subject_id}`)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <QrCode className="w-12 h-12 text-indigo-500 mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-slate-800">扫码快捷执行</h2>
        <p className="text-sm text-slate-500 mt-1">扫描受试者二维码快速匹配工单</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <SmartQRScanner
          workstation="evaluator"
          onAction={handleAction}
          onAlternativeAction={handleAlternativeAction}
        />
      </div>

      {/* M4 跨工作台：扫码出库 */}
      <MaterialScanIssue />
    </div>
  )
}
