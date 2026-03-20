/**
 * Phase 2：Skill 注册表 — Claw 技能与执行统计
 */
import { useQuery } from '@tanstack/react-query'
import { assistantRegistryApi } from '@cn-kis/api-client'
import { List, TrendingUp } from 'lucide-react'

export default function SkillRegistryPage() {
  const { data: registryRes } = useQuery({
    queryKey: ['digital-workforce', 'claw-registry'],
    queryFn: () => assistantRegistryApi.getClawRegistry(),
  })
  const { data: metricsRes } = useQuery({
    queryKey: ['digital-workforce', 'claw-iteration-metrics', 30],
    queryFn: () => assistantRegistryApi.getClawIterationMetrics({ days: 30 }),
  })

  const registry = (registryRes as { data?: { workstations?: Record<string, unknown>; shared_skills?: string[] } })?.data
  const metrics = (metricsRes as { data?: { skills_success_rate?: Array<{ skill: string; success: number; total: number; rate: number }> } })?.data
  const skillsSuccess = metrics?.skills_success_rate ?? []
  const sharedSkills = registry?.shared_skills ?? []
  const workstationKeys = registry?.workstations ? Object.keys(registry.workstations) : []

  return (
    <div data-testid="skill-registry-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Skill 注册表</h2>
        <p className="mt-1 text-sm text-slate-500">Claw 技能与近 30 天执行成功率</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <List className="h-4 w-4" />
            共享技能 ({sharedSkills.length})
          </h3>
          <ul className="mt-2 max-h-48 overflow-y-auto text-sm text-slate-600">
            {sharedSkills.length === 0 ? (
              <li>暂无</li>
            ) : (
              sharedSkills.map((s) => <li key={s}>{s}</li>)
            )}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <TrendingUp className="h-4 w-4" />
            技能成功率 (近 30 天)
          </h3>
          <ul className="mt-2 max-h-48 space-y-1 text-sm">
            {skillsSuccess.length === 0 ? (
              <li className="text-slate-500">暂无执行记录</li>
            ) : (
              skillsSuccess.slice(0, 15).map((s) => (
                <li key={s.skill} className="flex justify-between text-slate-600">
                  <span className="truncate">{s.skill}</span>
                  <span>{s.total > 0 ? `${(s.rate * 100).toFixed(0)}%` : '-'}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
      <p className="text-xs text-slate-400">工作台数: {workstationKeys.length}</p>
    </div>
  )
}
