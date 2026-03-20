import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@cn-kis/ui-kit'

export interface ConditionItem {
  name: string
  ongoing: boolean
  notes: string
}

export interface AllergyItem {
  allergen: string
  type: string
  severity: string
}

export interface MedicationItem {
  name: string
  indication: string
  ongoing: boolean
}

export interface LifestyleData {
  sun_exposure: string
  skincare_habits: string
  cosmetics_frequency: string
}

export interface MedicalHistoryData {
  conditions: ConditionItem[]
  allergies: AllergyItem[]
  medications: MedicationItem[]
  lifestyle: LifestyleData
}

interface MedicalHistoryFormProps {
  data: MedicalHistoryData
  onChange: (data: MedicalHistoryData) => void
  readonly?: boolean
}

const ALLERGY_TYPE_OPTIONS = ['食物', '药物', '环境', '接触性', '其他']
const SEVERITY_OPTIONS = ['轻度', '中度', '重度']
const SUN_EXPOSURE_OPTIONS = ['极少', '偶尔', '经常', '频繁']
const COSMETICS_FREQUENCY_OPTIONS = ['从不', '偶尔', '每天', '多次/天']

function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
          <span className="text-sm font-medium text-slate-700">{title}</span>
        </div>
        <span className="text-xs text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">{count}</span>
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  )
}

