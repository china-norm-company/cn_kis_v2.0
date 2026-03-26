import { describe, expect, it } from 'vitest'
import { formatProductDisplayName } from './product'

describe('formatProductDisplayName', () => {
  it('prefers project and sample fields when they are available', () => {
    expect(
      formatProductDisplayName({
        project_no: 'W26001111',
        project_name: '面霜项目',
        sample_name: '面霜',
        sample_no: '123',
        product_name: '研究产品A',
      }),
    ).toBe('W26001111-面霜项目-面霜-123')
  })

  it('falls back to product_name when project fields are missing', () => {
    expect(
      formatProductDisplayName({
        product_name: '研究产品A',
      }),
    ).toBe('研究产品A')
  })
})
