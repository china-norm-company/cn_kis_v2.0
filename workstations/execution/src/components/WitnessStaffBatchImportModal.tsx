/**
 * 双签工作人员 — 表格批量导入（.xlsx / .xls / .csv）
 * 解析后逐条调用 POST /protocol/witness-staff/part-time
 */
import { useCallback, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Modal, Button } from '@cn-kis/ui-kit'
import { protocolApi } from '@cn-kis/api-client'
import { Upload, FileSpreadsheet, Download } from 'lucide-react'

const ACCEPT = '.xlsx,.xls,.csv'
const MAX_ROWS = 500
const MAX_FILE_BYTES = 8 * 1024 * 1024

const COL_NAME = ['姓名', 'name', '名字', '工作人员姓名']
const COL_EMAIL = ['邮箱', 'email', '工作邮箱', 'e-mail', '电子邮箱', '邮件']

function normCell(s: unknown): string {
  return String(s ?? '')
    .replace(/^\ufeff/, '')
    .trim()
    .replace(/\u00a0/g, ' ')
}

function headerMatch(header: string, aliases: string[]): boolean {
  const h = normCell(header)
  if (!h) return false
  const hn = h.replace(/\s/g, '').toLowerCase()
  for (const a of aliases) {
    const an = a.replace(/\s/g, '').toLowerCase()
    if (hn === an || h === a) return true
  }
  return false
}

function findColIndex(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (headerMatch(headers[i] ?? '', aliases)) return i
  }
  return -1
}

export type WitnessImportRow = {
  name: string
  email: string
  _sheetRow: number
}

