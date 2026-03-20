/**
 * 方案 AI 解析工具（与 KIS 一致）
 */
type JSONValue = string | number | boolean | null | JSONObject | JSONArray
interface JSONObject { [key: string]: JSONValue }
type JSONArray = JSONValue[]

export const SUBAGENTS = [
  'project_info',
  'site_plan',
  'sample_plan',
  'recruitment_plan',
  'consumables_plan',
  'visit_plan',
  'equipment_plan',
  'evaluation_plan',
  'auxiliary_measurement_plan',
  'special_requirements',
] as const

export const ARRAY_SUBAGENTS = new Set<string>([
  'sample_plan',
  'recruitment_plan',
  'consumables_plan',
  'visit_plan',
  'equipment_plan',
  'evaluation_plan',
  'auxiliary_measurement_plan',
])

const isPlainObject = (value: JSONValue): value is JSONObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isEmptyValue = (value: JSONValue): boolean => {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) return Object.keys(value).length === 0
  return false
}

const mergePreferExisting = (prev: JSONValue, next: JSONValue): JSONValue => {
  if (isPlainObject(prev) && isPlainObject(next)) {
    const merged: JSONObject = {}
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
    keys.forEach((key) => {
      const prevValue = prev[key]
      const nextValue = next[key]
      if (isPlainObject(prevValue) && isPlainObject(nextValue)) {
        merged[key] = mergePreferExisting(prevValue, nextValue) as JSONValue
        return
      }
      if (Array.isArray(prevValue) && Array.isArray(nextValue)) {
        merged[key] = prevValue.length > 0 ? prevValue : nextValue
        return
      }
      merged[key] = !isEmptyValue(prevValue) ? prevValue : nextValue
    })
    return merged
  }
  if (Array.isArray(prev) && Array.isArray(next)) {
    return prev.length > 0 ? prev : next
  }
  return !isEmptyValue(prev) ? prev : next
}

export const mergeParsedData = (prev: JSONObject | null, next: JSONObject): JSONObject => {
  if (!prev) return next
  return mergePreferExisting(prev, next) as JSONObject
}

export const extractSubagentResult = (payload: unknown, subagent: string): JSONValue | undefined => {
  if (!payload || typeof payload !== 'object') return undefined
  const data = payload as Record<string, unknown>
  const fromResult = (data?.data as any)?.result?.[subagent] ?? (data?.result as any)?.[subagent]
  if (fromResult !== undefined) return fromResult as JSONValue
  const fromData = (data?.data as any)?.[subagent]
  if (fromData !== undefined) return fromData as JSONValue
  const direct = data?.[subagent]
  if (direct !== undefined) return direct as JSONValue
  return undefined
}

export const extractSubagentExtractions = (payload: unknown, subagent: string): JSONArray | undefined => {
  if (!payload || typeof payload !== 'object') return undefined
  const data = payload as Record<string, unknown>
  const raw = (data?.data as any)?.extractions?.[subagent] ?? (data?.extractions as any)?.[subagent]
  if (!Array.isArray(raw)) return undefined
  const attributes = raw
    .map((item) => (item && typeof item === 'object' ? (item as any).attributes ?? item : item))
    .filter((item) => item && typeof item === 'object')
  return attributes as JSONArray
}
