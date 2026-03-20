/**
 * 时间范围：本月/本季/本年/自定义
 * 返回 YYYY-MM-DD 格式的 startDate、endDate
 */
export type DateRangePeriod = "month" | "quarter" | "year" | "custom";

/** 按本地时区格式化为 YYYY-MM-DD，避免 toISOString() 的 UTC 导致“本月”与本地日期错位 */
function toLocalYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getStartEndForPeriod(
  period: DateRangePeriod,
  customStart?: string,
  customEnd?: string
): { startDate: string; endDate: string } {
  const now = new Date();
  const toYYYYMMDD = toLocalYYYYMMDD;

  if (period === "custom" && customStart && customEnd) {
    return { startDate: customStart, endDate: customEnd };
  }

  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: toYYYYMMDD(start), endDate: toYYYYMMDD(end) };
  }

  if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3) + 1;
    const start = new Date(now.getFullYear(), (q - 1) * 3, 1);
    const end = new Date(now.getFullYear(), q * 3, 0);
    return { startDate: toYYYYMMDD(start), endDate: toYYYYMMDD(end) };
  }

  if (period === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);
    return { startDate: toYYYYMMDD(start), endDate: toYYYYMMDD(end) };
  }

  // default: 本月
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { startDate: toYYYYMMDD(start), endDate: toYYYYMMDD(end) };
}