function parseRowsFromTable(headers: string[], rows: string[][]): { rows: WitnessImportRow[]; error: string | null } {
  const iName = findColIndex(headers, COL_NAME)
  const iEmail = findColIndex(headers, COL_EMAIL)
  if (iName < 0 || iEmail < 0) {
    return {
      rows: [],
      error: '表头须同时包含「姓名」与「邮箱」列（也支持英文列名 name、email）。',
    }
  }

  const out: WitnessImportRow[] = []
  let sheetRow = 1
  for (const row of rows) {
    sheetRow++
    const name = iName >= 0 ? normCell(row[iName]) : ''
    const email = iEmail >= 0 ? normCell(row[iEmail]) : ''
    if (!name && !email) continue
    out.push({
      name,
      email,
      _sheetRow: sheetRow,
    })
  }

  if (out.length > MAX_ROWS) {
    return { rows: [], error: `单次最多导入 ${MAX_ROWS} 行，请拆分文件。` }
  }
  return { rows: out, error: null }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validatePreviewRow(r: WitnessImportRow): string | null {
  if (!r.name) return '缺少姓名'
  if (!r.email) return '缺少邮箱'
  if (!EMAIL_RE.test(r.email)) return '邮箱格式不正确'
  return null
}

type Props = {
  open: boolean
  onClose: () => void
  onImported: () => void
}

export function WitnessStaffBatchImportModal({ open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<WitnessImportRow[] | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [resultSummary, setResultSummary] = useState<{
    ok: number
    fail: { row: number; msg: string }[]
  } | null>(null)

  const reset = useCallback(() => {
    setFile(null)
    setParsed(null)
    setParseError(null)
    setResultSummary(null)
    setIsDragging(false)
  }, [])

  const handleClose = useCallback(() => {
    if (importing) return
    reset()
    onClose()
  }, [importing, onClose, reset])

  const processFile = useCallback((f: File | null) => {
    setParseError(null)
    setParsed(null)
    setResultSummary(null)
    setFile(f)
    if (!f) return
    if (f.size > MAX_FILE_BYTES) {
      setParseError(`文件过大（>${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB）`)
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const raw = ev.target?.result
        if (!raw) {
          setParseError('无法读取文件')
          return
        }
        const wb = f.name.toLowerCase().endsWith('.csv')
          ? XLSX.read(typeof raw === 'string' ? raw : '', { type: 'string' })
          : XLSX.read(raw as ArrayBuffer, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        const sheet = wb.Sheets[sheetName]
        const json: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        if (json.length < 2) {
          setParseError('文件至少需要表头一行与数据一行')
          return
        }
        const headers = (json[0] ?? []).map((c) => normCell(c))
        const dataRows = json.slice(1).map((row) => (row ?? []).map((c) => normCell(c)))
        const { rows, error } = parseRowsFromTable(headers, dataRows)
        if (error) {
          setParseError(error)
          return
        }
        if (rows.length === 0) {
          setParseError('未解析到有效数据行（需填写姓名与邮箱）')
          return
        }
        setParsed(rows)
      } catch (err) {
        setParseError(err instanceof Error ? err.message : '解析失败')
      }
    }
    if (f.name.toLowerCase().endsWith('.csv')) {
      reader.readAsText(f, 'UTF-8')
    } else {
      reader.readAsArrayBuffer(f)
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      const f = e.dataTransfer.files?.[0]
      if (f) processFile(f)
    },
    [processFile],
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const downloadTemplate = useCallback(() => {
    const header = '姓名,邮箱'
    const example = '张三,zhangsan@example.com'
    const blob = new Blob(['\ufeff' + header + '\n' + example], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = '双签工作人员导入模板.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }, [])

  const runImport = useCallback(async () => {
    if (!parsed?.length) return
    setImporting(true)
    setResultSummary(null)
    const fail: { row: number; msg: string }[] = []
    let ok = 0
    for (const row of parsed) {
      const pre = validatePreviewRow(row)
      if (pre) {
        fail.push({ row: row._sheetRow, msg: pre })
        continue
      }
      try {
        await protocolApi.createWitnessStaffPartTime({
          name: row.name,
          email: row.email,
        })
        ok++
      } catch (e) {
        const msg = e instanceof Error ? e.message : '导入失败'
        fail.push({ row: row._sheetRow, msg })
      }
    }
    setResultSummary({ ok, fail })
    setImporting(false)
    if (ok > 0) onImported()
  }, [parsed, onImported])

  const inputId = 'witness-staff-batch-import-input'

  const importableCount = useMemo(
    () => (parsed ? parsed.filter((r) => !validatePreviewRow(r)).length : 0),
    [parsed],
  )

  if (!open) return null

  return (
    <Modal open={open} onClose={handleClose} title="批量导入双签工作人员" size="xl">
      <div className="space-y-4 mt-1">
        <p className="text-sm text-slate-600">
          支持拖拽文件到下方区域，或点击选择。<strong className="text-slate-800">首行为表头</strong>
          ，须包含「姓名」「邮箱」列。支持 .xlsx、.xls、.csv，单次最多 {MAX_ROWS} 行。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            <Download className="w-4 h-4" aria-hidden />
            下载 CSV 模板
          </button>
        </div>

        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
            isDragging ? 'border-indigo-400 bg-indigo-50/80' : 'border-slate-200 bg-slate-50/80'
          }`}
        >
          <input
            type="file"
            accept={ACCEPT}
            className="hidden"
            id={inputId}
            onChange={(e) => processFile(e.target.files?.[0] ?? null)}
          />
          <Upload className={`w-10 h-10 mb-2 ${isDragging ? 'text-indigo-500' : 'text-slate-400'}`} aria-hidden />
          <p className="text-sm font-medium text-slate-700 mb-1">将文件拖到此处，或</p>
          <Button type="button" variant="secondary" className="min-h-10" onClick={() => document.getElementById(inputId)?.click()}>
            选择文件
          </Button>
          {file ? (
            <p className="mt-3 text-sm text-slate-500 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden />
              {file.name}
            </p>
          ) : null}
        </div>

        {parseError ? (
          <div className="rounded-lg bg-rose-50 text-rose-800 text-sm px-4 py-2">{parseError}</div>
        ) : null}

        {parsed && parsed.length > 0 ? (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 flex justify-between flex-wrap gap-2">
              <span>待导入 {parsed.length} 行</span>
              <span className="text-slate-500 font-normal">标红行为校验未通过，导入时将跳过并记入失败明细</span>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[min(48vh,360px)]">
              <table className="w-full text-sm border-collapse min-w-[480px]">
                <thead className="sticky top-0 bg-white border-b border-slate-200">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-slate-600 w-14">行号</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">姓名</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">邮箱</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-600">校验</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((r, i) => {
                    const err = validatePreviewRow(r)
                    return (
                      <tr key={i} className={`border-b border-slate-100 ${err ? 'bg-rose-50/90' : ''}`}>
                        <td className="px-2 py-1.5 text-slate-500 tabular-nums">{r._sheetRow}</td>
                        <td className="px-2 py-1.5">{r.name || '—'}</td>
                        <td className="px-2 py-1.5 break-all">{r.email || '—'}</td>
                        <td className="px-2 py-1.5 text-xs">{err ? <span className="text-rose-700">{err}</span> : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {resultSummary ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm space-y-2">
            <p>
              <span className="text-emerald-700 font-medium">成功 {resultSummary.ok} 条</span>
              {resultSummary.fail.length > 0 ? (
                <>
                  {' '}
                  <span className="text-slate-500">|</span> <span className="text-rose-700 font-medium">失败 {resultSummary.fail.length} 条</span>
                </>
              ) : null}
            </p>
            {resultSummary.fail.length > 0 ? (
              <ul className="max-h-32 overflow-y-auto text-rose-800 text-xs space-y-0.5 list-disc pl-4">
                {resultSummary.fail.map((f, i) => (
                  <li key={i}>
                    第 {f.row} 行：{f.msg}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={importing}>
            {resultSummary ? '关闭' : '取消'}
          </Button>
          {parsed && parsed.length > 0 && !resultSummary ? (
            <Button
              type="button"
              variant="primary"
              disabled={importing || importableCount === 0}
              onClick={() => void runImport()}
              title={importableCount === 0 ? '没有可通过校验的数据行' : undefined}
            >
              {importing ? '导入中…' : `开始导入${importableCount < parsed.length ? `（${importableCount} 行）` : ''}`}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
