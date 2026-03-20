import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import axios from 'axios'
import { useAuthProfile } from './useAuthProfile'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}))

type MockedAxios = {
  get: ReturnType<typeof vi.fn>
}

const mockedAxios = axios as unknown as MockedAxios

describe('useAuthProfile normalization', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('normalizes wrapped auth_profile cache on init', async () => {
    localStorage.setItem('auth_profile_token', 'token')
    localStorage.setItem(
      'auth_profile',
      JSON.stringify({
        code: 200,
        msg: 'ok',
        data: {
          id: 1,
          username: 'finance_user',
          display_name: '财务用户',
          roles: ['finance_manager'],
          permissions: ['finance.quote.read'],
          visible_workbenches: ['finance'],
          visible_menu_items: { finance: ['dashboard'] },
        },
      }),
    )
    mockedAxios.get.mockRejectedValueOnce(new Error('network'))

    const { result } = renderHook(() => useAuthProfile('token', '/api/v1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.profile?.username).toBe('finance_user')
    expect(result.current.profile?.roles[0]?.name).toBe('finance_manager')
    expect(result.current.profile?.permissions).toEqual(['finance.quote.read'])
    expect(result.current.profile?.visible_menu_items.finance).toEqual(['dashboard'])
  })

  it('normalizes legacy account-nested profile response', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        code: 200,
        msg: 'OK',
        data: {
          account: {
            id: 3,
            username: 'legacy_finance',
            display_name: '财务旧结构',
            email: 'legacy@example.com',
          },
          roles: ['finance_manager'],
          permissions: ['finance.quote.read'],
          visible_workbenches: ['finance'],
          visible_menus: { finance: ['dashboard', 'quotes'] },
        },
      },
    })

    const { result } = renderHook(() => useAuthProfile('token', '/api/v1'))

    await waitFor(() => {
      expect(result.current.profile?.username).toBe('legacy_finance')
    })

    expect(result.current.profile?.display_name).toBe('财务旧结构')
    expect(result.current.profile?.permissions).toEqual(['finance.quote.read'])
    expect(result.current.profile?.visible_menu_items.finance).toEqual(['dashboard', 'quotes'])
  })

  it('normalizes object-based permissions and menu payloads', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        code: 200,
        msg: 'OK',
        data: {
          account: {
            id: 6,
            username: 'object_perm_user',
            display_name: '对象权限用户',
          },
          permissions: [{ code: 'finance.quote.read' }, { permission: 'finance.report.read' }],
          visible_workbenches: [{ code: 'finance' }],
          visible_menu_items: {
            finance: [{ code: 'dashboard' }, { key: 'quotes' }],
          },
        },
      },
    })

    const { result } = renderHook(() => useAuthProfile('token', '/api/v1'))
    await waitFor(() => {
      expect(result.current.profile?.username).toBe('object_perm_user')
    })

    expect(result.current.profile?.permissions).toEqual(['finance.quote.read', 'finance.report.read'])
    expect(result.current.profile?.visible_workbenches).toEqual(['finance'])
    expect(result.current.profile?.visible_menu_items.finance).toEqual(['dashboard', 'quotes'])
  })

  it('matches menu visibility with full-path menu keys', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        code: 200,
        msg: 'OK',
        data: {
          id: 9,
          username: 'path_user',
          display_name: '路径用户',
          permissions: ['finance.quote.read'],
          visible_workbenches: ['finance'],
          visible_menu_items: { finance: ['/finance/dashboard', 'finance/quotes'] },
        },
      },
    })

    const { result } = renderHook(() => useAuthProfile('token', '/api/v1'))
    await waitFor(() => {
      expect(result.current.profile?.username).toBe('path_user')
    })

    expect(result.current.isMenuVisible('finance', 'dashboard')).toBe(true)
    expect(result.current.isMenuVisible('finance', '/quotes')).toBe(true)
  })

  it('normalizes wrapped /auth/profile response and stores flattened profile', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        code: 200,
        msg: 'OK',
        data: {
          id: 2,
          username: 'ops_user',
          display_name: '执行用户',
          roles: [{ name: 'executor', display_name: '执行角色', level: '2', category: 'project' }],
          permissions: ['visit.plan.read'],
          visible_workbenches: ['execution'],
          visible_menu_items: { execution: ['dashboard', 'scheduling'] },
        },
      },
    })

    const { result } = renderHook(() => useAuthProfile('token', '/api/v1'))

    await waitFor(() => {
      expect(result.current.profile?.username).toBe('ops_user')
    })

    expect(result.current.profile?.roles[0]?.level).toBe(2)
    expect(result.current.profile?.visible_menu_items.execution).toEqual(['dashboard', 'scheduling'])

    const stored = JSON.parse(localStorage.getItem('auth_profile') || '{}')
    expect(stored.code).toBeUndefined()
    expect(stored.msg).toBeUndefined()
    expect(stored.username).toBe('ops_user')
    expect(stored.visible_menu_items.execution).toEqual(['dashboard', 'scheduling'])
  })

  it('keeps previous profile when /auth/profile payload is invalid', async () => {
    localStorage.setItem('auth_profile_token', 'token')
    localStorage.setItem(
      'auth_profile',
      JSON.stringify({
        id: 8,
        username: 'finance_cached',
        display_name: '缓存用户',
        roles: [{ name: 'finance_manager', display_name: '财务角色', level: 1, category: 'biz' }],
        permissions: ['finance.quote.read'],
        visible_workbenches: ['finance'],
        visible_menu_items: { finance: ['dashboard', 'quotes'] },
      }),
    )
    mockedAxios.get.mockResolvedValueOnce({
      data: { code: 200, msg: 'ok', data: { items: [], total: 0 } },
    })

    const { result } = renderHook(() => useAuthProfile('token', '/api/v1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.profile?.username).toBe('finance_cached')
    expect(result.current.profile?.visible_menu_items.finance).toEqual(['dashboard', 'quotes'])
    expect(result.current.error).toContain('auth/profile 返回结构异常')
  })
})
