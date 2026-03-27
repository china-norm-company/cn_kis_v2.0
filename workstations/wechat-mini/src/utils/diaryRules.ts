/**
 * 日记应填周期、补填回溯（rule_json.retrospective_days_max）与待填角标计数 — 与日记页、首页共用。
 */

export interface DiaryEntryLike {
  entry_date: string
}

export interface DiaryPeriodLike {
  start?: string | null
  end?: string | null
}

/** 本地日历 YYYY-MM-DD（禁止 toISOString：其在微信/浏览器中为 UTC，与中国「今天」可能差一天） */
export function formatLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function getLocalTodayYmd(): string {
  return formatLocalYmd(new Date())
}

/** 后端或序列化可能返回 2026-03-24T00:00:00，统一为 YYYY-MM-DD */
export function normalizeEntryDate(raw: string | undefined): string {
  if (!raw) return ''
  const s = String(raw).trim()
  return s.split('T')[0].split(' ')[0]
}

/** 将 2026-3-24 / 2026-03-24 统一为可比较的 YYYY-MM-DD */
export function padYmdComponents(raw: string): string {
  const n = normalizeEntryDate(raw)
  const m = n.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return n
  const mm = m[2]!.padStart(2, '0')
  const dd = m[3]!.padStart(2, '0')
  return `${m[1]}-${mm}-${dd}`
}

/** 与历史列表、今日是否已填同一套日期归一化，避免重复提交同一天 */
export function findDiaryEntryForYmd<T extends DiaryEntryLike>(entries: readonly T[], ymd: string): T | undefined {
  const key = padYmdComponents(ymd)
  if (!key) return undefined
  return entries.find((e) => padYmdComponents(normalizeEntryDate(e.entry_date)) === key)
}

/** 解析 rule_json.diary_period 的起止本地日期（YYYY-MM-DD） */
export function parseDiaryPeriodBounds(rule: Record<string, unknown>): { start: string | null; end: string | null } {
  const dp = rule.diary_period
  let start: unknown = null
  let end: unknown = null
  if (dp != null && typeof dp === 'object' && !Array.isArray(dp)) {
    const o = dp as Record<string, unknown>
    start = o.start
    end = o.end
  } else if (Array.isArray(dp) && dp[0] && typeof dp[0] === 'object') {
    const o = dp[0] as Record<string, unknown>
    start = o.start
    end = o.end
  }
  const sn = start != null && String(start).trim() !== '' ? padYmdComponents(String(start)) : null
  const en = end != null && String(end).trim() !== '' ? padYmdComponents(String(end)) : null
  return { start: sn, end: en }
}

export function ymdMin(a: string, b: string): string {
  return a <= b ? a : b
}

export function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  return formatLocalYmd(dt)
}

