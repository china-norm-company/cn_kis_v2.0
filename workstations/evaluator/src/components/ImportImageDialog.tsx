/**
 * 导入排程图片对话框
 * 识别图片中与指定人员（如林紫倩）相关的工作日期、设备、项目编号，并展示在排程日历上
 */
import { useState, useRef } from 'react'
import { evaluatorApi } from '@cn-kis/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus, X, CheckCircle2, AlertCircle } from 'lucide-react'

const ACCEPT = '.jpg,.jpeg,.png,.webp,.gif'
const MAX_SIZE = 5 * 1024 * 1024
const VALID_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif']

export interface ImportImageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 当前周起始日期，用于生成日期选项（保留兼容） */
  weekStart?: string
}

export function ImportImageDialog({ open, onOpenChange }: ImportImageDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [personName, setPersonName] = useState('')
  const [drag, setDrag] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    created: number
    items: Array<{ schedule_date: string; equipment: string; project_no: string; room_no?: string; title: string }>
    error?: string
  } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // 不再预加载 OCR（已默认关闭 OCR，避免 warmup 阻塞后端 30–60 秒导致识别请求排队超时）

  const addFile = (newFile: File | null) => {
    if (!newFile) return
    const ext = newFile.name.split('.').pop()?.toLowerCase()
    if (!ext || !VALID_EXT.includes(ext)) return
    if (newFile.size > MAX_SIZE) return
    setFile(newFile)
    setResult(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (f) addFile(f)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) addFile(f)
    e.target.value = ''
  }

  const handleSubmit = async () => {
    if (!file) return
    setSubmitting(true)
    setResult(null)
    try {
      const res = await evaluatorApi.analyzeScheduleImage(file, personName.trim() || undefined)
      const d = (res as any)?.data
      setResult({
        created: d?.created ?? 0,
        items: d?.items ?? [],
        error: d?.error,
      })
      queryClient.invalidateQueries({ queryKey: ['evaluator', 'schedule'] })
      if (!d?.error && (d?.created ?? 0) > 0) {
        setFile(null)
        setTimeout(() => onOpenChange(false), 1500)
      }
    } catch (err) {
      setResult({
        created: 0,
        items: [],
        error: err instanceof Error ? err.message : '识别失败',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setResult(null)
    setPersonName('')
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold">识别排程图片</h3>
          <button onClick={handleClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">筛选人员姓名</label>
            <input
              type="text"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder="如：林紫倩，留空则使用当前登录账号"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">选择图片</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`
                flex flex-col items-center justify-center gap-2 min-h-[100px] border-2 border-dashed rounded-lg cursor-pointer
                transition-colors
                ${drag ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}
              ${submitting ? 'opacity-60 pointer-events-none' : ''}
            `}
            >
              <ImagePlus className="w-6 h-6 text-slate-400" />
              <span className="text-sm text-slate-600">
                {submitting ? '识别中…' : '点击或拖拽图片到此处，将识别日期、设备、项目编号、房间号'}
              </span>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={handleChange}
            />
          </div>
          {file && (
            <div className="flex items-center gap-2">
              <div className="w-12 h-12 rounded border overflow-hidden bg-slate-100 shrink-0">
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="w-full h-full object-cover"
                  onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                />
              </div>
              <span className="text-sm text-slate-600 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => { setFile(null); setResult(null) }}
                className="ml-auto text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
          )}
          {result && (
            <div className={`p-3 rounded-lg ${result.error ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>
              <div className="flex items-center gap-2">
                {result.error ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                <span>
                  {result.error ? result.error : `成功识别并导入 ${result.created} 条排程，已显示在对应日期`}
                </span>
              </div>
              {result.items?.length > 0 && (
                <ul className="mt-2 text-sm space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {result.items.map((item, i) => (
                    <li key={i} className="break-words border-b border-slate-200/60 pb-1 last:border-0 last:pb-0">
                      {item.schedule_date}：{[item.project_no, item.equipment, item.room_no, item.title].filter(Boolean).join(' / ') || '—'}
                    </li>
                  ))}
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
            disabled={!file || submitting}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? '识别中…' : '识别并导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
