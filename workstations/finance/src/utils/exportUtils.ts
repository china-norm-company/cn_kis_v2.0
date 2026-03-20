/**
 * 客户端 xlsx 导出工具（财务台）
 *
 * 使用已安装的 xlsx 库（SheetJS），无需后端参与。
 */
import * as XLSX from 'xlsx'

export interface ExportColumn {
  key: string
  header: string
  width?: number
}

export interface ExportSheet {
  name: string
  columns: ExportColumn[]
  rows: Record<string, string | number | null | undefined>[]
}

/**
 * 导出单个 sheet 为 xlsx 文件并触发下载
 */
export function exportToXlsx(sheets: ExportSheet[], filename: string): void {
  const wb = XLSX.utils.book_new()

  for (const sheet of sheets) {
    const headers = sheet.columns.map((c) => c.header)
    const data = sheet.rows.map((row) =>
      sheet.columns.map((c) => row[c.key] ?? '')
    )

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data])

    // 设置列宽
    ws['!cols'] = sheet.columns.map((c) => ({ wch: c.width ?? 18 }))

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
  }

  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

/**
 * 快捷：从对象数组 + 列定义导出单 sheet
 */
export function exportTableToXlsx(
  rows: Record<string, string | number | null | undefined>[],
  columns: ExportColumn[],
  sheetName: string,
  filename: string,
): void {
  exportToXlsx([{ name: sheetName, columns, rows }], filename)
}
