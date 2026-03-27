import { describe, it, expect } from 'vitest'
import {
  injectCheckboxPreviewMarkers,
  injectInteractiveCheckboxMarkers,
  detectCheckboxControlsFromHtml,
  countCheckboxPreviewMarkers,
  appendSupplementalCollectCheckboxPreviewRows,
  stripDocumentOtherInfoPlaceholderForCustomSupplemental,
  icfInteractiveCheckboxGroupsAllAnswered,
  collectInteractiveCheckboxAnswers,
} from './icfCheckboxDetect'

describe('stripDocumentOtherInfoPlaceholderForCustomSupplemental', () => {
  it('removes placeholder paragraph when custom labels exist', () => {
    const html = '<p>前段</p><p>如有其他信息，可在此添加 请勾选</p><p>后段</p>'
    const out = stripDocumentOtherInfoPlaceholderForCustomSupplemental(html, ['你好'])
    expect(out).not.toContain('如有其他信息')
    expect(out).toContain('前段')
    expect(out).toContain('后段')
  })
  it('removes placeholder when no custom labels (正文不重复出现，由配置追加)', () => {
    const html = '<p>如有其他信息，可在此添加</p>'
    const out = stripDocumentOtherInfoPlaceholderForCustomSupplemental(html, [])
    expect(out).not.toContain('如有其他信息')
  })
  it('removes only the table row that contains the placeholder', () => {
    const html =
      '<table><tr><td>前</td></tr><tr><td>如有其他信息，可在此添加</td></tr><tr><td>后</td></tr></table>'
    const out = stripDocumentOtherInfoPlaceholderForCustomSupplemental(html, ['x'])
    expect(out).not.toContain('如有其他信息')
    expect(out).toContain('前')
    expect(out).toContain('后')
  })
})

describe('appendSupplementalCollectCheckboxPreviewRows', () => {
  it('inserts labeled rows after last document checkbox row (before footnote), not at document end', () => {
    const raw =
      '<p>姓名 □是 □否</p><p>请勾选 [ ] 是 [ ] 否</p><p>注：√□为同意。</p><p>我们深知个人信息对您的重要性…</p>'
    const injected = injectCheckboxPreviewMarkers(raw)
    const out = appendSupplementalCollectCheckboxPreviewRows(injected, raw, ['哈哈', '我好'], false)
    expect(out).toContain('哈哈')
    expect(out).toContain('我好')
    expect(out.split('icf-cb-preview').length - 1).toBe(
      (injected.match(/class="icf-cb-preview"/g) || []).length + 2,
    )
    expect(out.indexOf('哈哈')).toBeLessThan(out.indexOf('注：'))
    expect(out.indexOf('我好')).toBeLessThan(out.indexOf('注：'))
    expect(out.indexOf('我们深知')).toBeGreaterThan(out.indexOf('我好'))
  })
})

describe('countCheckboxPreviewMarkers', () => {
  it('matches inject output: one icf-cb-preview per injected block', () => {
    const html = '<p>请勾选 [ ] 是 [ ] 否</p><p>第二处 请勾选 [ ] 是 [ ] 否</p>'
    const injected = injectCheckboxPreviewMarkers(html)
    expect(countCheckboxPreviewMarkers(html)).toBe((injected.match(/class="icf-cb-preview"/g) || []).length)
    expect(countCheckboxPreviewMarkers(html)).toBeGreaterThanOrEqual(1)
  })
})

