import { useQuery } from '@tanstack/react-query'
import { evaluatorApi } from '@cn-kis/api-client'
import { Badge, Empty } from '@cn-kis/ui-kit'
import { User, Award, GraduationCap, BarChart3 } from 'lucide-react'

export function ProfilePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['evaluator', 'profile'],
    queryFn: () => evaluatorApi.myProfile(),
  })

  const profile = (data as any)?.data

  if (isLoading) return <div className="text-center py-12 text-slate-400">加载中...</div>
  if (!profile) return <Empty message="暂无个人档案" />

  const perf = profile.performance ?? {}
  const quals = profile.qualifications ?? []
  const trainings = profile.trainings ?? []

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-slate-800">个人档案</h2>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white border border-slate-200 p-4 text-center">
          <div className="text-2xl font-bold text-indigo-600">{perf.month_completed ?? 0}</div>
          <div className="text-xs text-slate-400 mt-1">本月完成</div>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{perf.approval_rate != null ? `${perf.approval_rate}%` : '--'}</div>
          <div className="text-xs text-slate-400 mt-1">一次通过率</div>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{perf.on_time_rate != null ? `${perf.on_time_rate}%` : '--'}</div>
          <div className="text-xs text-slate-400 mt-1">准时完成率</div>
        </div>
        <div className="rounded-xl bg-white border border-slate-200 p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">{perf.month_approved ?? 0}</div>
          <div className="text-xs text-slate-400 mt-1">本月审核通过</div>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-amber-500" />
          资质证书
        </h3>
        {quals.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-4">暂无资质记录</div>
        ) : (
          <div className="space-y-2">
            {quals.map((q: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div>
                  <div className="text-sm text-slate-700">{q.qualification_name}</div>
                  <div className="text-xs text-slate-400">获得：{q.obtained_date}</div>
                </div>
                <Badge variant={q.status === 'valid' ? 'success' : q.status === 'expiring' ? 'warning' : 'error'}>
                  {q.status === 'valid' ? '有效' : q.status === 'expiring' ? '即将到期' : '已过期'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3">
          <GraduationCap className="w-4 h-4 text-blue-500" />
          培训记录
        </h3>
        {trainings.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-4">暂无培训记录</div>
        ) : (
          <div className="space-y-2">
            {trainings.map((t: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <div>
                  <div className="text-sm text-slate-700">{t.training_name}</div>
                  <div className="text-xs text-slate-400">{t.training_date}</div>
                </div>
                <div className="flex items-center gap-2">
                  {t.score != null && (
                    <span className="text-xs font-medium text-indigo-600">{t.score}分</span>
                  )}
                  <Badge variant={t.status === 'completed' ? 'success' : 'warning'}>
                    {t.status === 'completed' ? '已完成' : '进行中'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
