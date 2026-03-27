const IPV4_HOST =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/

export function isLoopbackHostname(hostname: string): boolean {
  const h = (hostname || '').toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]' || h === '::1'
}

/**
 * 后端 consent_test_scan_url 在未配置 CONSENT_TEST_SCAN_PUBLIC_BASE 时常为 localhost:8001，
 * 手机无法访问。若用户用局域网 IP 打开执行台（如 http://192.168.x.x:3007），则用当前页 origin
 * 替换为同机 Vite 代理的 /api 地址，真机扫码可到达 Django 公开落地页。
 * 已配置 ngrok / 公网 base 的 URL 非 loopback，不改写。
 */
function isPrivateLanIPv4(hostname: string): boolean {
  if (!IPV4_HOST.test(hostname)) return false
  const parts = hostname.split('.').map((x) => parseInt(x, 10))
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false
  const [a, b] = parts
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

/**
 * `http://10.x.x.x/...` 无端口 → 手机连 80。核验二维码现为执行台 H5（路径含 `/execution`）补 :3007，否则补 :8001（API）。
 */
export function normalizePrivateLanHttpIpv4ImplicitPort8001(url: string): string {
  if (!isConsentScanUrlHttpIpv4ImplicitPort80(url)) return url
  try {
    const u = new URL(url.trim())
    if (!isPrivateLanIPv4(u.hostname)) return url
    u.port = u.pathname.includes('/execution') ? '3007' : '8001'
    return u.toString()
  } catch {
    return url
  }
}

export function rewriteConsentTestScanUrlForBrowserClient(
  serverUrl: string,
  opts: { origin: string; hostname: string },
): string {
  const trimmed = (serverUrl || '').trim()
  if (!trimmed) return trimmed
  if (!isConsentScanUrlUnreachableFromPhone(trimmed)) return trimmed
  if (isLoopbackHostname(opts.hostname)) return trimmed
  try {
    const parsed = new URL(trimmed)
    // Hash 路由（如 /execution/#/consent-test-scan?p=）须带上 hash，否则丢参
    const pathAndQuery = parsed.pathname + parsed.search + parsed.hash
    return `${opts.origin.replace(/\/$/, '')}${pathAndQuery}`
  } catch {
    return trimmed
  }
}

/** 二维码 URL 为 localhost / 127.0.0.1 等时，手机微信无法访问开发机，扫到会白屏 */
export function isConsentScanUrlUnreachableFromPhone(url: string): boolean {
  try {
    const u = new URL(url.trim())
    const h = u.hostname.toLowerCase()
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '[::1]'
  } catch {
    return false
  }
}

/**
 * `http://局域网IPv4` 未写端口时，客户端默认连 80；本地 Django 多为 8001，微信内常见 net::ERR_CONNECTION_REFUSED。
 */
export function isConsentScanUrlHttpIpv4ImplicitPort80(url: string): boolean {
  try {
    const u = new URL(url.trim())
    if (u.protocol !== 'http:') return false
    if (!IPV4_HOST.test(u.hostname)) return false
    return u.port === ''
  } catch {
    return false
  }
}

/**
 * 签署回执 PDF：后端可能返回 `http://127.0.0.1:8001/media/...`，iframe/ fetch 指向与前端不同端口时易失败。
 * 改为同源路径 `/media/...`，开发环境由 Vite 代理到 Django；公网绝对 URL（非 loopback）保持不动。
 */
export function normalizeConsentReceiptPdfUrlForBrowser(url: string): string {
  const t = (url || '').trim()
  if (!t) return ''
  if (t.startsWith('/')) return t
  if (t.startsWith('http://') || t.startsWith('https://')) {
    try {
      const u = new URL(t)
      if (isLoopbackHostname(u.hostname)) {
        return u.pathname + u.search + u.hash
      }
      return t
    } catch {
      return t
    }
  }
  return t
}
