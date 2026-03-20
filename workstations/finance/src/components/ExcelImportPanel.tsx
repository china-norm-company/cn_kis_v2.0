/**
 * 绩效奖金 Excel 导入组件（财务台）
 *
 * 功能：
 * 1. 拖放或点击上传 xlsx 文件
 * 2. SheetJS 客户端解析，自动定位"临床研究" Sheet
 * 3. QC 确认筛选（QC确认列 = "是" 才入库）
 * 4. 分配占比校验（各角色占比之和必须 = 100%）
 * 5. 预览表格 + 错误高亮
 * 6. 确认后批量提交后端
 */
import { useState, useRef, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import * as XLSX from 'xlsx'
import { Upload, AlertTriangle, CheckCircle, XCircle, FileSpreadsheet, Info } from 'lucide-react'

const TARGET_SHEET_KEYWORDS = ['临床研究', '绩效', '奖金', '分配']
const QC_CONFIRM_KEYWORDS = ['qc确认', 'qc_confirm', '质控确认', '已确认']
const ROLE_ALLOC_COLS = ['pm占比', 'crc占比', 'pi占比', '护士占比', '其他占比', 'pm_ratio', 'crc_ratio', 'pi_ratio']

interface ParsedRow {
  [key: string]: string | number | null | boolean
  _rowIndex: number
  _qcPassed: boolean
  _allocTotal: number
  _errors: string
}

interface ValidationSummary {
  total: number
  qcPassed: number
  qcFailed: number
  allocErrors: number
  readyToImport: number
}

function findTargetSheet(workbook: XLSX.WorkBook): string {
  const names = workbook.SheetNames
  for (const kw of TARGET_SHEET_KEYWORDS) {
    const found = names.find((n) => n.includes(kw))
    if (found) return found
  }
  return names[0] ?? ''
}

function normalizeHeader(h: string): string {
  return h.replace(/\s/g, '').toLowerCase()
}

function detectQcColumn(headers: string[]): string | null {
  for (const h of headers) {
    if (QC_CONFIRM_KEYWORDS.some((kw) => normalizeHeader(h).includes(kw))) return h
  }
  return null
}

function detectAllocColumns(headers: string[]): string[] {
  return headers.filter((h) =>
    ROLE_ALLOC_COLS.some((kw) => normalizeHeader(h).includes(kw))
  )
}

export function ExcelImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [sheetName, setSheetName] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [summary, setSummary] = useState<ValidationSummary | null>(null)
  const [parseError, setParseError] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)

  const importMutation = useMutation({
    mutationFn: (data: ParsedRow[]) =>
      api.post('/finance/contributions/import-excel', {
        rows: data.map(({ _rowIndex: _r, _qcPassed: _q, _allocTotal: _a, _errors: _e, ...rest }) => rest),
        sheet_name: sheetName,
      }),
  })

  const parseFile = useCallback((file: File) => {
    setParseError('')
    setRows([])
    setHeaders([])
    setSummary(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const targetSheet = findTargetSheet(wb)
        setSheetName(targetSheet)

        const ws = wb.Sheets[targetSheet]
        if (!ws) {
          setParseError(`未找到目标 Sheet（尝试了：${TARGET_SHEET_KEYWORDS.join('/')}）`)
          return
        }

        const rawData: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
        if (rawData.length < 2) {
          setParseError('Sheet 数据不足（少于 2 行）')
          return
        }

        const headerRow = (rawData[0] as string[]).map(String)
        setHeaders(headerRow)

        const qcCol = detectQcColumn(headerRow)
        const allocCols = detectAllocColumns(headerRow)

        const parsed: ParsedRow[] = []
        for (let i = 1; i < rawData.length; i++) {
          const rowArr = rawData[i] as (string | number)[]
          if (rowArr.every((v) => v === '' || v == null)) continue

          const row: ParsedRow = {
            _rowIndex: i + 1,
            _qcPassed: true,
            _allocTotal: 0,
            _errors: '',
          }

          headerRow.forEach((h, idx) => {
            row[h] = rowArr[idx] ?? null
          })

          // QC 确认筛选
          if (qcCol) {
            const qcVal = String(row[qcCol] ?? '').trim()
            row._qcPassed = qcVal === '是' || qcVal === 'yes' || qcVal === '1' || qcVal === 'true'
          }

          // 分配占比校验
          if (allocCols.length > 0) {
            const total = allocCols.reduce((sum, col) => {
              const v = parseFloat(String(row[col] ?? '0').replace('%', '')) || 0
              return sum + v
            }, 0)
            row._allocTotal = Math.round(total * 10) / 10
            const errors: string[] = []
            if (row._qcPassed && Math.abs(total - 100) > 0.5) {
              errors.push(`占比之和 ${total.toFixed(1)}% ≠ 100%`)
            }
            row._errors = errors.join('；')
          }

          parsed.push(row)
        }

        setRows(parsed)
        const qcPassed = parsed.filter((r) => r._qcPassed)
        const allocErrors = qcPassed.filter((r) => r._errors !== '').length
        setSummary({
          total: parsed.length,
          qcPassed: qcPassed.length,
          qcFailed: parsed.filter((r) => !r._qcPassed).length,
          allocErrors,
          readyToImport: qcPassed.length - allocErrors,
        })
      } catch (err) {
        setParseError(`解析失败：${String(err)}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const handleFile = (file: File | null | undefined) => {
    if (!file) return
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setParseError('仅支持 .xlsx / .xls / .csv 文件')
      return
    }
    parseFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  const readyRows = rows.filter((r) => r._qcPassed && r._errors === '')

  return (
    <div className="space-y-4">
      {/* 上传区 */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 cursor-pointer flex flex-col items-center gap-3 transition-colors ${
          isDragOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
        }`}
      >
        <FileSpreadsheet className="w-10 h-10 text-slate-300" />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-600">
            {fileName || '拖放或点击上传 Excel 文件'}
          </p>
          <p className="text-xs text-slate-400 mt-1">支持 .xlsx / .xls，自动定位"临床研究"Sheet</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {parseError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <XCircle className="w-4 h-4 shrink-0" />
          {parseError}
        </div>
      )}

      {/* 解析摘要 */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: '总行数', value: summary.total, color: 'text-slate-700' },
            { label: 'QC 通过', value: summary.qcPassed, color: 'text-green-600' },
            { label: 'QC 未通过', value: summary.qcFailed, color: 'text-amber-600' },
            { label: '占比错误', value: summary.allocErrors, color: 'text-red-600' },
            { label: '可导入', value: summary.readyToImport, color: 'text-blue-600 font-bold' },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-400">{s.label}</p>
              <p className={`text-xl font-semibold mt-0.5 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* 分配规则说明 */}
      {rows.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">校验规则：</span>
            QC确认列必须为"是"；各角色占比（PM/CRC/PI/护士/其他）之和须等于 100%（误差 ≤ 0.5%）。
            橙色行为 QC 未通过，红色行为占比校验失败，仅绿色行参与导入。
          </div>
        </div>
      )}

      {/* 数据预览表格 */}
      {rows.length > 0 && headers.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">
              数据预览（Sheet: {sheetName}）
            </span>
            <span className="text-xs text-slate-400">{rows.length} 行</span>
          </div>
          <div className="overflow-auto max-h-72">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-slate-500 whitespace-nowrap">行号</th>
                  <th className="px-3 py-2 text-left text-slate-500 whitespace-nowrap">状态</th>
                  {headers.slice(0, 10).map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                  {headers.length > 10 && (
                    <th className="px-3 py-2 text-slate-400">+{headers.length - 10} 列</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 50).map((row) => {
                  const rowBg = !row._qcPassed
                    ? 'bg-amber-50'
                    : row._errors
                    ? 'bg-red-50'
                    : 'hover:bg-slate-50'
                  return (
                    <tr key={row._rowIndex} className={`border-t border-slate-100 ${rowBg}`}>
                      <td className="px-3 py-1.5 text-slate-400">{row._rowIndex}</td>
                      <td className="px-3 py-1.5">
                        {!row._qcPassed ? (
                          <span className="flex items-center gap-1 text-amber-600"><AlertTriangle className="w-3 h-3" /> QC</span>
                        ) : row._errors ? (
                          <span className="flex items-center gap-1 text-red-600"><XCircle className="w-3 h-3" /> 占比</span>
                        ) : (
                          <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3 h-3" /> 通过</span>
                        )}
                      </td>
                      {headers.slice(0, 10).map((h) => (
                        <td key={h} className="px-3 py-1.5 text-slate-700 whitespace-nowrap max-w-[120px] truncate">
                          {String(row[h] ?? '')}
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {rows.length > 50 && (
                  <tr className="border-t border-slate-100">
                    <td colSpan={headers.length + 2} className="px-3 py-2 text-center text-xs text-slate-400">
                      仅显示前 50 行，共 {rows.length} 行
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      {summary && summary.readyToImport > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">
            将导入 <span className="font-semibold text-blue-600">{summary.readyToImport}</span> 条记录
            （跳过 {summary.total - summary.readyToImport} 条）
          </p>
          <button
            onClick={() => importMutation.mutate(readyRows)}
            disabled={importMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {importMutation.isPending ? '导入中...' : `确认导入 ${summary.readyToImport} 条`}
          </button>
        </div>
      )}

      {importMutation.isSuccess && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <CheckCircle className="w-4 h-4" />
          导入成功！
        </div>
      )}

      {importMutation.isError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <XCircle className="w-4 h-4" />
          导入失败，请检查后端接口
        </div>
      )}
    </div>
  )
}
