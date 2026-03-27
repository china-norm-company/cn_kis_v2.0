/**
 * 数据报告准备
 *
 * 数据报告的生成、审阅与归档准备
 */
import { FileSpreadsheet } from 'lucide-react'

export default function DataReportPreparationPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-400">
      <FileSpreadsheet className="w-12 h-12 text-slate-300" />
      <div className="text-center">
        <p className="text-base font-medium text-slate-600">数据报告准备</p>
        <p className="text-sm mt-1">功能建设中，敬请期待</p>
      </div>
    </div>
  )
}
