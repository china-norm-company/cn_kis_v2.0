import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { FeishuAuth } from './auth'

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    isAxiosError: (err: unknown) => Boolean((err as { isAxiosError?: boolean })?.isAxiosError),
  },
}))

const postMock = vi.mocked(axios.post)

function mockAuthResponse() {
  postMock.mockResolvedValue({
    data: {
      access_token: 'jwt-token',
      user: {
        id: 1,
        username: 'secretary_user',
        display_name: '子衿用户',
        email: 'secretary@example.com',
        avatar: '',
        account_type: 'internal',
      },
      roles: ['viewer'],
      visible_workbenches: ['secretary'],
    },
  } as Awaited<ReturnType<typeof axios.post>>)
}

describe('FeishuAuth state handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    window.history.replaceState({}, '', '/secretary/')
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0',
      configurable: true,
    })
    delete (window as Window & { tt?: unknown }).tt
  })

  it('falls back to stored OAuth state only for callback code exchange', async () => {
    mockAuthResponse()
    sessionStorage.setItem('cnkis_auth_state', 'stored-oauth-state')
    sessionStorage.setItem('cnkis_auth_trace_id', 'trace-001')
    window.history.replaceState({}, '', '/secretary/?code=oauth-code')

    const auth = new FeishuAuth({
      appId: 'cli_secretary',
      redirectUri: 'https://example.com/secretary/',
      workstation: 'secretary',
      apiBaseUrl: '/api/v1',
    })

    const result = await auth.autoLogin()

    expect(result?.token).toBe('jwt-token')
    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/auth/feishu/callback',
      expect.objectContaining({
        code: 'oauth-code',
        state: 'stored-oauth-state',
        trace_id: 'trace-001',
      }),
      expect.any(Object),
    )
    expect(sessionStorage.getItem('cnkis_auth_state')).toBeNull()
    expect(sessionStorage.getItem('cnkis_auth_trace_id')).toBeNull()
  })

  it('does not leak stale OAuth state into in-app auth code exchange', async () => {
    mockAuthResponse()
    sessionStorage.setItem('cnkis_auth_state', 'stale-state')
    sessionStorage.setItem('cnkis_auth_trace_id', 'trace-002')
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 Lark',
      configurable: true,
    })
    ;(window as Window & { tt?: { requestAuthCode: (options: { success: (res: { code: string }) => void }) => void } }).tt = {
      requestAuthCode: ({ success }) => success({ code: 'in-app-code' }),
    }

    const auth = new FeishuAuth({
      appId: 'cli_secretary',
      redirectUri: 'https://example.com/secretary/',
      workstation: 'secretary',
      apiBaseUrl: '/api/v1',
    })

    const result = await auth.autoLogin()

    expect(result?.token).toBe('jwt-token')
    expect(postMock).toHaveBeenCalledTimes(1)
    expect(postMock).toHaveBeenCalledWith(
      '/api/v1/auth/feishu/callback',
      expect.objectContaining({
        code: 'in-app-code',
        state: undefined,
        trace_id: 'trace-002',
      }),
      expect.any(Object),
    )
    expect(sessionStorage.getItem('cnkis_auth_state')).toBe('stale-state')
  })
})
