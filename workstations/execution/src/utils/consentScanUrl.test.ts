import { describe, expect, it } from 'vitest'
import {
  isConsentScanUrlHttpIpv4ImplicitPort80,
  isConsentScanUrlUnreachableFromPhone,
  normalizePrivateLanHttpIpv4ImplicitPort8001,
  rewriteConsentTestScanUrlForBrowserClient,
} from './consentScanUrl'

describe('isConsentScanUrlUnreachableFromPhone', () => {
  it('flags loopback hosts used in local Django URLs', () => {
    expect(isConsentScanUrlUnreachableFromPhone('http://localhost:8001/api/v1/protocol/public/x')).toBe(true)
    expect(isConsentScanUrlUnreachableFromPhone('http://127.0.0.1:8001/x')).toBe(true)
    expect(isConsentScanUrlUnreachableFromPhone('http://0.0.0.0:8001/x')).toBe(true)
  })

  it('does not flag LAN or public hosts', () => {
    expect(isConsentScanUrlUnreachableFromPhone('http://192.168.1.100:8001/x')).toBe(false)
    expect(isConsentScanUrlUnreachableFromPhone('https://abc.ngrok-free.app/api/v1/x')).toBe(false)
  })
})

describe('rewriteConsentTestScanUrlForBrowserClient', () => {
  it('rewrites loopback backend URL when browser is on LAN (H5 hash 路由)', () => {
    const inUrl =
      'http://127.0.0.1:8001/execution/#/consent-test-scan?p=1&t=abc%2B'
    const out = rewriteConsentTestScanUrlForBrowserClient(inUrl, {
      origin: 'http://192.168.0.10:3007',
      hostname: '192.168.0.10',
    })
    expect(out).toBe(
      'http://192.168.0.10:3007/execution/#/consent-test-scan?p=1&t=abc%2B',
    )
  })

  it('does not rewrite when browser is still on localhost', () => {
    const inUrl =
      'http://localhost:8001/execution/#/consent-test-scan?p=1&t=x'
    expect(
      rewriteConsentTestScanUrlForBrowserClient(inUrl, {
        origin: 'http://localhost:3007',
        hostname: 'localhost',
      }),
    ).toBe(inUrl)
  })

  it('does not rewrite when server URL is already public/LAN', () => {
    const inUrl =
      'http://192.168.1.100:8001/execution/#/consent-test-scan?p=1&t=x'
    expect(
      rewriteConsentTestScanUrlForBrowserClient(inUrl, {
        origin: 'http://192.168.0.10:3007',
        hostname: '192.168.0.10',
      }),
    ).toBe(inUrl)
  })
})

describe('normalizePrivateLanHttpIpv4ImplicitPort8001', () => {
  it('adds :3007 for execution H5 URL without port', () => {
    const inUrl = 'http://10.0.18.125/execution/#/consent-test-scan?p=1&t=x'
    expect(normalizePrivateLanHttpIpv4ImplicitPort8001(inUrl)).toBe(
      'http://10.0.18.125:3007/execution/#/consent-test-scan?p=1&t=x',
    )
  })

  it('adds :8001 for API path without port', () => {
    const inUrl = 'http://10.0.18.125/api/v1/health'
    expect(normalizePrivateLanHttpIpv4ImplicitPort8001(inUrl)).toBe(
      'http://10.0.18.125:8001/api/v1/health',
    )
  })

  it('does not change public IPv4', () => {
    const inUrl = 'http://8.8.8.8/api/v1/x'
    expect(normalizePrivateLanHttpIpv4ImplicitPort8001(inUrl)).toBe(inUrl)
  })

  it('does not change when port is explicit', () => {
    const inUrl = 'http://10.0.18.125:3007/api/v1/x'
    expect(normalizePrivateLanHttpIpv4ImplicitPort8001(inUrl)).toBe(inUrl)
  })
})

describe('isConsentScanUrlHttpIpv4ImplicitPort80', () => {
  it('flags http + IPv4 without explicit port (client defaults to 80)', () => {
    expect(isConsentScanUrlHttpIpv4ImplicitPort80('http://10.0.18.123/api/v1/x')).toBe(true)
    expect(isConsentScanUrlHttpIpv4ImplicitPort80('http://192.168.0.1')).toBe(true)
  })

  it('does not flag when port is explicit or not http/IPv4', () => {
    expect(isConsentScanUrlHttpIpv4ImplicitPort80('http://10.0.18.123:8001/x')).toBe(false)
    expect(isConsentScanUrlHttpIpv4ImplicitPort80('https://10.0.18.123/x')).toBe(false)
    expect(isConsentScanUrlHttpIpv4ImplicitPort80('http://localhost/x')).toBe(false)
  })
})
