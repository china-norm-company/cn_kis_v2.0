/**
 * 日历小组件
 *
 * 今日/本周日程摘要，来源于访视 + 会议 + 待办
 */
import { Calendar, Clock } from 'lucide-react'
import { Badge } from '@cn-kis/ui-kit'

interface ScheduleItem {
  id: string
  title: string
  time: string
  type: 'visit' | 'meeting' | 'deadline'
}

interface Props {
  items: ScheduleItem[]
  isLoading?: boolean
}

const TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  visit: { color: 'bg-green-100 text-green-700', label: '访视' },
  meeting: { color: 'bg-blue-100 text-blue-700', label: '会议' },
  deadline: { color: 'bg-amber-100 text-amber-700', label: '截止' },
}

export function CalendarWidget({ items, isLoading }: Props) {
  const today = new Date()
  const dateStr = today.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          今日日程
        </h3>
        <span className="text-xs text-slate-400">{dateStr}</span>
      </div>

      {isLoading ? (
        <div className="text-center py-4 text-sm text-slate-400">加载中...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-6 text-sm text-slate-400">今日暂无日程安排</div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.meeting
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-1.5 text-xs text-slate-500 w-16 flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  {item.time}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-slate-700 truncate block">{item.title}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${config.color}`}>
                  {config.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
