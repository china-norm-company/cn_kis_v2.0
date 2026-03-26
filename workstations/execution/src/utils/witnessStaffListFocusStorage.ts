/** 双签名单行高亮：Hash 路由下 query 可能不可靠，跳转前写入 sessionStorage 作备用 */

export const WITNESS_STAFF_LIST_FOCUS_STORAGE_KEY = 'cnkis.execution.witnessStaffFocusId'

export function peekWitnessStaffListFocusId(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(WITNESS_STAFF_LIST_FOCUS_STORAGE_KEY)
    if (!raw) return null
    const n = parseInt(raw, 10)
    return Number.isNaN(n) || n <= 0 ? null : n
  } catch {
    return null
  }
}

export function persistWitnessStaffListFocusId(id: number): void {
  try {
    sessionStorage.setItem(WITNESS_STAFF_LIST_FOCUS_STORAGE_KEY, String(id))
  } catch {
    /* ignore */
  }
}

export function clearWitnessStaffListFocusStorage(): void {
  try {
    sessionStorage.removeItem(WITNESS_STAFF_LIST_FOCUS_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Hash 形如 `#/consent/witness-staff?focusWitnessStaffId=12` 时，从 hash 段解析 query（不依赖 useSearchParams） */
export function parseFocusWitnessStaffIdFromHash(): string | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash || ''
  const qi = hash.indexOf('?')
  if (qi === -1) return null
  return new URLSearchParams(hash.slice(qi + 1)).get('focusWitnessStaffId')
}
