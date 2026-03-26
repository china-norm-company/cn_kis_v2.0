/**
 * 执行台签署预览：mammoth 将 .docx 转 HTML 的统一入口。
 * 新版 mammoth 类型定义不再暴露 ignoreEmptyParagraphs；保留默认转换行为。
 */
import mammoth from 'mammoth'

export async function mammothConvertDocxToArticleHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const { value } = await mammoth.convertToHtml({ arrayBuffer })
  return value
}
