/**
 * 身份证号列表脱敏展示（不修改原始数据）。
 * 18 位：前 6 + 8 个 * + 后 4，例如 310110********1058
 * 15 位一代证：前 6 + 5 个 * + 后 4
 * 其它长度：保留前 6、后 4（若长度允许），中间用 * 补足观感
 */
export function maskIdCardNoForDisplay(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const n = s.length
  if (n === 18) {
    return `${s.slice(0, 6)}********${s.slice(-4)}`
  }
  if (n === 15) {
    return `${s.slice(0, 6)}*****${s.slice(-4)}`
  }
  if (n >= 11) {
    return `${s.slice(0, 6)}${'*'.repeat(n - 10)}${s.slice(-4)}`
  }
  if (n === 10) {
    return `${s.slice(0, 5)}*${s.slice(-4)}`
  }
  return '*'.repeat(n)
}
