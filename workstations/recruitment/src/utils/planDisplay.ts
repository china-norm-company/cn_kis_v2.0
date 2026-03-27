/**
 * 后端 completion_rate 为 0–100；历史前端曾按 0–1 再乘 100。统一为百分比 0–100。
 */
export function completionRatePercent(cr: number | undefined | null): number {
  if (cr == null || Number.isNaN(Number(cr))) return 0
  const n = Number(cr)
  return n <= 1 ? n * 100 : n
}
