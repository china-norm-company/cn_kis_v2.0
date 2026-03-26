import * as XLSX from 'xlsx'

/** Excel 工作表名：≤31 字符，且不能包含 : \ / ? * [ ] */
function sanitizeSheetName(name: string): string {
  const s = name.replace(/[\[\]:\\/?*]/g, '_').trim().slice(0, 31)
  return s || 'Sheet1'
}

/**
 * 将表头 + 行数据导出为 .xlsx 并触发下载（浏览器环境）
 */
export function downloadXlsxFromAoA(
  filename: string,
  sheetName: string,
  rowsAoA: (string | number)[][]
): void {
  const ws = XLSX.utils.aoa_to_sheet(rowsAoA)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheetName))
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

/**
 * 多 Sheet 导出：一个工作簿内多个工作表（rowsAoA 含表头行）
 */
export function downloadXlsxMultiSheet(
  filename: string,
  sheets: Array<{ name: string; rowsAoA: (string | number)[][] }>
): void {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()
  for (const { name, rowsAoA } of sheets) {
    let base = sanitizeSheetName(name)
    let finalName = base
    let n = 2
    while (used.has(finalName)) {
      const suffix = `_${n}`
      finalName = (base.slice(0, Math.max(1, 31 - suffix.length)) + suffix).slice(0, 31)
      n += 1
    }
    used.add(finalName)
    const ws = XLSX.utils.aoa_to_sheet(rowsAoA.length ? rowsAoA : [[]])
    XLSX.utils.book_append_sheet(wb, ws, finalName)
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}
