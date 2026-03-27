import type { NavigateFunction } from 'react-router-dom'
import { CNKIS_OAUTH_RESTORE_HASH_KEY, CNKIS_POST_LOGIN_HASH_STORAGE_KEY } from '@cn-kis/feishu-sdk'
import { peekConsentListFocusProtocolId } from './consentListFocusStorage'
import { peekWitnessStaffListFocusId } from './witnessStaffListFocusStorage'

/** 与 setExecutionPostLoginHashForOAuth 写入的格式一致：#/consent?… 或 #/consent/witness-staff?… */
export function parseExecutionRestoreHash(raw: string): { pathname: string; search: string } | null {
  const s = raw.trim()
  const withoutHash = s.startsWith('#') ? s.slice(1) : s
  if (!withoutHash.startsWith('/')) return null
  const q = withoutHash.indexOf('?')
  if (q === -1) return { pathname: withoutHash, search: '' }
  return { pathname: withoutHash.slice(0, q), search: withoutHash.slice(q) }
}

/** restore_hash 异常格式时的宽松解析（不误删 storage） */
function parseExecutionRestoreHashLoose(raw: string): { pathname: string; search: string } | null {
  const t = raw.trim()
  const m = t.match(/#?(\/consent(?:\/witness-staff)?)(\?[^#]*)?/)
  if (!m?.[1]) return null
  return { pathname: m[1], search: (m[2] || '').replace(/\s+$/, '') }
}

export function peekRestoreHash(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const a = sessionStorage.getItem(CNKIS_OAUTH_RESTORE_HASH_KEY)
    if (a?.trim()) return a.trim()
    const b = localStorage.getItem(CNKIS_OAUTH_RESTORE_HASH_KEY)
    if (b?.trim()) return b.trim()
    // 换票成功但 state 未解析出 restore 时，auth 会保留 cnkis.execution.postLoginHash
    const pl =
      sessionStorage.getItem(CNKIS_POST_LOGIN_HASH_STORAGE_KEY) ||
      localStorage.getItem(CNKIS_POST_LOGIN_HASH_STORAGE_KEY)
    const pt = (pl || '').trim()
    if (pt.startsWith('#/consent')) return pt
    return null
  } catch {
    return null
  }
}

export function clearRestoreHash(): void {
  try {
    sessionStorage.removeItem(CNKIS_OAUTH_RESTORE_HASH_KEY)
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(CNKIS_OAUTH_RESTORE_HASH_KEY)
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(CNKIS_POST_LOGIN_HASH_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(CNKIS_POST_LOGIN_HASH_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * OAuth 回跳后优先恢复知情/双签深链；否则在「根路径或仪表盘」用 session peek 兜底。
 * @returns 是否已发起 navigate（replace）
 */
export function tryNavigateExecutionPostAuthDeepLink(
  navigate: NavigateFunction,
  currentPathname: string,
): boolean {
  const devLog = (phase: string, payload?: Record<string, unknown>) => {
    if (!import.meta.env.DEV) return
    console.error('[ExecutionPostAuthDeepLink]', phase, payload ?? {})
  }
  const raw = peekRestoreHash()
  devLog('enter', { currentPathname, raw })
  if (raw) {
    const parsed = parseExecutionRestoreHash(raw) ?? parseExecutionRestoreHashLoose(raw)
    if (
      parsed &&
      (parsed.pathname === '/consent' || parsed.pathname === '/consent/witness-staff')
    ) {
      clearRestoreHash()
      devLog('navigate by restore_hash', { parsed })
      navigate({ pathname: parsed.pathname, search: parsed.search }, { replace: true })
      return true
    }
    // 解析失败时禁止 clear：否则 OAuth 刚写入的合法值会被误删，用户只能落到首页/仪表盘
    devLog('restore_hash present but unparseable, keep storage', { raw, parsed })
  }

  if (currentPathname !== '/' && currentPathname !== '/dashboard') return false

  const pid = peekConsentListFocusProtocolId()
  if (pid != null) {
    devLog('navigate by consent focus id', { pid })
    navigate(`/consent?focusProtocolId=${pid}`, { replace: true })
    return true
  }
  const wid = peekWitnessStaffListFocusId()
  if (wid != null) {
    devLog('navigate by witness focus id', { wid })
    navigate(`/consent/witness-staff?focusWitnessStaffId=${wid}`, { replace: true })
    return true
  }
  devLog('no deep link applied')
  return false
}
