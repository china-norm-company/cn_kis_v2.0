import { describe, expect, it } from 'vitest'
import { extractPostLoginHashFromOAuthState } from './auth'

function toBase64Url(raw: string): string {
  const encoded = btoa(raw)
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

describe('extractPostLoginHashFromOAuthState', () => {
  it('roundtrips post_login_hash in OAuth state payload', () => {
    const payload = {
      ws: 'execution',
      app_id: 'cli_test',
      trace_id: 'trace',
      nonce: 'nonce123456',
      ts: Math.floor(Date.now() / 1000),
      ver: 'v1',
      post_login_hash: '#/consent?focusProtocolId=42',
    }
    const state = toBase64Url(JSON.stringify(payload))
    expect(extractPostLoginHashFromOAuthState(state)).toBe('#/consent?focusProtocolId=42')
  })

  it('reconstructs hash from compact post_login_focus_protocol_id', () => {
    const payload = {
      ws: 'execution',
      app_id: 'cli_test',
      trace_id: 'trace',
      nonce: 'nonce123456',
      ts: Math.floor(Date.now() / 1000),
      ver: 'v1',
      post_login_focus_protocol_id: 42,
    }
    const state = toBase64Url(JSON.stringify(payload))
    expect(extractPostLoginHashFromOAuthState(state)).toBe('#/consent?focusProtocolId=42')
  })
})
