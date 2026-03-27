/**
 * 用户权限画像 Hook
 *
 * 登录后自动从 /auth/profile 获取角色、权限、可见工作台等信息。
 * 供所有工作台共享使用。
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'

const AUTH_PROFILE_KEY = 'auth_profile'
const AUTH_PROFILE_TOKEN_KEY = 'auth_profile_token'

export interface RoleInfo {
  name: string
  display_name: string
  level: number
  category: string
}

export interface AuthProfile {
  id: number
  username: string
  display_name: string
  email: string
  avatar: string
  account_type: string
  roles: RoleInfo[]
  permissions: string[]
  data_scope: string
  visible_workbenches: string[]
  visible_menu_items: Record<string, string[]>
  /**
   * 工作台模式配置（渐进上线支持）
   * 键为工作台标识，值为 'blank' | 'pilot' | 'full'
   * 无此字段或某工作台无配置时，默认为 'full'
   */
  workstation_modes?: Record<string, string>
}

interface UseAuthProfileReturn {
  profile: AuthProfile | null
  loading: boolean
  error: string | null
  authRequired: boolean
  refetch: () => void
  /** 当前用户是否为管理员（拥有 * 全权限） */
  isAdmin: boolean
  // 权限检查方法
  hasPermission: (code: string) => boolean
  hasAnyPermission: (codes: string[]) => boolean
  hasAllPermissions: (codes: string[]) => boolean
  hasRole: (name: string) => boolean
  hasAnyRole: (names: string[]) => boolean
  canAccessWorkbench: (wb: string) => boolean
  isMenuVisible: (workbench: string, menuKey: string) => boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || 0
  return 0
}

function asCodeArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        const record = asRecord(item)
        if (!record) return ''
        return asString(record.code || record.permission || record.name || record.key)
      })
      .filter((item): item is string => item.length > 0)
  }
  const record = asRecord(value)
  if (!record) return []
  return Object.keys(record).filter((key) => key.length > 0)
}

function normalizeMenuKey(value: string, workbench?: string): string {
  let key = value.trim().toLowerCase()
  if (!key) return ''
  key = key.split('?')[0].split('#')[0]
  key = key.replace(/^\/+/, '')
  if (workbench) {
    const wb = workbench.toLowerCase()
    if (key.startsWith(`${wb}/`)) key = key.slice(wb.length + 1)
    if (key.startsWith(`${wb}.`)) key = key.slice(wb.length + 1)
  }
  return key
}

function normalizeVisibleMenus(value: unknown): Record<string, string[]> {
  const directRecord = asRecord(value)
  if (directRecord) {
    return Object.fromEntries(
      Object.entries(directRecord).map(([workbench, menus]) => [
        workbench,
        asCodeArray(menus)
          .map((menu) => normalizeMenuKey(menu, workbench))
          .filter((menu) => menu.length > 0),
      ]),
    )
  }
  if (!Array.isArray(value)) return {}
  const entries = value
    .map((item) => {
      const record = asRecord(item)
      if (!record) return null
      const workbench = asString(record.workbench || record.wb || record.key)
      if (!workbench) return null
      return [
        workbench,
        asCodeArray(record.menus || record.items || record.visible_menu_items)
          .map((menu) => normalizeMenuKey(menu, workbench))
          .filter((menu) => menu.length > 0),
      ] as const
    })
    .filter((item): item is readonly [string, string[]] => item !== null)
  return Object.fromEntries(entries)
}

function firstRecord(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const record = asRecord(value)
    if (record) return record
  }
  return null
}

function normalizeAuthProfile(raw: unknown): AuthProfile | null {
  const source = asRecord(raw)
  if (!source) return null
  const payload = firstRecord(source.data, source.profile, source)
  if (!payload) return null
  const account = firstRecord(payload.account, payload.user, payload) ?? payload

  const rolesRaw = Array.isArray(payload.roles)
    ? payload.roles
    : Array.isArray(account.roles)
      ? account.roles
      : []
  const roles = rolesRaw
    .map((role): RoleInfo | null => {
      if (typeof role === 'string') {
        return {
          name: role,
          display_name: role,
          level: 0,
          category: '',
        }
      }
      const roleObj = asRecord(role)
      if (!roleObj || typeof roleObj.name !== 'string') return null
      return {
        name: roleObj.name,
        display_name: typeof roleObj.display_name === 'string' ? roleObj.display_name : roleObj.name,
        level: asNumber(roleObj.level),
        category: typeof roleObj.category === 'string' ? roleObj.category : '',
      }
    })
    .filter((item): item is RoleInfo => item !== null)

  const visible_menu_items = normalizeVisibleMenus(
    payload.visible_menu_items ?? payload.visible_menus ?? account.visible_menu_items ?? account.visible_menus,
  )

  const username = asString(account.username || account.name)
  const permissions = asCodeArray(payload.permissions).length
    ? asCodeArray(payload.permissions)
    : asCodeArray(account.permissions)
  const visible_workbenches = asCodeArray(payload.visible_workbenches).length
    ? asCodeArray(payload.visible_workbenches)
    : asCodeArray(account.visible_workbenches)
  const display_name =
    asString(account.display_name)
    || asString(account.name)
    || username

  const hasUserIdentity = asNumber(account.id) > 0 || username.length > 0
  const hasPermissionHints = permissions.length > 0
    || visible_workbenches.length > 0
    || Object.keys(visible_menu_items).length > 0
  if (!hasUserIdentity && !hasPermissionHints) {
    return null
  }

  return {
    id: asNumber(account.id),
    username,
    display_name,
    email: asString(account.email),
    avatar: asString(account.avatar),
    account_type: asString(account.account_type),
    roles,
    permissions,
    data_scope: asString(payload.data_scope),
    visible_workbenches,
    visible_menu_items,
    // workstation_modes：仅后端有配置时才有该字段
    workstation_modes: (() => {
      const raw = payload.workstation_modes ?? account.workstation_modes
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
      const modes: Record<string, string> = {}
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof v === 'string') modes[k] = v
      }
      return Object.keys(modes).length > 0 ? modes : undefined
    })(),
  }
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    // ignored
  }
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
    return
  } catch {
    // ignored
  }
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // ignored
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignored
  }
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignored
  }
}

