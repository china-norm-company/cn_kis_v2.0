/** 知情管理项目列表行高亮：OAuth 回调会清掉 hash query，跳转前写入 sessionStorage 作兜底 */

export const CONSENT_LIST_FOCUS_PROTOCOL_KEY = 'cnkis.execution.consentListFocusProtocolId'

export function peekConsentListFocusProtocolId(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw =
      sessionStorage.getItem(CONSENT_LIST_FOCUS_PROTOCOL_KEY) ||
      localStorage.getItem(CONSENT_LIST_FOCUS_PROTOCOL_KEY)
    if (!raw) return null
    const n = parseInt(raw, 10)
    return Number.isNaN(n) || n <= 0 ? null : n
  } catch {
    return null
  }
}

export function persistConsentListFocusProtocolId(id: number): void {
  const v = String(id)
  try {
    sessionStorage.setItem(CONSENT_LIST_FOCUS_PROTOCOL_KEY, v)
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(CONSENT_LIST_FOCUS_PROTOCOL_KEY, v)
  } catch {
    /* ignore */
  }
}

export function clearConsentListFocusStorage(): void {
  try {
    sessionStorage.removeItem(CONSENT_LIST_FOCUS_PROTOCOL_KEY)
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(CONSENT_LIST_FOCUS_PROTOCOL_KEY)
  } catch {
    /* ignore */
  }
}

/** Hash 形如 `#/consent?focusProtocolId=12` 时从 hash 段解析（HashRouter 下与 useSearchParams 互补） */
export function parseFocusProtocolIdFromHash(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash || ''
  const qi = hash.indexOf('?')
  if (qi === -1) return null
  return new URLSearchParams(hash.slice(qi + 1)).get('focusProtocolId')
}
