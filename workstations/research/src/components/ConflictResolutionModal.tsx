/**
 * 冲突解决弹窗
 *
 * 展示资源冲突详情，提供调整时间/更换执行人/取消排程选项
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Button, Input, Select, Badge } from '@cn-kis/ui-kit'
import { schedulingApi, dashboardApi } from '@cn-kis/api-client'
import type { ResourceConflict, TeamMember } from '@cn-kis/api-client'
import { AlertTriangle, Clock, UserCog, XCircle, Loader2 } from 'lucide-react'

interface ConflictResolutionModalProps {
  isOpen: boolean
  onClose: () => void
  conflict: ResourceConflict | null
}

type ResolutionType = 'reschedule' | 'reassign' | 'cancel'

export function ConflictResolutionModal({ isOpen, onClose, conflict }: ConflictResolutionModalProps) {
  const queryClient = useQueryClient()
  const [resolution, setResolution] = useState<ResolutionType>('reschedule')
  const [selectedSlotIdx, setSelectedSlotIdx] = useState(0)
  const [newDate, setNewDate] = useState('')
  const [newStartTime, setNewStartTime] = useState('')
  const [newEndTime, setNewEndTime] = useState('')
  const [newAssigneeId, setNewAssigneeId] = useState('')

  const { data: teamRes } = useQuery({
    queryKey: ['dashboard', 'team-overview-for-conflict'],
    queryFn: () => dashboardApi.getTeamOverview(),
    enabled: isOpen && resolution === 'reassign',
  })

  const teamMembers: TeamMember[] = teamRes?.data ?? []

  const slots = conflict?.slots ?? []
  const targetSlot = slots[selectedSlotIdx]

  const mutation = useMutation({
    mutationFn: async () => {
      if (!targetSlot) throw new Error('No slot selected')

      if (resolution === 'reschedule') {
        await schedulingApi.updateSlot(targetSlot.id, {
          scheduled_date: newDate || undefined,
          start_time: newStartTime || undefined,
          end_time: newEndTime || undefined,
        })
      } else if (resolution === 'reassign') {
        await schedulingApi.updateSlot(targetSlot.id, {
          assigned_to_id: parseInt(newAssigneeId),
        })
      } else if (resolution === 'cancel') {
        await schedulingApi.updateSlot(targetSlot.id, {
          scheduled_date: undefined,
          start_time: undefined,
          end_time: undefined,
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'resource-conflicts'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'portfolio'] })
      handleClose()
    },
  })

  function handleClose() {
    setResolution('reschedule')
    setSelectedSlotIdx(0)
    setNewDate('')
    setNewStartTime('')
    setNewEndTime('')
    setNewAssigneeId('')
    mutation.reset()
    onClose()
  }

  const canSubmit =
    (resolution === 'reschedule' && newDate) ||
    (resolution === 'reassign' && newAssigneeId) ||
    resolution === 'cancel'

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="解决资源冲突"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" />处理中...</>
            ) : (
              '确认解决'
            )}
          </Button>
        </>
      }
    >
      {!conflict ? (
        <div className="py-8 text-center text-sm text-slate-400">无冲突数据</div>
      ) : (
        <div className="space-y-5">
          {/* 冲突概要 */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-amber-800">
                人员 #{conflict.person_id} 在 {conflict.date} 有 {conflict.count} 个时间槽冲突
              </div>
              <div className="text-xs text-amber-600 mt-1">
                请选择一个冲突时间槽并选择解决方案
              </div>
            </div>
          </div>

          {/* 冲突的时间槽列表 */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">冲突的时间槽</h4>
            <div className="space-y-1.5">
              {slots.map((slot, idx) => (
                <button
                  key={slot.id}
                  onClick={() => setSelectedSlotIdx(idx)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition ${
                    idx === selectedSlotIdx
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    idx === selectedSlotIdx ? 'bg-blue-500' : 'bg-slate-300'
                  }`} />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-800">{slot.visit_node}</span>
                    <span className="text-xs text-slate-400 ml-2">
                      {slot.start_time && slot.end_time
                        ? `${slot.start_time} - ${slot.end_time}`
                        : '时间未定'}
                    </span>
                  </div>
                  <Badge variant="default" size="sm">#{slot.id}</Badge>
                </button>
              ))}
            </div>
          </div>

          {/* 解决方案 */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">解决方案</h4>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([
                { key: 'reschedule' as const, label: '调整时间', icon: Clock, color: 'text-blue-600' },
                { key: 'reassign' as const, label: '更换执行人', icon: UserCog, color: 'text-purple-600' },
                { key: 'cancel' as const, label: '取消排程', icon: XCircle, color: 'text-red-600' },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setResolution(opt.key)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition ${
                    resolution === opt.key
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <opt.icon className={`w-5 h-5 ${opt.color}`} />
                  <span className="text-xs font-medium text-slate-700">{opt.label}</span>
                </button>
              ))}
            </div>

            {resolution === 'reschedule' && (
              <div className="space-y-3 pl-1">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">新日期</label>
                  <Input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">开始时间</label>
                    <Input
                      type="time"
                      value={newStartTime}
                      onChange={(e) => setNewStartTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">结束时间</label>
                    <Input
                      type="time"
                      value={newEndTime}
                      onChange={(e) => setNewEndTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {resolution === 'reassign' && (
              <div className="pl-1">
                <label className="block text-sm text-slate-600 mb-1">选择新执行人</label>
                <Select
                  value={newAssigneeId}
                  onChange={(val) => setNewAssigneeId(String(val))}
                  options={teamMembers
                    .filter((m) => m.id !== conflict.person_id)
                    .map((m) => ({
                      value: String(m.id),
                      label: `${m.name} (负荷率 ${m.load_rate}%)`,
                    }))}
                  placeholder="选择团队成员"
                />
              </div>
            )}

            {resolution === 'cancel' && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                <p className="text-sm text-red-700">
                  取消排程将移除选中时间槽的排程安排，关联工单可能需要重新安排。
                </p>
              </div>
            )}
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-600">操作失败，请重试</p>
          )}
        </div>
      )}
    </Modal>
  )
}
