/**
 * 方案设计准备
 *
 * 临床试验方案设计的前期准备与评审
 */
import { PenLine } from 'lucide-react'

export default function ProposalDesignPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-400">
      <PenLine className="w-12 h-12 text-slate-300" />
      <div className="text-center">
        <p className="text-base font-medium text-slate-600">方案设计准备</p>
        <p className="text-sm mt-1">功能建设中，敬请期待</p>
      </div>
    </div>
  )
}
