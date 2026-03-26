/**
 * 工作台卡片展示用样式（与 backend/configs/workstations.yaml 的 key 对齐）。
 * 名称与 path 以 API 注册表为准；此处仅补充配色与角标字。
 */
export const WORKSTATION_CARD_BY_KEY: Record<string, { color: string; logo: string }> = {
  secretary: { color: 'bg-violet-50 text-violet-600 border-violet-200', logo: '衿' },
  finance: { color: 'bg-emerald-50 text-emerald-600 border-emerald-200', logo: '仲' },
  research: { color: 'bg-blue-50 text-blue-600 border-blue-200', logo: '苓' },
  execution: { color: 'bg-orange-50 text-orange-600 border-orange-200', logo: '周' },
  quality: { color: 'bg-red-50 text-red-600 border-red-200', logo: '瑾' },
  hr: { color: 'bg-teal-50 text-teal-600 border-teal-200', logo: '雨' },
  crm: { color: 'bg-pink-50 text-pink-600 border-pink-200', logo: '思' },
  recruitment: { color: 'bg-cyan-50 text-cyan-600 border-cyan-200', logo: '招' },
  equipment: { color: 'bg-amber-50 text-amber-600 border-amber-200', logo: '衡' },
  material: { color: 'bg-lime-50 text-lime-600 border-lime-200', logo: '支' },
  facility: { color: 'bg-sky-50 text-sky-600 border-sky-200', logo: '坤' },
  evaluator: { color: 'bg-indigo-50 text-indigo-600 border-indigo-200', logo: '技' },
  'lab-personnel': { color: 'bg-fuchsia-50 text-fuchsia-600 border-fuchsia-200', logo: '济' },
  ethics: { color: 'bg-rose-50 text-rose-600 border-rose-200', logo: '史' },
  reception: { color: 'bg-yellow-50 text-yellow-600 border-yellow-200', logo: '序' },
  'control-plane': { color: 'bg-slate-50 text-slate-700 border-slate-200', logo: '枢' },
  admin: { color: 'bg-amber-50 text-amber-800 border-amber-200', logo: '鸣' },
  'digital-workforce': { color: 'bg-purple-50 text-purple-700 border-purple-200', logo: '书' },
  'data-platform': { color: 'bg-cyan-50 text-cyan-800 border-cyan-200', logo: '明' },
}

export function workstationCardStyle(key: string): { color: string; logo: string } {
  return (
    WORKSTATION_CARD_BY_KEY[key] ?? {
      color: 'bg-slate-50 text-slate-600 border-slate-200',
      logo: key.slice(0, 1).toUpperCase(),
    }
  )
}
