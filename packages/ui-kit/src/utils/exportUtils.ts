/**
 * 数据导出工具
 * 
 * 支持多种格式的数据导出：
 * - CSV格式
 * - JSON格式
 * - Excel格式（需要xlsx库）
 */

// ============================================================================
// 类型定义
// ============================================================================

export type ExportFormat = 'csv' | 'json' | 'excel'

export interface ExportOptions {
  filename?: string
  includeHeaders?: boolean
  dateFormat?: string
}

// ============================================================================
// CSV导出
// ============================================================================

/**
 * 将数据导出为CSV格式
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  options: ExportOptions = {}
): void {
  if (data.length === 0) {
    alert('没有数据可导出')
    return
  }

  const { filename = 'export', includeHeaders = true } = options

  // 获取表头
  const headers = Object.keys(data[0])
  
  // 构建CSV内容
  let csvContent = ''
  
  // 添加表头
  if (includeHeaders) {
    csvContent += headers.map(h => escapeCSVField(h)).join(',') + '\n'
  }
  
  // 添加数据行
  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header]
      if (value === null || value === undefined) {
        return ''
      }
      // 处理日期
      if (value instanceof Date) {
        return escapeCSVField(value.toLocaleString('zh-CN'))
      }
      // 处理对象和数组
      if (typeof value === 'object') {
        return escapeCSVField(JSON.stringify(value))
      }
      return escapeCSVField(String(value))
    })
    csvContent += values.join(',') + '\n'
  })
  
  // 创建Blob并下载
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `${filename}.csv`, 'text/csv')
}

/**
 * 转义CSV字段
 */
function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}

// ============================================================================
// JSON导出
// ============================================================================

/**
 * 将数据导出为JSON格式
 */
export function exportToJSON<T extends Record<string, any>>(
  data: T[],
  options: ExportOptions = {}
): void {
  if (data.length === 0) {
    alert('没有数据可导出')
    return
  }

  const { filename = 'export' } = options

  // 格式化JSON
  const jsonContent = JSON.stringify(data, null, 2)
  
  // 创建Blob并下载
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' })
  downloadBlob(blob, `${filename}.json`, 'application/json')
}

// ============================================================================
// Excel导出
// ============================================================================

/**
 * 将数据导出为Excel格式
 * 注意：需要安装 xlsx 库
 */
export async function exportToExcel<T extends Record<string, any>>(
  data: T[],
  options: ExportOptions = {}
): Promise<void> {
  if (data.length === 0) {
    alert('没有数据可导出')
    return
  }

  try {
    // 动态导入xlsx库
    const XLSX = await import('xlsx')
    
    const { filename = 'export', includeHeaders = true } = options

    // 获取表头
    const headers = Object.keys(data[0])
    
    // 准备数据
    const worksheetData: any[][] = []
    
    // 添加表头
    if (includeHeaders) {
      worksheetData.push(headers)
    }
    
    // 添加数据行
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header]
        if (value === null || value === undefined) {
          return ''
        }
        // 处理日期
        if (value instanceof Date) {
          return value.toLocaleString('zh-CN')
        }
        // 处理对象和数组
        if (typeof value === 'object') {
          return JSON.stringify(value)
        }
        return value
      })
      worksheetData.push(values)
    })
    
    // 创建工作簿
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
    
    // 导出
    XLSX.writeFile(workbook, `${filename}.xlsx`)
  } catch (error) {
    console.error('Excel导出失败:', error)
    alert('Excel导出功能需要安装xlsx库，请使用CSV或JSON格式')
  }
}

// ============================================================================
// 通用导出函数
// ============================================================================

/**
 * 通用导出函数
 */
export async function exportData<T extends Record<string, any>>(
  data: T[],
  format: ExportFormat,
  options: ExportOptions = {}
): Promise<void> {
  switch (format) {
    case 'csv':
      exportToCSV(data, options)
      break
    case 'json':
      exportToJSON(data, options)
      break
    case 'excel':
      await exportToExcel(data, options)
      break
    default:
      throw new Error(`不支持的导出格式: ${format}`)
  }
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 下载Blob文件
 */
function downloadBlob(blob: Blob, filename: string, _mimeType?: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 格式化文件名（移除特殊字符）
 */
export function formatFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 100)
}

