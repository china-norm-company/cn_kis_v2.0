import { Database, GitBranch, Activity, Shield, HardDrive, BookOpen, AlertCircle, CheckCircle } from 'lucide-react'

const stats = [
  { label: '数据表', value: '-', icon: Database, color: 'text-purple-600 bg-purple-50' },
  { label: '血缘节点', value: '-', icon: GitBranch, color: 'text-blue-600 bg-blue-50' },
  { label: '活跃 Pipeline', value: '-', icon: Activity, color: 'text-emerald-600 bg-emerald-50' },
  { label: '知识条目', value: '-', icon: BookOpen, color: 'text-amber-600 bg-amber-50' },
]

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">数据全景</h2>
        <p className="text-sm text-slate-500 mt-1">数据中台资产与运行状态全局概览</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{s.label}</p>
                <p className="text-2xl font-bold text-slate-800 mt-1">{s.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            数据质量告警
          </h3>
          <p className="text-sm text-slate-400">暂无告警</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            存储健康状态
          </h3>
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-slate-400" />
            <Shield className="w-4 h-4 text-slate-400" />
            <p className="text-sm text-slate-400">数据加载中...</p>
          </div>
        </div>
      </div>
    </div>
  )
}
