/**
 * 飞书认证 React Context Provider
 *
 * 包装整个工作台应用，提供认证状态 + 权限画像。
 * 登录后自动从 /auth/profile 获取角色、权限、可见工作台信息。
 *
 * 增强：错误降级 UI、全局错误监听
 */
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useFeishuAuth } from './hooks/useFeishuAuth'
import { useAuthProfile, type AuthProfile } from './hooks/useAuthProfile'
import type { FeishuAuthConfig, FeishuUser, AuthErrorType } from './auth'

interface FeishuContextValue {
  user: FeishuUser | null
  token: string | null
  loading: boolean
  error: string | null
  errorType: AuthErrorType | null
  login: () => void
  logout: () => void
  isAuthenticated: boolean
  profile: AuthProfile | null
  profileLoading: boolean
  refetchProfile: () => void
  isAdmin: boolean
  hasPermission: (code: string) => boolean
  hasAnyPermission: (codes: string[]) => boolean
  hasAllPermissions: (codes: string[]) => boolean
  hasRole: (name: string) => boolean
  hasAnyRole: (names: string[]) => boolean
  canAccessWorkbench: (wb: string) => boolean
  isMenuVisible: (workbench: string, menuKey: string) => boolean
  canSeeMenu: (workbench: string, menuKey: string, permissions?: string[]) => boolean
  /**
   * 获取指定工作台的模式配置
   * 返回 'blank' | 'pilot' | 'full'，无配置时默认返回 'full'
   */
  getWorkstationMode: (workstation: string) => string
}

const FeishuContext = createContext<FeishuContextValue | null>(null)

interface FeishuAuthProviderProps {
  config: FeishuAuthConfig
  children: ReactNode
  loginFallback?: ReactNode
  loadingFallback?: ReactNode
}

const alwaysTrue = () => true

/**
 * 开发环境认证旁路
 */
const DEV_BYPASS =
  typeof import.meta !== 'undefined' &&
  (import.meta as any).env?.VITE_DEV_AUTH_BYPASS === '1'

const DEV_MOCK_USER: FeishuUser = {
  id: 0,
  name: '开发测试用户',
  email: 'dev@cnkis.local',
  avatar: '',
}

function isAuthDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('cnkis_auth_debug') === '1') return true
    if (window.location.hash.includes('?')) {
      const hashQuery = window.location.hash.split('?')[1] || ''
      const hashParams = new URLSearchParams(hashQuery)
      if (hashParams.get('cnkis_auth_debug') === '1') return true
    }
  } catch {
    // ignore
  }
  try {
    if ((window as any).__CNKIS_AUTH_DEBUG__ === true) return true
  } catch {
    // ignore
  }
  try {
    return localStorage.getItem('cnkis_auth_debug') === '1'
  } catch {
    return false
  }
}

function workstationModeFromProfile(
  profile: AuthProfile | null | undefined,
  workstation: string,
): string {
  const modes = profile?.workstation_modes
  if (!modes) return 'full'
  return modes[workstation] ?? 'full'
}

type AuthProfileHookReturn = ReturnType<typeof useAuthProfile>

function canSeeMenuFromProfile(
  authProfile: AuthProfileHookReturn,
  workbench: string,
  menuKey: string,
  permissions: string[] = [],
): boolean {
  if (authProfile.loading || !authProfile.profile) return true
  const wbMenus = authProfile.profile.visible_menu_items?.[workbench] || []
  const hasWorkbenchMenuConfig = Object.prototype.hasOwnProperty.call(
    authProfile.profile.visible_menu_items || {},
    workbench,
  )
  const hasProfileSignals =
    wbMenus.length > 0
    || (authProfile.profile.permissions?.length || 0) > 0
  if (!hasProfileSignals) return true
  if (!hasWorkbenchMenuConfig) return true
  if (authProfile.isMenuVisible(workbench, menuKey)) return true
  if (!wbMenus.length && permissions.length && !authProfile.hasAnyPermission(permissions)) return false
  if (!permissions.length) return true
  const allowed = authProfile.hasAnyPermission(permissions)
  if (!allowed && isAuthDebugEnabled()) {
    console.warn('[CNKIS auth] menu denied', {
      workbench,
      menuKey,
      permissions,
      wbMenus,
      profilePermissionsCount: authProfile.profile.permissions?.length || 0,
      roleNames: (authProfile.profile.roles || []).map((role) => role.name),
      username: authProfile.profile.username,
    })
  }
  return allowed
}

/** 从门户页接收 token 的 postMessage 类型（跨工作台同源/同主机免二次登录） */
const CNKIS_PORTAL_READY = 'cnkis_portal_ready'
const CNKIS_TOKEN_HANDOFF = 'cnkis_token_handoff'

