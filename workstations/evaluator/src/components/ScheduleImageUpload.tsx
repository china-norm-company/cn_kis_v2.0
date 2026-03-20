/**
 * 排程图片上传区域
 * 支持拖拽、点击选择，格式 jpg/png/webp/gif，单文件 < 5MB
 */
import { useState, useRef } from 'react'
import { evaluatorApi } from '@cn-kis/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus } from 'lucide-react'
import type { ScheduleAttachment } from '@cn-kis/api-client'

const ACCEPT = '.jpg,.jpeg,.png,.webp,.gif'
const MAX_SIZE = 5 * 1024 * 1024

export interface ScheduleImageUploadProps {
  attachments: ScheduleAttachment[]
  scheduleDate?: string
  onUploadSuccess?: () => void
}

export function ScheduleImageUpload({
  attachments,
  scheduleDate,
  onUploadSuccess,
}: ScheduleImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const doUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '')) {
      setError('请上传 jpg/png/webp/gif 格式')
      return
    }
    if (file.size > MAX_SIZE) {
      setError('单文件不能超过 5MB')
      return
    }
    setError(null)
    setUploading(true)
    try {
      await evaluatorApi.uploadScheduleAttachment(file, scheduleDate)
      queryClient.invalidateQueries({ queryKey: ['evaluator', 'schedule'] })
      onUploadSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) doUpload(f)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (f) doUpload(f)
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          flex items-center justify-center gap-2 min-h-[80px] border-2 border-dashed rounded-lg cursor-pointer
          transition-colors
          ${drag ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}
          ${uploading ? 'opacity-60 pointer-events-none' : ''}
        `}
      >
        <ImagePlus className="w-5 h-5 text-slate-400" />
        <span className="text-sm text-slate-600">
          {uploading ? '上传中…' : '点击或拖拽图片到此处上传（jpg/png/webp/gif，&lt;5MB）'}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleChange}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {attachments.map((a) => (
            <div key={a.id} className="relative group">
              <a
                href={a.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-16 h-16 rounded border border-slate-200 overflow-hidden bg-slate-100"
              >
                <img
                  src={a.file_url}
                  alt={a.file_name}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = '' }}
                />
              </a>
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-slate-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="text-white text-xs">↗</a>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
