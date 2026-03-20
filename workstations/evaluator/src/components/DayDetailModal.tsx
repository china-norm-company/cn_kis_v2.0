/**
 * 排程日期详情弹窗：完整显示该日期的工单与备注（含项目编号、设备名称）
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Trash2 } from 'lucide-react'
import { evaluatorApi } from '@cn-kis/api-client'
import type { EvaluatorWorkOrder, ScheduleNote } from '@cn-kis/api-client'

export interface DayDetailModalProps {
  open: boolean
  onClose: () => void
  dateStr: string
  dateLabel: string
  workOrders: EvaluatorWorkOrder[]
  notes: ScheduleNote[]
  /** 删除备注后的回调，用于刷新数据 */
  onNoteDeleted?: (deletedId: number) => void
}

export function DayDetailModal({
  open,
  onClose,
  dateStr,
  dateLabel,
  workOrders,
  notes,
  onNoteDeleted,
}: DayDetailModalProps) {
  const navigate = useNavigate()
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const handleDeleteNote = async (n: ScheduleNote) => {
    if (!onNoteDeleted) return
    setDeletingId(n.id)
    try {
      await evaluatorApi.deleteScheduleNote(n.id)
      onNoteDeleted(n.id)
    } finally {
      setDeletingId(null)
    }
  }

  if (!open) return null

  const hasItems = workOrders.length > 0 || notes.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
          <h3 className="text-base font-semibold text-slate-800">
            {dateLabel} 排程详情
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!hasItems && (
            <p className="text-sm text-slate-500 text-center py-8">该日期暂无排程</p>
          )}
          {workOrders.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-2">工单</h4>
              <ul className="space-y-2">
                {workOrders.map((wo) => (
                  <li key={wo.id}>
                    <button
                      onClick={() => {
                        onClose()
                        navigate(`/execute/${wo.id}`)
                      }}
                      className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
                    >
                      <p className="text-sm font-medium text-slate-800">{wo.title}</p>
                      <span className="text-xs text-slate-500 mt-1 block">
                        状态: {wo.status}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {notes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-2">参考备注（图片识别）</h4>
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="relative p-3 pr-10 rounded-lg border border-slate-200 border-dashed bg-slate-50"
                  >
                    {onNoteDeleted && (
                      <button
                        type="button"
                        onClick={() => handleDeleteNote(n)}
                        disabled={deletingId === n.id}
                        className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title="删除此条"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {(n.equipment || n.project_no || n.room_no) && (
                      <div className="space-y-1 text-sm">
                        {n.project_no && (
                          <p className="text-slate-700">
                            <span className="font-medium text-slate-500">项目编号：</span>
                            <span className="break-words">{n.project_no}</span>
                          </p>
                        )}
                        {n.equipment && (
                          <p className="text-slate-700">
                            <span className="font-medium text-slate-500">设备：</span>
                            <span className="break-words">{n.equipment}</span>
                          </p>
                        )}
                        {n.room_no && (
                          <p className="text-slate-700">
                            <span className="font-medium text-slate-500">房间号：</span>
                            <span className="break-words">{n.room_no}</span>
                          </p>
                        )}
                      </div>
                    )}
                    {n.title && !n.equipment && !n.project_no && !n.room_no && (
                      <p className="text-sm text-slate-700 break-words">{n.title}</p>
                    )}
                    {n.note && (
                      <p className="text-sm text-slate-600 mt-2 break-words">{n.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
