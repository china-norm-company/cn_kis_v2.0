import Taro from '@tarojs/taro'
import { buildMyConsentReceiptPdfUrl, getCurrentApiBaseUrl } from '@/utils/api'

/** 与知情页文档列表行一致，供下载回执 PDF 使用 */
export interface ConsentReceiptPdfRow {
  consent_id?: number
  receipt_pdf_url: string | null
}

function resolveMediaFullUrl(pathOrUrl: string | null | undefined): string {
  const p = (pathOrUrl || '').trim()
  if (!p) return ''
  if (/^https?:\/\//i.test(p)) return p
  const base = (getCurrentApiBaseUrl() || '').replace(/\/api\/v1\/?$/i, '')
  if (!base) return p
  return `${base}${p.startsWith('/') ? '' : '/'}${p}`
}

/**
 * 下载并打开签署回执 PDF（wx.downloadFile + wx.openDocument）。
 * 真机微信内一般为微信内置文档查看器；开发者工具（platform === 'devtools'）常调起系统默认程序（如 WPS），属工具限制。
 */
export function openConsentReceiptPdf(row: ConsentReceiptPdfRow): void {
  const token = (Taro.getStorageSync('token') as string) || ''
  const authUrl =
    row.consent_id != null && row.consent_id > 0 ? buildMyConsentReceiptPdfUrl(row.consent_id) : ''
  const fallback = resolveMediaFullUrl(row.receipt_pdf_url)
  const url = authUrl || fallback
  if (!url) {
    Taro.showToast({ title: '暂无 PDF 链接', icon: 'none' })
    return
  }
  const header: Record<string, string> = {}
  if (authUrl && token) {
    header.Authorization = `Bearer ${token}`
  }
  Taro.showLoading({ title: '打开中…' })
  Taro.downloadFile({
    url,
    header: Object.keys(header).length ? header : undefined,
    success: (df) => {
      const sc = typeof df.statusCode === 'number' ? df.statusCode : 200
      if (sc !== 200) {
        Taro.showToast({ title: `下载失败 (${sc})`, icon: 'none' })
        return
      }
      const openDoc = () => {
        Taro.openDocument({
          filePath: df.tempFilePath,
          fileType: 'pdf',
          showMenu: false,
          fail: () => Taro.showToast({ title: '无法打开文件', icon: 'none' }),
        })
      }
      let isDevtools = false
      try {
        isDevtools = Taro.getSystemInfoSync().platform === 'devtools'
      } catch {
        isDevtools = false
      }
      if (isDevtools) {
        void Taro.showModal({
          title: '预览说明',
          content:
            '微信开发者工具会调用本机默认应用（如 WPS）打开 PDF，无法像真机一样在微信内预览，属工具限制。真机微信内将使用微信内置文档查看器。',
          confirmText: '仍要打开',
          cancelText: '取消',
        }).then((res) => {
          if (res.confirm) openDoc()
        })
        return
      }
      openDoc()
    },
    fail: () => Taro.showToast({ title: '下载失败，请检查网络与域名白名单', icon: 'none', duration: 3500 }),
  }).finally(() => Taro.hideLoading())
}