export function FeishuAuthProvider({
  config,
  children,
  loginFallback,
  loadingFallback,
}: FeishuAuthProviderProps) {
  const auth = useFeishuAuth(config)
  const authProfile = useAuthProfile(auth.token, config.apiBaseUrl || '/api/v1')

  // 从秘书台门户打开时：若本页无 token 且由门户打开，向 opener 请求 token 并写入本地，避免重复登录
  useEffect(() => {
    if (typeof window === 'undefined' || !window.opener) return
    if (localStorage.getItem('auth_token')) return
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== CNKIS_TOKEN_HANDOFF) return
      try {
        if (new URL(e.origin).hostname !== window.location.hostname) return
      } catch {
        return
      }
      const { token, tokenTs, authUser } = e.data
      if (token) {
        try {
          localStorage.setItem('auth_token', token)
          if (tokenTs) localStorage.setItem('auth_token_ts', String(tokenTs))
          if (authUser) localStorage.setItem('auth_user', authUser)
        } catch {}
        window.removeEventListener('message', handler)
        window.location.reload()
      }
    }
    window.addEventListener('message', handler)
    try {
      window.opener.postMessage({ type: CNKIS_PORTAL_READY }, '*')
    } catch {}
    return () => window.removeEventListener('message', handler)
  }, [])

  useEffect(() => {
    if (DEV_BYPASS) return
    if (auth.isAuthenticated && authProfile.authRequired) {
      auth.logout()
    }
  }, [auth.isAuthenticated, auth.logout, authProfile.authRequired])

  // Global error listeners for logging
  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      try {
        const payload = {
          workstation: window.location.pathname.split('/')[1] || 'unknown',
          error_type: 'unhandled_rejection',
          message: event.reason?.message || String(event.reason),
          stack: event.reason?.stack?.slice(0, 2000),
        }
        navigator.sendBeacon?.('/api/v1/log/frontend-error', JSON.stringify(payload))
      } catch { /* best-effort */ }
    }
    const onGlobalError = (event: ErrorEvent) => {
      try {
        const payload = {
          workstation: window.location.pathname.split('/')[1] || 'unknown',
          error_type: 'global_error',
          message: event.message,
          stack: event.error?.stack?.slice(0, 2000),
        }
        navigator.sendBeacon?.('/api/v1/log/frontend-error', JSON.stringify(payload))
      } catch { /* best-effort */ }
    }

    window.addEventListener('unhandledrejection', onUnhandledRejection)
    window.addEventListener('error', onGlobalError)
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
      window.removeEventListener('error', onGlobalError)
    }
  }, [])

  if (DEV_BYPASS) {
    // 把 dev-bypass-token 写入 localStorage，让 api-client 的 getToken 能读到
    try {
      if (!localStorage.getItem('auth_token')) {
        localStorage.setItem('auth_token', 'dev-bypass-token')
        localStorage.setItem('auth_token_ts', String(Date.now()))
        localStorage.setItem('auth_user', JSON.stringify({ id: 0, name: '开发测试用户', email: 'dev@cnkis.local', avatar: '' }))
      }
    } catch { /* ignore */ }

    const p = authProfile.profile
    const fromBackendAccount = Boolean(p && p.id > 0)
    const devDisplayUser: FeishuUser = p
      ? {
          id: p.id,
          name: (p.display_name || p.username || DEV_MOCK_USER.name).trim() || DEV_MOCK_USER.name,
          email: p.email || DEV_MOCK_USER.email,
          avatar: p.avatar || '',
        }
      : DEV_MOCK_USER

    try {
      if (fromBackendAccount && p) {
        localStorage.setItem(
          'auth_user',
          JSON.stringify({
            id: p.id,
            name: devDisplayUser.name,
            email: devDisplayUser.email,
            avatar: devDisplayUser.avatar,
          }),
        )
      }
    } catch { /* ignore */ }

    const devValue: FeishuContextValue = {
      user: devDisplayUser,
      token: 'dev-bypass-token',
      loading: false,
      error: null,
      errorType: null,
      login: () => {},
      logout: () => {},
      isAuthenticated: true,
      profile: p,
      profileLoading: authProfile.loading,
      refetchProfile: authProfile.refetch,
      isAdmin: fromBackendAccount ? authProfile.isAdmin : true,
      hasPermission: fromBackendAccount ? authProfile.hasPermission : alwaysTrue,
      hasAnyPermission: fromBackendAccount ? authProfile.hasAnyPermission : alwaysTrue,
      hasAllPermissions: fromBackendAccount ? authProfile.hasAllPermissions : alwaysTrue,
      hasRole: fromBackendAccount ? authProfile.hasRole : alwaysTrue,
      hasAnyRole: fromBackendAccount ? authProfile.hasAnyRole : alwaysTrue,
      canAccessWorkbench: fromBackendAccount ? authProfile.canAccessWorkbench : alwaysTrue,
      isMenuVisible: fromBackendAccount ? authProfile.isMenuVisible : alwaysTrue,
      canSeeMenu: fromBackendAccount
        ? (wb, key, perms) => canSeeMenuFromProfile(authProfile, wb, key, perms)
        : () => true,
      getWorkstationMode: (ws) => workstationModeFromProfile(p, ws),
    }
    return (
      <FeishuContext.Provider value={devValue}>
        {children}
      </FeishuContext.Provider>
    )
  }

  const contextValue: FeishuContextValue = {
    ...auth,
    profile: authProfile.profile,
    profileLoading: authProfile.loading,
    refetchProfile: authProfile.refetch,
    isAdmin: authProfile.hasAnyRole(['admin', 'superadmin']),
    hasPermission: authProfile.hasPermission,
    hasAnyPermission: authProfile.hasAnyPermission,
    hasAllPermissions: authProfile.hasAllPermissions,
    hasRole: authProfile.hasRole,
    hasAnyRole: authProfile.hasAnyRole,
    canAccessWorkbench: authProfile.canAccessWorkbench,
    isMenuVisible: authProfile.isMenuVisible,
    getWorkstationMode: (workstation: string): string =>
      workstationModeFromProfile(authProfile.profile, workstation),
    canSeeMenu: (workbench: string, menuKey: string, permissions: string[] = []) =>
      canSeeMenuFromProfile(authProfile, workbench, menuKey, permissions),
  }

  // 仅在 profile 加载成功后再渲染主内容，避免 ClawQuickPanel 等组件在 token 尚未被 /auth/profile 验证前抢跑请求导致 401 级联（同事登录后闪退）
  let content: ReactNode
  if (auth.loading) {
    content = loadingFallback || <DefaultLoading />
  } else if (auth.error) {
    content = <ErrorFallback error={auth.error} errorType={auth.errorType} onRetry={auth.login} />
  } else if (!auth.isAuthenticated && loginFallback) {
    content = loginFallback
  } else if (authProfile.authRequired) {
    content = loadingFallback || <DefaultLoading />
  } else if (auth.isAuthenticated && (!authProfile.profile) && authProfile.loading) {
    content = loadingFallback || <DefaultLoading />
  } else if (auth.isAuthenticated && auth.token && !authProfile.profile && !authProfile.loading) {
    content = loadingFallback || <DefaultLoading />
  } else {
    content = children
  }

  return (
    <FeishuContext.Provider value={contextValue}>
      {content}
    </FeishuContext.Provider>
  )
}

