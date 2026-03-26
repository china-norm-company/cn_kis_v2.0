/**
 * 执行订单首行 → 表头键值（与后端 scheduling.api._first_row_from_order 行为一致）
 * - 行数据为数组：按 headers 与列下标 zip
 * - 行数据为对象：保留对象上全部非内部键，不仅限于 headers（避免表头列表缺列时丢「项目编号」等）
 */
export function getFirstRowAsDict(headers: string[], rows: unknown[]): Record<string, string> {
  const row = rows?.[0]
  if (row == null) return {}
  const out: Record<string, string> = {}
  if (Array.isArray(row)) {
    headers.forEach((h, i) => {
      out[h] = String((row as unknown[])[i] ?? '')
    })
  } else if (typeof row === 'object') {
    const obj = row as Record<string, unknown>
    for (const [k, v] of Object.entries(obj)) {
      if (!k || k.startsWith('__')) continue
      out[k] = v != null ? String(v) : ''
    }
  }
  return out
}
