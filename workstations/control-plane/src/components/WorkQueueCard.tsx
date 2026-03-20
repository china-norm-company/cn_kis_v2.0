import { Link } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'

interface WorkQueueCardProps {
  eventCount?: number
  ticketCount?: number
  loading?: boolean
}

export function WorkQueueCard({ eventCount = 0, ticketCount = 0, loading }: WorkQueueCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
        <ClipboardList className="h-4 w-4" />
        待办
      </div>
      {loading ? (
        <div className="text-xs text-slate-400">加载中...</div>
      ) : (
        <div className="flex flex-wrap gap-3 text-sm">
          <Link to="/events" className="text-primary-600 hover:underline">
            未闭环事件 {eventCount}
          </Link>
          <Link to="/tickets" className="text-primary-600 hover:underline">
            处理中工单 {ticketCount}
          </Link>
        </div>
      )}
    </div>
  )
}
