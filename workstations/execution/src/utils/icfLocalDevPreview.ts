/**
 * 签署节点文件预览：对 Word（.doc/.docx）优先请求服务端 /preview（与线上一致）；失败时再回退「/file + mammoth」。
 * 同一节点合并并发 /preview、失败结果短时记忆；404 会短重试（上传后后台生成预览需数秒）。若发起请求，validateStatus 避免 axios 抛错。
 */
import type { AxiosResponse } from 'axios'
import { protocolApi, getAxiosInstance } from '@cn-kis/api-client'

import { mammothConvertDocxToArticleHtml } from '@/utils/icfMammothConvert'
import { normalizeIcfPreviewBlobForIframe } from '@/utils/icfPreviewBlobNormalize'

export type LocalIcfPreviewResult =
  | { ok: true; mode: 'pdf'; blob: Blob }
  | { ok: true; mode: 'server-preview'; blob: Blob }
  | { ok: true; mode: 'docx-html'; articleHtml: string; bannerExtra?: string }
  | { ok: false; message: string }

function getPathExtension(path: string): string {
  const base = path.split(/[/\\]/).pop() || ''
  const i = base.lastIndexOf('.')
  if (i <= 0 || i === base.length - 1) return ''
  return base.slice(i + 1).toLowerCase()
}

export async function sniffBlobBinaryKind(blob: Blob): Promise<'pdf' | 'zip' | 'ole' | 'unknown'> {
  if (blob.size < 4) return 'unknown'
  const buf = await blob.slice(0, Math.min(8, blob.size)).arrayBuffer()
  const u8 = new Uint8Array(buf)
  if (u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) return 'pdf'
  if (u8[0] === 0x50 && u8[1] === 0x4b) {
    const t = u8[2]
    const u = u8[3]
    if ((t === 0x03 && u === 0x04) || (t === 0x05 && u === 0x06) || (t === 0x07 && u === 0x08)) {
      return 'zip'
    }
  }
  if (u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) return 'ole'
  return 'unknown'
}

async function tryParseApiErrorFromBlob(blob: Blob): Promise<string | null> {
  if (blob.size > 65536) return null
  const head = await blob.slice(0, Math.min(512, blob.size)).text()
  if (!head.trimStart().startsWith('{')) return null
  const t = await blob.text()
  if (!t.trimStart().startsWith('{')) return null
  try {
    const j = JSON.parse(t) as { msg?: string; code?: number }
    const code = j.code
    if (code === 200 || code === 0) return null
    if (typeof j.msg === 'string' && j.msg.trim()) return j.msg.trim()
  } catch {
    return null
  }
  return null
}

async function mammothBlobToArticleHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  return mammothConvertDocxToArticleHtml(arrayBuffer)
}

/** 同一节点已确认「/preview 不可用」后不再发 GET，避免控制台重复出现 404（Strict Mode 双挂载、多分支重复调用等） */
const serverPreviewNegativeCache = new Set<string>()
/** 合并并发到同一 URL 的请求，避免重复网络与重复控制台报错 */
const serverPreviewInflight = new Map<string, Promise<LocalIcfPreviewResult>>()

function serverPreviewCacheKey(
  protocolId: number,
  icfId: number,
  filePath: string | null | undefined,
): string {
  return `${protocolId}:${icfId}:${filePath ?? ''}`
}

/** 上传后后台生成 *_preview.html 时，首次 GET 可能 404，稍等再试（每次失败都会在浏览器 Network 记一条 404，不宜过多） */
const ICF_PREVIEW_404_RETRIES = 3
const ICF_PREVIEW_404_DELAY_MS = 700

/**
 * 是否与线上一致请求服务端 /preview（LO/python-docx 生成的 HTML，版式优于纯 mammoth）。
 * 本地 dev 默认开启；若未起后端、想强制只用浏览器 mammoth，可设 `VITE_ICF_SERVER_PREVIEW=false`。
 */
function shouldTryIcfServerPreview(): boolean {
  if (import.meta.env.PROD) return true
  return import.meta.env.VITE_ICF_SERVER_PREVIEW !== 'false'
}