export function useFeishuContext(): FeishuContextValue {
  const ctx = useContext(FeishuContext)
  if (!ctx) {
    throw new Error('useFeishuContext 必须在 FeishuAuthProvider 内使用')
  }
  return ctx
}

function DefaultLoading() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontSize: '14px',
      color: '#64748b',
    }}>
      正在加载...
    </div>
  )
}

function ErrorFallback({ error, errorType, onRetry }: {
  error: string
  errorType: AuthErrorType | null
  onRetry: () => void
}) {
  const hint = errorType === 'network'
    ? '网络连接异常，请检查网络后重试。'
    : errorType === 'config'
    ? '应用配置异常，请联系管理员。'
    : '认证失败，请重新登录。'

  const handleClearAndRetry = () => {
    try {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      localStorage.removeItem('auth_profile')
      localStorage.removeItem('auth_roles')
      localStorage.removeItem('auth_workbenches')
      localStorage.removeItem('auth_token_ts')
      localStorage.removeItem('auth_session_meta')
      sessionStorage.removeItem('auth_token')
      sessionStorage.removeItem('auth_user')
      sessionStorage.removeItem('auth_profile')
      sessionStorage.removeItem('auth_roles')
      sessionStorage.removeItem('auth_workbenches')
      sessionStorage.removeItem('auth_token_ts')
      sessionStorage.removeItem('auth_session_meta')
    } catch { /* ignore */ }
    onRetry()
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#f8fafc',
    }}>
      <div style={{
        maxWidth: 400, padding: 32, textAlign: 'center',
        background: '#fff', borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px',
          background: errorType === 'network' ? '#fef3c7' : '#fef2f2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: errorType === 'network' ? '#d97706' : '#dc2626',
          fontSize: 22, fontWeight: 'bold',
        }}>
          {errorType === 'network' ? '!' : 'x'}
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', margin: '0 0 8px' }}>
          {errorType === 'network' ? '网络异常' : '登录失败'}
        </h3>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 8px', lineHeight: 1.6 }}>
          {hint}
        </p>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 20px', wordBreak: 'break-all' }}>
          {error}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={() => window.location.reload()} style={{
            padding: '8px 18px', borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#fff', color: '#334155', fontSize: 13,
            fontWeight: 500, cursor: 'pointer',
          }}>
            刷新页面
          </button>
          <button onClick={handleClearAndRetry} style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            background: '#3b82f6', color: '#fff', fontSize: 13,
            fontWeight: 500, cursor: 'pointer',
          }}>
            重新登录
          </button>
        </div>
      </div>
    </div>
  )
}
