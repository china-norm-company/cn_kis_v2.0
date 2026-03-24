/**
 * 回访时间点解析与阶段样本量计算
 *
 * 规则：只按第一段计算单天样本量，其余段与第一段相同。
 * 单天样本量 = 样本量 / 该段日期个数（第一段的该段天数）
 */

export type VisitSegment = {
  /** 阶段标签，如 T-2w、T0&Timm */
  label: string
  /** 该段日期个数（该段天数） */
  dayCount: number
  /** 格式化后的日期展示，如 "2026年4月6日、2026年4月8日" */
  formattedDates: string
  /** 该段首日 YYYY-MM-DD，供甘特图用 */
  startDate?: string
  /** 该段末日 YYYY-MM-DD，供甘特图用 */
  endDate?: string
  /** 该段实际执行日期列表 YYYY-MM-DD（非连续时与 startDate+dayCount 不一致），供线下排程页用 */
  dates?: string[]
}

/**
 * 解析单行回访时间点文本为多个阶段
 * 格式示例：T-2w：2026/4/6、8、13、14\r\nT0&Timm：2026/4/20、22、27、28
 */
export function parseVisitTimepoints(raw: string): VisitSegment[] {
  if (!raw || typeof raw !== 'string') return []
  const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  const segments: VisitSegment[] = []
  let baseYear: number | null = null
  let baseMonth: number | null = null

  for (const line of lines) {
    const colonIdx = line.indexOf('：')
    if (colonIdx === -1) continue
    const label = line.slice(0, colonIdx).trim()
    const rest = line.slice(colonIdx + 1).trim()
    const dateParts = rest.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
    const dateStrs: string[] = []
    const dateObjs: Date[] = []

    for (const part of dateParts) {
      const d = parseOneDate(part, baseYear, baseMonth)
      if (d) {
        dateStrs.push(formatDateCn(d))
        dateObjs.push(d)
        baseYear = d.getFullYear()
        baseMonth = d.getMonth() + 1
      }
    }

    if (label || dateStrs.length > 0) {
      const first = dateObjs[0]
      const last = dateObjs[dateObjs.length - 1]
      segments.push({
        label: label || '未命名',
        dayCount: dateStrs.length,
        formattedDates: dateStrs.join('、'),
        startDate: first ? toISODate(first) : undefined,
        endDate: last ? toISODate(last) : undefined,
        dates: dateObjs.map((d) => toISODate(d)),
      })
    }
  }

  return segments
}

/** 解析单个日期：支持 2026/4/6、8、5/4 等 */
function parseOneDate(
  part: string,
  baseYear: number | null,
  baseMonth: number | null
): Date | null {
  const slash = part.includes('/') ? part.split('/') : null
  if (slash && slash.length === 3) {
    const y = parseInt(slash[0], 10)
    const m = parseInt(slash[1], 10) - 1
    const d = parseInt(slash[2], 10)
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
      const date = new Date(y, m, d)
      if (!Number.isNaN(date.getTime())) return date
    }
  }
  if (slash && slash.length === 2) {
    const m = parseInt(slash[0], 10) - 1
    const d = parseInt(slash[1], 10)
    const y = baseYear ?? new Date().getFullYear()
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
      const date = new Date(y, m, d)
      if (!Number.isNaN(date.getTime())) return date
    }
  }
  const onlyDay = parseInt(part, 10)
  if (!Number.isNaN(onlyDay) && baseYear != null && baseMonth != null) {
    const date = new Date(baseYear, baseMonth - 1, onlyDay)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

function formatDateCn(d: Date): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}年${m}月${day}日`
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * 根据第一段天数与总样本量计算单天样本量（只算第一段，其余段与第一段相同）
 */
export function computeSamplePerDay(sampleSize: number, firstSegmentDayCount: number): number {
  if (firstSegmentDayCount <= 0) return 0
  return Math.round((sampleSize / firstSegmentDayCount) * 10) / 10
}
