/**
 * 日记配置：与后端 form_definition_json / rule_json 及 docs/日记配置表字段约定.md 对齐
 */
export type FormFieldType = 'boolean' | 'single_choice' | 'text'

export interface FormOption {
  value: string
  label: string
}

export interface FormFieldItem {
  /** 稳定键名，与条目 answers 一致 */
  id: string
  type: FormFieldType
  label: string
  required: boolean
  order: number
  /** single_choice 专用 */
  options?: FormOption[]
}

export interface RuleFormState {
  timezone: string
  diary_period_start: string
  diary_period_end: string
  fill_time_start: string
  fill_time_end: string
  frequency: string
  retrospective_days_max: number
  late_reason_required_when_retrospective: boolean
}

export const DEFAULT_RULE_STATE: RuleFormState = {
  timezone: 'Asia/Shanghai',
  diary_period_start: '',
  diary_period_end: '',
  fill_time_start: '09:00',
  fill_time_end: '18:00',
  frequency: 'daily',
  retrospective_days_max: 7,
  late_reason_required_when_retrospective: true,
}

export function normalizeDiaryPeriod(raw: unknown): { start: string; end: string } {
  if (raw == null) return { start: '', end: '' }
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    return {
      start: String(o.start ?? '').slice(0, 10),
      end: String(o.end ?? '').slice(0, 10),
    }
  }
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0]
    if (first && typeof first === 'object') {
      const o = first as Record<string, unknown>
      return {
        start: String(o.start ?? '').slice(0, 10),
        end: String(o.end ?? '').slice(0, 10),
      }
    }
  }
  return { start: '', end: '' }
}

function normalizeFillWindow(raw: unknown): { start: string; end: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { start: '09:00', end: '18:00' }
  }
  const o = raw as Record<string, unknown>
  const pad = (s: string) => {
    const t = String(s || '').trim()
    if (/^\d{1,2}:\d{2}$/.test(t)) return t.length === 4 ? `0${t}` : t
    return t.slice(0, 5) || '09:00'
  }
  return {
    start: pad(String(o.start ?? '09:00')),
    end: pad(String(o.end ?? '18:00')),
  }
}

export function formDefinitionToItems(raw: unknown): FormFieldItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [emptyField(10)]
  }
  return raw.map((x, i) => parseOneField(x, i))
}

function parseOneField(x: unknown, index: number): FormFieldItem {
  if (!x || typeof x !== 'object') return emptyField((index + 1) * 10)
  const o = x as Record<string, unknown>
  const t = o.type
  const type: FormFieldType =
    t === 'boolean' || t === 'single_choice' || t === 'text' ? t : 'text'
  const optionsRaw = o.options
  let options: FormOption[] | undefined
  if (type === 'single_choice' && Array.isArray(optionsRaw)) {
    options = optionsRaw.map((op, j) => {
      if (op && typeof op === 'object') {
        const r = op as Record<string, unknown>
        return { value: String(r.value ?? `opt_${j}`), label: String(r.label ?? '') }
      }
      return { value: `opt_${j}`, label: '' }
    })
    if (options.length === 0) options = [{ value: 'yes', label: '是' }, { value: 'no', label: '否' }]
  }
  return {
    id: String(o.id || `field_${index + 1}`).replace(/\s/g, '_'),
    type,
    label: String(o.label ?? ''),
    required: Boolean(o.required),
    order: typeof o.order === 'number' ? o.order : (index + 1) * 10,
    options,
  }
}

export function emptyField(order: number): FormFieldItem {
  return {
    id: `field_${Date.now()}`,
    type: 'text',
    label: '',
    required: true,
    order,
  }
}

export function itemsToFormDefinition(items: FormFieldItem[]): unknown[] {
  const sorted = [...items].sort((a, b) => a.order - b.order)
  return sorted.map((it) => {
    const base: Record<string, unknown> = {
      id: it.id.trim(),
      type: it.type,
      label: it.label.trim(),
      required: it.required,
      order: it.order,
    }
    if (it.type === 'single_choice' && it.options?.length) {
      base.options = it.options.map((o) => ({ value: o.value.trim(), label: o.label.trim() }))
    }
    return base
  })
}

export function ruleJsonToState(raw: Record<string, unknown> | null | undefined): RuleFormState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_RULE_STATE }
  const period = normalizeDiaryPeriod(raw.diary_period)
  const win = normalizeFillWindow(raw.fill_time_window)
  const n = raw.retrospective_days_max
  return {
    timezone: String(raw.timezone || DEFAULT_RULE_STATE.timezone),
    diary_period_start: period.start,
    diary_period_end: period.end,
    fill_time_start: win.start,
    fill_time_end: win.end,
    frequency: String(raw.frequency || DEFAULT_RULE_STATE.frequency),
    retrospective_days_max: typeof n === 'number' && !Number.isNaN(n) ? n : DEFAULT_RULE_STATE.retrospective_days_max,
    late_reason_required_when_retrospective: Boolean(
      raw.late_reason_required_when_retrospective ?? DEFAULT_RULE_STATE.late_reason_required_when_retrospective,
    ),
  }
}

export function stateToRuleJson(state: RuleFormState): Record<string, unknown> {
  return {
    timezone: state.timezone.trim() || 'Asia/Shanghai',
    diary_period: {
      start: state.diary_period_start.trim(),
      end: state.diary_period_end.trim(),
    },
    fill_time_window: {
      start: state.fill_time_start.trim(),
      end: state.fill_time_end.trim(),
    },
    frequency: state.frequency.trim() || 'daily',
    retrospective_days_max: Math.max(0, Math.floor(state.retrospective_days_max)),
    late_reason_required_when_retrospective: state.late_reason_required_when_retrospective,
  }
}

export function validateConfigBeforeSave(
  items: FormFieldItem[],
  rule: RuleFormState,
): { ok: true } | { ok: false; message: string } {
  const ids = new Set<string>()
  for (const it of items) {
    const id = it.id.trim()
    if (!id) return { ok: false, message: '每条题目需填写「题目 ID」（英文键名）' }
    if (ids.has(id)) return { ok: false, message: `题目 ID 重复：${id}` }
    ids.add(id)
    if (!it.label.trim()) return { ok: false, message: `题目 ${id} 需填写题干` }
    if (it.type === 'single_choice') {
      const opts = it.options ?? []
      if (opts.length < 1) return { ok: false, message: `单选题 ${id} 至少需要一个选项` }
      for (const o of opts) {
        if (!o.value.trim()) return { ok: false, message: `单选题 ${id} 的选项值不能为空` }
      }
    }
  }
  if (rule.diary_period_start && rule.diary_period_end) {
    if (rule.diary_period_start > rule.diary_period_end) {
      return { ok: false, message: '应填周期：开始日期不能晚于结束日期' }
    }
  }
  return { ok: true }
}
