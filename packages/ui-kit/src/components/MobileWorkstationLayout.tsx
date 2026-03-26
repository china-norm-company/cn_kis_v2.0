import { type ComponentType, type ReactNode, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import { Menu, X, LogOut } from 'lucide-react'

export interface MobileWorkstationNavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  indent?: boolean
}

/** 桌面侧栏分组；移动端仍使用扁平 navItems（可由 navGroups 拍平后传入） */
export interface MobileWorkstationNavGroup {
  label: string
  items: MobileWorkstationNavItem[]
}

export interface MobileWorkstationLayoutProps {
  title: string
  logoText: string
  logoClassName?: string
  navItems: MobileWorkstationNavItem[]
  /** 有值时桌面侧栏按分组渲染；移动端底部栏与抽屉仍用 navItems */
  navGroups?: MobileWorkstationNavGroup[]
  children: ReactNode
  userName?: string
  userAvatar?: string
  onLogout?: () => void
  appName?: string
  contentClassName?: string
  headerExtra?: ReactNode
  sidebarFooter?: ReactNode
  mobilePrimaryNavItems?: MobileWorkstationNavItem[]
}

function NavigationList({
  items,
  onNavigate,
}: {
  items: MobileWorkstationNavItem[]
  onNavigate?: () => void
}) {
  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              item.indent && 'ml-5 text-[13px]',
              isActive
                ? 'bg-primary-50 text-primary-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
            )
          }
        >
          <item.icon className="h-5 w-5" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function NavigationGroupedList({
  groups,
  onNavigate,
}: {
  groups: MobileWorkstationNavGroup[]
  onNavigate?: () => void
}) {
  return (
    <div className="flex flex-col gap-4 px-3 py-4">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {group.label}
          </div>
          <nav className="flex flex-col gap-1">
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    item.indent && 'ml-5 text-[13px]',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      ))}
    </div>
  )
}

function UserIdentity({ userName, userAvatar }: { userName?: string; userAvatar?: string }) {
  if (!userName) return null
  return (
    <div className="flex items-center gap-2">
      {userAvatar ? (
        <img src={userAvatar} alt={userName} className="h-7 w-7 rounded-full" />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
          {userName.charAt(0)}
        </div>
      )}
      <span className="max-w-[7rem] truncate text-sm text-slate-600 md:max-w-none">{userName}</span>
    </div>
  )
}

export function MobileWorkstationLayout({
  title,
  logoText,
  logoClassName = 'bg-primary-600',
  navItems,
  navGroups,
  children,
  userName,
  userAvatar,
  onLogout,
  appName = 'CN KIS',
  contentClassName,
  headerExtra,
  sidebarFooter,
  mobilePrimaryNavItems,
}: MobileWorkstationLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const hasNav = navItems.length > 0
  const desktopNavGroups =
    navGroups?.length && navGroups.some((g) => g.items.length > 0) ? navGroups.filter((g) => g.items.length > 0) : null
  const primaryNavItems = useMemo(() => {
    if (mobilePrimaryNavItems?.length) return mobilePrimaryNavItems.slice(0, 5)
    return navItems.slice(0, 5)
  }, [mobilePrimaryNavItems, navItems])
  const hasBottomNav = primaryNavItems.length > 0
  const headerActions = useMemo(() => {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden sm:block">
          <UserIdentity userName={userName} userAvatar={userAvatar} />
        </div>
        {onLogout && (
          <button
            onClick={onLogout}
            className="min-h-11 min-w-11 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            title="退出登录"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }, [onLogout, userAvatar, userName])

  return (
    <div className="flex min-h-[100dvh] h-[100dvh] md:h-screen overflow-hidden bg-slate-50">
      <aside className="hidden w-56 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex h-14 items-center border-b border-slate-200 px-5">
          <div className="flex items-center gap-2">
            <div
              className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white',
                logoClassName,
              )}
            >
              {logoText}
            </div>
            <span className="text-sm font-semibold text-slate-700">{appName}</span>
          </div>
        </div>
        {desktopNavGroups ? (
          <NavigationGroupedList groups={desktopNavGroups} />
        ) : (
          <NavigationList items={navItems} />
        )}
        {sidebarFooter}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-3 pt-[env(safe-area-inset-top)] md:px-6 md:pt-0">
          <div className="flex items-center gap-2">
            {hasNav && (
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="min-h-11 min-w-11 rounded-md p-2 text-slate-600 hover:bg-slate-100 md:hidden"
                aria-label="打开导航菜单"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            <h1 className="text-sm font-semibold text-slate-800 md:text-base">{title}</h1>
          </div>
          <div className="flex items-center gap-3">
            {headerExtra}
            {headerActions}
          </div>
        </header>

        <main
          className={clsx(
            'flex flex-1 flex-col min-h-0 overflow-hidden',
            contentClassName,
          )}
        >
          <div className="flex-1 min-h-0 overflow-auto p-3 pb-[calc(0.75rem+56px+env(safe-area-inset-bottom))] md:p-6 md:pb-6">
            {children}
          </div>
        </main>
      </div>

      {hasBottomNav && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <ul className="grid h-14 grid-cols-5 gap-1">
            {primaryNavItems.map((item) => (
              <li key={item.to} className="min-w-0">
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    clsx(
                      'flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium',
                      isActive ? 'text-primary-700' : 'text-slate-500',
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {mobileMenuOpen && hasNav && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <button
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="关闭导航菜单遮罩"
          />
          <aside className="relative h-full w-72 max-w-[85vw] border-r border-slate-200 bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4 pt-[env(safe-area-inset-top)]">
              <div className="flex items-center gap-2">
                <div
                  className={clsx(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white',
                    logoClassName,
                  )}
                >
                  {logoText}
                </div>
                <span className="text-sm font-semibold text-slate-700">{appName}</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="min-h-11 min-w-11 rounded-md p-2 text-slate-600 hover:bg-slate-100"
                aria-label="关闭导航菜单"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b border-slate-100 px-4 py-3">
              <UserIdentity userName={userName} userAvatar={userAvatar} />
            </div>
            <NavigationList items={navItems} onNavigate={() => setMobileMenuOpen(false)} />
            <div className="pb-[env(safe-area-inset-bottom)]" />
          </aside>
        </div>
      )}
    </div>
  )
}
