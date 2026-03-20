import type { QueueItem } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import { Badge, Button } from '@cn-kis/ui-kit'
import { LogIn, LogOut, ClipboardCheck } from 'lucide-react'

const TASK_TYPE_CONFIG: Record<QueueItem['task_type'], { label: string; border: string; variant: 'warning' | 'primary' | 'success' | 'info' | 'default' }> = {
  pre_screening: { label: '粗筛', border: 'border-l-orange-400', variant: 'warning' },
  screening:     { label: '筛选', border: 'border-l-blue-400', variant: 'primary' },
  visit:         { label: '访视', border: 'border-l-green-400', variant: 'success' },
  extra_visit:   { label: '加访', border: 'border-l-purple-400', variant: 'info' },
  walk_in:       { label: '临时', border: 'border-l-slate-400', variant: 'default' },
}

const STATUS_CONFIG: Record<QueueItem['status'], { label: string; variant: 'default' | 'primary' | 'warning' | 'success' | 'error' }> = {
  waiting:     { label: '待到场', variant: 'default' },
  checked_in:  { label: '已签到', variant: 'primary' },
  in_progress: { label: '执行中', variant: 'warning' },
  checked_out: { label: '已签出', variant: 'success' },
  no_show:     { label: '缺席', variant: 'error' },
}

interface ReceptionSubjectRowProps {
  item: QueueItem
  onCheckin: (subjectId: number) => void
  onCheckout: (checkinId: number) => void
}

export default function ReceptionSubjectRow({ item, onCheckin, onCheckout }: ReceptionSubjectRowProps) {
  const taskCfg = TASK_TYPE_CONFIG[item.task_type] ?? TASK_TYPE_CONFIG.walk_in
  const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.waiting

  const timeStr = item.appointment_time
    ? new Date(item.appointment_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '--:--'

  return (
    <div
      data-stat="queue-item"
      className={`flex items-center gap-4 px-5 py-4 bg-white rounded-lg border border-slate-200 border-l-4 ${taskCfg.border} hover:shadow-sm transition-shadow`}
    >
      {/* 时间 */}
      <div className="w-16 shrink-0 text-center" data-field="time">
        <span className="text-lg font-semibold text-slate-700">{timeStr}</span>
      </div>

      {/* 受试者信息 */}
      <div className="flex-1 min-w-0" data-field="subject-info">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800 truncate">{item.subject_no}</span>
          <span className="text-sm text-slate-600 truncate">{item.subject_name}</span>
        </div>
        <div className="text-xs text-slate-400 mt-0.5 space-y-0.5">
          {(item.project_name || item.visit_point) && (
            <p className="truncate" title={[item.project_name, item.visit_point].filter(Boolean).join(' · ')}>
              {[item.project_name, item.visit_point].filter(Boolean).join(' · ')}
            </p>
          )}
          {item.purpose && (
            <p className="truncate">{item.purpose}</p>
          )}
        </div>
      </div>

      {/* 任务类型 */}
      <Badge variant={taskCfg.variant} data-field="task-type">{taskCfg.label}</Badge>

      {/* 状态 */}
      <Badge variant={statusCfg.variant} data-field="status">{statusCfg.label}</Badge>

      {/* 操作区 */}
      <div className="flex items-center gap-2 shrink-0 ml-2" data-field="actions">
        {item.status === 'waiting' && (
          <Button
            variant="success"
            size="sm"
            icon={<LogIn />}
            onClick={() => onCheckin(item.subject_id)}
            data-action="checkin"
          >
            签到
          </Button>
        )}

        {item.status === 'checked_in' && (
          <>
            {item.task_type === 'pre_screening' && (
              <Button
                variant="secondary"
                size="sm"
                icon={<ClipboardCheck />}
                onClick={() => window.open(getWorkstationUrl('recruitment', '#/prescreening'), '_blank')}
                data-action="pre-screening"
                className="!border-orange-500 !text-orange-600 hover:!bg-orange-50"
              >
                发起粗筛
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              icon={<LogOut />}
              onClick={() => item.checkin_id && onCheckout(item.checkin_id)}
              data-action="checkout"
            >
              签出
            </Button>
          </>
        )}

        {item.status === 'in_progress' && (
          <Button
            variant="primary"
            size="sm"
            icon={<LogOut />}
            onClick={() => item.checkin_id && onCheckout(item.checkin_id)}
            data-action="checkout"
          >
            签出
          </Button>
        )}

        {item.status === 'checked_out' && (
          <span className="text-sm text-slate-400 font-medium">已签出</span>
        )}

        {item.status === 'no_show' && (
          <span className="text-sm text-red-500 font-medium">缺席</span>
        )}
      </div>
    </div>
  )
}