async function loadIcfPreviewFromServerEndpointImpl(
  protocolId: number,
  icfId: number,
  cacheKey: string,
): Promise<LocalIcfPreviewResult> {
  const markNegative = () => {
    serverPreviewNegativeCache.add(cacheKey)
  }
  try {
    let res: AxiosResponse<Blob> | null = null
    for (let attempt = 0; attempt < ICF_PREVIEW_404_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise<void>((r) => setTimeout(r, ICF_PREVIEW_404_DELAY_MS))
      }
      res = await getAxiosInstance().get<Blob>(`/protocol/${protocolId}/icf-versions/${icfId}/preview`, {
        responseType: 'blob',
        timeout: 180000,
        validateStatus: () => true,
      })
      if (res.status === 200 || res.status === 304) break
      if (res.status === 404 && attempt < ICF_PREVIEW_404_RETRIES - 1) continue
      break
    }
    if (!res || (res.status !== 200 && res.status !== 304)) {
      markNegative()
      const blob = res?.data as Blob
      if (blob instanceof Blob && blob.size < 65536) {
        const t = await blob.text()
        if (t.trimStart().startsWith('{')) {
          try {
            const j = JSON.parse(t) as { msg?: string }
            if (typeof j.msg === 'string' && j.msg.trim()) {
              return { ok: false, message: j.msg.trim() }
            }
          } catch {
            /* ignore */
          }
        }
      }
      return { ok: false, message: '服务端预览暂不可用' }
    }
    const blob = res.data as Blob
    const apiErr = await tryParseApiErrorFromBlob(blob)
    if (apiErr) {
      markNegative()
      return { ok: false, message: apiErr }
    }
    const normalized = await normalizeIcfPreviewBlobForIframe(blob)
    const k = await sniffBlobBinaryKind(normalized)
    const nt = (normalized.type || '').toLowerCase()
    if (k === 'pdf' || nt.includes('pdf')) {
      return { ok: true, mode: 'server-preview', blob: normalized }
    }
    if (nt.includes('html') || nt.includes('text/html')) {
      return { ok: true, mode: 'server-preview', blob: normalized }
    }
    const sniffLen = Math.min(normalized.size, 4096)
    if (sniffLen > 0) {
      const head = await normalized.slice(0, sniffLen).text()
      const ts = head.trimStart()
      if (ts.startsWith('<!') || ts.startsWith('<html') || ts.startsWith('<HTML') || ts.startsWith('<')) {
        const fixed = new Blob([normalized], { type: 'text/html; charset=utf-8' })
        return { ok: true, mode: 'server-preview', blob: fixed }
      }
    }
    markNegative()
    return { ok: false, message: '服务端预览返回了无法识别的格式。' }
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e)
    return { ok: false, message: m ? `服务端预览失败：${m}` : '服务端预览失败' }
  }
}

function loadIcfPreviewFromServerEndpoint(
  protocolId: number,
  icfId: number,
  filePath: string | null | undefined,
): Promise<LocalIcfPreviewResult> {
  const cacheKey = serverPreviewCacheKey(protocolId, icfId, filePath)
  if (serverPreviewNegativeCache.has(cacheKey)) {
    return Promise.resolve({ ok: false, message: '服务端预览暂不可用' })
  }
  const inflight = serverPreviewInflight.get(cacheKey)
  if (inflight) return inflight
  const p = loadIcfPreviewFromServerEndpointImpl(protocolId, icfId, cacheKey)
  serverPreviewInflight.set(cacheKey, p)
  void p.finally(() => {
    serverPreviewInflight.delete(cacheKey)
  })
  return p
}

/**
 * 使用已签发的文件流在浏览器内生成预览（PDF blob URL / docx→HTML）。
 */
