import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { executionApi } from '@cn-kis/api-client'
import { Button, Card, Empty, Input } from '@cn-kis/ui-kit'

const STAGE_LABEL: Record<string, string> = {
  registration: '报名',
  pre_screening: '初筛',
  screening: '筛选',
  enrollment: '入组',
  appointment: '预约',
  checkin: '签到',
  execution: '执行',
  checkout: '签出',
  questionnaire: '问卷',
  support: '答疑',
  followup: '随访',
  completion: '结项',
  withdrawal: '退出',
}

export default function ReceptionJourneyPage() {
  const [inputValue, setInputValue] = useState('')
  const [subjectId, setSubjectId] = useState<number | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['reception', 'journey', subjectId],
    queryFn: () => executionApi.getSubjectJourney(subjectId!),
    enabled: !!subjectId,
  })

  const events = useMemo(() => data?.data?.events || [], [data?.data?.events])
  const stageStats = data?.data?.stage_stats || {}

  return (
    <div className="space-y-5 md:space-y-6">
      <Card title="受试者轨迹查询" variant="bordered">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label="受试者ID"
            placeholder="输入 subject_id"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            inputClassName="min-h-11"
            title="受试者ID"
          />
          <Button
            className="min-h-11"
            size="sm"
            onClick={() => {
              const parsed = Number(inputValue)
              if (!parsed) {
                window.alert('请输入有效受试者ID')
                return
              }
              setSubjectId(parsed)
            }}
          >
            查询轨迹
          </Button>
        </div>
      </Card>

      {subjectId && (
        <Card title={`受试者 #${subjectId} · 13阶段轨迹`} variant="bordered">
          {isLoading ? (
            <p className="text-sm text-slate-400">加载中...</p>
          ) : events.length === 0 ? (
            <Empty title="暂无轨迹事件" />
          ) : (
            <div className="space-y-2">
              {events.map((event, idx) => (
                <div key={`${event.time}-${idx}`} className="border border-slate-200 rounded-lg px-3 py-2">
                  <div className="text-sm font-medium text-slate-800">{STAGE_LABEL[event.stage] || event.stage} · {event.title}</div>
                  <div className="text-xs text-slate-500">{event.time} · 状态：{event.status}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card title="阶段统计" variant="bordered">
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(stageStats).map(([stage, count]) => (
            <div key={stage} className="border border-slate-200 rounded-lg px-3 py-2">
              <div className="text-slate-500">{STAGE_LABEL[stage] || stage}</div>
              <div className="font-semibold text-slate-800">{count}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
