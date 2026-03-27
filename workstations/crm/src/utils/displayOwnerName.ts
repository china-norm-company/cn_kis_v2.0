/**
 * 商务负责人等场景仅展示姓名，去掉半角「 (…」或全角「（…」等括号后缀。
 */
export function displayOwnerName(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  const idxHalf = t.indexOf(' (')
  if (idxHalf >= 0) return t.slice(0, idxHalf).trim()
  const idxFull = t.indexOf('（')
  if (idxFull >= 0) return t.slice(0, idxFull).trim()
  return t
}
