/**
 * 导入 Excel 排程对话框
 * 支持 .xlsx、.xls，按人员筛选并提取：日期、项目编号、设备、房间号
 */
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { evaluatorApi } from '@cn-kis/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Download, X, CheckCircle2, AlertCircle } from 'lucide-react'

export interface ImportExcelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 导入确认后回调人员姓名，用于排程页切换为「按姓名查看」 */
  onConfirmPerson?: (name: string) => void
}

const COLUMNS = ['日期', '项目编号', '设备', '房间号']
const TEMPLATE_ROWS = [
  ['2026-02-27', 'C25021007', '探头-Corneometer 1', 'D04-2'],
  ['2026-02-27', 'C26030001', '探头-Glossymeter 1', 'D04-2'],
]

function excelDateToYmd(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value)
    if (!d) return ''
    return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const s = String(value).trim()
  if (!s) return ''
  const m = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return s
}

function normalizePerson(s: string): string {
  return s.replace(/\s+/g, '').replace(/[()（）]/g, '').toLowerCase()
}

function parseWideScheduleRows(rows2d: unknown[][], targetName: string) {
  const out: Array<Record<string, unknown>> = []
  const headerRowIdx = rows2d.findIndex((r) => r.some((c) => String(c ?? '').trim() === '项目编号'))
  if (headerRowIdx < 0) return out
  const headerRow = rows2d[headerRowIdx] ?? []
  const dateRow = rows2d[Math.max(0, headerRowIdx - 2)] ?? []
  const blockStarts: number[] = []
  for (let c = 0; c < headerRow.length; c++) {
    if (String(headerRow[c] ?? '').trim() === '项目编号') blockStarts.push(c)
  }
  const targetNorm = normalizePerson(targetName || '')
  const extractProject = (raw: string) => {
    const m = raw.toUpperCase().match(/C\d{8}/)
    return m ? m[0] : raw.trim()
  }

  for (let r = headerRowIdx + 1; r < rows2d.length; r++) {
    const row = rows2d[r] ?? []
    const equipment = String(row[2] ?? row[1] ?? row[0] ?? '').trim()
    for (const c of blockStarts) {
      const date = excelDateToYmd(dateRow[c])
      const projectRaw = String(row[c] ?? '').trim()
      const personRaw = String(row[c + 2] ?? '').trim()
      const room = String(row[c + 3] ?? '').trim()
      if (!date || (!projectRaw && !personRaw && !room)) continue
      if (targetNorm) {
        const personNorm = normalizePerson(personRaw)
        if (!personNorm || !personNorm.includes(targetNorm)) continue
      }
      out.push({
        日期: date,
        人员姓名: personRaw,
        项目编号: extractProject(projectRaw),
        设备: equipment,
        房间号: room,
        备注: '',
      })
    }
  }
  return out
}

function parseWorkbookRows(wb: XLSX.WorkBook, targetName: string) {
  const all: Array<Record<string, unknown>> = []
  let hasWideSheet = false
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const rows2d = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    const wideRows = parseWideScheduleRows(rows2d, targetName)
    if (wideRows.length > 0) {
      all.push(...wideRows)
      hasWideSheet = true
      continue
    }
    // 若工作簿中已识别到宽表，则忽略其它普通表，避免混入无关结构数据
    if (!hasWideSheet) {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)
      if (rows.length > 0) all.push(...rows)
    }
  }
  return all
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([COLUMNS, ...TEMPLATE_ROWS])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '排程')
  XLSX.writeFile(wb, '排程导入模板.xlsx')
}

