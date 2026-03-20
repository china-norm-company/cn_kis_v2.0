/**
 * CSV 导出工具
 * 支持将数据导出为 CSV 文件并下载
 */

export interface CsvColumn<T> {
  key: keyof T | string
  label: string
  formatter?: (value: unknown, row: T) => string
}

export function exportToCsv<T extends Record<string, unknown>>(
  filename: string,
  columns: CsvColumn<T>[],
  data: T[],
) {
  const BOM = '\uFEFF'
  const header = columns.map((c) => `"${c.label}"`).join(',')
  const rows = data.map((row) =>
    columns.map((col) => {
      const raw = row[col.key as keyof T]
      const value = col.formatter ? col.formatter(raw, row) : String(raw ?? '')
      return `"${value.replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv = BOM + [header, ...rows].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
