import { Card } from '@cn-kis/ui-kit'

interface SkinAssessmentFormProps {
  assessment: Record<string, unknown> | null
  instruments: Record<string, unknown> | null
  onChange: (assessment: Record<string, unknown>, instruments: Record<string, unknown>) => void
  readonly?: boolean
}

const SKIN_CONDITION_OPTIONS = ['正常', '轻度异常', '明显异常'] as const
const SITE_INTEGRITY_OPTIONS = ['完好', '轻微损伤', '明显损伤'] as const
const FITZPATRICK_OPTIONS = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500"
        title={label}
      >
        <option value="">请选择</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}

function NumberInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  unit,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  unit?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 mb-1">
        {label}
        {unit && <span className="text-slate-400 font-normal ml-1">({unit})</span>}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-500"
      />
    </div>
  )
}

export function SkinAssessmentForm({ assessment, instruments, onChange, readonly }: SkinAssessmentFormProps) {
  const a = (assessment ?? {}) as Record<string, string>
  const ins = (instruments ?? {}) as Record<string, string>

  const updateA = (key: string, val: string) => {
    onChange({ ...a, [key]: val }, ins)
  }

  const updateIns = (key: string, val: string) => {
    onChange(a, { ...ins, [key]: val })
  }

  return (
    <div className="space-y-6">
      <Card title="皮肤视觉评估" variant="bordered">
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="整体皮肤状况"
            value={a.overall_condition ?? ''}
            options={SKIN_CONDITION_OPTIONS}
            onChange={(v) => updateA('overall_condition', v)}
            disabled={readonly}
          />
          <SelectField
            label="受试部位完整性"
            value={a.site_integrity ?? ''}
            options={SITE_INTEGRITY_OPTIONS}
            onChange={(v) => updateA('site_integrity', v)}
            disabled={readonly}
          />
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">可见皮肤疾病</label>
            <input
              type="text"
              value={a.visible_diseases ?? ''}
              onChange={(e) => updateA('visible_diseases', e.target.value)}
              placeholder="无则留空"
              disabled={readonly}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <SelectField
            label="Fitzpatrick 分型"
            value={a.fitzpatrick ?? ''}
            options={FITZPATRICK_OPTIONS}
            onChange={(v) => updateA('fitzpatrick', v)}
            disabled={readonly}
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-600 mb-1">评估备注</label>
          <textarea
            value={a.visual_notes ?? ''}
            onChange={(e) => updateA('visual_notes', e.target.value)}
            placeholder="皮肤视觉评估的补充说明..."
            disabled={readonly}
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-500"
          />
        </div>
      </Card>

      <Card title="仪器基线测量" variant="bordered">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ins.visia_captured === 'true'}
                onChange={(e) => updateIns('visia_captured', String(e.target.checked))}
                disabled={readonly}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">VISIA 面部影像已采集</span>
            </label>
          </div>

          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">Corneometer 水分值</h4>
            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="左脸颊" value={ins.corneometer_left ?? ''} onChange={(v) => updateIns('corneometer_left', v)} placeholder="AU" disabled={readonly} />
              <NumberInput label="右脸颊" value={ins.corneometer_right ?? ''} onChange={(v) => updateIns('corneometer_right', v)} placeholder="AU" disabled={readonly} />
              <NumberInput label="前额" value={ins.corneometer_forehead ?? ''} onChange={(v) => updateIns('corneometer_forehead', v)} placeholder="AU" disabled={readonly} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <NumberInput label="Mexameter 黑色素值" value={ins.mexameter_melanin ?? ''} onChange={(v) => updateIns('mexameter_melanin', v)} placeholder="MI" disabled={readonly} />
            <NumberInput label="Mexameter 红斑值" value={ins.mexameter_erythema ?? ''} onChange={(v) => updateIns('mexameter_erythema', v)} placeholder="EI" disabled={readonly} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <NumberInput label="Tewameter TEWL 值" value={ins.tewameter ?? ''} onChange={(v) => updateIns('tewameter', v)} placeholder="g/h/m²" disabled={readonly} />
            <NumberInput label="Sebumeter 皮脂值" value={ins.sebumeter ?? ''} onChange={(v) => updateIns('sebumeter', v)} placeholder="µg/cm²" disabled={readonly} />
          </div>
        </div>
      </Card>
    </div>
  )
}
