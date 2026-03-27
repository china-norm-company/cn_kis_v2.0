export interface MyDiaryEntryItem {
  id: number
  entry_date: string
  mood: string
  symptoms: string
  medication_taken: boolean
  symptom_severity?: string
  symptom_onset?: string
  symptom_duration?: string
  /** 其它备注（与症状程度/开始时间/持续时长拆分后） */
  notes: string
}

/** 与后端 `_diary_has_adverse` / 研究台 `has_adverse` 判定一致 */
export type MyDiaryEntryAdverseFields = Pick<
  MyDiaryEntryItem,
  'mood' | 'symptoms' | 'symptom_severity' | 'symptom_onset' | 'symptom_duration'
>

function normalizeDiaryTextFieldForAdverse(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value).trim()
    }
  }
  return String(value).trim()
}

/**
 * 是否与「发生不良情况」一致：心情为不适、有症状描述，或存在症状程度/开始/持续等拆分字段。
 * 保持与 `backend/apps/subject/api_research_diary.py` 中 `_diary_has_adverse` 同步。
 */
export function diaryHasAdverseFromMyItem(entry: MyDiaryEntryAdverseFields): boolean {
  const m = normalizeDiaryTextFieldForAdverse(entry.mood)
  const s = normalizeDiaryTextFieldForAdverse(entry.symptoms)
  if (m === '不适' || Boolean(s)) return true
  const sev = normalizeDiaryTextFieldForAdverse(entry.symptom_severity)
  const onset = normalizeDiaryTextFieldForAdverse(entry.symptom_onset)
  const dur = normalizeDiaryTextFieldForAdverse(entry.symptom_duration)
  if (sev || onset || dur) return true
  return false
}

/** GET /my/diary 中与列表一并返回的应填周期（与配置表同源，配置接口失败时仍可用于裁剪历史日期） */
export interface MyDiaryListDiaryPeriod {
  start?: string | null
  end?: string | null
}

/** GET /my/diary/config（project_id 可选；不传时后端按入组协议编号与全链路 project_no 自动匹配）成功时 data 形态 */
export interface MyDiaryConfigData {
  id: number
  project_id: number
  project_no: string
  config_version_label: string
  form_definition_json: unknown[]
  rule_json: Record<string, unknown>
  status: string
  researcher_confirmed_at: string | null
  supervisor_confirmed_at: string | null
  create_time: string
  update_time: string
}
