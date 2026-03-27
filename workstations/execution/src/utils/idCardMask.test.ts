import { describe, it, expect } from 'vitest'
import { maskIdCardNoForDisplay } from './idCardMask'

describe('maskIdCardNoForDisplay', () => {
  it('masks 18-digit id', () => {
    expect(maskIdCardNoForDisplay('310110199001011058')).toBe('310110********1058')
  })

  it('masks 15-digit id', () => {
    expect(maskIdCardNoForDisplay('310110900101105')).toBe('310110*****1105')
  })

  it('returns empty for blank', () => {
    expect(maskIdCardNoForDisplay('')).toBe('')
    expect(maskIdCardNoForDisplay(null)).toBe('')
  })
})
