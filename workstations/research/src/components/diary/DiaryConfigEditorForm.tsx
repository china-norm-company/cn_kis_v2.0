/**
 * 日记配置结构化编辑：条目配置 + 发布设置
 */
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Button, Input, Select } from '@cn-kis/ui-kit'
import { Plus, Trash2, ArrowUp, ArrowDown, ListChecks, CalendarClock } from 'lucide-react'
import type { FormFieldItem, FormFieldType, RuleFormState } from './diaryConfigMapper'
import { emptyField } from './diaryConfigMapper'

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai（中国）' },
  { value: 'Asia/Chongqing', label: 'Asia/Chongqing' },
  { value: 'UTC', label: 'UTC' },
]

const TYPE_OPTIONS: { value: FormFieldType; label: string }[] = [
  { value: 'boolean', label: '是否题（是/否）' },
  { value: 'single_choice', label: '单选题' },
  { value: 'text', label: '文本' },
]

const FREQ_OPTIONS = [
  { value: 'daily', label: '每日 1 条（daily）' },
  { value: 'weekly', label: '每周（预留）' },
]

type Props = {
  formItems: FormFieldItem[]
  setFormItems: Dispatch<SetStateAction<FormFieldItem[]>>
  ruleState: RuleFormState
  setRuleState: Dispatch<SetStateAction<RuleFormState>>
  subTab: 'items' | 'publish'
  setSubTab: (k: 'items' | 'publish') => void
  /** 发布设置页顶部：如「日记面向对象」预览（可选） */
  publishExtra?: ReactNode
}

