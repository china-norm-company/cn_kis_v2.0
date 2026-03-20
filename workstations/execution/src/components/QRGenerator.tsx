/**
 * 二维码生成组件
 *
 * 调用后端生成 API，展示二维码图片（使用 QR Code API 渲染）
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { qrcodeApi } from '@cn-kis/api-client'
import type { QRCodeRecord } from '@cn-kis/api-client'
import { QrCode, Download, Copy, CheckCircle } from 'lucide-react'

interface QRGeneratorProps {
  entityType: 'subject' | 'sample' | 'equipment' | 'workorder'
  entityId: number
  label?: string
  className?: string
}

export default function QRGenerator({ entityType, entityId, label, className = '' }: QRGeneratorProps) {
  const [record, setRecord] = useState<QRCodeRecord | null>(null)
  const [copied, setCopied] = useState(false)

  const generateMutation = useMutation({
    mutationFn: () => qrcodeApi.generate({ entity_type: entityType, entity_id: entityId }),
    onSuccess: (res) => {
      setRecord(res.data as QRCodeRecord)
    },
  })

  const qrImageUrl = record?.qr_data
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&ecc=H&data=${encodeURIComponent(record.qr_data)}`
    : null

  const handleCopy = () => {
    if (record?.qr_data) {
      navigator.clipboard.writeText(record.qr_data)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    if (qrImageUrl) {
      const link = document.createElement('a')
      link.href = qrImageUrl
      link.download = `qr-${entityType}-${entityId}.png`
      link.click()
    }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {!record ? (
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          <QrCode className="w-4 h-4" />
          {generateMutation.isPending ? '生成中...' : '生成二维码'}
        </button>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
          {qrImageUrl && (
            <img
              src={qrImageUrl}
              alt={`QR Code: ${record.label}`}
              className="w-40 h-40 mx-auto mb-3"
            />
          )}
          <div className="text-sm font-medium text-slate-700">{record.label || label}</div>
          <div className="text-xs text-slate-400 mt-1">{record.entity_type} #{record.entity_id}</div>
          <div className="flex items-center justify-center gap-2 mt-3">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-1 text-xs text-slate-600 bg-slate-100 rounded hover:bg-slate-200"
            >
              {copied ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              {copied ? '已复制' : '复制链接'}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-3 py-1 text-xs text-slate-600 bg-slate-100 rounded hover:bg-slate-200"
            >
              <Download className="w-3 h-3" />
              下载
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
