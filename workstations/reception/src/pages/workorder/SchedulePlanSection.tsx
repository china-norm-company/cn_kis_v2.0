/**
 * 排期计划展示（数据来源于执行台项目管理详情页）
 */
import { Card } from '@cn-kis/ui-kit'
import type { SchedulePlanData } from './types'

export function SchedulePlanSection({ schedulePlan }: { schedulePlan?: SchedulePlanData | null }) {
  if (!schedulePlan || (!schedulePlan.rows?.length && !schedulePlan.raw)) {
    return null
  }

  const { rows = [], overall_start, overall_end } = schedulePlan
  const maxDates = rows.length ? Math.max(1, ...rows.map((r) => r.dates?.length ?? 0)) : 0

  return (
    <Card variant="elevated" className="p-4">
      <h3 className="text-base font-semibold text-slate-800 mb-3">排期计划</h3>
      {(overall_start || overall_end) && (
        <div className="border-b border-slate-200 mb-3 pb-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="px-4 py-2 text-center font-medium text-slate-700 border-b border-r border-slate-200">执行开始日期</th>
                <th className="px-4 py-2 text-center font-medium text-slate-700 border-b border-slate-200">执行结束日期</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-2 text-center text-slate-700 border-r border-slate-200 bg-white">{overall_start || '—'}</td>
                <td className="px-4 py-2 text-center text-slate-700 bg-white">{overall_end || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100">
                <th className="px-3 py-2 text-left font-medium text-slate-700 border-r border-slate-200">访视时间点</th>
                {Array.from({ length: maxDates }, (_, i) => (
                  <th key={i} className="px-3 py-2 text-left font-medium text-slate-700 border-r border-slate-200 last:border-r-0">
                    执行日期{i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-700 border-r border-slate-100 bg-white/50">{row.visitPoint}</td>
                  {Array.from({ length: maxDates }, (_, di) => (
                    <td key={di} className="px-3 py-2 text-slate-700 border-r border-slate-100 last:border-r-0 bg-white/50">
                      {(row.dates ?? [])[di] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : schedulePlan.raw ? (
        <pre className="text-sm text-slate-700 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3">
          {schedulePlan.raw}
        </pre>
      ) : null}
    </Card>
  )
}