export function MedicalHistoryForm({ data, onChange, readonly }: MedicalHistoryFormProps) {
  const update = <K extends keyof MedicalHistoryData>(key: K, value: MedicalHistoryData[K]) => {
    onChange({ ...data, [key]: value })
  }

  const addCondition = () => {
    update('conditions', [...data.conditions, { name: '', ongoing: false, notes: '' }])
  }
  const removeCondition = (idx: number) => {
    update('conditions', data.conditions.filter((_, i) => i !== idx))
  }
  const updateCondition = (idx: number, patch: Partial<ConditionItem>) => {
    update('conditions', data.conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
  }

  const addAllergy = () => {
    update('allergies', [...data.allergies, { allergen: '', type: '', severity: '' }])
  }
  const removeAllergy = (idx: number) => {
    update('allergies', data.allergies.filter((_, i) => i !== idx))
  }
  const updateAllergy = (idx: number, patch: Partial<AllergyItem>) => {
    update('allergies', data.allergies.map((a, i) => (i === idx ? { ...a, ...patch } : a)))
  }

  const addMedication = () => {
    update('medications', [...data.medications, { name: '', indication: '', ongoing: false }])
  }
  const removeMedication = (idx: number) => {
    update('medications', data.medications.filter((_, i) => i !== idx))
  }
  const updateMedication = (idx: number, patch: Partial<MedicationItem>) => {
    update('medications', data.medications.map((m, i) => (i === idx ? { ...m, ...patch } : m)))
  }

  const updateLifestyle = (patch: Partial<LifestyleData>) => {
    update('lifestyle', { ...data.lifestyle, ...patch })
  }

  return (
    <div className="space-y-4">
      {/* 病史 */}
      <CollapsibleSection title="病史" count={data.conditions.length}>
        {data.conditions.map((c, idx) => (
          <div key={idx} className="flex items-start gap-3 bg-slate-50 rounded-lg p-3">
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">疾病名称</label>
                <input
                  value={c.name}
                  onChange={(e) => updateCondition(idx, { name: e.target.value })}
                  disabled={readonly}
                  placeholder="如：高血压"
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm disabled:bg-white disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">备注</label>
                <input
                  value={c.notes}
                  onChange={(e) => updateCondition(idx, { notes: e.target.value })}
                  disabled={readonly}
                  placeholder="补充说明"
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm disabled:bg-white disabled:text-slate-500"
                />
              </div>
            </div>
            <label className="flex items-center gap-1.5 mt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={c.ongoing}
                onChange={(e) => updateCondition(idx, { ongoing: e.target.checked })}
                disabled={readonly}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span className="text-xs text-slate-600 whitespace-nowrap">持续</span>
            </label>
            {!readonly && (
              <button type="button" onClick={() => removeCondition(idx)} className="mt-5 text-red-400 hover:text-red-600" title="删除病史">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {!readonly && (
          <Button variant="ghost" size="sm" icon={<Plus className="w-4 h-4" />} onClick={addCondition}>
            添加病史
          </Button>
        )}
      </CollapsibleSection>

      {/* 过敏史 */}
      <CollapsibleSection title="过敏史" count={data.allergies.length}>
        {data.allergies.map((a, idx) => (
          <div key={idx} className="flex items-start gap-3 bg-slate-50 rounded-lg p-3">
            <div className="flex-1 grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">过敏原</label>
                <input
                  value={a.allergen}
                  onChange={(e) => updateAllergy(idx, { allergen: e.target.value })}
                  disabled={readonly}
                  placeholder="如：青霉素"
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm disabled:bg-white disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">类型</label>
                <select
                  value={a.type}
                  onChange={(e) => updateAllergy(idx, { type: e.target.value })}
                  disabled={readonly}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-white disabled:bg-white disabled:text-slate-500"
                  title="过敏类型"
                >
                  <option value="">请选择</option>
                  {ALLERGY_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">严重程度</label>
                <select
                  value={a.severity}
                  onChange={(e) => updateAllergy(idx, { severity: e.target.value })}
                  disabled={readonly}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm bg-white disabled:bg-white disabled:text-slate-500"
                  title="严重程度"
                >
                  <option value="">请选择</option>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
            {!readonly && (
              <button type="button" onClick={() => removeAllergy(idx)} className="mt-5 text-red-400 hover:text-red-600" title="删除过敏记录">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {!readonly && (
          <Button variant="ghost" size="sm" icon={<Plus className="w-4 h-4" />} onClick={addAllergy}>
            添加过敏史
          </Button>
        )}
      </CollapsibleSection>

      {/* 合并用药 */}
      <CollapsibleSection title="合并用药" count={data.medications.length}>
        {data.medications.map((m, idx) => (
          <div key={idx} className="flex items-start gap-3 bg-slate-50 rounded-lg p-3">
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">药品名称</label>
                <input
                  value={m.name}
                  onChange={(e) => updateMedication(idx, { name: e.target.value })}
                  disabled={readonly}
                  placeholder="如：阿莫西林"
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm disabled:bg-white disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">适应症</label>
                <input
                  value={m.indication}
                  onChange={(e) => updateMedication(idx, { indication: e.target.value })}
                  disabled={readonly}
                  placeholder="用药原因"
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm disabled:bg-white disabled:text-slate-500"
                />
              </div>
            </div>
            <label className="flex items-center gap-1.5 mt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={m.ongoing}
                onChange={(e) => updateMedication(idx, { ongoing: e.target.checked })}
                disabled={readonly}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span className="text-xs text-slate-600 whitespace-nowrap">持续</span>
            </label>
            {!readonly && (
              <button type="button" onClick={() => removeMedication(idx)} className="mt-5 text-red-400 hover:text-red-600" title="删除用药记录">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {!readonly && (
          <Button variant="ghost" size="sm" icon={<Plus className="w-4 h-4" />} onClick={addMedication}>
            添加用药
          </Button>
        )}
      </CollapsibleSection>

      {/* 生活方式 */}
      <CollapsibleSection title="生活方式" count={0} defaultOpen>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">日晒暴露</label>
            <select
              value={data.lifestyle.sun_exposure}
              onChange={(e) => updateLifestyle({ sun_exposure: e.target.value })}
              disabled={readonly}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500"
              title="日晒暴露"
            >
              <option value="">请选择</option>
              {SUN_EXPOSURE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">护肤习惯</label>
            <textarea
              value={data.lifestyle.skincare_habits}
              onChange={(e) => updateLifestyle({ skincare_habits: e.target.value })}
              disabled={readonly}
              rows={2}
              placeholder="描述日常护肤步骤..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">化妆品使用频率</label>
            <select
              value={data.lifestyle.cosmetics_frequency}
              onChange={(e) => updateLifestyle({ cosmetics_frequency: e.target.value })}
              disabled={readonly}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500"
              title="化妆品使用频率"
            >
              <option value="">请选择</option>
              {COSMETICS_FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}
