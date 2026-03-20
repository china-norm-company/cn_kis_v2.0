/**
 * 方案质量检查
 * 方案准备 → 方案质量检查：通过 iframe 嵌入方案检查台（Flask app）。
 * 本地开发：VITE_PROTOCOL_QC_URL 或默认 http://localhost:5000
 * 生产：构建时设置 VITE_PROTOCOL_QC_URL 为方案检查台对外 URL（如 https://域名/protocol-qc/）
 */
const DEFAULT_PROTOCOL_QC_URL = 'http://localhost:5000'
const PROTOCOL_QC_URL =
  (import.meta.env.VITE_PROTOCOL_QC_URL as string)?.trim() || DEFAULT_PROTOCOL_QC_URL

export default function ProtocolQualityCheckPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-3 flex-shrink-0">
        <h2 className="text-xl font-bold text-slate-800">方案质量检查</h2>
        <p className="mt-1 text-sm text-slate-500">
          上传方案 PDF，执行规则与通用性检查，查看检查日志与反馈
        </p>
      </div>
      <div className="flex-1 px-4 pb-4 min-h-0">
        <iframe
          src={PROTOCOL_QC_URL}
          title="方案质量检查台"
          className="w-full h-full rounded-xl border border-slate-200 bg-white"
          style={{ minHeight: '80vh' }}
          allowFullScreen
        />
      </div>
    </div>
  )
}
