import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Award, GraduationCap, BarChart3, Target, AlertCircle, CheckCircle } from 'lucide-react'
import { evaluatorApi } from '@cn-kis/api-client'
import type { EvaluatorProfile } from '@cn-kis/api-client'

const TABS = [
  { key: 'qualifications', label: '资质状态', icon: Award },
  { key: 'training', label: '培训计划', icon: GraduationCap },
  { key: 'performance', label: '绩效统计', icon: BarChart3 },
  { key: 'assessment', label: '能力评估', icon: Target },
] as const

type TabKey = typeof TABS[number]['key']

export function GrowthPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('qualifications')

  const { data: profileRes, isLoading } = useQuery({
    queryKey: ['evaluator', 'profile'],
    queryFn: () => evaluatorApi.myProfile(),
  })

  const profile = (profileRes as any)?.data as EvaluatorProfile | undefined
  const perf = profile?.performance
  const qualifications = profile?.qualifications ?? []
  const trainings = profile?.trainings ?? []

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">我的成长</h2>
        <p className="text-sm text-slate-500 mt-1">资质管理、培训跟踪与绩效分析</p>
      </div>

      {/* Tab 切换 */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex overflow-x-auto border-b border-slate-200">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 flex min-h-11 items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.key
                  ? 'text-indigo-700 bg-indigo-50/50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <tab.icon className="w-4 h-4" />{tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
              )}
            </button>
          ))}
        </div>

        <div className="p-4 md:p-6">
          {isLoading && (
            <div className="text-center py-8 text-slate-400 text-sm">加载中...</div>
          )}

          {/* ===== 资质状态 ===== */}
          {!isLoading && activeTab === 'qualifications' && (
              <div className="space-y-4">
              <h3 className="text-base font-semibold text-slate-800">资质状态</h3>
              {qualifications.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Award className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">暂无资质记录</p>
                  <p className="text-xs mt-1 text-slate-300">请联系人事部门添加您的资质信息</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {qualifications.map((q: any, idx: number) => {
                    const isExpired = q.expiry_date && new Date(q.expiry_date) < new Date()
                    const isExpiringSoon = q.expiry_date && !isExpired &&
                      new Date(q.expiry_date).getTime() - Date.now() < 90 * 86400000

                    return (
                      <div key={idx} className={`p-4 rounded-lg border ${
                        isExpired ? 'border-red-200 bg-red-50/50' :
                        isExpiringSoon ? 'border-amber-200 bg-amber-50/50' :
                        'border-green-200 bg-green-50/50'
                      }`}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            {isExpired ? <AlertCircle className="w-4 h-4 text-red-500" /> :
                             isExpiringSoon ? <AlertCircle className="w-4 h-4 text-amber-500" /> :
                             <CheckCircle className="w-4 h-4 text-green-500" />}
                            <span className="text-sm font-medium text-slate-700">{q.qualification_name}</span>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            isExpired ? 'bg-red-100 text-red-700' :
                            isExpiringSoon ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {isExpired ? '已过期' : isExpiringSoon ? '即将过期' : '有效'}
                          </span>
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-slate-500 ml-6">
                          {q.qualification_code && <span>编号: {q.qualification_code}</span>}
                          {q.obtained_date && <span>获取: {q.obtained_date}</span>}
                          {q.expiry_date && <span>到期: {q.expiry_date}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ===== 培训计划 ===== */}
          {!isLoading && activeTab === 'training' && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-slate-800">培训记录</h3>
              {trainings.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">暂无培训记录</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {trainings.map((t: any, idx: number) => (
                    <div key={idx} className="flex flex-col gap-2 p-3 rounded-lg border border-slate-200 bg-white sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{t.training_name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{t.training_date}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {t.score != null && (
                          <span className="text-xs text-slate-500">得分: {t.score}</span>
                        )}
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          t.status === 'completed' ? 'bg-green-100 text-green-700' :
                          t.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {t.status === 'completed' ? '已完成' :
                           t.status === 'in_progress' ? '进行中' :
                           t.status === 'pending' ? '待参加' : t.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== 绩效统计 ===== */}
          {!isLoading && activeTab === 'performance' && (
              <div className="space-y-6">
              <h3 className="text-base font-semibold text-slate-800">本月绩效</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { label: '本月完成', value: perf?.month_completed ?? '--', color: 'text-green-600', bg: 'bg-green-50' },
                  { label: '审计通过率', value: perf ? `${perf.approval_rate}%` : '--%', color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: '按时完成率', value: perf ? `${perf.on_time_rate}%` : '--%', color: 'text-indigo-600', bg: 'bg-indigo-50' },
                ].map((stat) => (
                  <div key={stat.label} className={`${stat.bg} rounded-lg p-4`}>
                    <p className="text-sm text-slate-500">{stat.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                  </div>
                ))}
              </div>

              <MonthlyTrendChart trend={profile?.monthly_trend ?? []} />
            </div>
          )}

          {/* ===== 能力评估 ===== */}
          {!isLoading && activeTab === 'assessment' && (
            <div className="space-y-4">
              <CompetencyAssessment accountId={0} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MonthlyTrendChart({ trend }: { trend: { month: string; completed: number; approval_rate: number; on_time_rate: number }[] }) {
  if (trend.length === 0) {
    return (
      <div className="bg-slate-50 rounded-lg p-6 text-center text-slate-400">
        <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">暂无月度趋势数据</p>
      </div>
    )
  }

  const maxCompleted = Math.max(...trend.map(t => t.completed), 1)

  return (
    <div className="bg-slate-50 rounded-lg p-4 space-y-4">
      <h4 className="text-sm font-semibold text-slate-700">月度趋势（近 6 个月）</h4>

      <div>
        <p className="text-xs text-slate-500 mb-2">工单完成数</p>
        <div className="flex items-end gap-2 h-32">
          {trend.map((t) => (
            <div key={t.month} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs text-slate-600 font-mono">{t.completed}</span>
              <div
                className="w-full bg-indigo-400 rounded-t transition-all"
                style={{ height: `${(t.completed / maxCompleted) * 100}%`, minHeight: t.completed > 0 ? '4px' : '0' }}
              />
              <span className="text-[10px] text-slate-400">{t.month.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-slate-500 mb-1">质量通过率</p>
          <div className="flex items-center gap-2">
            {trend.map((t) => (
              <div key={t.month} className="flex-1 text-center">
                <div className={`text-xs font-mono font-medium ${t.approval_rate >= 90 ? 'text-green-600' : t.approval_rate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                  {t.approval_rate}%
                </div>
                <div className="text-[10px] text-slate-400">{t.month.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">按时完成率</p>
          <div className="flex items-center gap-2">
            {trend.map((t) => (
              <div key={t.month} className="flex-1 text-center">
                <div className={`text-xs font-mono font-medium ${t.on_time_rate >= 90 ? 'text-green-600' : t.on_time_rate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                  {t.on_time_rate}%
                </div>
                <div className="text-[10px] text-slate-400">{t.month.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function CompetencyAssessment({ accountId }: { accountId: number }) {
  const { data: assessmentRes, isLoading } = useQuery({
    queryKey: ['hr', 'competency', accountId],
    queryFn: () => fetch(`/api/v1/hr/competency-assessments?account_id=${accountId}&page_size=5`)
      .then(r => r.json())
      .catch(() => ({ data: { items: [] } })),
  })

  const assessments = ((assessmentRes as any)?.data?.items ?? []) as any[]

  if (isLoading) {
    return <div className="text-center py-8 text-slate-400 text-sm">加载中...</div>
  }

  if (assessments.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-slate-800">能力评估</h3>
        <div className="text-center py-8 text-slate-400">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">暂无评估记录</p>
          <p className="text-xs mt-1 text-slate-300">待人事部门安排能力评估</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-slate-800">能力评估</h3>
      <div className="space-y-3">
        {assessments.map((a: any, idx: number) => (
          <div key={idx} className="p-4 rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">{a.assessment_name ?? a.competency_name ?? '评估'}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                a.level === 'expert' ? 'bg-purple-100 text-purple-700' :
                a.level === 'advanced' ? 'bg-blue-100 text-blue-700' :
                a.level === 'intermediate' ? 'bg-green-100 text-green-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {a.level ?? a.status ?? '--'}
              </span>
            </div>
            {a.score != null && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-indigo-500 h-2 rounded-full"
                    style={{ width: `${Math.min(a.score, 100)}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 font-mono">{a.score}</span>
              </div>
            )}
            {a.assessed_at && (
              <p className="text-xs text-slate-400 mt-1">评估日期: {new Date(a.assessed_at).toLocaleDateString('zh-CN')}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