describe('injectCheckboxPreviewMarkers', () => {
  it('replaces checkbox phrase with preview marker at same position', () => {
    const html = '<p>请勾选 [ ] 是 [ ] 否</p>'
    expect(detectCheckboxControlsFromHtml(html)).toHaveLength(1)
    const out = injectCheckboxPreviewMarkers(html)
    expect(out).toContain('icf-cb-preview')
    expect(out).toContain('请勾选')
    expect(out).toContain('color:#dc2626')
    expect(out).not.toContain('[ ] 是 [ ] 否')
  })

  it('returns original html when tokenizer plain mismatches stripTags', () => {
    const html = ''
    expect(injectCheckboxPreviewMarkers(html)).toBe('')
  })

  it('regex fallback: mammoth-like <p> with ____Yes是 ____No否 still injects marker', () => {
    const html =
      '<p>我同意。 ____Yes是 ____No否</p><p>第二处 ____Yes是 ____No否</p>'
    const out = injectCheckboxPreviewMarkers(html)
    expect(out.split('icf-cb-preview').length - 1).toBe(2)
    expect(out).toContain('color:#dc2626')
  })

  it('detects ☐/□ + 是 + □ + 否 (personal info table rows)', () => {
    const html = '<p>姓名 \u2610 是 \u2610 否</p><p>性别 \u25A1是\u25A1否</p>'
    expect(detectCheckboxControlsFromHtml(html)).toHaveLength(2)
    const out = injectCheckboxPreviewMarkers(html)
    expect(out.split('icf-cb-preview').length - 1).toBe(2)
  })

  it('decodes numeric entities for box chars before match', () => {
    const html = '<p>姓名 &#9633; 是 &#9633; 否</p>'
    expect(detectCheckboxControlsFromHtml(html)).toHaveLength(1)
    expect(injectCheckboxPreviewMarkers(html)).toContain('icf-cb-preview')
  })

  it('detects □ + field name rows without 是/否 (personal info line)', () => {
    const html = '<p>□实验样本、数据 □病史</p>'
    expect(detectCheckboxControlsFromHtml(html)).toHaveLength(2)
    const out = injectCheckboxPreviewMarkers(html)
    expect(out.split('icf-cb-preview').length - 1).toBe(2)
    expect(out).toContain('icf-cb-field')
  })

  it('does not treat legend line 注：√□为同意，□x 拒绝 as checkbox fields', () => {
    const html =
      '<p>□面部照片 □银行账户信息</p><p>注：√□为同意，□x 拒绝。</p>'
    expect(detectCheckboxControlsFromHtml(html)).toHaveLength(2)
    const out = injectCheckboxPreviewMarkers(html)
    expect(out.split('icf-cb-preview').length - 1).toBe(2)
    expect(out).toContain('面部照片')
    expect(out).not.toContain('银行账户信息 注：')
    expect(out.match(/data-icf-cb-ord="[12]"/g)?.length).toBe(2)
  })

  it('does not treat legend without 注 prefix but with √□与拒绝说明 as fields', () => {
    const html = '<p>√□为同意，□x 拒绝。</p>'
    expect(detectCheckboxControlsFromHtml(html)).toHaveLength(0)
  })
})

describe('injectInteractiveCheckboxMarkers / 方形勾选与采集', () => {
  it('uses checkbox inputs (not radio) for 是/否', () => {
    const html = '<p>请勾选 [ ] 是 [ ] 否</p>'
    const out = injectInteractiveCheckboxMarkers(html)
    expect(out).toContain('icf-cb-interactive')
    expect(out).toContain('type="checkbox"')
    expect(out).not.toContain('type="radio"')
  })

  it('icfInteractiveCheckboxGroupsAllAnswered is false until one of 是/否 is checked', () => {
    const html = '<p>请勾选 [ ] 是 [ ] 否</p>'
    const injected = injectInteractiveCheckboxMarkers(html)
    document.body.innerHTML = `<div id="root">${injected}</div>`
    const root = document.getElementById('root')
    expect(icfInteractiveCheckboxGroupsAllAnswered(root)).toBe(false)
    const yes = root?.querySelector('input.icf-cb-yes') as HTMLInputElement
    yes!.checked = true
    expect(icfInteractiveCheckboxGroupsAllAnswered(root)).toBe(true)
  })

  it('collectInteractiveCheckboxAnswers returns yes/no per group', () => {
    const html = '<p>A 请勾选 [ ] 是 [ ] 否</p><p>B 请勾选 [ ] 是 [ ] 否</p>'
    const injected = injectInteractiveCheckboxMarkers(html)
    document.body.innerHTML = `<div id="r">${injected}</div>`
    const root = document.getElementById('r')
    const groups = root!.querySelectorAll('.icf-cb-interactive')
    expect(groups.length).toBe(2)
    const y0 = groups[0].querySelector('input.icf-cb-yes') as HTMLInputElement
    y0.checked = true
    const n1 = groups[1].querySelector('input.icf-cb-no') as HTMLInputElement
    n1.checked = true
    expect(collectInteractiveCheckboxAnswers(root)).toEqual([{ value: 'yes' }, { value: 'no' }])
  })
})
