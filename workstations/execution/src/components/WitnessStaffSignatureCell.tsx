import { useEffect, useState } from 'react'
import { protocolApi } from '@cn-kis/api-client'
import { Modal } from '@cn-kis/ui-kit'
import { ImageOff } from 'lucide-react'

type Props = {
  staffId: number
  /** 与列表字段 signature_file 一致：有非空路径才请求 */
  hasSignatureFile: boolean
}

/**
 * 双签名单「签名文件」列：带 JWT 拉取 PNG，避免直接 /media 404；支持点击放大。
 */
export function WitnessStaffSignatureCell({ staffId, hasSignatureFile }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    if (!hasSignatureFile) {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setFailed(false)
      return
    }

    let cancelled = false

    setLoading(true)
    setFailed(false)

    void protocolApi
      .fetchWitnessStaffSignatureImageBlob(staffId)
      .then((blob) => {
        if (cancelled) return
        if (!blob || blob.size === 0) {
          setFailed(true)
          return
        }
        const u = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(u)
          return
        }
        setBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return u
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [staffId, hasSignatureFile])

  if (!hasSignatureFile) {
    return (
      <span className="inline-flex min-h-10 items-center text-xs text-slate-500">
        —
      </span>
    )
  }

  if (loading) {
    return (
      <span className="inline-flex min-h-10 items-center text-xs text-slate-400 tabular-nums">
        加载中…
      </span>
    )
  }

  if (failed || !blobUrl) {
    return (
      <span
        className="inline-flex min-h-10 items-center gap-1 text-xs text-amber-800"
        title="无法加载签名文件，请确认后端可访问 MEDIA_ROOT 下文件或重新登记签名"
      >
        <ImageOff className="w-4 h-4 shrink-0" aria-hidden />
        加载失败
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="inline-flex min-h-10 items-center p-0.5 rounded border border-slate-100 bg-white cursor-zoom-in hover:ring-2 hover:ring-indigo-200/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
        aria-label="查看签名大图"
      >
        <img
          src={blobUrl}
          alt="签名"
          className="h-10 max-w-[100px] object-contain rounded bg-white pointer-events-none"
        />
      </button>
      <Modal open={lightboxOpen} onClose={() => setLightboxOpen(false)} title="签名预览" size="lg">
        <div className="flex justify-center items-center bg-slate-50/95 rounded-lg p-4 min-h-[200px] max-h-[min(85vh,720px)] overflow-auto">
          <img src={blobUrl} alt="签名预览" className="max-w-full w-auto h-auto object-contain max-h-[min(80vh,680px)]" />
        </div>
      </Modal>
    </>
  )
}
