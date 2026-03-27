import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'

const PDFJS_DIST_VERSION = '4.4.168'

type Props = {
  /** 同源 URL（如 /media/...），不含鉴权；与 loadPdfBytes 二选一 */
  pdfUrl?: string
  /** 优先使用：带 JWT 拉取 PDF（如执行台回执接口），避免 /media 静态 404 */
  loadPdfBytes?: () => Promise<ArrayBuffer>
  /**
   * 当前文档标识，变化时重新加载。**勿把 loadPdfBytes 放进 effect 依赖**（引用不稳定会死循环）；
   * 使用 loadPdfBytes 时务必传入（如 `${consentId}-${nodeIndex}`）；仅用 pdfUrl 时可省略（默认用 pdfUrl）。
   */
  documentKey?: string
  /**
   * iframe：浏览器内置 PDF 查看器（Blob URL），与小程序「下载」同源字节即可稳定展示，推荐审核弹窗。
   * canvas：pdf.js 绘 canvas（核验页等需兼容微信 WebView 时用）。
   */
  renderMode?: 'iframe' | 'canvas'
  className?: string
  /** 滚动容器额外 class（在默认面板样式之上追加） */
  scrollClassName?: string
  /** panel：审核弹窗（限高）；fullscreen：核验页全屏层（随容器增高） */
  layout?: 'panel' | 'fullscreen'
  /**
   * iframe 模式：在父级 flex 容器内撑满剩余高度（用 flex-1/min-h-0，不用 vh），用于抽屉侧栏等。
   */
  fillContainer?: boolean
  emptyHint?: string
  /** 加载成功后展示「新窗口打开」（使用内存 Blob URL，含鉴权下载场景） */
  showOpenInNewWindowLink?: boolean
}

