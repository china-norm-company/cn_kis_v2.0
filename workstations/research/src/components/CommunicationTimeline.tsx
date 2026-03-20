/**
 * 统一沟通时间线组件
 *
 * 跨阶段沟通记录：方案沟通 + 执行会议 + 客户沟通，聚合展示
 */
import { useQuery } from '@tanstack/react-query'
import { proposalApi, api } from '@cn-kis/api-client'
import { Empty } from '@cn-kis/ui-kit'
import {
  MessageSquare, Phone, Mail, Video,
  FileText, Users, Calendar, Clock,
} from 'lucide-react'

interface Props {
  protocolId: number
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  phone: Phone,
  meeting: Users,
  video: Video,
  document: FileText,
  feishu: MessageSquare,
  note: FileText,
}

const PHASE_COLOR: Record<string, string> = {
  proposal: 'border-blue-300 bg-blue-50',
  execution: 'border-green-300 bg-green-50',
  client: 'border-amber-300 bg-amber-50',
  closeout: 'border-purple-300 bg-purple-50',
}

interface TimelineEntry {
  id: string
  phase: string
  type: string
  title: string
  content: string
  sender: string
  time: string
}

export function CommunicationTimeline({ protocolId }: Props) {
  const { data: proposalCommsRes } = useQuery({
    queryKey: ['proposal', 'communications', protocolId],
    queryFn: () => proposalApi.listCommunications({ proposal_id: protocolId }),
    enabled: !!protocolId,
  })

  const proposalComms: TimelineEntry[] = ((proposalCommsRes?.data as any)?.items ?? []).map((c: any) => ({
    id: `proposal-${c.id}`,
    phase: 'proposal',
    type: c.type || 'note',
    title: c.title || '方案沟通',
    content: c.content || '',
    sender: c.sender || c.created_by_name || '',
    time: c.create_time || '',
  }))

  const allEntries = [...proposalComms].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  )

  if (allEntries.length === 0) {
    return <Empty description="暂无沟通记录" />
  }

  return (
    <div className="relative">
      <div className="absolute left-5 top-3 bottom-3 w-px bg-slate-200" />
      <div className="space-y-4">
        {allEntries.map((entry) => {
          const Icon = ICON_MAP[entry.type] || MessageSquare
          const phaseColor = PHASE_COLOR[entry.phase] || PHASE_COLOR.execution
          const phaseLabel = entry.phase === 'proposal'
            ? '方案阶段'
            : entry.phase === 'execution'
            ? '执行阶段'
            : entry.phase === 'client'
            ? '客户沟通'
            : '结项阶段'

          return (
            <div key={entry.id} className="flex items-start gap-4 relative">
              <div className={`relative z-10 w-10 h-10 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${phaseColor}`}>
                <Icon className="w-4 h-4 text-slate-500" />
              </div>
              <div className="flex-1 bg-white rounded-lg border border-slate-100 p-3 hover:shadow-sm transition">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-medium text-slate-700">{entry.title}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{phaseLabel}</span>
                  <span className="text-[11px] text-slate-400 ml-auto flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {entry.time ? new Date(entry.time).toLocaleString('zh-CN') : ''}
                  </span>
                </div>
                {entry.sender && (
                  <div className="text-xs text-slate-500 mb-1">{entry.sender}</div>
                )}
                {entry.content && (
                  <p className="text-sm text-slate-600 whitespace-pre-line line-clamp-3">{entry.content}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
