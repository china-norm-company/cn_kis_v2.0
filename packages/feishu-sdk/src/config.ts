import type { FeishuAuthConfig } from './auth'

/** 火山云重定向源（固定域名），不随本机/本地环境变化，避免 20029 */
const VOLCENGINE_REDIRECT_BASE = 'http://118.196.64.48'

/** 子衿（秘书台）统一 App ID，开发环境下未配置 VITE_FEISHU_APP_ID 时回退使用，与 docs/CONFIG_MANAGEMENT.md 一致 */
const PRIMARY_APP_ID_FALLBACK = 'cli_a907f21f0723dbce'

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

  // 浏览器环境：用当前页面 origin，避免部署到服务器后仍跳回 localhost（构建时 env 为 localhost）
  // 非浏览器（SSR/测试）：用 env 或火山云默认
  const envBase = (import.meta.env.VITE_FEISHU_REDIRECT_BASE as string)?.trim()
  const base =
    (typeof window !== 'undefined' && window.location?.origin)
      ? window.location.origin
      : (envBase || VOLCENGINE_REDIRECT_BASE)
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
    redirectUri = `${baseNorm}/${normalized}/`
  }

  return {
    appId,
    redirectUri,
    workstation: normalized,
  }
}
