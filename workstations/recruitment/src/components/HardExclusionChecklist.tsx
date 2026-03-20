import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

export interface HardExclusionCheck {
  item: string
  met: boolean
  value: string
}

interface HardExclusionChecklistProps {
  checks: HardExclusionCheck[]
  onChange: (checks: HardExclusionCheck[]) => void
  readonly?: boolean
}

const DEFAULT_CHECKS: HardExclusionCheck[] = [
  { item: '年龄范围（18-60岁）', met: true, value: '' },
  { item: '近1周未使用抗组胺药', met: true, value: '' },
  { item: '近1月未使用免疫抑制剂', met: true, value: '' },
  { item: '近2月受试部位未用抗炎药物', met: true, value: '' },
  { item: '无炎症性皮肤病/糖尿病/哮喘', met: true, value: '' },
  { item: '非妊娠/哺乳期', met: true, value: '' },
  { item: '近1月未参加其他试验', met: true, value: '' },
  { item: '无影响判定的瘢痕/色素沉着', met: true, value: '' },
]

export function getDefaultChecks(): HardExclusionCheck[] {
  return DEFAULT_CHECKS.map((c) => ({ ...c }))
}

export function HardExclusionChecklist({ checks, onChange, readonly }: HardExclusionChecklistProps) {
  const failCount = checks.filter((c) => !c.met).length
  const allPassed = failCount === 0

  const toggle = (idx: number) => {
    if (readonly) return
    const updated = checks.map((c, i) => (i === idx ? { ...c, met: !c.met } : c))
    onChange(updated)
  }

  const updateValue = (idx: number, value: string) => {
    if (readonly) return
    const updated = checks.map((c, i) => (i === idx ? { ...c, value } : c))
    onChange(updated)
  }

  return (
    <div className={`rounded-lg border-2 border-dashed p-4 ${allPassed ? 'border-emerald-300 bg-emerald-50/30' : 'border-red-300 bg-red-50/30'}`}>
      <div className="space-y-2">
        {checks.map((check, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${
              check.met ? 'bg-white' : 'bg-red-50 border border-red-200'
            }`}
          >
            <button
              type="button"
              disabled={readonly}
              onClick={() => toggle(idx)}
              className={`mt-0.5 flex-shrink-0 transition-colors ${
                readonly ? 'cursor-default' : 'cursor-pointer'
              }`}
            >
              {check.met ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm ${check.met ? 'text-slate-700' : 'text-red-700 font-medium'}`}>
                  {check.item}
                </span>
                {!check.met && <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />}
              </div>
              {!check.met && (
                <input
                  type="text"
                  value={check.value}
                  onChange={(e) => updateValue(idx, e.target.value)}
                  placeholder="请说明具体情况..."
                  disabled={readonly}
                  className="mt-1.5 w-full text-xs px-2 py-1.5 border border-red-200 rounded bg-white text-slate-700 placeholder:text-slate-400 disabled:bg-slate-50"
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
        allPassed
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-red-100 text-red-700'
      }`}>
        {allPassed ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            <span>全部满足</span>
          </>
        ) : (
          <>
            <AlertTriangle className="w-4 h-4" />
            <span>{failCount} 项不满足</span>
          </>
        )}
      </div>
    </div>
  )
}