export function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** laterYmd 比 earlierYmd 晚几天（同一天为 0） */
export function calendarDaysBetween(earlierYmd: string, laterYmd: string): number {
  const a = parseYmdLocal(earlierYmd).getTime()
  const b = parseYmdLocal(laterYmd).getTime()
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

/** 研究台 rule_json.retrospective_days_max；列表接口带回时优先 listFallback */
export function parseRetrospectiveDaysMax(
  ruleJson: Record<string, unknown> | null | undefined,
  listFallback?: number | null,
): number {
  if (ruleJson && typeof ruleJson === 'object') {
    const v = ruleJson.retrospective_days_max
    const n = typeof v === 'number' ? v : parseInt(String(v), 10)
    if (!Number.isNaN(n)) {
      return Math.max(0, Math.min(366, Math.floor(n)))
    }
  }
  if (listFallback != null && typeof listFallback === 'number' && !Number.isNaN(listFallback)) {
    return Math.max(0, Math.min(366, Math.floor(listFallback)))
  }
  return 7
}

/** 详情 rule_json 优先，否则列表 diary_period 合成最小 rule */
export function ruleJsonForHistory(
  diaryCfgRuleJson: Record<string, unknown> | null | undefined,
  listDiaryPeriod: DiaryPeriodLike | null,
): Record<string, unknown> {
  if (diaryCfgRuleJson && typeof diaryCfgRuleJson === 'object') {
    return diaryCfgRuleJson
  }
  if (listDiaryPeriod && (listDiaryPeriod.start || listDiaryPeriod.end)) {
    return {
      diary_period: {
        start: listDiaryPeriod.start ?? '',
        end: listDiaryPeriod.end ?? '',
      },
    }
  }
  return {}
}

/**
 * 历史列表日期：有应填周期时仅在 diary_period 内（且≤今天、≤周期结束）；无则回落为近 fallbackPastDays 天。
 */
export function buildDiaryHistoryDays(
  todayYmd: string,
  diaryCfgRuleJson: Record<string, unknown> | null | undefined,
  entries: DiaryEntryLike[],
  fallbackPastDays: number,
  listDiaryPeriod: DiaryPeriodLike | null,
): string[] {
  const rule = ruleJsonForHistory(diaryCfgRuleJson, listDiaryPeriod)
  const { start: pStart, end: pEnd } = parseDiaryPeriodBounds(rule)

  let rangeFrom: string
  let rangeTo: string
  if (pStart) {
    rangeFrom = pStart
    const periodEnd = pEnd || todayYmd
    rangeTo = ymdMin(todayYmd, periodEnd)
    if (rangeTo < rangeFrom) {
      rangeTo = todayYmd
    }
  } else {
    rangeFrom = addCalendarDaysYmd(todayYmd, -fallbackPastDays)
    rangeTo = todayYmd
  }

  const set = new Set<string>()
  let cur = rangeTo
  for (let guard = 0; guard < 500 && cur >= rangeFrom; guard++) {
    set.add(cur)
    if (cur === rangeFrom) break
    cur = addCalendarDaysYmd(cur, -1)
  }

  for (const e of entries) {
    const d = padYmdComponents(normalizeEntryDate(e.entry_date))
    if (!d) continue
    if (pStart) {
      if (d >= pStart && (!pEnd || d <= pEnd)) set.add(d)
    } else if (d >= rangeFrom && d <= rangeTo) {
      set.add(d)
    }
  }

  return Array.from(set).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))
}

/**
 * 应填周期内、截至今天仍未填、且在补填窗口内（距今天 0..retro 天）的条数 — 首页角标与「待处理」总量。
 * 无应填周期（pStart）时返回 0。
 */
/** 构建注入的全链路 project_id；0 表示交由后端按入组匹配 */
export function getDiaryExplicitProjectIdFromEnv(): number {
  const e = typeof process !== 'undefined' && process.env?.TARO_APP_DIARY_PROJECT_ID
  const ep = e ? parseInt(String(e), 10) : NaN
  return !Number.isNaN(ep) && ep > 0 ? ep : 0
}

export function computeDiaryPendingBadgeCount(params: {
  todayYmd: string
  periodStart: string | null
  periodEnd: string | null
  entries: DiaryEntryLike[]
  retrospectiveDaysMax: number
}): number {
  const { todayYmd, periodStart: pStart, periodEnd: pEnd, entries, retrospectiveDaysMax } = params
  if (!pStart) return 0

  const retro = Math.max(0, Math.min(366, Math.floor(retrospectiveDaysMax)))
  const periodEndCap = pEnd || todayYmd
  let rangeTo = ymdMin(todayYmd, periodEndCap)
  if (rangeTo < pStart) return 0

  const entryDates = new Set(
    entries.map((e) => padYmdComponents(normalizeEntryDate(e.entry_date))).filter(Boolean),
  )

  let count = 0
  let cur = pStart
  for (let guard = 0; guard < 500 && cur <= rangeTo; guard++) {
    if (!entryDates.has(cur)) {
      const gap = calendarDaysBetween(cur, todayYmd)
      if (gap >= 0 && gap <= retro) {
        count += 1
      }
    }
    if (cur === rangeTo) break
    cur = addCalendarDaysYmd(cur, 1)
  }
  return count
}
