/**
 * 研究概览
 *
 * 研究者视角的项目看板：
 * - 我参与的项目及其状态
 * - 受试者入组进度
 * - 工单完成率
 * - 近期待办
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Card, StatCard, Empty } from '@cn-kis/ui-kit'
import { FlaskConical, Users, ClipboardList, TrendingUp } from 'lucide-react'

export function OverviewPage() {
  const { data: protocolsRes } = useQuery({
    queryKey: ['overview-protocols'],
    queryFn: () => api.get<{ items: any[]; total: number }>('/protocol/list', {
      params: { status: 'active', page: 1, page_size: 50 },
    }),
  })

  const { data: subjectsRes } = useQuery({
    queryKey: ['overview-subjects'],
    queryFn: () => api.get<{ items: any[]; total: number }>('/subject/list', {
      params: { page: 1, page_size: 1 },
    }),
  })

  const { data: woStatsRes } = useQuery({
    queryKey: ['overview-wo-stats'],
    queryFn: () => api.get<Record<string, number>>('/workorder/stats'),
  })

  const protocols = protocolsRes?.data?.items ?? []
  const totalSubjects = subjectsRes?.data?.total ?? 0
  const woStats = woStatsRes?.data ?? {}
  const totalWO = woStats.total ?? 0
  const completedWO = (woStats.completed ?? 0) + (woStats.approved ?? 0)

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">研究概览</h2>
        <p className="text-sm text-slate-500 mt-1">我参与的项目状态与进度</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard
          title="活跃项目"
          value={protocols.length}
          icon={<FlaskConical className="w-6 h-6" />}
        />
        <StatCard
          title="受试者总数"
          value={totalSubjects}
          icon={<Users className="w-6 h-6" />}
        />
        <StatCard
          title="工单总数"
          value={totalWO}
          icon={<ClipboardList className="w-6 h-6" />}
        />
        <StatCard
          title="完成率"
          value={totalWO > 0 ? `${Math.round(completedWO / totalWO * 100)}%` : '0%'}
          icon={<TrendingUp className="w-6 h-6" />}
        />
      </div>

      {/* 项目列表 */}
      <Card>
        <h3 className="text-base font-semibold text-slate-800 mb-4">活跃项目</h3>
        {protocols.length > 0 ? (
          <div className="space-y-3">
            {protocols.map((p: any) => (
              <div key={p.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 md:p-4 bg-slate-50 rounded-lg">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800">{p.title}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                    {p.code && <span className="mr-3">{p.code}</span>}
                    {p.product_category && <span>产品: {p.product_category}</span>}
                    {p.claim_type && <span className="ml-3">功效: {p.claim_type}</span>}
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  {p.sample_size ? `目标 ${p.sample_size} 例` : '进行中'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="暂无活跃项目" />
        )}
      </Card>

      {/* 近期待办 */}
      <Card>
        <h3 className="text-base font-semibold text-slate-700 mb-4">工单概况</h3>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="text-center p-3 bg-amber-50 rounded-lg">
            <div className="text-lg font-bold text-amber-700">{(woStats.pending ?? 0) + (woStats.assigned ?? 0)}</div>
            <div className="text-xs text-amber-600 mt-1">待处理</div>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-lg font-bold text-blue-700">{woStats.in_progress ?? 0}</div>
            <div className="text-xs text-blue-600 mt-1">进行中</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-lg font-bold text-green-700">{completedWO}</div>
            <div className="text-xs text-green-600 mt-1">已完成</div>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <div className="text-lg font-bold text-purple-700">{woStats.review ?? 0}</div>
            <div className="text-xs text-purple-600 mt-1">待审核</div>
          </div>
        </div>
      </Card>
    </div>
  )
}
