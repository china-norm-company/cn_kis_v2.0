import type { FeishuAuthConfig } from './auth'

/** 火山云重定向源（固定域名），不随本机/本地环境变化，避免 20029 */
const VOLCENGINE_REDIRECT_BASE = 'http://118.196.64.48'

/** 开发环境未配置 VITE_FEISHU_APP_ID 时回退（子衿）；须与 backend/.env 的 FEISHU_APP_ID 一致，否则换 token 会 20024 invalid_grant */
const PRIMARY_APP_ID_FALLBACK = 'cli_a98b0babd020500e'

/**
 * 本地开发常见：浏览器用 http://127.0.0.1:3007 打开，而飞书「重定向 URL」登记的是 http://localhost:3007/... → 授权页 20029。
 * 开发环境下将 127.0.0.1 规范为 localhost，与开放平台登记保持一致。
 */
export function normalizeDevRedirectBaseForFeishu(base: string, isDev: boolean): string {
  if (!isDev || !base?.trim()) return base
  try {
    const u = new URL(base.replace(/\/+$/, ''))
    if (u.hostname === '127.0.0.1') {
      u.hostname = 'localhost'
      return u.origin
    }
  } catch {
    /* ignore */
  }
  return base.replace(/\/+$/, '')
}

export function createWorkstationFeishuConfig(workstation: string): FeishuAuthConfig {
  const devBypass = (import.meta as any).env?.VITE_DEV_AUTH_BYPASS === '1'
  const envAppId = (import.meta.env.VITE_FEISHU_APP_ID as string)?.trim()
  const appId =
    envAppId ||
    (devBypass ? 'dev-bypass-app' : '') ||
    (import.meta.env.DEV ? PRIMARY_APP_ID_FALLBACK : '')
  if (!appId) {
    throw new Error(`[FeishuConfig] 缺少 VITE_FEISHU_APP_ID，workstation=${workstation}`)
  }
  const normalized = workstation.replace(/^\/+|\/+$/g, '')
  if (!normalized) {
    throw new Error('[FeishuConfig] workstation 不能为空')
  }

  const envBase = (import.meta.env.VITE_FEISHU_REDIRECT_BASE as string)?.trim()
  const isDev = Boolean(import.meta.env.DEV)
  const useFixedRedirectOrigin =
    isDev && !!envBase && /^https?:\/\//i.test(envBase)
  const baseRaw =
    useFixedRedirectOrigin
      ? envBase.replace(/\/+$/, '')
      : (typeof window !== 'undefined' && window.location?.origin)
        ? window.location.origin
        : (envBase || VOLCENGINE_REDIRECT_BASE)
  const base = normalizeDevRedirectBaseForFeishu(baseRaw, isDev)
  const baseNorm = base.replace(/\/+$/, '')

  const redirectOverride = (import.meta.env.VITE_FEISHU_REDIRECT_URI as string)?.trim()
  let redirectUri: string
  if (redirectOverride && /^https?:\/\//i.test(redirectOverride)) {
    redirectUri = redirectOverride
  } else if (redirectOverride && redirectOverride.startsWith('/')) {
    // 路径形式：与 base 拼接，便于本地开发配置（如 base=localhost:3001, uri=/secretary/）
    redirectUri = `${baseNorm}${redirectOverride.startsWith('/') ? '' : '/'}${redirectOverride}`
  } else if (normalized === 'secretary') {
    redirectUri = `${baseNorm}/login`
  } else {
    // 须与 Vite `base`（如 /secretary/）及飞书开放平台「重定向 URL」完全一致，否则授权页报 20029
    redirectUri = `${baseNorm}/${normalized}/`
  }

  return {
    appId,
    redirectUri,
    workstation: normalized,
  }
}