function buildPdfjsAssetBases(pdfjsLib: { version?: string }) {
  const v = (pdfjsLib.version || PDFJS_DIST_VERSION).trim()
  const root = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${v}`
  return {
    cMapUrl: `${root}/cmaps/`,
    standardFontDataUrl: `${root}/standard_fonts/`,
  }
}

/**
 * 使用 Blob + 浏览器内置 PDF（iframe）或 pdf.js canvas 展示 PDF。
 */
export function PdfJsCanvasViewer({
  pdfUrl,
  loadPdfBytes,
  documentKey: documentKeyProp,
  renderMode = 'canvas',
  className,
  scrollClassName,
  layout = 'panel',
  fillContainer = false,
  emptyHint,
  showOpenInNewWindowLink = true,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const loadPdfBytesRef = useRef(loadPdfBytes)
  loadPdfBytesRef.current = loadPdfBytes
  const showOpenRef = useRef(showOpenInNewWindowLink)
  showOpenRef.current = showOpenInNewWindowLink
  const renderModeRef = useRef(renderMode)
  renderModeRef.current = renderMode

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [newWindowBlobUrl, setNewWindowBlobUrl] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  /** 勿把函数本身当 boolean（strict-boolean-expressions）；用 != null 判断是否传入 loader */
  const hasLoader = loadPdfBytes != null
  const hasPdfUrl = (pdfUrl || '').trim() !== ''
  const hasSource = hasLoader || hasPdfUrl
  const trimmedPdfUrl = (pdfUrl || '').trim()
  /** 与 `documentKeyProp ?? …` 一致：仅 null/undefined 才走 URL/inline-load；传 `''` 时保持空串 */
  const resolvedDocumentKey =
    documentKeyProp == null
      ? trimmedPdfUrl !== ''
        ? trimmedPdfUrl
        : hasLoader
          ? 'inline-load'
          : ''
      : documentKeyProp

  useEffect(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setNewWindowBlobUrl(null)
  }, [resolvedDocumentKey])

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [])

  /** iframe：与小程序下载同一字节流，浏览器原生渲染 */
  useEffect(() => {
    if (renderMode !== 'iframe' || !hasSource) return undefined

    let cancelled = false
    setLoading(true)
    setErr(null)

    void (async () => {
      try {
        const loader = loadPdfBytesRef.current
        if (!loader) {
          throw new Error('iframe 预览需要 loadPdfBytes（与登录接口拉取同一份回执 PDF）')
        }
        const buf = await loader()
        if (cancelled) return
        if (buf.byteLength === 0) {
          throw new Error('PDF 为空')
        }
        const blob = new Blob([buf], { type: 'application/pdf' })
        const nextUrl = URL.createObjectURL(blob)
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = nextUrl
        setNewWindowBlobUrl(nextUrl)
      } catch (e: unknown) {
        if (!cancelled) {
          const m = e instanceof Error ? e.message : '无法加载 PDF'
          setErr(m)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hasSource, resolvedDocumentKey, renderMode])

  /** canvas：pdf.js */
  useEffect(() => {
    if (renderMode !== 'canvas') return undefined

    let cancelled = false
    const container = wrapRef.current
    if (!container || !hasSource) {
      setLoading(false)
      setErr(null)
      return undefined
    }

    setLoading(true)
    setErr(null)
    container.innerHTML = ''

    void (async () => {
      try {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        if (cancelled) return
        const [pdfjsMod, workerMod] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ])
        const pdfjsLib = pdfjsMod
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default
        const { cMapUrl, standardFontDataUrl } = buildPdfjsAssetBases(pdfjsLib)

        let buf: ArrayBuffer
        const loader = loadPdfBytesRef.current
        if (loader) {
          buf = await loader()
        } else {
          const res = await fetch((pdfUrl || '').trim(), { credentials: 'same-origin' })
          if (!res.ok) {
            throw new Error(`加载失败（${res.status}）`)
          }
          buf = await res.arrayBuffer()
        }

        if (cancelled) return

        const showLink = showOpenRef.current
        if (showLink && buf.byteLength > 0) {
          const blob = new Blob([buf], { type: 'application/pdf' })
          const nextUrl = URL.createObjectURL(blob)
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
          blobUrlRef.current = nextUrl
          setNewWindowBlobUrl(nextUrl)
        }

        const pdf = await pdfjsLib
          .getDocument({
            data: buf,
            cMapUrl,
            cMapPacked: true,
            standardFontDataUrl,
          })
          .promise
        const numPages = pdf.numPages
        const scrollEl = container.closest('[data-pdf-scroll]') as HTMLElement | null
        const maxW = Math.max(
          280,
          (scrollEl?.clientWidth ?? container.parentElement?.clientWidth ?? container.clientWidth) - 16,
        )

        for (let i = 1; i <= numPages; i += 1) {
          if (cancelled) return
          const page = await pdf.getPage(i)
          const base = page.getViewport({ scale: 1 })
          const scale = Math.min(2.2, maxW / base.width)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.display = 'block'
          canvas.style.marginLeft = 'auto'
          canvas.style.marginRight = 'auto'
          canvas.style.maxWidth = '100%'
          canvas.className =
            'mb-3 max-w-full rounded border border-slate-200 bg-white shadow-sm'
          await page.render({ canvasContext: ctx, viewport }).promise
          if (cancelled) return
          container.appendChild(canvas)
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const m = e instanceof Error ? e.message : '无法预览 PDF'
          setErr(m)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hasSource, resolvedDocumentKey, renderMode, pdfUrl])

  if (!hasSource) {
    return <p className="text-sm text-slate-500">{emptyHint ?? '暂无 PDF'}</p>
  }

  const iframeMinH =
    layout === 'fullscreen'
      ? 'min-h-[min(70vh,800px)] flex-1'
      : 'min-h-[min(58vh,680px)] max-h-[min(78vh,860px)] w-full'

  const iframeShellClass = fillContainer
    ? clsx(
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-inner',
        scrollClassName,
      )
    : clsx(
        'overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-inner',
        iframeMinH,
        scrollClassName,
      )

  return (
    <div className={clsx('flex min-h-0 flex-1 flex-col', className)}>
      {showOpenInNewWindowLink && newWindowBlobUrl ? (
        <div className="flex justify-end pb-1">
          <a
            href={newWindowBlobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            新窗口打开 PDF
          </a>
        </div>
      ) : null}

      {renderMode === 'iframe' ? (
        <>
          {loading ? (
            <div
              className={clsx(
                'flex items-center justify-center text-sm text-slate-500',
                fillContainer ? 'min-h-0 flex-1' : 'min-h-[200px]',
              )}
            >
              正在加载与小程序下载一致的回执 PDF…
            </div>
          ) : null}
          {err ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {err}
            </div>
          ) : null}
          {newWindowBlobUrl && !loading && !err ? (
            <div className={iframeShellClass}>
              <iframe
                title="签署回执 PDF"
                src={newWindowBlobUrl}
                className={clsx(
                  'block w-full border-0 bg-white',
                  fillContainer
                    ? 'min-h-0 flex-1'
                    : layout === 'fullscreen'
                      ? 'min-h-[60vh] flex-1'
                      : 'h-[min(72vh,820px)] min-h-[52vh]',
                )}
              />
            </div>
          ) : null}
        </>
      ) : (
        <>
          {loading ? (
            <div className="flex min-h-[200px] items-center justify-center text-sm text-slate-500">
              PDF 加载中…
            </div>
          ) : null}
          {err ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {err}
            </div>
          ) : null}
          <div
            data-pdf-scroll
            className={clsx(
              layout === 'fullscreen'
                ? 'min-h-[40vh] flex-1 overflow-y-auto bg-slate-100 p-2'
                : 'min-h-[min(52vh,480px)] max-h-[min(72vh,720px)] flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-100 p-3',
              scrollClassName,
            )}
          >
            <div ref={wrapRef} className="min-h-[120px]" />
          </div>
        </>
      )}
    </div>
  )
}
