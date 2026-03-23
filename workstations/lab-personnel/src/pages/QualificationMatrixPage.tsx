import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { labPersonnelApi } from '@cn-kis/api-client'
import type { QualificationMatrix, GapAnalysis, MethodQualItem } from '@cn-kis/api-client'
import { ShieldCheck, Search, AlertTriangle, TrendingUp, Download } from 'lucide-react'

const LEVEL_COLORS: Record<string, string> = {
  learning: 'bg-slate-200 text-slate-700',
  probation: 'bg-blue-100 text-blue-700',
  independent: 'bg-green-100 text-green-700',
  mentor: 'bg-amber-100 text-amber-800',
  '': 'bg-slate-50 text-slate-300',
}

const LEVEL_LABELS: Record<string, string> = {
  learning: '学习',
  probation: '见习',
  independent: '独立',
  mentor: '带教',
}

export function QualificationMatrixPage() {
  const [activeTab, setActiveTab] = useState<'matrix' | 'gap' | 'list'>('matrix')
  const [searchMethod, setSearchMethod] = useState('')

  const { data: matrixData } = useQuery({
    queryKey: ['lab-personnel', 'qualification-matrix'],
    queryFn: () => labPersonnelApi.getQualificationMatrix(),
  })
  const matrix = (matrixData as any)?.data as QualificationMatrix | undefined

  const { data: gapData } = useQuery({
    queryKey: ['lab-personnel', 'gap-analysis'],
    queryFn: () => labPersonnelApi.getGapAnalysis(),
  })
  const gap = (gapData as any)?.data as GapAnalysis | undefined

  const { data: qualListData } = useQuery({
    queryKey: ['lab-personnel', 'method-quals'],
    queryFn: () => labPersonnelApi.getMethodQuals({}),
  })
  const qualList = ((qualListData as any)?.data as { items: MethodQualItem[] } | undefined)?.items ?? []

  const filteredMethods = matrix?.methods?.filter(m =>
    !searchMethod || m.name.includes(searchMethod) || m.code.includes(searchMethod)
  ) ?? []

  const tabs = [
    { key: 'matrix' as const, label: '资质矩阵', icon: ShieldCheck },
    { key: 'gap' as const, label: '差距分析', icon: TrendingUp },
    { key: 'list' as const, label: '资质列表', icon: ShieldCheck },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">资质矩阵</h2>
          <p className="text-sm text-slate-500 mt-1">人员 × 检测方法资质全景矩阵，识别单点风险与能力缺口</p>
        </div>
        <button
          onClick={() => window.open('/api/v1/lab-personnel/export/qualification-matrix', '_blank')}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          <Download className="w-4 h-4" />导出 Excel
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            data-tab={tab.key}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {/* Matrix View */}
      {activeTab === 'matrix' && matrix && (
        <div className="bg-white rounded-xl border border-slate-200 p-5" data-section="qualification-matrix">
          {/* Search */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="搜索检测方法" value={searchMethod} onChange={e => setSearchMethod(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <div className="flex gap-2 text-xs">
              {Object.entries(LEVEL_LABELS).map(([k, v]) => (
                <span key={k} className={`px-2 py-1 rounded ${LEVEL_COLORS[k]}`}>{v}</span>
              ))}
              <span className={`px-2 py-1 rounded ${LEVEL_COLORS['']}`}>无资质</span>
            </div>
          </div>

          {/* Matrix Table */}
          <div className="overflow-auto max-h-[500px]">
            <table className="text-sm border-collapse w-full">
              <thead className="sticky top-0 bg-white z-10">
                <tr>
                  <th className="text-left px-3 py-2 border-b border-slate-200 bg-slate-50 font-medium text-slate-600 sticky left-0 z-20 min-w-[120px]">人员</th>
                  {filteredMethods.map(m => (
                    <th key={m.id} className="px-2 py-2 border-b border-slate-200 bg-slate-50 font-medium text-slate-600 text-center whitespace-nowrap">{m.code}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(matrix.staff ?? []).map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 border-b border-slate-100 font-medium text-slate-700 sticky left-0 bg-white">{s.name}</td>
                    {filteredMethods.map(m => {
                      const level = matrix.matrix?.[String(s.id)]?.[String(m.id)] || ''
                      return (
                        <td key={m.id} className="px-2 py-2 border-b border-slate-100 text-center" data-cell data-cell-type="method" data-status={level === 'independent' || level === 'mentor' ? 'pass' : level === '' ? 'warning' : 'learning'}>
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[level] ?? LEVEL_COLORS['']}`}>
                            {LEVEL_LABELS[level] || '-'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Single Point Risks */}
          {matrix.single_point_risks && matrix.single_point_risks.length > 0 && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg" data-section="single-point-risks">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <h4 className="text-sm font-semibold text-red-700">单点依赖风险</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {matrix.single_point_risks.map(r => (
                  <span key={r.method_id} className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-medium" data-risk="true">
                    {r.method_name}（仅 {r.qualified_count} 人具备资质）
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gap Analysis */}
      {activeTab === 'gap' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5" data-section="gap-analysis">
          <h3 className="font-semibold text-slate-800 mb-4">能力差距分析</h3>
          {gap?.gaps && gap.gaps.length > 0 ? (
            <div className="space-y-3">
              {gap.gaps.map(g => (
                <div key={g.method_id} className="flex items-center justify-between bg-slate-50 rounded-lg p-4">
                  <div>
                    <p className="font-medium text-slate-800">{g.method_name}</p>
                    <p className="text-xs text-slate-500">要求等级: {g.required_level} · 现有合格: {g.qualified_staff} 人</p>
                  </div>
                  <div className={`text-sm font-bold ${g.gap_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {g.gap_count > 0 ? `缺口 ${g.gap_count} 人` : '充足'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-slate-400 py-8">暂无差距分析数据</div>
          )}
          {gap?.recommendations && gap.recommendations.length > 0 && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <h4 className="text-sm font-semibold text-blue-700 mb-2">改进建议</h4>
              <ul className="text-sm text-blue-600 space-y-1">
                {gap.recommendations.map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Qualification List */}
      {activeTab === 'list' && (
        <div className="bg-white rounded-xl border border-slate-200" data-section="qual-list">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">人员</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">检测方法</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">资质等级</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">执行次数</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">最近执行</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">有效期</th>
              </tr>
            </thead>
            <tbody>
              {qualList.map(q => (
                <tr key={q.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{q.staff_name}</td>
                  <td className="px-4 py-3"><span className="text-slate-800">{q.method_name}</span> <span className="text-slate-400 text-xs">{q.method_code}</span></td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${LEVEL_COLORS[q.level] ?? LEVEL_COLORS['']}`}>{q.level_display ?? LEVEL_LABELS[q.level] ?? '-'}</span></td>
                  <td className="px-4 py-3 text-slate-600">{q.total_executions ?? 0}</td>
                  <td className="px-4 py-3 text-slate-500">{q.last_execution_date || '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{q.expiry_date || '永久'}</td>
                </tr>
              ))}
              {qualList.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">暂无资质数据</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
