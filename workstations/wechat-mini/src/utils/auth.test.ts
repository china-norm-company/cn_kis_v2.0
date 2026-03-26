import { beforeEach, describe, expect, it, vi } from 'vitest'

const { storage, modalMock, toastMock, loginMock, postMock } = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  modalMock: vi.fn(),
  toastMock: vi.fn(),
  loginMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock('@tarojs/taro', () => ({
  default: {
    ENV_TYPE: {
      WEAPP: 'weapp',
    },
    getEnv: () => 'weapp',
    getStorageSync: (key: string) => storage.get(key) || '',
    setStorageSync: (key: string, value: string) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
    showModal: modalMock,
    showToast: toastMock,
    login: loginMock,
  },
}))

vi.mock('./api', () => ({
  post: postMock,
  get: vi.fn(),
  getCurrentChannel: () => 'https',
  getCurrentApiBaseUrl: () => 'http://127.0.0.1:8001/api/v1',
}))

vi.mock('@cn-kis/subject-core', () => ({
  computePrimaryRole: () => 'subject',
  resolveLoginRoute: () => ({ type: 'switchTab', url: '/pages/index/index' }),
}))

import { wechatLogin } from './auth'

describe('wechatLogin local fallback', () => {
  beforeEach(() => {
    storage.clear()
    modalMock.mockReset()
    toastMock.mockReset()
    loginMock.mockReset()
    postMock.mockReset()
  })

  it('returns a subject mock user when current API base is local and request fails', async () => {
    loginMock.mockResolvedValue({ code: 'wx-code' })
    postMock.mockRejectedValue(new Error('network timeout'))

    const result = await wechatLogin()

    expect(result).toMatchObject({
      account_type: 'subject',
      roles: ['subject'],
      enrollmentStatus: 'enrolled',
    })
    expect(storage.get('token')).toBe('dev-mock-token')
    expect(modalMock).not.toHaveBeenCalled()
  })
})