export function DiaryConfigEditorForm({
  formItems,
  setFormItems,
  ruleState,
  setRuleState,
  subTab,
  setSubTab,
  publishExtra,
}: Props) {
  const updateField = (index: number, patch: Partial<FormFieldItem>) => {
    setFormItems((prev) => {
      const next = [...prev]
      const cur = { ...next[index], ...patch }
      if (patch.type === 'single_choice' && !cur.options?.length) {
        cur.options = [
          { value: 'no', label: '没有' },
          { value: 'yes', label: '有' },
        ]
      }
      if (patch.type && patch.type !== 'single_choice') {
        delete cur.options
      }
      next[index] = cur
      return next
    })
  }

  const removeField = (index: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== index))
  }

  const moveField = (index: number, dir: -1 | 1) => {
    setFormItems((prev) => {
      const j = index + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[j]] = [next[j], next[index]]
      return next.map((it, i) => ({ ...it, order: (i + 1) * 10 }))
    })
  }

  const addField = () => {
    setFormItems((prev) => {
      const maxOrder = prev.reduce((m, x) => Math.max(m, x.order), 0)
      return [...prev, emptyField(maxOrder + 10)]
    })
  }

  const updateOption = (fieldIndex: number, optIndex: number, patch: Partial<{ value: string; label: string }>) => {
    setFormItems((prev) => {
      const next = [...prev]
      const f = { ...next[fieldIndex] }
      const opts = [...(f.options ?? [])]
      opts[optIndex] = { ...opts[optIndex], ...patch }
      f.options = opts
      next[fieldIndex] = f
      return next
    })
  }

  const addOption = (fieldIndex: number) => {
    setFormItems((prev) => {
      const next = [...prev]
      const f = { ...next[fieldIndex] }
      const opts = [...(f.options ?? [])]
      opts.push({ value: `opt_${opts.length + 1}`, label: '' })
      f.options = opts
      next[fieldIndex] = f
      return next
    })
  }

  const removeOption = (fieldIndex: number, optIndex: number) => {
    setFormItems((prev) => {
      const next = [...prev]
      const f = { ...next[fieldIndex] }
      const opts = (f.options ?? []).filter((_, i) => i !== optIndex)
      f.options = opts.length ? opts : [{ value: 'a', label: '选项' }]
      next[fieldIndex] = f
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setSubTab('items')}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            subTab === 'items'
              ? 'bg-violet-100 text-violet-800'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ListChecks className="h-4 w-4" />
          条目配置
        </button>
        <button
          type="button"
          onClick={() => setSubTab('publish')}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            subTab === 'publish'
              ? 'bg-violet-100 text-violet-800'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <CalendarClock className="h-4 w-4" />
          发布设置
        </button>
      </div>

      {subTab === 'items' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            定义受试者每日需填写的题目；<strong>题目 ID</strong> 需稳定，与提交答案 JSON 的键一致（见「日记配置表字段约定」）。
          </p>
          {formItems.map((field, idx) => (
            <div
              key={`${field.id}-${idx}`}
              className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">题目 {idx + 1}</span>
                <div className="flex gap-1">
                  <Button type="button" size="xs" variant="ghost" onClick={() => moveField(idx, -1)} title="上移">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="xs" variant="ghost" onClick={() => moveField(idx, 1)} title="下移">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" size="xs" variant="danger" onClick={() => removeField(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">题目 ID（英文键名）</label>
                  <Input
                    value={field.id}
                    onChange={(e) => updateField(idx, { id: e.target.value })}
                    placeholder="如 medication_taken"
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">题型</label>
                  <Select
                    value={field.type}
                    onChange={(e) => updateField(idx, { type: e.target.value as FormFieldType })}
                    options={TYPE_OPTIONS}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">题干（受试者可见）</label>
                <Input
                  value={field.label}
                  onChange={(e) => updateField(idx, { label: e.target.value })}
                  placeholder="题目描述"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => updateField(idx, { required: e.target.checked })}
                  className="rounded border-slate-300"
                />
                必填
              </label>
              {field.type === 'single_choice' && (
                <div className="space-y-2 pl-2 border-l-2 border-violet-200">
                  <div className="text-xs font-medium text-slate-600">选项</div>
                  {(field.options ?? []).map((opt, oi) => (
                    <div key={oi} className="flex flex-wrap gap-2 items-center">
                      <Input
                        className="w-28 font-mono text-xs"
                        placeholder="value"
                        value={opt.value}
                        onChange={(e) => updateOption(idx, oi, { value: e.target.value })}
                      />
                      <Input
                        className="flex-1 min-w-[120px] text-sm"
                        placeholder="显示文字"
                        value={opt.label}
                        onChange={(e) => updateOption(idx, oi, { label: e.target.value })}
                      />
                      <Button type="button" size="xs" variant="ghost" onClick={() => removeOption(idx, oi)}>
                        删
                      </Button>
                    </div>
                  ))}
                  <Button type="button" size="xs" variant="secondary" onClick={() => addOption(idx)}>
                    + 添加选项
                  </Button>
                </div>
              )}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addField}>
            <Plus className="h-4 w-4 mr-1" /> 添加题目
          </Button>
        </div>
      )}

      {subTab === 'publish' && (
        <div className="space-y-4">
          {publishExtra}
          <p className="text-xs text-slate-500">
            定义应填日期范围、每日可提交时段等；对应后端 <code className="bg-slate-100 px-1 rounded">rule_json</code>。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-600 mb-1">时区 timezone</label>
              <Select
                value={ruleState.timezone}
                onChange={(e) => setRuleState((s) => ({ ...s, timezone: e.target.value }))}
                options={TIMEZONE_OPTIONS}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">填写频率 frequency</label>
              <Select
                value={ruleState.frequency}
                onChange={(e) => setRuleState((s) => ({ ...s, frequency: e.target.value }))}
                options={FREQ_OPTIONS}
              />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-4 space-y-3 bg-white">
            <div className="text-sm font-medium text-slate-800">应填周期 diary_period</div>
            <p className="text-xs text-slate-500">推送/统计的起止日期（含首尾），与进度管理一致。</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-600 mb-1">开始日期</label>
                <Input
                  type="date"
                  value={ruleState.diary_period_start}
                  onChange={(e) => setRuleState((s) => ({ ...s, diary_period_start: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">结束日期</label>
                <Input
                  type="date"
                  value={ruleState.diary_period_end}
                  onChange={(e) => setRuleState((s) => ({ ...s, diary_period_end: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-4 space-y-3 bg-white">
            <div className="text-sm font-medium text-slate-800">每日提交时间窗 fill_time_window</div>
            <p className="text-xs text-slate-500">受试者在该时段内提交视为当日有效（服务端校验以实际为准）。</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-600 mb-1">开始时间</label>
                <Input
                  type="time"
                  value={ruleState.fill_time_start}
                  onChange={(e) => setRuleState((s) => ({ ...s, fill_time_start: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">结束时间</label>
                <Input
                  type="time"
                  value={ruleState.fill_time_end}
                  onChange={(e) => setRuleState((s) => ({ ...s, fill_time_end: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-600 mb-1">允许补填最多回溯天数 retrospective_days_max</label>
              <Input
                type="number"
                min={0}
                value={String(ruleState.retrospective_days_max)}
                onChange={(e) =>
                  setRuleState((s) => ({
                    ...s,
                    retrospective_days_max: parseInt(e.target.value, 10) || 0,
                  }))
                }
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 pb-2">
                <input
                  type="checkbox"
                  checked={ruleState.late_reason_required_when_retrospective}
                  onChange={(e) =>
                    setRuleState((s) => ({
                      ...s,
                      late_reason_required_when_retrospective: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-300"
                />
                补填时必须填写原因
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
