/**
 * 执行订单首行 → 表头键值（与后端 scheduling.api._first_row_from_order 行为一致）
 * - 行数据为数组：按 headers 与列下标 zip
 * - 行数据为对象：保留对象上全部非内部键，不仅限于 headers（避免表头列表缺列时丢「项目编号」等）
 */
export function getFirstRowAsDict(headers: string[], rows: unknown[]): Record<string, string> {
  const row = rows?.[0]
  return rowToDict(headers, row)
}

/** 将单行与表头对齐为 dict，逻辑与 getFirstRowAsDict 中单行处理一致 */
function rowToDict(headers: string[], row: unknown): Record<string, string> {
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

/**
 * 多项目执行订单：按「项目编号」取与当前时间槽/快照一致的那一行（排期计划「执行排期」、执行日期列均在该行）。
 * projectCode 为空或无法匹配时回退首行（与旧行为一致）。
 */
export function getRowAsDictMatchingProject(
  headers: string[],
  rows: unknown[],
  projectCode: string
): Record<string, string> {
  const code = (projectCode || '').trim()
  if (!code || !rows?.length) {
    return getFirstRowAsDict(headers, rows)
  }
  for (let i = 0; i < rows.length; i++) {
    const d = rowToDict(headers, rows[i])
    if ((d['项目编号'] || '').trim() === code) {
      return d
    }
  }
  return getFirstRowAsDict(headers, rows)
}
