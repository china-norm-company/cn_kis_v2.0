import { describe, expect, it } from 'vitest'
import { resolveServerProductData } from './data'

describe('resolveServerProductData', () => {
  it('uses real empty payload when backend returns 200 with no products', () => {
    expect(
      resolveServerProductData(
        { code: 200, data: { items: [] } },
        { code: 200, data: { items: [] } },
      ),
    ).toEqual({
      items: [],
      reminders: [],
    })
  })
})
