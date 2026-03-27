import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { LayoutDashboard, QrCode, Calendar, BookOpen, TrendingUp, ClipboardList, Microscope, AlertTriangle, History, User, Settings, Gauge } from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('evaluator')

const navItems = [
  { path: '/dashboard', label: '工作面板', icon: LayoutDashboard, permissions: ['workorder.workorder.read'] },
  { path: '/workorders', label: '我的工单', icon: ClipboardList, permissions: ['workorder.workorder.read'] },
  { path: '/scan', label: '扫码执行', icon: QrCode, permissions: ['workorder.workorder.read'] },
  { path: '/instrument-measure', label: '仪器测量', icon: Gauge, permissions: ['workorder.workorder.read'] },
  { path: '/schedule', label: '我的排程', icon: Calendar, permissions: [] },
  { path: '/detections', label: '检测记录', icon: Microscope, permissions: ['workorder.workorder.read'] },
  { path: '/exceptions', label: '异常管理', icon: AlertTriangle, permissions: ['workorder.workorder.read'] },
  { path: '/history', label: '执行历史', icon: History, permissions: ['workorder.workorder.read'] },
  { path: '/knowledge', label: '知识库', icon: BookOpen, permissions: [] },
  { path: '/growth', label: '我的成长', icon: TrendingUp, permissions: [] },
  { path: '/profile', label: '个人档案', icon: User, permissions: [] },
  { path: '/settings', label: '设置', icon: Settings, permissions: [] },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('evaluator')

  if (mode === 'blank') return []

  return navItems.flatMap((item) => {
    if (mode === 'pilot') {
      const pilotMenus = ctx.profile?.visible_menu_items?.['evaluator'] ?? []
      const menuKey = item.path.replace(/^\//, '')
      if (!pilotMenus.includes(menuKey)) return []
    }
    if (!ctx.canSeeMenu('evaluator', item.path.replace(/^\//, ''), item.permissions)) return []
    return [{ to: item.path, label: item.label, icon: item.icon }]
  })
}

function WorkstationPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50 text-slate-500">
      <div className="text-5xl mb-4">🔧</div>
      <h2 className="text-xl font-semibold text-slate-700 mb-2">功能建设中</h2>
      <p className="text-sm text-slate-400 text-center max-w-xs">
        该工作台正在为您定制专属功能，即将开放，敬请期待。
      </p>
    </div>
  )
}

function LayoutContent() {
  const { user, logout, getWorkstationMode } = useFeishuContext()
  const visibleItems = useVisibleNavItems()
  if (getWorkstationMode('evaluator') === 'blank') return <WorkstationPlaceholder />
  return (
    <MobileWorkstationLayout
      title="衡技·评估台"
      logoText="评"
      logoClassName="bg-indigo-600"
      navItems={visibleItems}
      mobilePrimaryNavItems={visibleItems.slice(0, 5)}
      userName={user?.name}
      userAvatar={user?.avatar}
      onLogout={logout}
    >
      <Outlet />
    </MobileWorkstationLayout>
  )
}

function EvaluatorLoginFallback() {
  const { login } = useFeishuContext()
  const [devLoading, setDevLoading] = useState(false)
  const [devError, setDevError] = useState<string | null>(null)
  const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost'

  const handleDevLogin = async () => {
    setDevError(null)
    setDevLoading(true)
    try {
      const base = (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ?? '/api/v1'
      const res = await fetch(`${base}/auth/dev-login`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.msg ?? json?.message ?? `HTTP ${res.status}`)
      }
      const token = json?.access_token
      const user = json?.user
      if (!token || !user) throw new Error('登录响应异常')
      const normalizedUser = {
        id: user.id,
        name: user.name ?? user.display_name ?? user.username ?? '开发用户',
        email: user.email ?? '',
        avatar: user.avatar ?? '',
        department: '',
      }
      try {
        localStorage.setItem('auth_token', token)
        localStorage.setItem('auth_user', JSON.stringify(normalizedUser))
        localStorage.setItem('auth_token_ts', String(Date.now()))
        if (Array.isArray(json.roles)) {
          localStorage.setItem('auth_roles', JSON.stringify(json.roles))
        }
        if (Array.isArray(json.visible_workbenches)) {
          localStorage.setItem('auth_workbenches', JSON.stringify(json.visible_workbenches))
        }
      } catch {
        // ignore storage errors
      }
      window.location.reload()
    } catch (e) {
      setDevError(e instanceof Error ? e.message : '开发登录失败')
    } finally {
      setDevLoading(false)
    }
  }

  return (
    <LoginFallback title="衡技·评估台" onLogin={login}>
      {isLocalhost && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleDevLogin}
            disabled={devLoading}
            style={{
              padding: '10px 24px',
              background: devLoading ? '#94a3b8' : '#64748b',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              cursor: devLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {devLoading ? '登录中…' : '开发模式登录'}
          </button>
          {devError && <span style={{ fontSize: 13, color: '#ef4444' }}>{devError}</span>}
        </div>
      )}
    </LoginFallback>
  )
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex items-center justify-center h-screen text-slate-500">正在加载衡技·评估台...</div>}
      loginFallback={<EvaluatorLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
