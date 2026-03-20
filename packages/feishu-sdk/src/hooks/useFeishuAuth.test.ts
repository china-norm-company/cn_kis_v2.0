import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useFeishuAuth } from './useFeishuAuth'

const autoLoginMock = vi.fn()
const redirectToAuthMock = vi.fn()

vi.mock('../auth', () => ({
  FeishuAuth: class {
    autoLogin = autoLoginMock
    redirectToAuth = redirectToAuthMock
  },
  AuthError: class extends Error {
    type: string
    constructor(message: string, type: string) {
      super(message)
      this.type = type
    }
  },
}))

describe('useFeishuAuth normalization', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('restores user from wrapped auth_user cache when token exists', async () => {
    localStorage.setItem('auth_token', 'mock-token')
    localStorage.setItem(
      'auth_user',
      JSON.stringify({
        code: 200,
        msg: 'ok',
        data: {
          id: 9,
          display_name: '管仲用户',
          email: 'finance@example.com',
          avatar: 'https://example.com/avatar.png',
        },
      }),
    )

    const { result } = renderHook(() =>
      useFeishuAuth({
        appId: 'app-id',
        redirectUri: 'https://example.com/callback',
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user?.id).toBe(9)
    expect(result.current.user?.name).toBe('管仲用户')
    expect(result.current.user?.email).toBe('finance@example.com')
    expect(autoLoginMock).not.toHaveBeenCalled()
  })

  it('normalizes autoLogin result and stores flattened auth_user', async () => {
    autoLoginMock.mockResolvedValueOnce({
      token: 'new-token',
      user: {
        id: 11,
        username: 'ops_user',
        display_name: '执行用户',
        avatar: 'https://example.com/u.png',
      },
      roles: [],
      visible_workbenches: [],
    })

    const { result } = renderHook(() =>
      useFeishuAuth({
        appId: 'app-id',
        redirectUri: 'https://example.com/callback',
      }),
    )

    await waitFor(() => {
      expect(result.current.user?.name).toBe('执行用户')
    })

    const stored = JSON.parse(localStorage.getItem('auth_user') || '{}')
    expect(stored.code).toBeUndefined()
    expect(stored.msg).toBeUndefined()
    expect(stored.name).toBe('执行用户')
    expect(stored.id).toBe(11)
  })

  it('restores account-nested auth_user cache', async () => {
    localStorage.setItem('auth_token', 'mock-token')
    localStorage.setItem(
      'auth_user',
      JSON.stringify({
        code: 200,
        msg: 'ok',
        data: {
          account: {
            id: 12,
            username: 'legacy_user',
            display_name: '旧结构用户',
          },
        },
      }),
    )

    const { result } = renderHook(() =>
      useFeishuAuth({
        appId: 'app-id',
        redirectUri: 'https://example.com/callback',
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.user?.id).toBe(12)
    expect(result.current.user?.name).toBe('旧结构用户')
    expect(autoLoginMock).not.toHaveBeenCalled()
  })

  it('restores auth_user with open_id identity', async () => {
    localStorage.setItem('auth_token', 'mock-token')
    localStorage.setItem(
      'auth_user',
      JSON.stringify({
        open_id: 'ou_test_evaluator_001',
        name: '张技评',
      }),
    )

    const { result } = renderHook(() =>
      useFeishuAuth({
        appId: 'app-id',
        redirectUri: 'https://example.com/callback',
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.user?.id).toBe('ou_test_evaluator_001')
    expect(result.current.user?.name).toBe('张技评')
    expect(result.current.isAuthenticated).toBe(true)
    expect(autoLoginMock).not.toHaveBeenCalled()
  })

  it('restores name-only auth_user cache for legacy compatibility', async () => {
    localStorage.setItem('auth_token', 'mock-token')
    localStorage.setItem(
      'auth_user',
      JSON.stringify({
        name: '仅姓名用户',
      }),
    )

    const { result } = renderHook(() =>
      useFeishuAuth({
        appId: 'app-id',
        redirectUri: 'https://example.com/callback',
      }),
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.user?.id).toBe('仅姓名用户')
    expect(result.current.user?.name).toBe('仅姓名用户')
    expect(result.current.isAuthenticated).toBe(true)
    expect(autoLoginMock).not.toHaveBeenCalled()
  })
})
