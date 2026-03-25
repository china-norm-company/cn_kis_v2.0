/**
 * 解析「实验室项目运营安排」Excel 模板（设备&场地 sheet）
 *
 * 结构：第 2 行为日期（第 4 列起每 5 列为一组），第 4 行为表头（项目编号、样本量、人员/岗位、房间、组别），
 * 第 5 行起为数据；前 3 列为 组别、设备编号、设备。
 */
import type { LabScheduleRow } from '@cn-kis/api-client'

const COLS_PER_DAY = 5
const HEADER_ROW_INDEX = 3 // 0-based，表头行
const DATE_ROW_INDEX = 1 // 0-based，日期行
const FIRST_DATA_ROW = 4 // 0-based，第一条数据行
const FIXED_COLUMNS = 3 // 组别、设备编号、设备

/** 与「本地日历日」一致，避免 toISOString() 用 UTC 日期导致跨日错位 */
function toYmdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseExcelDate(v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'string') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? '' : toYmdLocal(d)
  }
  if (typeof v === 'number') {
    // Excel 序列日 → 用本地年月日写入，避免 UTC 与业务日期不一致
    const d = new Date((v - 25569) * 86400 * 1000)
    return Number.isNaN(d.getTime()) ? '' : toYmdLocal(d)
  }
  return String(v).trim()
}

function str(v: unknown): string {
  if (v == null) return ''
  const s = String(v).trim()
  return s
}

/**
 * 从二维数组解析出实验室排期行（设备&场地 sheet）
 */
export function parseLabScheduleSheet(rows: unknown[][]): LabScheduleRow[] {
  const out: LabScheduleRow[] = []
  if (!rows || rows.length <= FIRST_DATA_ROW) return out

  const dateRow = rows[DATE_ROW_INDEX] as unknown[] | undefined
  const headerRow = rows[HEADER_ROW_INDEX] as unknown[] | undefined
  if (!dateRow || !headerRow) return out

  // 日期列索引：第 4 列起每 5 列为一组
  const dateIndices: number[] = []
  for (let c = FIXED_COLUMNS; c < (dateRow.length || 0); c += COLS_PER_DAY) {
    const dateStr = parseExcelDate(dateRow[c])
    if (dateStr) dateIndices.push(c)
  }

  for (let r = FIRST_DATA_ROW; r < rows.length; r++) {
    const row = rows[r] as unknown[] | undefined
    if (!row) continue

    const group = str(row[0])
    const equipmentCode = str(row[1])
    const equipment = str(row[2])

    for (let i = 0; i < dateIndices.length; i++) {
      const startCol = dateIndices[i]
      const protocolCode = str(row[startCol])
      if (!protocolCode) continue

      const sampleSize = row[startCol + 1]
      const personRole = str(row[startCol + 2])
      /** 日期块仅在有「人员/岗位」且非「/」时生成明细行 */
      if (!personRole || personRole === '/') continue

      const room = str(row[startCol + 3])
      const dayGroup = str(row[startCol + 4])
      const dateStr = parseExcelDate(dateRow[startCol])

      out.push({
        group,
        equipment_code: equipmentCode,
        equipment,
        date: dateStr,
        protocol_code: protocolCode,
        sample_size: sampleSize != null && sampleSize !== '' ? String(sampleSize) : '',
        person_role: personRole,
        room,
        day_group: dayGroup,
      })
    }
  }

  return out
}
