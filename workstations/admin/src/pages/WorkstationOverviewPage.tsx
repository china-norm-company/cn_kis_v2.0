import { ExternalLink } from 'lucide-react'

const WORKSTATIONS = [
  { key: 'secretary', name: '子衿·秘书台', path: '/secretary', color: 'bg-violet-50 text-violet-600 border-violet-200', logo: '衿' },
  { key: 'finance', name: '管仲·财务台', path: '/finance', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', logo: '仲' },
  { key: 'research', name: '采苓·研究台', path: '/research', color: 'bg-blue-50 text-blue-600 border-blue-200', logo: '苓' },
  { key: 'execution', name: '维周·执行台', path: '/execution', color: 'bg-orange-50 text-orange-600 border-orange-200', logo: '周' },
  { key: 'quality', name: '怀瑾·质量台', path: '/quality', color: 'bg-red-50 text-red-600 border-red-200', logo: '瑾' },
  { key: 'hr', name: '时雨·人事台', path: '/hr', color: 'bg-teal-50 text-teal-600 border-teal-200', logo: '雨' },
  { key: 'crm', name: '进思·客户台', path: '/crm', color: 'bg-pink-50 text-pink-600 border-pink-200', logo: '思' },
  { key: 'recruitment', name: '招招·招募台', path: '/recruitment', color: 'bg-cyan-50 text-cyan-600 border-cyan-200', logo: '招' },
  { key: 'equipment', name: '器衡·设备台', path: '/equipment', color: 'bg-amber-50 text-amber-600 border-amber-200', logo: '衡' },
  { key: 'material', name: '度支·物料台', path: '/material', color: 'bg-lime-50 text-lime-600 border-lime-200', logo: '支' },
  { key: 'facility', name: '坤元·设施台', path: '/facility', color: 'bg-sky-50 text-sky-600 border-sky-200', logo: '坤' },
  { key: 'evaluator', name: '衡技·评估台', path: '/evaluator', color: 'bg-indigo-50 text-indigo-600 border-indigo-200', logo: '技' },
  { key: 'lab-personnel', name: '共济·人员台', path: '/lab-personnel', color: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200', logo: '济' },
  { key: 'ethics', name: '御史·伦理台', path: '/ethics', color: 'bg-rose-50 text-rose-600 border-rose-200', logo: '史' },
  { key: 'reception', name: '和序·接待台', path: '/reception', color: 'bg-yellow-50 text-yellow-600 border-yellow-200', logo: '序' },
]

export function WorkstationOverviewPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">工作台总览</h2>
        <p className="text-sm text-slate-400 mt-1">系统共 {WORKSTATIONS.length} 个工作台</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {WORKSTATIONS.map((ws) => (
          <div key={ws.key} className={`rounded-xl border bg-white p-5 hover:shadow-md transition-shadow ${ws.color.split(' ')[2] || 'border-slate-200'}`}>
            <div className="flex items-start gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg font-bold ${ws.color.split(' ').slice(0, 2).join(' ')}`}>
                {ws.logo}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-800">{ws.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{ws.path}</div>
              </div>
              <a
                href={ws.path}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`打开 ${ws.name}`}
                className="p-1 text-slate-300 hover:text-slate-600"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-500">已部署</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
