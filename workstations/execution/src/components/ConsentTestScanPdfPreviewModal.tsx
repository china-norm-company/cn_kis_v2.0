import { PdfJsCanvasViewer } from '@/components/PdfJsCanvasViewer'

type Props = {
  pdfUrl: string
  onClose: () => void
}

/**
 * 知情测试完成页：用 pdf.js 在页面内渲染 PDF，避免微信 WebView 对 iframe 直链 PDF 触发「在浏览器打开」。
 */
export function ConsentTestScanPdfPreviewModal({ pdfUrl, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/50 p-3 pt-10"
      role="dialog"
      aria-modal="true"
      aria-label="PDF 预览"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 min-h-0 flex-col rounded-t-xl bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-sm shrink-0">
          <span className="text-slate-700 font-medium">PDF 预览</span>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <PdfJsCanvasViewer pdfUrl={pdfUrl} layout="fullscreen" className="min-h-0 flex-1" />
        </div>
      </div>
    </div>
  )
}
