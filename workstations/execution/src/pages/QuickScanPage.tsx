/**
 * 快捷扫码执行页面
 *
 * P2.5: 技术员扫受试者二维码 → smart-resolve → 自动跳转工单
 */
import { useNavigate } from 'react-router-dom'
import type { SmartResolveAction, SmartResolveResult } from '@cn-kis/api-client'
import SmartQRScanner from '../components/QRScanner'
import { QrCode } from 'lucide-react'

export default function QuickScanPage() {
  const navigate = useNavigate()

  const handleAction = (
    action: SmartResolveAction,
    data: Record<string, unknown>,
    _result: SmartResolveResult,
  ) => {
    if (action === 'jump_to_workorder' && data.work_order_id) {
      navigate(`/workorders/${data.work_order_id}`)
    } else if (action === 'show_workorder_list') {
      // 有多个工单时留在页面展示列表，SmartQRScanner 已渲染备选动作
    }
    // 其他动作（show_profile、record_ae 等）由 SmartQRScanner 展示备选按钮
  }

  const handleAlternativeAction = (
    action: SmartResolveAction,
    data: Record<string, unknown>,
  ) => {
    if (action === 'show_profile' && data.subject_id) {
      navigate(`/subjects/${data.subject_id}`)
    } else if (action === 'record_ae' && data.subject_id) {
      navigate(`/ae/new?subject_id=${data.subject_id}`)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <QrCode className="w-12 h-12 text-primary-500 mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-slate-800">扫码快捷执行</h2>
        <p className="text-sm text-slate-500 mt-1">扫描受试者二维码，自动匹配工单</p>
      </div>

      <SmartQRScanner
        workstation="execution"
        onAction={handleAction}
        onAlternativeAction={handleAlternativeAction}
      />
    </div>
  )
}
