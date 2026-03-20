/**
 * 接待台 - 场所码管理页面
 *
 * 功能：
 * 1. 查看所有已生成的场所码
 * 2. 生成新场所码（指定工位ID和名称）
 * 3. 预览二维码图片（可打印/下载）
 * 4. 一键打印
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qrcodeApi } from '@cn-kis/api-client'
import type { QRCodeRecord } from '@cn-kis/api-client'
import { MapPin, Plus, Printer, RefreshCw, QrCode } from 'lucide-react'

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1'

function qrcodeImageUrl(qrData: string) {
  return `${API_BASE}/qrcode/image?data=${encodeURIComponent(qrData)}`
}

export default function StationQRPage() {
  const queryClient = useQueryClient()
  const [newStationId, setNewStationId] = useState('')
  const [newStationLabel, setNewStationLabel] = useState('')
  const [showForm, setShowForm] = useState(false)

  const { data: stationsRes, isLoading } = useQuery({
    queryKey: ['station-qrcodes'],
    queryFn: () => qrcodeApi.listStations(),
  })
  const stations: QRCodeRecord[] = (stationsRes as any)?.data ?? []

  const generateMutation = useMutation({
    mutationFn: () =>
      qrcodeApi.generateStation(Number(newStationId), newStationLabel.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['station-qrcodes'] })
      setNewStationId('')
      setNewStationLabel('')
      setShowForm(false)
    },
  })

  const handlePrintAll = () => {
    window.print()
  }

  const handlePrintSingle = (qrData: string, label: string) => {
    const win = window.open('', '_blank')
    if (!win) return
    const imgUrl = qrcodeImageUrl(qrData)
    win.document.write(`
      <!DOCTYPE html><html><head><title>场所码 - ${label}</title>
      <style>
        body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; }
        img { width: 280px; height: 280px; }
        h2 { margin: 16px 0 4px; font-size: 20px; }
        p { margin: 0; color: #666; font-size: 14px; }
      </style></head>
      <body onload="window.print()">
        <img src="${imgUrl}" alt="${label}" />
        <h2>${label}</h2>
        <p>扫码签到</p>
      </body></html>
    `)
    win.document.close()
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-slate-800">场所码管理</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePrintAll}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            <Printer className="w-4 h-4" />
            全部打印
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            新建场所码
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <strong>使用说明：</strong>场所码打印后张贴在接待台、等候区、评估室等位置。受试者用微信小程序扫描后自动完成签到，无需工作人员操作。
      </div>

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">新建场所码</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">工位编号</label>
              <input
                type="number"
                value={newStationId}
                onChange={e => setNewStationId(e.target.value)}
                placeholder="如：1、2、3"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">场所名称</label>
              <input
                type="text"
                value={newStationLabel}
                onChange={e => setNewStationLabel(e.target.value)}
                placeholder="如：接待台·1号窗口"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
            >
              取消
            </button>
            <button
              onClick={() => generateMutation.mutate()}
              disabled={!newStationId || !newStationLabel.trim() || generateMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {generateMutation.isPending ? '生成中...' : '生成场所码'}
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
          <span className="ml-2 text-sm text-slate-500">加载中...</span>
        </div>
      )}

      {!isLoading && stations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <QrCode className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm">尚未生成任何场所码</p>
          <p className="text-slate-400 text-xs mt-1">点击「新建场所码」为接待台生成签到二维码</p>
        </div>
      )}

      {/* 场所码网格 - print 友好 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 print:grid-cols-3">
        {stations.map(station => (
          <div
            key={station.id}
            className="bg-white border border-slate-200 rounded-xl p-5 text-center space-y-3 print:border-black print:rounded-none"
          >
            <img
              src={qrcodeImageUrl(station.qr_data)}
              alt={station.label}
              className="w-36 h-36 mx-auto"
            />
            <div>
              <div className="text-sm font-semibold text-slate-800">{station.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">扫码签到</div>
            </div>
            <button
              onClick={() => handlePrintSingle(station.qr_data, station.label)}
              className="flex items-center gap-1 mx-auto text-xs text-blue-600 hover:text-blue-700 print:hidden"
            >
              <Printer className="w-3 h-3" />
              单独打印
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
