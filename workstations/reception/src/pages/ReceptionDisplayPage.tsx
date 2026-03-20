import { useEffect, useRef, useState } from 'react'
import { receptionApi, type DisplayBoard } from '@cn-kis/api-client'

/** 生成二维码图片 URL（使用后端 /qrcode/image 接口，避免配置第三方域名） */
function getQrcodeImageUrl(content: string): string {
  const base = (window as unknown as Record<string, string>).__API_BASE__ || '/api/v1'
  return `${base}/qrcode/image?data=${encodeURIComponent(content)}`
}

export default function ReceptionDisplayPage() {
  const [board, setBoard] = useState<DisplayBoard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const fetchBoard = async () => {
      try {
        const res = await receptionApi.displayBoard()
        if (res.code === 200 && res.data) {
          setBoard(res.data)
          setError(null)
          return
        }
        setError(res.msg || '获取大屏数据失败')
      } catch (e) {
        setError(e instanceof Error ? e.message : '网络异常，请稍后重试')
      }
    }
    fetchBoard()
    timerRef.current = setInterval(fetchBoard, 30000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  if (!board && error) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white p-8">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-2xl font-semibold">大屏加载失败</h2>
          <p className="text-slate-300 text-sm">{error}</p>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-white text-slate-900 text-sm font-medium hover:bg-slate-100"
            onClick={() => window.location.reload()}
          >
            刷新重试
          </button>
        </div>
      </div>
    )
  }

  if (!board) return <div className="flex items-center justify-center h-screen bg-slate-900 text-white text-2xl">加载中...</div>

  const qrcode = board.checkin_qrcode

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">CN KIS 接待大屏</h1>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6" data-section="stats">
        <div className="rounded-xl bg-emerald-500/20 p-4 text-center">
          <div className="text-4xl font-bold" data-stat="serving">{board.serving.length}</div>
          <div className="text-slate-300">正在服务</div>
        </div>
        <div className="rounded-xl bg-amber-500/20 p-4 text-center">
          <div className="text-4xl font-bold" data-stat="waiting">{board.waiting_total}</div>
          <div className="text-slate-300">等候中</div>
        </div>
        <div className="rounded-xl bg-blue-500/20 p-4 text-center">
          <div className="text-4xl font-bold" data-stat="completed">{board.completed_count}</div>
          <div className="text-slate-300">已完成</div>
        </div>
      </div>
      {/* 当日签到二维码区域 */}
      <div className="flex justify-center mt-8" data-section="checkin-qrcode">
        {qrcode ? (
          <div className="rounded-2xl bg-white p-6 flex flex-col items-center gap-3" data-testid="qrcode-area">
            <img
              src={getQrcodeImageUrl(qrcode.content)}
              alt="签到二维码"
              className="w-52 h-52 rounded-lg"
              data-testid="qrcode-image"
            />
            <p className="text-slate-800 text-lg font-semibold">{qrcode.station_label}</p>
            <p className="text-slate-500 text-sm">扫码签到 / 签出</p>
            <p className="text-slate-400 text-xs">本码当日有效（{qrcode.valid_date}）</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-700 p-8 text-center text-slate-400 text-sm" data-testid="qrcode-placeholder">
            <p>暂无签到二维码</p>
            <p className="mt-1 text-xs">请在接待台管理后台创建场所码后刷新</p>
          </div>
        )}
      </div>

      {/* 正在服务队列 */}
      {board.serving.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-3 text-emerald-400">正在服务</h2>
          <div className="flex flex-wrap gap-3">
            {board.serving.map((entry, idx) => (
              <div key={idx} className="rounded-xl bg-emerald-500/20 px-6 py-4 text-center min-w-32">
                <div className="text-2xl font-bold">{entry.subject_no_tail}</div>
                <div className="text-slate-300 text-sm">{entry.name_masked}</div>
                <div className="text-slate-400 text-xs mt-1">{entry.checkin_time}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 等候队列 */}
      {board.waiting.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-3 text-amber-400">等候中</h2>
          <div className="flex flex-wrap gap-3">
            {board.waiting.map((entry, idx) => (
              <div key={idx} className="rounded-xl bg-amber-500/10 px-4 py-3 text-center min-w-24">
                <div className="text-xl font-semibold">{entry.subject_no_tail}</div>
                <div className="text-slate-400 text-xs">{entry.checkin_time}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
