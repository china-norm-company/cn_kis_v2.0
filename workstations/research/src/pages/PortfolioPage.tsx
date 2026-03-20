/**
 * A3: 项目组合看板
 *
 * 顶部统计 + 甘特图里程碑时间线（带快捷操作） + 资源冲突列表（可解决）
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, dashboardApi } from '@cn-kis/api-client'
import type { ResourceConflict } from '@cn-kis/api-client'
import { StatCard, Badge, Empty, Button } from '@cn-kis/ui-kit'
import { Link } from 'react-router-dom'
import {
  Briefcase, Users, DollarSign, AlertTriangle, Calendar,
  ChevronRight, Wrench, Eye,
} from 'lucide-react'
import { ConflictResolutionModal } from '../components/ConflictResolutionModal'

interface PortfolioProject {
  id: number
  title: string
  code: string
  status: string
  enrolled: number
  sample_size: number
  contract_amount: number
  milestones: {
    fsi?: string | null
    lsi?: string | null
    lso?: string | null
    dbl?: string | null
  }
}

interface PortfolioData {
  active_count: number
  total_enrolled: number
  total_sample_size: number
  total_contract_amount: number
  projects: PortfolioProject[]
}

interface ConflictItem {
  id: number
  type: string
  description: string
  severity: 'high' | 'medium' | 'low'
  projects: string[]
  detected_at: string
  person_id?: number
  date?: string
  count?: number
  slots?: Array<{
    id: number
    visit_node: string
    start_time: string | null
    end_time: string | null
  }>
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  planning: { label: '筹备中', color: 'bg-slate-400' },
  active: { label: '进行中', color: 'bg-blue-500' },
  enrolling: { label: '入组中', color: 'bg-green-500' },
  monitoring: { label: '监查中', color: 'bg-amber-500' },
  closing: { label: '结题中', color: 'bg-purple-500' },
  completed: { label: '已完成', color: 'bg-slate-300' },
}

const MILESTONE_COLORS: Record<string, string> = {
  FSI: 'bg-blue-500',
  LSI: 'bg-green-500',
  LSO: 'bg-amber-500',
  DBL: 'bg-purple-500',
}

function formatAmount(value: number): string {
  if (value >= 10000) return `¥${(value / 10000).toFixed(1)}万`
  return `¥${value.toLocaleString()}`
}

function getTimelineRange(projects: PortfolioProject[]): { min: number; max: number } {
  const allDates: number[] = []
  for (const p of projects) {
    const ms = p.milestones
    if (ms.fsi) allDates.push(new Date(ms.fsi).getTime())
    if (ms.lsi) allDates.push(new Date(ms.lsi).getTime())
    if (ms.lso) allDates.push(new Date(ms.lso).getTime())
    if (ms.dbl) allDates.push(new Date(ms.dbl).getTime())
  }
  if (allDates.length === 0) {
    const now = Date.now()
    return { min: now - 180 * 86400000, max: now + 180 * 86400000 }
  }
  const min = Math.min(...allDates)
  const max = Math.max(...allDates)
  const padding = (max - min) * 0.1 || 30 * 86400000
  return { min: min - padding, max: max + padding }
}

function getPosition(date: string | null | undefined, range: { min: number; max: number }): number | null {
  if (!date) return null
  const t = new Date(date).getTime()
  return ((t - range.min) / (range.max - range.min)) * 100
}

export default function PortfolioPage() {
  const [selectedConflict, setSelectedConflict] = useState<ResourceConflict | null>(null)
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(null)

  const { data: portfolioRes, isLoading: portfolioLoading } = useQuery({
    queryKey: ['dashboard', 'portfolio'],
    queryFn: () => api.get<PortfolioData>('/dashboard/portfolio'),
  })

  const { data: conflictsRes, isLoading: conflictsLoading } = useQuery({
    queryKey: ['dashboard', 'resource-conflicts'],
    queryFn: () => api.get<{ items: ConflictItem[] }>('/dashboard/resource-conflicts'),
  })

  const portfolio = portfolioRes?.data
  const projects = portfolio?.projects ?? []
  const conflicts = conflictsRes?.data?.items ?? []
  const timelineRange = getTimelineRange(projects)

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">项目组合看板</h2>
        <p className="mt-1 text-sm text-slate-500">
          总览所有活跃项目的里程碑进度与资源分配
        </p>
      </div>

      {/* 顶部统计 */}
      <div className="grid grid-cols-3 gap-4" data-section="portfolio-stats">
        <StatCard
          title="活跃项目"
          value={portfolio?.active_count ?? 0}
          icon={<Briefcase className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="总入组 / 样本量"
          value={`${portfolio?.total_enrolled ?? 0} / ${portfolio?.total_sample_size ?? 0}`}
          icon={<Users className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          title="合同总额"
          value={formatAmount(portfolio?.total_contract_amount ?? 0)}
          icon={<DollarSign className="w-5 h-5" />}
          color="amber"
        />
      </div>

      {/* 甘特图 - 里程碑时间线 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5" data-section="milestone-timeline">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            里程碑时间线
          </h3>
          <div className="flex items-center gap-4 text-xs">
            {Object.entries(MILESTONE_COLORS).map(([key, color]) => (
              <span key={key} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                {key}
              </span>
            ))}
          </div>
        </div>

        {portfolioLoading ? (
          <div className="py-12 text-center text-sm text-slate-400">加载中...</div>
        ) : projects.length === 0 ? (
          <Empty description="暂无项目数据" />
        ) : (
          <div className="space-y-1">
            {/* 时间轴标尺 */}
            <div className="flex items-center pl-48 pr-4 mb-2">
              <div className="flex-1 relative h-5">
                {[0, 25, 50, 75, 100].map((pct) => {
                  const date = new Date(timelineRange.min + (timelineRange.max - timelineRange.min) * (pct / 100))
                  return (
                    <span
                      key={pct}
                      className="absolute text-[10px] text-slate-400 -translate-x-1/2"
                      style={{ left: `${pct}%` }}
                    >
                      {date.toLocaleDateString('zh-CN', { month: 'short', year: '2-digit' })}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* 项目行 */}
            {projects.map((project) => {
              const status = STATUS_MAP[project.status] ?? { label: project.status, color: 'bg-slate-400' }
              const milestoneEntries = [
                { key: 'FSI', date: project.milestones.fsi },
                { key: 'LSI', date: project.milestones.lsi },
                { key: 'LSO', date: project.milestones.lso },
                { key: 'DBL', date: project.milestones.dbl },
              ]

              return (
                <div key={project.id}>
                  <div
                    className="flex items-center group hover:bg-slate-50 rounded-lg py-2 px-1 transition"
                  >
                    {/* 项目名称 */}
                    <div className="w-48 flex-shrink-0 pr-4">
                      <Link
                        to={`/projects/${project.id}/dashboard`}
                        className="text-sm font-medium text-slate-700 hover:text-blue-600 flex items-center gap-1"
                      >
                        <span className="truncate">{project.title}</span>
                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-blue-500 flex-shrink-0" />
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${status.color}`} />
                        <span className="text-[11px] text-slate-400">{status.label}</span>
                        <span className="text-[11px] text-slate-400">
                          {project.enrolled}/{project.sample_size}
                        </span>
                        <button
                          onClick={() => setExpandedProjectId(expandedProjectId === project.id ? null : project.id)}
                          className="opacity-0 group-hover:opacity-100 transition text-blue-500 hover:text-blue-700"
                          title="查看排程"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 时间线区域 */}
                    <div className="flex-1 relative h-8 mr-4">
                      <div className="absolute inset-y-0 left-0 right-0 flex items-center">
                        <div className="w-full h-px bg-slate-200" />
                      </div>

                      {(() => {
                        const positions = milestoneEntries
                          .map((m) => ({ ...m, pos: getPosition(m.date, timelineRange) }))
                          .filter((m) => m.pos !== null) as Array<{ key: string; date: string | null | undefined; pos: number }>

                        if (positions.length < 2) {
                          return positions.map((m) => (
                            <div
                              key={m.key}
                              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group/tip"
                              style={{ left: `${m.pos}%` }}
                            >
                              <div className={`w-3 h-3 rounded-full ${MILESTONE_COLORS[m.key]} ring-2 ring-white shadow-sm`} />
                              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover/tip:opacity-100 whitespace-nowrap pointer-events-none">
                                {m.key}: {m.date ? new Date(m.date).toLocaleDateString('zh-CN') : ''}
                              </div>
                            </div>
                          ))
                        }

                        const minPos = Math.min(...positions.map((p) => p.pos))
                        const maxPos = Math.max(...positions.map((p) => p.pos))

                        return (
                          <>
                            <div
                              className="absolute top-1/2 -translate-y-1/2 h-1 bg-blue-100 rounded-full"
                              style={{ left: `${minPos}%`, width: `${maxPos - minPos}%` }}
                            />
                            {positions.map((m) => (
                              <div
                                key={m.key}
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group/tip"
                                style={{ left: `${m.pos}%` }}
                              >
                                <div className={`w-3 h-3 rounded-full ${MILESTONE_COLORS[m.key]} ring-2 ring-white shadow-sm`} />
                                <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover/tip:opacity-100 whitespace-nowrap pointer-events-none">
                                  {m.key}: {m.date ? new Date(m.date).toLocaleDateString('zh-CN') : ''}
                                </div>
                              </div>
                            ))}
                          </>
                        )
                      })()}
                    </div>
                  </div>

                  {/* 项目排程展开区域 */}
                  {expandedProjectId === project.id && (
                    <ProjectScheduleExpand projectId={project.id} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 资源冲突 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5" data-section="resource-conflicts">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          资源冲突
        </h3>

        {conflictsLoading ? (
          <div className="py-8 text-center text-sm text-slate-400">加载中...</div>
        ) : conflicts.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-green-500 text-sm font-medium">无资源冲突</div>
            <p className="text-xs text-slate-400 mt-1">当前所有项目资源分配正常</p>
          </div>
        ) : (
          <div className="space-y-3">
            {conflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50"
              >
                <AlertTriangle
                  className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                    conflict.severity === 'high'
                      ? 'text-red-500'
                      : conflict.severity === 'medium'
                        ? 'text-amber-500'
                        : 'text-slate-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-700">{conflict.description}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge
                      variant={
                        conflict.severity === 'high'
                          ? 'error'
                          : conflict.severity === 'medium'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {conflict.severity === 'high' ? '高' : conflict.severity === 'medium' ? '中' : '低'}
                    </Badge>
                    <span className="text-xs text-slate-400">{conflict.type}</span>
                    {conflict.projects.map((proj) => (
                      <span key={proj} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        {proj}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] text-slate-400">
                    {new Date(conflict.detected_at).toLocaleDateString('zh-CN')}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const rc: ResourceConflict = {
                        person_id: conflict.person_id ?? 0,
                        date: conflict.date ?? conflict.detected_at,
                        count: conflict.count ?? conflict.slots?.length ?? 2,
                        slots: conflict.slots ?? [],
                      }
                      setSelectedConflict(rc)
                    }}
                    className="!text-xs !gap-1"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    解决
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal
        isOpen={!!selectedConflict}
        onClose={() => setSelectedConflict(null)}
        conflict={selectedConflict}
      />
    </div>
  )
}

/**
 * 项目排程展开子组件
 */
function ProjectScheduleExpand({ projectId }: { projectId: number }) {
  const { data: slotsRes, isLoading } = useQuery({
    queryKey: ['scheduling', 'slots-for-project', projectId],
    queryFn: () =>
      import('@cn-kis/api-client').then(({ schedulingApi }) =>
        schedulingApi.listSlots({ page_size: 20 })
      ),
  })

  const slots = slotsRes?.data?.items ?? []

  if (isLoading) {
    return <div className="py-3 pl-52 text-xs text-slate-400">加载排程...</div>
  }

  if (slots.length === 0) {
    return <div className="py-3 pl-52 text-xs text-slate-400">暂无排程数据</div>
  }

  return (
    <div className="pl-52 pr-4 pb-3">
      <div className="bg-slate-50 rounded-lg border border-slate-100 p-3 space-y-1.5">
        {slots.slice(0, 8).map((slot) => (
          <div
            key={slot.id}
            className="flex items-center gap-3 text-xs"
          >
            <Badge
              variant={slot.status === 'completed' ? 'success' : slot.status === 'conflict' ? 'error' : 'default'}
              size="sm"
            >
              {slot.status}
            </Badge>
            <span className="font-medium text-slate-700">{slot.visit_node_name}</span>
            <span className="text-slate-400">{slot.scheduled_date}</span>
            {slot.start_time && slot.end_time && (
              <span className="text-slate-400">{slot.start_time}-{slot.end_time}</span>
            )}
            {slot.assigned_to_id && (
              <span className="text-slate-500">执行人 #{slot.assigned_to_id}</span>
            )}
          </div>
        ))}
        {slots.length > 8 && (
          <div className="text-xs text-slate-400 pt-1">还有 {slots.length - 8} 个时间槽...</div>
        )}
      </div>
    </div>
  )
}
