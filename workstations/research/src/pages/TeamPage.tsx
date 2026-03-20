/**
 * E1: 团队全景
 *
 * 团队成员卡片网格（可展开工单 + 分配操作） + 团队产能统计 + 一键均衡
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, workorderApi } from '@cn-kis/api-client'
import type { WorkOrder } from '@cn-kis/api-client'
import { StatCard, Empty, Button, Badge } from '@cn-kis/ui-kit'
import {
  Users, UserCheck, TrendingUp, AlertTriangle,
  ClipboardList, ChevronDown, ChevronUp, Shuffle, Loader2,
} from 'lucide-react'
import { AssignWorkOrderModal } from '../components/AssignWorkOrderModal'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TeamMember {
  id: number
  name: string
  role: string
  active_workorders: number
  completed_this_week: number
  overdue_count: number
  load_rate: number
}

interface TeamCapacity {
  total_members: number
  avg_load_rate: number
  total_utilization: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function getLoadColor(rate: number): { bar: string; text: string; bg: string } {
  if (rate > 100) return { bar: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50' }
  if (rate > 80) return { bar: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-50' }
  return { bar: 'bg-green-500', text: 'text-green-600', bg: 'bg-green-50' }
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500',
  'bg-teal-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-amber-500',
]

/* ------------------------------------------------------------------ */
/*  Member Workorder Expansion                                         */
/* ------------------------------------------------------------------ */