export async function loadIcfPreviewInLocalDev(
  protocolId: number,
  icf: { id: number; file_path?: string | null },
): Promise<LocalIcfPreviewResult> {
  const path = icf.file_path || ''
  const ext = getPathExtension(path)

  let serverPreviewErr: string | null = null
  if ((ext === 'doc' || ext === 'docx') && shouldTryIcfServerPreview()) {
    const fromServer = await loadIcfPreviewFromServerEndpoint(protocolId, icf.id, icf.file_path)
    if (fromServer.ok === true) {
      return fromServer
    }
    serverPreviewErr = fromServer.message
  }

  const blob = await protocolApi.fetchIcfVersionFileBlob(protocolId, icf.id)
  const apiErr = await tryParseApiErrorFromBlob(blob)
  if (apiErr) {
    return { ok: false, message: apiErr }
  }

  const kind = await sniffBlobBinaryKind(blob)

  if (kind === 'pdf') {
    const n = await normalizeIcfPreviewBlobForIframe(blob)
    return { ok: true, mode: 'pdf', blob: n }
  }

  if (kind === 'zip') {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const extraParts: string[] = []
      if (ext === 'doc') {
        extraParts.push(
          '检测到文件内容为 OOXML（与 .docx 相同），但扩展名为 .doc；已按 Word 文档预览。建议将元数据改为 .docx 以免其他环节误判。',
        )
      }
      if (serverPreviewErr != null) {
        extraParts.push('当前为浏览器内预览；与印刷版式可能略有差异。若需服务端 HTML，请确保后端已生成 MEDIA 预览文件。')
      }
      const extra = extraParts.length > 0 ? extraParts.join('\n') : undefined
      const articleHtml = await mammothBlobToArticleHtml(arrayBuffer)
      if (!articleHtml?.trim()) {
        return {
          ok: false,
          message:
            '浏览器未能将文档转为 HTML（可能文件异常）。请确认服务端已生成预览，或下载原文件查看。',
        }
      }
      return { ok: true, mode: 'docx-html', articleHtml, bannerExtra: extra }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      return {
        ok: false,
        message: m ? `无法将 ZIP/Office 文档解析为 HTML：${m}` : '无法将 Office 文档解析为 HTML',
      }
    }
  }

  if (kind === 'ole') {
    if (serverPreviewErr !== null) {
      return {
        ok: false,
        message: `${serverPreviewErr}（旧版 .doc 需服务端 LibreOffice 自动转换后预览；亦可下载原文件。）`,
      }
    }
    if (!shouldTryIcfServerPreview()) {
      return {
        ok: false,
        message:
          '旧版 .doc 需服务端 LibreOffice 转换后预览。本地已关闭服务端 /preview（VITE_ICF_SERVER_PREVIEW=false）；可改回默认或下载原文件。',
      }
    }
    const fromServer = await loadIcfPreviewFromServerEndpoint(protocolId, icf.id, icf.file_path)
    if (fromServer.ok === false) {
      return {
        ok: false,
        message: `${fromServer.message}（旧版 .doc 需服务端 LibreOffice 自动转换后预览；亦可下载原文件。）`,
      }
    }
    return fromServer
  }

  if (ext === 'pdf') {
    const n = await normalizeIcfPreviewBlobForIframe(blob)
    return { ok: true, mode: 'pdf', blob: n }
  }

  if (ext === 'docx') {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const articleHtml = await mammothBlobToArticleHtml(arrayBuffer)
      if (!articleHtml?.trim()) {
        return {
          ok: false,
          message:
            '浏览器未能将文档转为 HTML（可能文件异常）。请确认服务端已生成预览，或下载原文件查看。',
        }
      }
      const bannerExtra =
        serverPreviewErr != null
          ? '当前为浏览器内预览；与印刷版式可能略有差异。'
          : undefined
      return { ok: true, mode: 'docx-html', articleHtml, bannerExtra }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      return { ok: false, message: m ? `无法解析 .docx：${m}` : '无法解析 .docx' }
    }
  }

  if (ext === 'doc') {
    if (serverPreviewErr !== null) {
      return {
        ok: false,
        message: `${serverPreviewErr}（扩展名为 .doc 但内容无法识别时，依赖服务端 LibreOffice 转换。）`,
      }
    }
    if (!shouldTryIcfServerPreview()) {
      return {
        ok: false,
        message:
          '扩展名为 .doc 且内容无法识别时依赖服务端转换。本地开发已默认跳过服务端 /preview；需要时可设置 VITE_ICF_SERVER_PREVIEW=true 或下载原文件。',
      }
    }
    const fromServer = await loadIcfPreviewFromServerEndpoint(protocolId, icf.id, icf.file_path)
    if (fromServer.ok === false) {
      return {
        ok: false,
        message: `${fromServer.message}（扩展名为 .doc 但内容无法识别时，依赖服务端 LibreOffice 转换。）`,
      }
    }
    return fromServer
  }

  return { ok: false, message: '本地预览仅支持 PDF 与 .docx。' }
}