export function ImportExcelDialog({ open, onOpenChange, onConfirmPerson }: ImportExcelDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [personName, setPersonName] = useState('')
  const [preview, setPreview] = useState<Record<string, unknown>[]>([])
  const [matchedRows, setMatchedRows] = useState<Record<string, unknown>[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const normalizeKey = (s: string) => s.replace(/\s+/g, '').toLowerCase()

  const pickField = (row: Record<string, unknown>, candidates: string[]) => {
    for (const c of candidates) {
      if (row[c] != null && String(row[c]).trim()) return row[c]
    }
    const keys = Object.keys(row)
    for (const k of keys) {
      const nk = normalizeKey(k)
      for (const c of candidates) {
        if (nk.includes(normalizeKey(c))) {
          const v = row[k]
          if (v != null && String(v).trim()) return v
        }
      }
    }
    return undefined
  }

  const normalizeRows = (rows: Record<string, unknown>[]) =>
    rows.map((r) => ({
      日期: pickField(r, ['日期', '排程日期', '工作日期', 'schedule_date', 'date']),
      人员姓名: pickField(r, ['人员姓名', '姓名', '人员', '人员/岗位', '岗位人员', 'person_name']),
      项目编号: pickField(r, ['项目编号', '项目号', '项目编码', 'project_no']),
      设备: pickField(r, ['设备', '仪器', 'equipment']),
      房间号: pickField(r, ['房间号', '房间', 'room_no']),
      备注: pickField(r, ['备注', 'note', 'remark']) ?? '',
    }))

  const looksLikeScheduleRow = (row: Record<string, unknown>) => {
    const hasDate = !!String(row['日期'] ?? '').trim()
    const hasPerson = !!String(row['人员姓名'] ?? '').trim()
    const hasCore = !!(
      String(row['项目编号'] ?? '').trim()
      || String(row['设备'] ?? '').trim()
      || String(row['房间号'] ?? '').trim()
    )
    return hasDate && hasPerson && hasCore
  }

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls'].includes(ext || '')) {
      alert('请选择 .xlsx 或 .xls 文件')
      return
    }
    setFile(f)
    setPreview([])
    setMatchedRows([])
    setResult(null)
    try {
      const data = await new Promise<ArrayBuffer>((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result as ArrayBuffer)
        r.onerror = rej
        r.readAsArrayBuffer(f)
      })
      const wb = XLSX.read(data, { type: 'array' })
      const parsedRows = parseWorkbookRows(wb, personName.trim())
      if (parsedRows.length === 0) {
        alert('文件中没有数据')
        return
      }
      const normalized = normalizeRows(parsedRows)
      const scheduleRows = normalized.filter((r) => looksLikeScheduleRow(r))
      const target = personName.trim()
      const filtered = target
        ? scheduleRows.filter((r) => normalizePerson(String(r['人员姓名'] ?? '')).includes(normalizePerson(target)))
        : scheduleRows
      if (target && filtered.length === 0) {
        alert(`未在 Excel 中找到与“${target}”相关的排班记录`)
      }
      setMatchedRows(filtered)
      setPreview(filtered.slice(0, 20))
    } catch (err) {
      console.error(err)
      alert('文件解析失败：' + (err instanceof Error ? err.message : '未知错误'))
    }
  }

  const handleSubmit = async () => {
    if (!file || matchedRows.length === 0) return
    setSubmitting(true)
    setResult(null)
    try {
      const target = personName.trim()
      const res = await evaluatorApi.importScheduleNotes(matchedRows, target || undefined)
      const d = (res as any)?.data
      setResult({ created: d?.created ?? 0, errors: d?.errors ?? [] })
      queryClient.invalidateQueries({ queryKey: ['evaluator', 'schedule'] })
      if ((d?.errors?.length ?? 0) === 0) {
        const name = target.trim()
        if (name && onConfirmPerson) onConfirmPerson(name)
        setTimeout(() => onOpenChange(false), 1500)
      }
    } catch (err) {
      alert('导入失败：' + (err instanceof Error ? err.message : '未知错误'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setPersonName('')
    setPreview([])
    setMatchedRows([])
    setResult(null)
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold">导入 Excel 排程</h3>
          <button onClick={handleClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">筛选人员姓名（建议填写）</label>
            <input
              type="text"
              value={personName}
              onChange={(e) => {
                setPersonName(e.target.value)
                // 切换姓名后需重新选择文件触发解析，避免沿用上一次姓名的匹配结果
                if (file) {
                  setPreview([])
                  setMatchedRows([])
                  setResult(null)
                }
              }}
              placeholder="如：林紫倩"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <FileSpreadsheet className="w-4 h-4" />
              选择文件
            </button>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              <Download className="w-4 h-4" />
              下载模板
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleSelect}
          />
          {file && <p className="text-sm text-slate-500">已选：{file.name}</p>}
          {matchedRows.length > 0 && (
            <p className="text-xs text-slate-500">匹配到 {matchedRows.length} 条（预览前 20 条）</p>
          )}
          {preview.length > 0 && (
            <div className="max-h-48 overflow-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {COLUMNS.map((col) => (
                        <td key={col} className="px-3 py-1.5">
                          {String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result && (
            <div className={`p-3 rounded-lg ${result.errors?.length ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>
              <div className="flex items-center gap-2">
                {result.errors?.length ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                <span>成功导入 {result.created} 条</span>
              </div>
              {result.errors?.length > 0 && (
                <ul className="mt-2 text-sm list-disc list-inside">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {result.errors.length > 5 && <li>… 共 {result.errors.length} 条错误</li>}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button onClick={handleClose} className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || matchedRows.length === 0 || submitting}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? '导入中…' : '确认导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
