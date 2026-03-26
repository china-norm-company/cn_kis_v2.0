import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { QrCode } from 'lucide-react'
import { Modal } from '@cn-kis/ui-kit'
import { RichTooltip } from '@/components/ui/TruncatedTooltipLabel'
import {
  isConsentScanUrlHttpIpv4ImplicitPort80,
  isConsentScanUrlUnreachableFromPhone,
} from '@/utils/consentScanUrl'

/** 列表内缩略图（点击后弹窗放大，便于真机扫码） */
const THUMB_QR_PX = 52
/** 弹窗内大图尺寸 */
const ENLARGE_QR_PX = 280

type Props = {
  /** 完整落地页 URL（微信扫一扫） */
  scanUrl: string
  /** 是否为可扫码测试状态（未发布且为核验测试中 / 已授权待测试 / 已测试待开始 等）：否则落地页提示不可测试 */
  verificationActive: boolean
  /** 知情已发布时，服务端不会放行预发布「核验测试」扫码；用于展示与未发布阶段不同的说明 */
  consentLaunched?: boolean
  /** 列表「知情配置状态」，配合 consentLaunched 说明为何当前不可测试扫码 */
  configStatus?: string
  /** 演示行等无有效 URL */
  disabled?: boolean
}

export function ConsentTestScanQr({
  scanUrl,
  verificationActive,
  consentLaunched,
  configStatus,
  disabled,
}: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [enlargeOpen, setEnlargeOpen] = useState(false)
  const [largeDataUrl, setLargeDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (disabled || !scanUrl.trim()) {
      setDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(scanUrl, { width: THUMB_QR_PX, margin: 1, errorCorrectionLevel: 'M' })
      .then((u) => {
        if (!cancelled) setDataUrl(u)
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [scanUrl, disabled])

  useEffect(() => {
    if (!enlargeOpen || disabled || !scanUrl.trim()) {
      setLargeDataUrl(null)
      return
    }
    let cancelled = false
    QRCode.toDataURL(scanUrl, {
      width: ENLARGE_QR_PX,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
      .then((u) => {
        if (!cancelled) setLargeDataUrl(u)
      })
      .catch(() => {
        if (!cancelled) setLargeDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [enlargeOpen, scanUrl, disabled])

  const st = (configStatus || '').trim() || '—'
  const tip = verificationActive
    ? '手机浏览器或微信扫一扫：打开执行台「知情核验测试」H5 页（阅读计时、勾选、签名），不进入小程序；提交后签署记录为「测试」类型。请将 CONSENT_TEST_SCAN_PUBLIC_BASE 配为手机可访问的执行台地址（含端口，一般为 :3007）。'
    : consentLaunched
      ? `知情已发布（当前列表状态「${st}」）。预发布「核验测试」扫码仅适用于未发布阶段（列表为「已授权待测试」「已测试待开始」等）；与蓝底气泡是否曾发邮无关。正式签署请走小程序正式入口；若需再次从本列表「授权核验测试」发邮，请先下架知情。`
      : '请先完成配置与工作人员在邮件中完成人脸核验与签名授权（列表需为「核验测试中」「已授权待测试」或「已测试待开始」等）。扫码将打开提示页，无法开始测试。'

  const unreachableFromPhone = isConsentScanUrlUnreachableFromPhone(scanUrl)
  const httpIpv4NoPort = isConsentScanUrlHttpIpv4ImplicitPort80(scanUrl)

  const tooltipBody = (
    <div className="space-y-2">
      <p>{tip}</p>
      {unreachableFromPhone && (
        <p className="border-t border-amber-200/60 pt-2 text-xs leading-snug text-amber-900">
          当前二维码指向本机地址（localhost / 127.0.0.1），手机无法访问。请在 backend/.env 设置
          CONSENT_TEST_SCAN_PUBLIC_BASE 为手机可访问的 HTTPS 或局域网地址，重启后端后刷新本页。详见文档
          CONSENT_MANAGEMENT.md §5.3.1。
        </p>
      )}
      {httpIpv4NoPort && (
        <p className="border-t border-amber-200/60 pt-2 text-xs leading-snug text-amber-900">
          当前为 <code className="rounded bg-white/60 px-0.5">http://</code> + 局域网 IP 且<strong>未写端口</strong>
          ，微信会连 <strong>80</strong> 端口；Django 开发一般为 <strong>8001</strong>，易出现「无法打开页面 /
          ERR_CONNECTION_REFUSED」。请改为 <code className="rounded bg-white/60 px-0.5">http://&lt;IP&gt;:8001</code>
          ，并用 <code className="rounded bg-white/60 px-0.5">python manage.py runserver 0.0.0.0:8001</code>{' '}
          监听局域网；改 backend/.env 后重启后端并刷新列表。
        </p>
      )}
    </div>
  )

  if (disabled || !scanUrl.trim()) {
    return (
      <div className="flex flex-col items-center justify-center py-0.5">
        <div
          className="flex items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50"
          style={{ width: THUMB_QR_PX, height: THUMB_QR_PX }}
        >
          <QrCode className="h-5 w-5 text-slate-300" aria-hidden />
        </div>
      </div>
    )
  }

  return (
    <>
      <RichTooltip content={tooltipBody}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setEnlargeOpen(true)
          }}
          className="flex flex-col items-center rounded py-0.5 outline-none focus-visible:outline-none"
          title="点击放大二维码"
          aria-label="点击放大二维码以便扫码测试"
        >
          {dataUrl ? (
            <img
              src={dataUrl}
              alt="知情签署测试扫码"
              width={THUMB_QR_PX}
              height={THUMB_QR_PX}
              className={`rounded border border-slate-200 bg-white ${!verificationActive ? 'opacity-60' : ''}`}
            />
          ) : (
            <div
              className="flex items-center justify-center rounded border border-slate-200 bg-slate-50 text-[9px] text-slate-400"
              style={{ width: THUMB_QR_PX, height: THUMB_QR_PX }}
            >
              生成中
            </div>
          )}
        </button>
      </RichTooltip>

      <Modal
        open={enlargeOpen}
        onClose={() => setEnlargeOpen(false)}
        title="扫码 · 知情签署测试"
        size="sm"
        closeOnOverlay
        overlayClassName="bg-transparent"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          {unreachableFromPhone && (
            <div
              className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-950"
              role="status"
            >
              <p className="font-medium">当前二维码指向本机地址，手机微信无法打开落地页</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900/95">
                在 backend/.env 设置 <code className="rounded bg-white/80 px-1">CONSENT_TEST_SCAN_PUBLIC_BASE</code>{' '}
                为手机可访问的根地址（如 ngrok HTTPS 或同局域网 IP:端口），重启 Django 后刷新本页再扫码。说明见{' '}
                <code className="rounded bg-white/80 px-1">docs/CONSENT_MANAGEMENT.md</code> §5.3.1。
              </p>
            </div>
          )}
          {httpIpv4NoPort && (
            <div
              className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm text-amber-950"
              role="status"
            >
              <p className="font-medium">http + 局域网 IP 未带端口 → 手机会连 80，易 ERR_CONNECTION_REFUSED</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-900/95">
                将 <code className="rounded bg-white/80 px-1">CONSENT_TEST_SCAN_PUBLIC_BASE</code> 设为{' '}
                <code className="rounded bg-white/80 px-1">http://&lt;本机局域网IP&gt;:3007</code>（执行台 Vite 端口，与{' '}
                <code className="rounded bg-white/80 px-1">pnpm run dev:execution</code> 一致），并确保手机与电脑同网；重启后端后刷新列表再扫码。API 仍由 Django 8001 提供时，二维码中的主机若配为 :8001 会自动按后端规则改为 :3007。
              </p>
            </div>
          )}
          {largeDataUrl ? (
            <img
              src={largeDataUrl}
              alt="知情签署测试扫码（放大）"
              width={ENLARGE_QR_PX}
              height={ENLARGE_QR_PX}
              className={`rounded-lg border border-slate-200 bg-white ${!verificationActive ? 'opacity-60' : ''}`}
            />
          ) : (
            <div
              className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500 shadow-sm"
              style={{ width: ENLARGE_QR_PX, height: ENLARGE_QR_PX }}
            >
              生成中…
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
