/**
 * 上传测试执行订单 - 建排程下解析后展示在资源需求 Tab，并在排程计划中生成一条待排程任务
 */
import { useState, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { Modal, Button } from '@cn-kis/ui-kit'
import { Upload, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react'
import {
  extractByCellMap,
  getEvaluationBlockFromSheet,
  hasCellMap,
  convertVerticalLayoutToHeadersRows,
} from '../utils/executionOrderPlanConfig'
import { schedulingApi } from '@cn-kis/api-client'
import { ExecutionOrderDetailReadOnly } from './ExecutionOrderDetailReadOnly'

const ACCEPT = '.xlsx,.xls,.csv'
const MAX_PREVIEW_ROWS = 50

export type ExecutionOrderParsed = {
  sheetName: string
  headers: string[]
  rows: string[][]
}

type Props = {
  onClose: () => void
  onConfirm?: (data: { headers: string[]; rows: string[][] }) => void
  confirmLoading?: boolean
}

export function UploadExecutionOrderModal({ onClose, onConfirm, confirmLoading = false }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ExecutionOrderParsed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [showRawTable, setShowRawTable] = useState(false)

  const firstRowAsRecord = useMemo((): Record<string, string> | null => {
    if (!parsed?.headers?.length || !parsed.rows?.[0]) return null
    const row: Record<string, string> = {}
    parsed.headers.forEach((h, i) => {
      row[h] = String(parsed.rows[0][i] ?? '').trim()
    })
    return row
  }, [parsed])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setError(null)
    setParsed(null)
    setFile(f ?? null)
    if (!f) {
      setIsParsing(false)
      return
    }
    setIsParsing(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const raw = ev.target?.result
        if (!raw) {
          setError('无法读取文件')
          return
        }
        const wb = f.name.endsWith('.csv')
          ? XLSX.read(typeof raw === 'string' ? raw : '', { type: 'string' })
          : XLSX.read(raw as ArrayBuffer, { type: 'array' })
        const sheetName = wb.SheetNames[0] || ''
        const sheet = wb.Sheets[sheetName]
        if (!sheet) {
          setParsed({ sheetName, headers: [], rows: [] })
          return
        }
        const json: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        if (json.length === 0) {
          setParsed({ sheetName, headers: [], rows: [] })
          return
        }
        const rawRows = json.map((row: unknown[]) => (row ?? []).map((c: unknown) => String(c ?? '')))
        let headers: string[]
        let rows: string[][]
        if (hasCellMap()) {
          let aiEvaluationTable: Array<Record<string, string>> | null = null
          try {
            const { block } = getEvaluationBlockFromSheet(rawRows)
            if (block.length > 0) {
              const res = await schedulingApi.parseEvaluationBlock(block)
              const data = (res as { data?: { data?: { evaluationTable?: Array<Record<string, string>> } } })?.data?.data
              aiEvaluationTable = data?.evaluationTable ?? null
            }
          } catch {
            // AI 解析失败，下方用规则解析
          }
          const byCell = extractByCellMap(
            rawRows,
            undefined,
            aiEvaluationTable && aiEvaluationTable.length > 0 ? (aiEvaluationTable as never) : undefined
          )
          if (byCell.headers.length > 0) {
            headers = byCell.headers
            rows = byCell.rows
          } else {
            const vertical = convertVerticalLayoutToHeadersRows(rawRows)
            if (vertical) {
              headers = vertical.headers
              rows = vertical.rows
            } else {
              headers = (rawRows[0] ?? []).map((c) => String(c ?? ''))
              rows = rawRows.slice(1).map((row) => [...row])
            }
          }
        } else {
          const vertical = convertVerticalLayoutToHeadersRows(rawRows)
          if (vertical) {
            headers = vertical.headers
            rows = vertical.rows
          } else {
            headers = (rawRows[0] ?? []).map((c) => String(c ?? ''))
            rows = rawRows.slice(1).map((row) => [...row])
          }
        }
        // 固定 C4 单元格解析项目名称：若未包含或首行为空，则从 rawRows[3][2] 注入（C4 = 第4行第C列）
        const c4Val = rawRows.length > 3 && rawRows[3]?.length > 2 ? String(rawRows[3][2] ?? '').trim() : ''
        if (c4Val) {
          const idx = headers.indexOf('项目名称')
          if (idx >= 0) {
            if (rows[0] && (rows[0][idx] ?? '').toString().trim() === '') {
              rows[0] = [...(rows[0] ?? [])]
              rows[0][idx] = c4Val
            }
          } else {
            headers = [...headers, '项目名称']
            rows = rows.map((r, i) => [...(r ?? []), i === 0 ? c4Val : ''])
          }
        }
        setParsed({ sheetName, headers, rows })
      } catch (err) {
        setError(err instanceof Error ? err.message : '解析失败')
      } finally {
        setIsParsing(false)
      }
    }
    if (f.name.endsWith('.csv')) {
      reader.readAsText(f, 'UTF-8')
    } else {
      reader.readAsArrayBuffer(f)
    }
  }, [])

  const handleConfirm = useCallback(() => {
    if (!parsed || !onConfirm) return
    // 传深拷贝，避免关闭弹窗后引用丢失或与解析状态绑定
    const headers = (parsed.headers || []).map((h) => String(h ?? ''))
    const rows = (parsed.rows || []).map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? '')) : []))
    onConfirm({ headers, rows })
    onClose()
  }, [parsed, onConfirm, onClose])

  const inputId = 'upload-execution-order'
  return (
    <Modal
      title="上传测试执行订单"
      open
      onClose={onClose}
      size="xl"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button className="min-h-11" variant="secondary" onClick={onClose}>
            关闭
          </Button>
          {isParsing && (
            <Button className="min-h-11" variant="primary" disabled>
              解析中...
            </Button>
          )}
          {!isParsing && parsed && parsed.rows.length > 0 && (
            <Button className="min-h-11" variant="primary" onClick={handleConfirm} disabled={confirmLoading}>
              {confirmLoading ? '保存中...' : '确认上传'}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5 min-h-[70vh] flex flex-col">
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-10 min-h-[140px]">
          <input
            type="file"
            accept={ACCEPT}
            onChange={handleFileChange}
            className="hidden"
            id={inputId}
          />
          <label
            htmlFor={inputId}
            className="flex flex-col items-center gap-3 cursor-pointer text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <Upload className="w-12 h-12 text-slate-400 dark:text-slate-500" />
            <span className="text-base font-medium">选择测试执行订单文件</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">支持 .xlsx、.xls、.csv</span>
          </label>
          <Button
            type="button"
            variant="primary"
            className="mt-5 min-h-11 px-6"
            onClick={() => document.getElementById(inputId)?.click()}
          >
            <Upload className="w-4 h-4 mr-2 inline" />
            选择文件上传
          </Button>
          {file && (
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2 bg-white dark:bg-slate-700/50 px-4 py-2 rounded-lg">
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-[280px]">已选：{file.name}</span>
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm px-4 py-3 border border-red-100 dark:border-red-800/50">
            {error}
          </div>
        )}

        {parsed && parsed.rows.length > 0 && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden bg-white dark:bg-slate-800 flex-1 flex flex-col min-h-0">
              <div className="bg-slate-100 dark:bg-slate-700/80 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-600 shrink-0">
                解析结果预览（与资源需求详情展示一致）
                <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                  {parsed.sheetName}，共 {parsed.rows.length} 行
                  {parsed.rows.length > 1 && '，以下为首行'}
                </span>
              </div>
              <div className="overflow-auto flex-1 min-h-[320px] p-4">
                {firstRowAsRecord && (
                  <ExecutionOrderDetailReadOnly
                    headers={parsed.headers}
                    row={firstRowAsRecord}
                    isDark={false}
                  />
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowRawTable((v) => !v)}
              className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            >
              {showRawTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showRawTable ? '收起原始表格' : '查看原始表格'}
            </button>

            {showRawTable && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
                <div className="bg-slate-100 dark:bg-slate-700 px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                  原始数据
                  {parsed.rows.length > MAX_PREVIEW_ROWS && `（仅显示前 ${MAX_PREVIEW_ROWS} 行）`}
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[40vh] min-h-[120px]">
                  <table className="w-full min-w-[800px] text-sm border-collapse">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-600">
                      <tr>
                        {parsed.headers.map((h, i) => (
                          <th
                            key={i}
                            className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-600 last:border-r-0 whitespace-nowrap"
                          >
                            {h || `列${i + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, MAX_PREVIEW_ROWS).map((row, ri) => (
                        <tr key={ri} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                          {parsed.headers.map((_, ci) => (
                            <td
                              key={ci}
                              className="px-3 py-2 text-slate-600 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0 align-top"
                            >
                              {row[ci] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="text-sm text-slate-500 dark:text-slate-400">
              确认后将写入资源需求 Tab，并在排程计划中生成一条待排程任务。
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
