/**
 * 试验报告准备
 *
 * 临床试验总结报告（CSR）的准备与审查
 */
import { ScrollText } from 'lucide-react'

export default function TrialReportPreparationPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-400">
      <ScrollText className="w-12 h-12 text-slate-300" />
      <div className="text-center">
        <p className="text-base font-medium text-slate-600">试验报告准备</p>
        <p className="text-sm mt-1">功能建设中，敬请期待</p>
      </div>
    </div>
  )
}
