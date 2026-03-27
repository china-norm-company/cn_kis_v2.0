/**
 * AI 解析上传弹窗（与 KIS 项目全链路一致）
 * 选择方案文件并触发解析流程；已有解析结果时需勾选「确认覆盖」方可提交。
 */
import { useState, useEffect } from 'react'
import { Modal, Button } from '@cn-kis/ui-kit'

export interface AiParseUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 是否已有解析结果（方案或项目已存在 parsed_data） */
  hasExistingParsedData?: boolean
  onConfirm: (file: File, confirmOverwrite: boolean) => void
  isSubmitting?: boolean
}

export function AiParseUploadDialog({
  open,
  onOpenChange,
  hasExistingParsedData = false,
  onConfirm,
  isSubmitting = false,
}: AiParseUploadDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  useEffect(() => {
    if (!open) {
      setSelectedFile(null)
      setConfirmOverwrite(false)
    }
  }, [open])

  const handleClose = () => {
    setSelectedFile(null)
    setConfirmOverwrite(false)
    onOpenChange(false)
  }

  const needOverwriteConfirm = hasExistingParsedData
  const canSubmit = selectedFile && (isSubmitting === false) && (!needOverwriteConfirm || confirmOverwrite)

  const handleConfirm = () => {
    if (selectedFile && canSubmit) {
      onConfirm(selectedFile, confirmOverwrite)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="AI 解析 - 上传方案文件"
      size="md"
      zIndex={100}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canSubmit}
          >
            {isSubmitting ? '提交中…' : '确定'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          请选择 PDF 或 Word 格式的方案文件，确认后将依次调用 AI 解析。
        </p>
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm"
          onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-slate-500">支持 PDF / DOC / DOCX 格式。</p>
        {needOverwriteConfirm && (
          <label className="flex items-center gap-2 mt-3 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmOverwrite}
              onChange={(e) => setConfirmOverwrite(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>确认覆盖现有解析结果（当前项目/方案已有解析数据，重新解析将覆盖）</span>
          </label>
        )}
      </div>
    </Modal>
  )
}
