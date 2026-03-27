import { describe, expect, it } from 'vitest'
import {
  applyIcfPlaceholders,
  applyIcfPlaceholdersWithSourceAnchors,
  buildIcfPlaceholderValues,
  buildIcfPlaceholderValuesFromConsentPreview,
  buildIcfSignatureRawHtmlPlaceholders,
  ICF_PLACEHOLDER_TOKENS,
} from '@cn-kis/consent-placeholders'

describe('ICF placeholders', () => {
  it('exports a stable token list', () => {
    expect(ICF_PLACEHOLDER_TOKENS).toContain('{{ICF_SUBJECT_NAME}}')
    expect(ICF_PLACEHOLDER_TOKENS).toContain('{{ICF_ID_CARD_LAST4}}')
    expect(ICF_PLACEHOLDER_TOKENS).toContain('{{ICF_SUBJECT_SIG_1}}')
    expect(ICF_PLACEHOLDER_TOKENS).toContain('{{ICF_STAFF_SIG_1}}')
  })

  it('applyIcfPlaceholdersWithSourceAnchors wraps tokens with data-icf-src offsets', () => {
    const raw = '<p>{{ICF_SUBJECT_SIG_1}}</p>'
    const rawSig = buildIcfSignatureRawHtmlPlaceholders({
      subjectSignatureTimes: 1,
      sig1Src: null,
    })
    const out = applyIcfPlaceholdersWithSourceAnchors(raw, {}, { escapeValues: true, rawHtmlByToken: rawSig })
    expect(out).toContain('data-icf-src-start="3"')
    expect(out).toContain(`data-icf-src-end="${3 + '{{ICF_SUBJECT_SIG_1}}'.length}"`)
    expect(out).toContain('icf-src-anchor')
  })

  it('injects raw HTML for signature placeholders without escaping img', () => {
    const v = buildIcfPlaceholderValues({
      previewNow: new Date('2026-01-01T12:00:00+08:00'),
    })
    const raw = '<p>{{ICF_SUBJECT_SIG_1}}</p>'
    const rawSig = buildIcfSignatureRawHtmlPlaceholders({
      subjectSignatureTimes: 1,
      sig1Src: 'data:image/png;base64,xx',
    })
    const out = applyIcfPlaceholders(raw, v, { escapeValues: true, rawHtmlByToken: rawSig })
    expect(out).toContain('data:image/png;base64')
    expect(out).toContain('data-icf-inline-sig')
  })

  it('replaces placeholders in order and escapes HTML', () => {
    const v = buildIcfPlaceholderValues({
      protocolCode: 'P1',
      protocolTitle: '测试 & 项目',
      nodeTitle: '节点A',
      versionLabel: 'V1',
      identity: { declared_name: '张三', declared_id_card: '110101199001011234' },
      previewNow: new Date('2026-03-25T12:00:00+08:00'),
    })
    const raw = '<p>{{ICF_PROTOCOL_TITLE}} {{ICF_SUBJECT_NAME}} {{ICF_ID_CARD_LAST4}}</p>'
    const out = applyIcfPlaceholders(raw, v, { escapeValues: true })
    expect(out).toContain('测试 &amp; 项目')
    expect(out).toContain('张三')
    expect(out).toContain('1234')
  })

  it('fills protocol/node fields for config-time preview (no subject)', () => {
    const v = buildIcfPlaceholderValues({
      protocolCode: 'PRJ-01',
      protocolTitle: '示例项目',
      nodeTitle: '筛选期知情',
      versionLabel: 'V2.1',
    })
    const raw = '项目 {{ICF_PROTOCOL_CODE}} / {{ICF_NODE_TITLE}} / {{ICF_VERSION_LABEL}}'
    expect(applyIcfPlaceholders(raw, v, { escapeValues: true })).toBe(
      '项目 PRJ-01 / 筛选期知情 / V2.1',
    )
  })

  it('builds from consent preview signature summary', () => {
    const v = buildIcfPlaceholderValuesFromConsentPreview({
      protocolCode: 'C',
      protocolTitle: 'T',
      nodeTitle: 'N',
      versionLabel: '1.0',
      signedAt: '2026-03-25T08:58:31.034378+00:00',
      receiptNo: 'ICF-RCP-1',
      signatureSummary: {
        mini_sign_confirm: {
          subject_name: '李四',
          id_card_last4: '5678',
        },
      },
    })
    const raw = '{{ICF_RECEIPT_NO}} {{ICF_SUBJECT_NAME}} {{ICF_ID_CARD_LAST4}}'
    const out = applyIcfPlaceholders(raw, v, { escapeValues: true })
    expect(out).toBe('ICF-RCP-1 李四 5678')
  })

  it('splits signed date into year/month/day tokens', () => {
    const v = buildIcfPlaceholderValues({
      signedAt: '2026-03-27T10:30:20.450022+00:00',
    })
    expect(v['{{ICF_SIGNED_DATE}}']).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const [yy, mm, dd] = v['{{ICF_SIGNED_DATE}}'].split('-')
    expect(v['{{ICF_SIGNED_YEAR}}']).toBe(yy)
    expect(v['{{ICF_SIGNED_MONTH}}']).toBe(mm)
    expect(v['{{ICF_SIGNED_DAY}}']).toBe(dd)
  })
})
