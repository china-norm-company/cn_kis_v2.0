import { useQuery } from '@tanstack/react-query'
import { Card } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'

interface CompetencyDimension {
  id: number
  name: string
  description: string
  icon: string
  levels: string[]
}

export function CompetencyPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['competency-models'],
    queryFn: () =>
      api.get<{ items: CompetencyDimension[] }>('/hr/competency/list'),
  })

  const dimensions = data?.data?.items ?? []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        加载中...
      </div>
    )
  }

  if (dimensions.length === 0) {
    return (
      <div className="space-y-5 md:space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 md:text-2xl">胜任力模型</h1>
          <p className="mt-1 text-sm text-slate-500">临床研究岗位能力要求框架</p>
        </div>
        <Card>
          <div className="p-8 text-center text-slate-400">暂无胜任力模型数据，请在后台配置</div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">胜任力模型</h1>
        <p className="mt-1 text-sm text-slate-500">临床研究岗位能力要求框架（{dimensions.length}维度 x {dimensions[0]?.levels?.length ?? 4}等级）</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {dimensions.map((dim) => (
          <Card key={dim.id}>
            <div className="p-4 md:p-5">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-2xl">{dim.icon || '📋'}</span>
                <div>
                  <h3 className="font-semibold text-slate-800">{dim.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{dim.description}</p>
                </div>
              </div>
              <div className="space-y-2">
                {(dim.levels ?? []).map((level: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      idx === 0 ? 'bg-slate-100 text-slate-500' :
                      idx === 1 ? 'bg-blue-100 text-blue-600' :
                      idx === 2 ? 'bg-amber-100 text-amber-600' :
                      'bg-emerald-100 text-emerald-600'
                    }`}>
                      {idx + 1}
                    </span>
                    <span className="text-sm text-slate-600">{level}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
