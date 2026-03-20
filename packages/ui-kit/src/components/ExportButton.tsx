/**
 * ExportButton - 数据导出按钮组件
 * 
 * 支持多种格式的数据导出：CSV、JSON、Excel
 */
import { useState } from 'react'
import { Download, FileText, FileJson, FileSpreadsheet, ChevronDown } from 'lucide-react'
import { Button } from './Button'

export interface ExportButtonProps<T = any> {
  data: T[]
  filename?: string
  disabled?: boolean
  formats?: Array<'csv' | 'json' | 'excel'>
  onExport?: (format: 'csv' | 'json' | 'excel') => void
}

export function ExportButton<T extends Record<string, any>>({
  data,
  filename = 'export',
  disabled = false,
  formats,
  onExport,
}: ExportButtonProps<T>) {
  const canExport = {
    csv: !formats || formats.includes('csv'),
    json: !formats || formats.includes('json'),
    excel: !formats || formats.includes('excel'),
  }

  const [isOpen, setIsOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async (format: 'csv' | 'json' | 'excel') => {
    if (data.length === 0) {
      alert('没有数据可导出')
      return
    }

    setIsExporting(true)
    try {
      const { exportData, formatFilename } = await import('../utils/exportUtils')
      await exportData(data, format, {
        filename: formatFilename(filename),
        includeHeaders: true,
      })
      onExport?.(format)
    } catch (error) {
      console.error('导出失败:', error)
      alert('导出失败，请重试')
    } finally {
      setIsExporting(false)
      setIsOpen(false)
    }
  }

  if (disabled || data.length === 0) {
    return null
  }

  return (
    <div className="relative">
      <Button
        variant="secondary"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="flex items-center gap-2"
      >
        <Download className="w-4 h-4" />
        导出数据
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* 下拉菜单 */}
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 z-20">
            <div className="py-1">
              {canExport.csv && <button
                onClick={() => handleExport('csv')}
                disabled={isExporting}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
              >
                <FileText className="w-4 h-4 text-slate-500" />
                <span>导出为 CSV</span>
              </button>}
              {canExport.json && <button
                onClick={() => handleExport('json')}
                disabled={isExporting}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
              >
                <FileJson className="w-4 h-4 text-slate-500" />
                <span>导出为 JSON</span>
              </button>}
              {canExport.excel && <button
                onClick={() => handleExport('excel')}
                disabled={isExporting}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                <span>导出为 Excel</span>
              </button>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

