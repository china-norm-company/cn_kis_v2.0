/**
 * 快捷扫码执行页面
 *
 * P2.5: 技术员扫受试者二维码 → 系统查找今日关联工单 → 直接进入 eCRF 填写
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { QRCodeRecord } from '@cn-kis/api-client'
import QRScanner from '../components/QRScanner'
import { Badge } from '@cn-kis/ui-kit'
import { QrCode, ArrowRight, AlertTriangle, User, FileText } from 'lucide-react'

export default function QuickScanPage() {
  const navigate = useNavigate()
  const [scanResult, setScanResult] = useState<QRCodeRecord | null>(null)
  const [mismatchWarn, setMismatchWarn] = useState(false)

  const handleResolved = (record: QRCodeRecord) => {
    setScanResult(record)
    setMismatchWarn(false)

    // 如果是受试者且只有一个今日工单，直接跳转
    if (
      record.entity_type === 'subject' &&
      record.today_work_orders?.length === 1
    ) {
      navigate(`/workorders/${record.today_work_orders[0].id}`)
    }
  }

  const todayWOs = scanResult?.today_work_orders || []
  const entityDetail = scanResult?.entity_detail as Record<string, unknown> | undefined

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <QrCode className="w-12 h-12 text-primary-500 mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-slate-800">扫码快捷执行</h2>
        <p className="text-sm text-slate-500 mt-1">
          扫描受试者二维码，快速进入工单和 eCRF 填写
        </p>
      </div>

      {/* 扫码区 */}
      <QRScanner onResolved={handleResolved} />

      {/* 受试者信息 */}
      {scanResult && entityDetail && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <User className="w-5 h-5 text-primary-500" />
            <div>
              <div className="text-sm font-medium text-slate-800">
                {entityDetail.name as string}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                {typeof entityDetail.gender === 'string' && <span>{entityDetail.gender}</span>}
                {typeof entityDetail.skin_type === 'string' && <span>皮肤: {entityDetail.skin_type}</span>}
              </div>
            </div>
            {entityDetail.risk_level === 'high' && (
              <Badge variant="error">高风险</Badge>
            )}
          </div>
        </div>
      )}

      {/* 今日工单列表 */}
      {scanResult && todayWOs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            今日关联工单 ({todayWOs.length})
          </h3>
          <div className="space-y-2">
            {todayWOs.map((wo) => (
              <button
                key={wo.id}
                onClick={() => navigate(`/workorders/${wo.id}`)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-primary-50 hover:border-primary-200 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <div>
                    <div className="text-sm font-medium text-slate-800">
                      WO#{wo.id}: {wo.title}
                    </div>
                    <div className="text-xs text-slate-400">{wo.status}</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 无工单提示 */}
      {scanResult && todayWOs.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
          <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-amber-700">该受试者今日暂无排程工单</p>
        </div>
      )}

      {/* 防串号警告 */}
      {mismatchWarn && (
        <div className="fixed inset-0 bg-red-600/90 flex items-center justify-center z-50">
          <div className="text-center text-white p-8">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">受试者不匹配！</h2>
            <p className="text-lg">扫码的受试者与当前工单关联的受试者不一致</p>
            <button
              onClick={() => setMismatchWarn(false)}
              className="mt-6 px-6 py-3 bg-white text-red-600 rounded-lg font-medium"
            >
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
