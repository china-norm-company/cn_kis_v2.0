import { useState, useEffect, useRef } from 'react'
import { receptionApi, type DisplayBoard } from '@cn-kis/api-client'

export default function ReceptionDisplayPage() {
  const [board, setBoard] = useState<DisplayBoard | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchBoard = async () => {
    try {
      const res = await receptionApi.displayBoard()
      if (res.code === 200 && res.data) {
        setBoard(res.data)
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchBoard()
    timerRef.current = setInterval(fetchBoard, 30000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  if (!board) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900 text-white text-2xl">
        加载中...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">CN KIS 受试者服务中心</h1>
          <div className="text-lg text-slate-300">
            {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            <span className="ml-4">{new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-white/10 backdrop-blur rounded-2xl p-6 text-center">
            <div className="text-5xl font-bold text-green-400">{board.serving.length}</div>
            <div className="text-slate-300 mt-2">正在服务</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-2xl p-6 text-center">
            <div className="text-5xl font-bold text-yellow-400">{board.waiting_total}</div>
            <div className="text-slate-300 mt-2">等候中</div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-2xl p-6 text-center">
            <div className="text-5xl font-bold text-blue-400">{board.completed_count}</div>
            <div className="text-slate-300 mt-2">已完成</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8">
          {/* 正在服务 */}
          <div className="bg-white/5 backdrop-blur rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
              正在服务
            </h2>
            {board.serving.length > 0 ? (
              <div className="space-y-3">
                {board.serving.map((entry, i) => (
                  <div key={i} className="flex items-center justify-between bg-green-500/20 rounded-xl px-6 py-4">
                    <div>
                      <span className="text-2xl font-bold text-green-300">
                        ***{entry.subject_no_tail}
                      </span>
                      <span className="ml-4 text-slate-300">{entry.name_masked}</span>
                    </div>
                    <span className="text-slate-400">{entry.checkin_time}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">暂无</div>
            )}
          </div>

          {/* 等候叫号 */}
          <div className="bg-white/5 backdrop-blur rounded-2xl p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-yellow-400 rounded-full" />
              等候叫号
            </h2>
            {board.waiting.length > 0 ? (
              <div className="space-y-2">
                {board.waiting.map((entry, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded-xl px-6 py-3 ${
                      i === 0 ? 'bg-yellow-500/30 border border-yellow-500/50' : 'bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`text-lg font-bold ${i === 0 ? 'text-yellow-300' : 'text-slate-400'}`}>
                        #{i + 1}
                      </span>
                      <span className="text-lg">***{entry.subject_no_tail}</span>
                    </div>
                    <span className="text-slate-400 text-sm">{entry.checkin_time}</span>
                  </div>
                ))}
                {board.waiting_total > board.waiting.length && (
                  <div className="text-center text-slate-500 py-2">
                    还有 {board.waiting_total - board.waiting.length} 位等候中
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">暂无等候</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