function MemberWorkOrders({ memberId, members }: { memberId: number; members: TeamMember[] }) {
  const queryClient = useQueryClient()

  const { data: wosRes, isLoading } = useQuery({
    queryKey: ['workorders', 'by-member', memberId],
    queryFn: () => workorderApi.list({ assigned_to: memberId, page_size: 20 }),
  })

  const workorders: WorkOrder[] = wosRes?.data?.items ?? []

  const reassignMutation = useMutation({
    mutationFn: ({ woId, newUserId }: { woId: number; newUserId: number }) =>
      workorderApi.manualAssign(woId, newUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workorders'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'team-overview'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'team-capacity'] })
    },
  })

  if (isLoading) {
    return <div className="py-3 text-center text-xs text-slate-400">加载工单...</div>
  }

  if (workorders.length === 0) {
    return <div className="py-3 text-center text-xs text-slate-400">暂无在手工单</div>
  }

  return (
    <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-100">
      {workorders.map((wo) => (
        <div
          key={wo.id}
          className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 text-xs"
        >
          <div className="flex-1 min-w-0">
            <span className="font-medium text-slate-700 truncate block">{wo.title}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant={wo.status === 'completed' ? 'success' : wo.status === 'in_progress' ? 'warning' : 'default'} size="sm">
                {wo.status}
              </Badge>
              {wo.due_date && (
                <span className="text-slate-400">{new Date(wo.due_date).toLocaleDateString('zh-CN')}</span>
              )}
            </div>
          </div>
          <select
            aria-label={`重新分配工单 ${wo.title}`}
            className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white text-slate-600 cursor-pointer"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                reassignMutation.mutate({ woId: wo.id, newUserId: parseInt(e.target.value) })
                e.target.value = ''
              }
            }}
          >
            <option value="" disabled>重新分配</option>
            {members
              .filter((m) => m.id !== memberId)
              .map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
          </select>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function TeamPage() {
  const queryClient = useQueryClient()
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [assignModal, setAssignModal] = useState<{ memberId: number; memberName: string } | null>(null)

  const { data: overviewRes, isLoading: overviewLoading } = useQuery({
    queryKey: ['dashboard', 'team-overview'],
    queryFn: () => api.get<{ members: TeamMember[] }>('/dashboard/team-overview'),
  })

  const { data: capacityRes } = useQuery({
    queryKey: ['dashboard', 'team-capacity'],
    queryFn: () => api.get<TeamCapacity>('/dashboard/team-capacity'),
  })

  const members = overviewRes?.data?.members ?? []
  const capacity = capacityRes?.data

  // 获取未分配工单，用于一键均衡
  const { data: unassignedRes } = useQuery({
    queryKey: ['workorders', 'unassigned-for-balance'],
    queryFn: () => workorderApi.list({ status: 'pending', page_size: 100 }),
  })

  const unassignedWos = (unassignedRes?.data?.items ?? []).filter((wo) => !wo.assigned_to)

  const balanceMutation = useMutation({
    mutationFn: () => workorderApi.autoAssignBatch(unassignedWos.map((wo) => wo.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'team-overview'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'team-capacity'] })
      queryClient.invalidateQueries({ queryKey: ['workorders'] })
    },
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">团队全景</h2>
          <p className="mt-1 text-sm text-slate-500">查看团队成员工作负荷与产能概况</p>
        </div>
        {unassignedWos.length > 0 && (
          <Button
            onClick={() => balanceMutation.mutate()}
            disabled={balanceMutation.isPending}
          >
            {balanceMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" />均衡分配中...</>
            ) : (
              <><Shuffle className="w-4 h-4 mr-1" />一键均衡 ({unassignedWos.length})</>
            )}
          </Button>
        )}
      </div>

      {/* Capacity Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title="总成员数"
          value={capacity?.total_members ?? members.length}
          icon={<Users className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="平均负荷率"
          value={`${capacity?.avg_load_rate ?? 0}%`}
          icon={<TrendingUp className="w-5 h-5" />}
          color={
            (capacity?.avg_load_rate ?? 0) > 100 ? 'red'
              : (capacity?.avg_load_rate ?? 0) > 80 ? 'amber'
              : 'green'
          }
        />
        <StatCard
          title="总利用率"
          value={`${capacity?.total_utilization ?? 0}%`}
          icon={<UserCheck className="w-5 h-5" />}
          color="purple"
        />
      </div>

      {/* Team Grid */}
      {overviewLoading ? (
        <div className="text-center py-12 text-sm text-slate-400">加载中...</div>
      ) : members.length === 0 ? (
        <Empty title="暂无团队成员" description="团队数据加载后将在此展示" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {members.map((member, idx) => {
            const loadColor = getLoadColor(member.load_rate)
            const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length]
            const isExpanded = expandedId === member.id

            return (
              <div
                key={member.id}
                className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow"
              >
                {/* Avatar + Name */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center text-white text-sm font-semibold`}
                  >
                    {getInitials(member.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800 truncate">{member.name}</div>
                    <div className="text-xs text-slate-500 truncate">{member.role}</div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center">
                    <div className="text-lg font-bold text-slate-800">{member.active_workorders}</div>
                    <div className="text-xs text-slate-400">在手工单</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-green-600">{member.completed_this_week}</div>
                    <div className="text-xs text-slate-400">本周完成</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-lg font-bold ${member.overdue_count > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                      {member.overdue_count}
                    </div>
                    <div className="text-xs text-slate-400">逾期</div>
                  </div>
                </div>

                {/* Load rate bar */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500">负荷率</span>
                    <span className={`text-xs font-semibold ${loadColor.text}`}>
                      {member.load_rate}%
                      {member.load_rate > 100 && (
                        <AlertTriangle className="w-3 h-3 inline-block ml-1 -mt-0.5" />
                      )}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${loadColor.bar}`}
                      style={{ width: `${Math.min(member.load_rate, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAssignModal({ memberId: member.id, memberName: member.name })}
                    className="!text-xs !gap-1 flex-1"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    分配工单
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedId(isExpanded ? null : member.id)}
                    className="!text-xs !gap-1 flex-1"
                  >
                    {isExpanded ? (
                      <><ChevronUp className="w-3.5 h-3.5" />收起</>
                    ) : (
                      <><ChevronDown className="w-3.5 h-3.5" />查看工单</>
                    )}
                  </Button>
                </div>

                {/* Expanded Workorder List */}
                {isExpanded && (
                  <MemberWorkOrders memberId={member.id} members={members} />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Assign Modal */}
      {assignModal && (
        <AssignWorkOrderModal
          isOpen={!!assignModal}
          onClose={() => setAssignModal(null)}
          memberId={assignModal.memberId}
          memberName={assignModal.memberName}
        />
      )}
    </div>
  )
}
