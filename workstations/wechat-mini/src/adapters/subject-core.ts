import Taro from '@tarojs/taro'
import type { ApiClient, RequestOptions, StorageAdapter, UIAdapter, AuthProvider, UserInfo } from '@cn-kis/subject-core'
import { get, post, put, del } from '../utils/api'
import { getLocalUserInfo, isLoggedIn, logout, smsCodeLogin, wechatLogin } from '../utils/auth'

export const taroApiClient = {
  get: (url: string, params?: Record<string, unknown>, options?: RequestOptions) => get(url, params, options),
  post: (url: string, data?: unknown, options?: RequestOptions) => post(url, data, options),
  put: (url: string, data?: unknown, options?: RequestOptions) => put(url, data, options),
  del: (url: string, options?: RequestOptions) => del(url, options),
} satisfies ApiClient

export const taroStorageAdapter = {
  get: (key: string) => {
    const value = Taro.getStorageSync(key)
    return value ? String(value) : null
  },
  set: (key: string, value: string) => {
    Taro.setStorageSync(key, value)
  },
  remove: (key: string) => {
    Taro.removeStorageSync(key)
  },
} satisfies StorageAdapter

export const taroUIAdapter = {
  toast: ({ title, icon = 'none', duration }: { title: string; icon?: 'none' | 'success'; duration?: number }) => {
    const toastIcon: 'none' | 'success' = icon === 'success' ? 'success' : 'none'
    Taro.showToast({ title, icon: toastIcon, duration })
  },
  showLoading: ({ title, mask }: { title: string; mask?: boolean }) => Taro.showLoading({ title, mask }),
  hideLoading: () => Taro.hideLoading(),
  modal: async ({ title, content, showCancel = false }: { title: string; content: string; showCancel?: boolean }) => {
    const res = await Taro.showModal({ title, content, showCancel })
    return { confirm: !!res.confirm }
  },
} satisfies UIAdapter

export const taroAuthProvider = {
  loginWithWechat: () => wechatLogin() as Promise<UserInfo | null>,
  loginWithSms: (credentials: { phone?: string; code?: string }) => {
    const phone = credentials.phone || ''
    const code = credentials.code || ''
    return smsCodeLogin(phone, code) as Promise<UserInfo | null>
  },
  getLocalUserInfo,
  isLoggedIn,
  logout,
} satisfies AuthProvider
