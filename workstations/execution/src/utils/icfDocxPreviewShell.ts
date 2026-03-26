/**
 * 服务端 HTML 预览（完整文档）在「勾选示意 / 项目信息更正」模式下需补充的样式（与正文 class 一致）。
 */
/** 勾选/项目信息模式注入到完整 HTML 时，与 mammoth 外壳共用：修正表格列宽 */
export const ICF_PREVIEW_TABLE_NORMALIZE_BLOCK = `
body{overflow-x:auto;-webkit-overflow-scrolling:touch;}
article{min-width:0;}
table{border-collapse:collapse;border:1px solid #e2e8f0;margin:12px 0;font-size:14px;table-layout:auto;width:max-content;max-width:100%;}
td,th{border:1px solid #e2e8f0;padding:6px 8px;vertical-align:top;min-width:1.5em;}
td p,th p{margin:0.25em 0;}
td p:first-child,th p:first-child{margin-top:0;}
td p:last-child,th p:last-child{margin-bottom:0;}
`

/** 与 buildCheckboxPreviewMarkerHtml 中方框尺寸一致：正文可交互区避免系统默认圆形 radio */
export const ICF_PREVIEW_INTERACTIVE_CHECKBOX_CSS = `
.icf-cb-preview.icf-cb-interactive input.icf-cb-yes,
.icf-cb-preview.icf-cb-interactive input.icf-cb-no{
  appearance:none;
  -webkit-appearance:none;
  width:0.85em;
  height:0.85em;
  margin:0;
  flex-shrink:0;
  vertical-align:middle;
  cursor:pointer;
  border:1px solid #64748b;
  border-radius:2px;
  background:#fff;
  box-sizing:border-box;
}
.icf-cb-preview.icf-cb-interactive input.icf-cb-yes:checked,
.icf-cb-preview.icf-cb-interactive input.icf-cb-no:checked{
  background:#2563eb;
  border-color:#1d4ed8;
}
`

export const ICF_PREVIEW_ASSIST_STYLE_BLOCK = `
${ICF_PREVIEW_TABLE_NORMALIZE_BLOCK}
${ICF_PREVIEW_INTERACTIVE_CHECKBOX_CSS}
.icf-cb-item-row{
  display:block;
  width:100%;
  max-width:100%;
  box-sizing:border-box;
  margin:0;
  padding:0.625rem 0;
  line-height:1.5;
  vertical-align:top;
}
.icf-cb-preview{line-height:1.5;vertical-align:middle;}
td:has(.icf-cb-item-row),th:has(.icf-cb-item-row){
  padding-top:0.25rem!important;
  padding-bottom:0.25rem!important;
  vertical-align:top!important;
}
p:has(.icf-cb-item-row){
  margin-top:0!important;
  margin-bottom:0!important;
}
.icf-proj-preview-hl{color:#dc2626;font-weight:600;}
`

/** 在完整 HTML 的 `</head>` 前插入辅助样式（无 head 则原样返回） */
export function injectIcfPreviewAssistStylesIntoHtml(html: string): string {
  if (!html.includes('</head>')) return html
  return html.replace('</head>', `<style>${ICF_PREVIEW_ASSIST_STYLE_BLOCK}</style></head>`)
}

/** 服务端 /preview 完整 HTML：补充表格列宽规则（与 mammoth 外壳一致）；勾选/项目信息模式请用 injectIcfPreviewAssistStylesIntoHtml（已含本段） */
export function injectIcfPreviewTableNormalizeStylesIntoHtml(html: string): string {
  if (!html.includes('</head>')) return html
  return html.replace('</head>', `<style>${ICF_PREVIEW_TABLE_NORMALIZE_BLOCK}</style></head>`)
}

function escBannerText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * mammoth 输出的正文 HTML 包成 iframe srcDoc 外壳（无 mammoth 依赖，供页面按模式注入勾选示意后组装）。
 * 提示条尽量克制，以正文为主；服务端 /preview 可用时不会走本函数。
 */
export function wrapMammothArticleToSrcDoc(articleHtml: string, bannerExtra?: string): string {
  const extra = (bannerExtra || '').trim()
  const dev = typeof import.meta !== 'undefined' && import.meta.env?.DEV
  let baseBanner = ''
  if (extra) {
    const body = escBannerText(extra).replace(/\n/g, '<br/>')
    if (dev) {
      baseBanner =
        '<div style="background:#f8fafc;border:1px solid #e2e8f0;color:#475569;padding:8px 10px;border-radius:6px;font-size:12px;margin-bottom:12px;line-height:1.45;">' +
        body +
        '</div>'
    } else {
      baseBanner =
        '<p style="font-size:11px;color:#94a3b8;margin:0 0 12px 0;line-height:1.4;">' + body + '</p>'
    }
  } else if (dev) {
    baseBanner =
      '<div style="background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;padding:6px 10px;border-radius:6px;font-size:11px;margin-bottom:12px;line-height:1.4;">' +
      '浏览器内预览（mammoth），版式可能与服务端生成的 HTML 略有差异。' +
      '</div>'
  }
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.65;color:#0f172a;padding:16px 18px;overflow-x:auto;-webkit-overflow-scrolling:touch;}
article{min-width:0;}
/* mammoth 默认 table{width:100%} 会让多列表格均分整行，版式表易出现大量极窄空列；改为按内容宽度 + 横向滚动 */
table{border-collapse:collapse;border:1px solid #e2e8f0;margin:12px 0;font-size:14px;table-layout:auto;width:max-content;max-width:100%;}
td,th{border:1px solid #e2e8f0;padding:6px 8px;vertical-align:top;min-width:1.5em;}
p{margin:0.45em 0;}
td p,th p{margin:0.25em 0;}
td p:first-child,th p:first-child{margin-top:0;}
td p:last-child,th p:last-child{margin-bottom:0;}
/* 与 icfCheckboxDetect 注入的示意行一致：统一每行上下留白，避免表格 td 与段落 margin 叠算导致组内/组间不一致 */
.icf-cb-item-row{
  display:block;
  width:100%;
  max-width:100%;
  box-sizing:border-box;
  margin:0;
  padding:0.625rem 0;
  line-height:1.5;
  vertical-align:top;
}
.icf-cb-preview{line-height:1.5;vertical-align:middle;}
td:has(.icf-cb-item-row),th:has(.icf-cb-item-row){
  padding-top:0.25rem!important;
  padding-bottom:0.25rem!important;
  vertical-align:top!important;
}
p:has(.icf-cb-item-row){
  margin-top:0!important;
  margin-bottom:0!important;
}
/* 执行台项目信息核对：识别与系统一致时预览高亮（不写入库、不影响小程序） */
.icf-proj-preview-hl{color:#dc2626;font-weight:600;}
${ICF_PREVIEW_INTERACTIVE_CHECKBOX_CSS}
</style></head><body>${baseBanner}<article>${articleHtml}</article></body></html>`
}
