import type { AuthProvider, UserInfo } from '@cn-kis/subject-core'
import { computePrimaryRole } from '@cn-kis/subject-core'
import * as SecureStore from 'expo-secure-store'
import { rnApiClient } from './rnApiClient'

interface AuthProfileRole {
  name: string
  display_name?: string
  level?: number
  category?: string
}

interface AuthProfileResponse {
  id: number
  username: string
  display_name: string
  account_type: string
  roles: AuthProfileRole[]
  visible_workbenches: string[]
}

/**
 * 登录成功后调 GET /auth/profile 获取完整角色信息并合并
 * 如果 profile 请求失败，使用登录响应中已有的 roles 字段作为回退
 */
export async function fetchAndMergeProfile(base: UserInfo): Promise<UserInfo> {
  try {
    const res = await rnApiClient.get<AuthProfileResponse | { data?: AuthProfileResponse }>(
      '/auth/profile',
    )
    const profileData: AuthProfileResponse | undefined =
      res.code === 200
        ? (res.data && typeof res.data === 'object' && 'roles' in res.data
            ? (res.data as AuthProfileResponse)
            : (res.data && typeof res.data === 'object' && 'data' in res.data
                ? (res.data as { data: AuthProfileResponse }).data
                : undefined))
        : undefined

    if (profileData && Array.isArray(profileData.roles)) {
      const roleNames = profileData.roles.map((r) =>
        typeof r === 'string' ? r : (r && typeof r === 'object' ? String(r.name || '') : '')
      ).filter(Boolean)
      const primary = computePrimaryRole(roleNames)
      return {
        ...base,
        account_type: (profileData.account_type as UserInfo['account_type']) || base.account_type,
        roles: roleNames,
        primary_role: primary,
      }
    }
  } catch {
    // profile 请求失败时，保留登录响应中已有的 roles
  }
  if (base.roles && base.roles.length > 0) {
    return {
      ...base,
      primary_role: computePrimaryRole(base.roles),
    }
  }
  return base
}

export const rnAuthProvider: AuthProvider = {
  loginWithSms: async (credentials) => {
    const res = await rnApiClient.post<{
      access_token: string
      user: Record<string, unknown>
      roles?: string[]
      visible_workbenches?: string[]
    }>(
      '/auth/sms/verify',
      { phone: credentials.phone, code: credentials.code, scene: 'cn_kis_login' },
      { auth: false },
    )
    if (res.code !== 200 || !res.data?.access_token || !res.data?.user) {
      return null
    }
    const rawUser = res.data.user
    await SecureStore.setItemAsync('token', res.data.access_token)

    const baseUser: UserInfo = {
      id: String(rawUser.id || ''),
      name: String(rawUser.display_name || rawUser.username || '受试者'),
      subjectNo: String(rawUser.subject_no || ''),
      enrollDate: String(rawUser.enroll_date || ''),
      projectName: String(rawUser.project_name || ''),
      account_type: (rawUser.account_type as UserInfo['account_type']) || undefined,
      roles: Array.isArray(res.data.roles) ? res.data.roles : [],
    }

    const user = await fetchAndMergeProfile(baseUser)
    await SecureStore.setItemAsync('userInfo', JSON.stringify(user))
    return user
  },

  getLocalUserInfo: async () => {
    try {
      const raw = await SecureStore.getItemAsync('userInfo')
      if (!raw) return null
      return JSON.parse(raw) as UserInfo
    } catch {
      return null
    }
  },

  isLoggedIn: async () => {
    const token = await SecureStore.getItemAsync('token')
    return !!token
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('token')
    await SecureStore.deleteItemAsync('userInfo')
  },
}
