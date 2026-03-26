import { describe, expect, it, vi } from 'vitest'
import { buildSubjectEndpoints } from './endpoints'

function createApiStub() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  }
}

describe('buildSubjectEndpoints', () => {
  it('posts product return with silent mode enabled', () => {
    const api = createApiStub()
    const endpoints = buildSubjectEndpoints(api as any)
    const payload = { quantity: 1 }

    endpoints.createMyProductReturn(12, payload)

    expect(api.post).toHaveBeenCalledWith('/my/products/12/return', payload, { silent: true })
  })

  it('posts sample confirm with an empty object and silent mode when no body is provided', () => {
    const api = createApiStub()
    const endpoints = buildSubjectEndpoints(api as any)

    endpoints.getSampleConfirmUrl(34)

    expect(api.post).toHaveBeenCalledWith('/my/sample-confirm?dispensing_id=34', {}, { silent: true })
  })
})
