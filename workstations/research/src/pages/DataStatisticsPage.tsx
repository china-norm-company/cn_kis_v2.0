/**
 * 数据统计分析
 *
 * 试验数据的统计分析与可视化
 */
import { BarChart2 } from 'lucide-react'

export default function DataStatisticsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-400">
      <BarChart2 className="w-12 h-12 text-slate-300" />
      <div className="text-center">
        <p className="text-base font-medium text-slate-600">数据统计分析</p>
        <p className="text-sm mt-1">功能建设中，敬请期待</p>
      </div>
    </div>
  )
}
