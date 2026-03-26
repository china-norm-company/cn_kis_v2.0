/**
 * 试验立项准备
 *
 * 临床试验立项申请、资质审核与伦理前准备
 */
import { FlaskConical } from 'lucide-react'

export default function TrialInitiationPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-400">
      <FlaskConical className="w-12 h-12 text-slate-300" />
      <div className="text-center">
        <p className="text-base font-medium text-slate-600">试验立项准备</p>
        <p className="text-sm mt-1">功能建设中，敬请期待</p>
      </div>
    </div>
  )
}
