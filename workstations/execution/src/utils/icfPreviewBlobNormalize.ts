/**
 * 签署节点 /preview 等接口返回的 Blob 经 axios 后常缺少 type 或为 octet-stream，
 * 导致 iframe 无法渲染 HTML。按文件头补全 MIME，便于内嵌预览。
 */
export async function normalizeIcfPreviewBlobForIframe(blob: Blob): Promise<Blob> {
  const t = (blob.type || '').toLowerCase()
  if (t.includes('application/pdf') || t.includes('text/html')) {
    return blob
  }
  if (blob.size === 0) return blob

  const headLen = Math.min(blob.size, 4096)
  const head = await blob.slice(0, headLen).arrayBuffer()
  const u8 = new Uint8Array(head)

  if (u8.length >= 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) {
    return new Blob([blob], { type: 'application/pdf' })
  }

  let textStart = 0
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    textStart = 3
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(u8.slice(textStart))
  const trimmed = text.trimStart()
  // 服务端 python-docx / 各类导出可能以 <div、<article 等开头
  if (
    trimmed.startsWith('<!') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML') ||
    trimmed.startsWith('<')
  ) {
    return new Blob([blob], { type: 'text/html; charset=utf-8' })
  }

  return blob
}
