import { describe, expect, it, afterEach } from 'vitest'
import { parseFocusWitnessStaffIdFromHash } from './witnessStaffListFocusStorage'

describe('parseFocusWitnessStaffIdFromHash', () => {
  const originalHash = window.location.hash

  afterEach(() => {
    window.location.hash = originalHash
  })

  it('parses focusWitnessStaffId from hash query', () => {
    window.location.hash = '#/consent/witness-staff?focusWitnessStaffId=42&x=1'
    expect(parseFocusWitnessStaffIdFromHash()).toBe('42')
  })

  it('returns null when hash has no query', () => {
    window.location.hash = '#/consent/witness-staff'
    expect(parseFocusWitnessStaffIdFromHash()).toBeNull()
  })
})
