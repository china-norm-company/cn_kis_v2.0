/**
 * 创建排程 - 本地表格上传与解析模态框
 *
 * 支持上传 Excel（.xlsx / .xls）或 CSV，解析后在模态框内以表格预览。
 * 仅执行台使用。
 */
import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Modal, Button } from '@cn-kis/ui-kit'
import { Upload, FileSpreadsheet } from 'lucide-react'

const ACCEPT = '.xlsx,.xls,.csv'
const MAX_PREVIEW_ROWS = 50

export type ParsedTable = {
  sheetName: string
  headers: string[]
  rows: string[][]
}

type Props = {
  onClose: () => void
  onParsed?: (data: ParsedTable) => void
  /** 确认上传请求进行中时为 true，用于禁用按钮并显示保存中 */
  confirmLoading?: boolean
}

export function CreateScheduleUploadModal({ onClose, onParsed, confirmLoading = false }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedTable | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setError(null)
    setParsed(null)
    setFile(f ?? null)
    if (!f) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const raw = ev.target?.result
        if (!raw) {
          setError('无法读取文件')
          return
        }
        const wb = f.name.endsWith('.csv')
          ? XLSX.read(typeof raw === 'string' ? raw : '', { type: 'string' })
          : XLSX.read(raw as ArrayBuffer, { type: 'array' })
        const sheetName = wb.SheetNames.includes('明细') ? '明细' : wb.SheetNames[0]
        const sheet = wb.Sheets[sheetName]
        const json: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        if (json.length === 0) {
          setParsed({ sheetName, headers: [], rows: [] })
          return
        }
        const headers = (json[0] ?? []).map((c: unknown) => String(c ?? ''))
        const rows = json.slice(1).map((row: unknown[]) => (row ?? []).map((c: unknown) => String(c ?? '')))
        setParsed({
          sheetName,
          headers,
          rows,
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : '解析失败')
      }
    }
    if (f.name.endsWith('.csv')) {
      reader.readAsText(f, 'UTF-8')
    } else {
      reader.readAsArrayBuffer(f)
    }
  }, [])

  const handleConfirmUpload = useCallback(() => {
    if (!parsed || !onParsed) return
    onParsed(parsed)
    onClose()
  }, [parsed, onParsed, onClose])

  const inputId = 'create-schedule-upload'
  return (
    <Modal title="创建排程 - 上传表格" open onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-8">
          <input
            type="file"
            accept={ACCEPT}
            onChange={handleFileChange}
            className="hidden"
            id={inputId}
          />
          <label
            htmlFor={inputId}
            className="flex flex-col items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400"
          >
            <Upload className="w-10 h-10" />
            <span className="text-sm font-medium">点击下方按钮或此区域选择文件</span>
            <span className="text-xs text-slate-500">支持 .xlsx、.xls、.csv（Timeline 明细表）</span>
          </label>
          <Button
            type="button"
            variant="primary"
            className="mt-4 min-h-11"
            onClick={() => document.getElementById(inputId)?.click()}
          >
            <Upload className="w-4 h-4 mr-2 inline" />
            选择文件上传
          </Button>
          {file && (
            <p className="mt-3 text-sm text-slate-500 flex items-center gap-1">
              <FileSpreadsheet className="w-4 h-4" />
              已选：{file.name}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm px-4 py-2">
            {error}
          </div>
        )}

        {parsed && (
          <>
            <div className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
              <div className="bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                上传内容预览：{parsed.sheetName}，共 {parsed.rows.length} 行
                {parsed.rows.length > MAX_PREVIEW_ROWS && `（下表仅显示前 ${MAX_PREVIEW_ROWS} 行）`}
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-[50vh] min-h-[200px]">
                <table className="w-full min-w-[900px] text-sm border-collapse">
                  <thead className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-600">
                    <tr>
                      {parsed.headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-600 last:border-r-0 whitespace-nowrap">
                          {h || `列${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, MAX_PREVIEW_ROWS).map((row, ri) => (
                      <tr key={ri} className="border-b border-slate-100 dark:border-slate-700">
                        {parsed.headers.map((_, ci) => (
                          <td key={ci} className="px-3 py-1.5 text-slate-600 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0">
                            {row[ci] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              请确认预览无误后点击「确认上传」导入数据；导入后将保存到系统并可在时间槽列表/甘特图中查看。
            </p>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button className="min-h-11" variant="secondary" onClick={onClose}>
            关闭
          </Button>
          {parsed && parsed.rows.length > 0 && (
            <Button className="min-h-11" variant="primary" onClick={handleConfirmUpload} disabled={confirmLoading}>
              {confirmLoading ? '保存中...' : '确认上传'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
