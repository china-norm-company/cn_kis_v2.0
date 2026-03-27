/**
 * 将后端返回的相对 media 路径转为浏览器可请求的 URL。
 * 开发环境：Vite 将 /media 代理到 Django；生产环境：由网关/Nginx 提供 /media。
 */
export function mediaUrlFromStorageKey(key: string): string {
  const k = (key || '').trim().replace(/^\/+/, '')
  if (!k) return ''
  if (k.startsWith('http://') || k.startsWith('https://') || k.startsWith('data:')) return k
  const rel = k.replace(/^media\//i, '')
  return `/media/${encodeURI(rel)}`
}
