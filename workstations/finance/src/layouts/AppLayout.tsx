import { Outlet } from 'react-router-dom'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'
import { financeNavGroups } from '../navigation/financeNavConfig'

const FEISHU_CONFIG = createWorkstationFeishuConfig('finance')

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('finance')

  if (mode === 'blank') return []

  return financeNavGroups.flatMap((group) =>
    group.items
      .filter((item) => {
        if (mode === 'pilot') {
          const pilotMenus = ctx.profile?.visible_menu_items?.['finance'] ?? []
          const menuKey = item.path.replace(/^\//, '')
          return pilotMenus.includes(menuKey)
        }
        return ctx.canSeeMenu('finance', item.path.replace(/^\//, ''), item.permissions)
      })
      .map((item) => ({ to: item.path, label: item.label, icon: item.icon })),
  )
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
  const { user, logout } = useFeishuContext()
  const visibleItems = useVisibleNavItems()
  const mode = useFeishuContext().getWorkstationMode('finance')

  if (mode === 'blank') {
    return <WorkstationPlaceholder />
  }

  return (
    <MobileWorkstationLayout
      title="管仲·财务台"
      logoText="仲"
      logoClassName="bg-primary-600"
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

function FinanceLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="管仲·财务台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex items-center justify-center h-screen text-slate-500">正在加载管仲·财务台...</div>}
      loginFallback={<FinanceLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