export function useAuthProfile(
  token: string | null,
  apiBase = '/api/v1',
): UseAuthProfileReturn {
  const [profile, setProfile] = useState<AuthProfile | null>(() => {
    const saved = safeGetItem(AUTH_PROFILE_KEY)
    const profileToken = safeGetItem(AUTH_PROFILE_TOKEN_KEY)
    if (saved && token && profileToken === token) {
      try {
        return normalizeAuthProfile(JSON.parse(saved))
      } catch {
        /* ignore */
      }
    }
    return null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState(false)

  const fetchProfile = useCallback(async () => {
    if (!token) {
      setProfile(null)
      setAuthRequired(false)
      safeRemoveItem(AUTH_PROFILE_KEY)
      safeRemoveItem(AUTH_PROFILE_TOKEN_KEY)
      return
    }

    setLoading(true)
    setError(null)
    setAuthRequired(false)
    try {
      const resp = await axios.get(`${apiBase}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const normalized = normalizeAuthProfile(resp.data)
      if (!normalized) {
        throw new Error('auth/profile 返回结构异常')
      }
      setProfile(normalized)
      safeSetItem(AUTH_PROFILE_KEY, JSON.stringify(normalized))
      safeSetItem(AUTH_PROFILE_TOKEN_KEY, token)
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined
      const backendMsg =
        axios.isAxiosError(err) && err.response?.data && typeof err.response.data === 'object'
          ? ((err.response.data as { msg?: string; message?: string }).msg
            || (err.response.data as { msg?: string; message?: string }).message
            || '')
          : ''
      // 仅将 401 视为「需重新登录」。403 可能是网关/中间层策略，不应与 profile 的 401 混为一谈（否则会误触发 logout）
      const isAuthError = status === 401
      const msg = isAuthError
        ? (backendMsg || '未授权，请重新登录')
        : (err instanceof Error ? err.message : '获取用户权限失败')
      setError(msg)
      if (isAuthError) {
        setAuthRequired(true)
        setProfile(null)
        safeRemoveItem(AUTH_PROFILE_KEY)
        safeRemoveItem(AUTH_PROFILE_TOKEN_KEY)
        return
      }
      // 保留旧的 profile（离线容错）
    } finally {
      setLoading(false)
    }
  }, [token, apiBase])

  useEffect(() => {
    if (token) {
      fetchProfile()
    } else {
      setProfile(null)
      setAuthRequired(false)
      safeRemoveItem(AUTH_PROFILE_KEY)
      safeRemoveItem(AUTH_PROFILE_TOKEN_KEY)
    }
  }, [token, fetchProfile])

  // 权限集合（缓存）
  const permissionSet = useMemo(
    () => new Set(profile?.permissions || []),
    [profile?.permissions],
  )

  const roleNameSet = useMemo(
    () => new Set((profile?.roles || []).map(r => r.name)),
    [profile?.roles],
  )

  const workbenchSet = useMemo(
    () => new Set(profile?.visible_workbenches || []),
    [profile?.visible_workbenches],
  )

  const isAdmin = useMemo(
    () => permissionSet.has('*'),
    [permissionSet],
  )

  // 权限检查：支持通配符
  const hasPermission = useCallback((code: string): boolean => {
    if (permissionSet.has('*')) return true
    if (permissionSet.has(code)) return true

    // 通配符检查
    const parts = code.split('.')
    for (let i = parts.length; i > 0; i--) {
      const wildcard = parts.slice(0, i).join('.') + '.*'
      if (permissionSet.has(wildcard)) return true
    }
    return false
  }, [permissionSet])

  const hasAnyPermission = useCallback(
    (codes: string[]) => codes.some(c => hasPermission(c)),
    [hasPermission],
  )

  const hasAllPermissions = useCallback(
    (codes: string[]) => codes.every(c => hasPermission(c)),
    [hasPermission],
  )

  const hasRole = useCallback(
    (name: string) => roleNameSet.has(name),
    [roleNameSet],
  )

  const hasAnyRole = useCallback(
    (names: string[]) => names.some(n => roleNameSet.has(n)),
    [roleNameSet],
  )

  const canAccessWorkbench = useCallback(
    (wb: string) => workbenchSet.has(wb),
    [workbenchSet],
  )

  const isMenuVisible = useCallback(
    (workbench: string, menuKey: string): boolean => {
      const menus = profile?.visible_menu_items?.[workbench]
      if (!menus) return false
      const normalized = normalizeMenuKey(menuKey, workbench)
      return menus.some((menu) => normalizeMenuKey(menu, workbench) === normalized)
    },
    [profile?.visible_menu_items],
  )

  return {
    profile,
    loading,
    error,
    authRequired,
    refetch: fetchProfile,
    isAdmin,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    hasAnyRole,
    canAccessWorkbench,
    isMenuVisible,
  }
}
