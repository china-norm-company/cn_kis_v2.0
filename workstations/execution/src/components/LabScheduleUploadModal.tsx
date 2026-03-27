/**
 * 实验室排期上传弹窗（过渡功能）
 * 解析「实验室项目运营安排」模板（设备&场地 sheet），上传后展示在实验室排期 Tab
 */
import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Modal, Button } from '@cn-kis/ui-kit'
import { Upload, FileSpreadsheet } from 'lucide-react'
import { parseLabScheduleSheet } from '../utils/labScheduleParser'
import type { LabScheduleRow } from '@cn-kis/api-client'

const ACCEPT = '.xlsx,.xls,.csv'
const SHEET_NAME = '设备&场地'
const MAX_PREVIEW = 30

type Props = {
  onClose: () => void
  /** 确认上传时回传解析结果，由父组件调用 API 并刷新 */
  onConfirm?: (items: LabScheduleRow[], fileName: string) => void
  confirmLoading?: boolean
}

export function LabScheduleUploadModal({ onClose, onConfirm, confirmLoading = false }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [items, setItems] = useState<LabScheduleRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    setError(null)
    setItems([])
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
        const sheetName = wb.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : wb.SheetNames[0]
        const sheet = wb.Sheets[sheetName]
        const json: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        const parsed = parseLabScheduleSheet(json)
        setItems(parsed)
        if (parsed.length === 0) setError('未解析到有效数据，请确认使用「实验室项目运营安排」模板且包含「设备&场地」表')
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

  const handleConfirm = useCallback(() => {
    if (items.length === 0 || !file) return
    onConfirm?.(items, file.name)
    onClose()
  }, [items, file, onConfirm, onClose])

  const inputId = 'lab-schedule-upload'
  const columns = [
    { key: 'group', label: '组别' },
    { key: 'equipment', label: '设备' },
    { key: 'date', label: '日期' },
    { key: 'protocol_code', label: '项目编号' },
    { key: 'sample_size', label: '样本量' },
    { key: 'person_role', label: '人员/岗位' },
    { key: 'room', label: '房间' },
    { key: 'day_group', label: '组别' },
  ]

  return (
    <Modal title="上传排程 - 实验室项目运营安排" open onClose={onClose} size="xl">
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
            <span className="text-sm font-medium">点击选择「实验室项目运营安排」Excel 文件</span>
            <span className="text-xs text-slate-500">支持 .xlsx、.xls、.csv（需含「设备&场地」表）</span>
          </label>
          <Button
            type="button"
            variant="primary"
            className="mt-4 min-h-11"
            onClick={() => document.getElementById(inputId)?.click()}
          >
            <Upload className="w-4 h-4 mr-2 inline" />
            选择文件
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

        {items.length > 0 && (
          <>
            <div className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
              <div className="bg-slate-100 dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                解析结果预览：共 {items.length} 条
                {items.length > MAX_PREVIEW && `（下表仅显示前 ${MAX_PREVIEW} 条）`}
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-[40vh] min-h-[160px]">
                <table className="w-full min-w-[800px] text-sm border-collapse">
                  <thead className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-600">
                    <tr>
                      {columns.map((col) => (
                        <th key={col.key} className="px-3 py-2 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-600 last:border-r-0 whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.slice(0, MAX_PREVIEW).map((row, ri) => (
                      <tr key={ri} className="border-b border-slate-100 dark:border-slate-700">
                        {columns.map((col) => (
                          <td key={col.key} className="px-3 py-1.5 text-slate-600 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0">
                            {String((row as Record<string, unknown>)[col.key] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              确认无误后点击「确认上传」，数据将展示在「实验室排期」Tab（列表+甘特图），并同步至共济/衡技「我的排程」。
            </p>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button className="min-h-11" variant="secondary" onClick={onClose}>
            关闭
          </Button>
          {items.length > 0 && (
            <Button className="min-h-11" variant="primary" onClick={handleConfirm} disabled={confirmLoading}>
              {confirmLoading ? '上传中...' : '确认上传'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
