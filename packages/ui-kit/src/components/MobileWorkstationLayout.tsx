import { type ComponentType, type ReactNode, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { Menu, X, LogOut, ChevronDown, ChevronRight } from 'lucide-react'

export interface MobileWorkstationNavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  indent?: boolean
}

export interface MobileWorkstationNavSection {
  title: string
  items: MobileWorkstationNavItem[]
}

export interface MobileWorkstationLayoutProps {
  title: string
  logoText: string
  logoClassName?: string
  navItems: MobileWorkstationNavItem[]
  navSections?: MobileWorkstationNavSection[]
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
          end
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              item.indent && 'ml-5 text-[13px]',
              isActive
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/35 dark:text-primary-300'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
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

function SectionedNavigationList({
  sections,
  onNavigate,
}: {
  sections: MobileWorkstationNavSection[]
  onNavigate?: () => void
}) {
  const location = useLocation()

  // 初始化：当前路由所在的分组默认展开，其余收起
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const defaultOpen = new Set<string>()
    for (const section of sections) {
      const isActive = section.items.some((item) =>
        location.hash ? location.hash.replace('#', '') === item.to : location.pathname === item.to,
      )
      if (isActive) defaultOpen.add(section.title)
    }
    // 若没有匹配（如首次加载），展开第一个分组
    if (defaultOpen.size === 0 && sections.length > 0) defaultOpen.add(sections[0].title)
    return defaultOpen
  })

  const toggleSection = (title: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(title)) {
        next.delete(title)
      } else {
        next.add(title)
      }
      return next
    })
  }

  return (
    <nav className="flex flex-col px-3 py-3">
      {sections.map((section) => {
        const isOpen = openSections.has(section.title)
        const hasActiveChild = section.items.some((item) => {
          const hash = location.hash.replace('#', '')
          return hash ? hash === item.to || hash.startsWith(item.to + '/') : false
        })

        return (
          <div key={section.title} className="mb-1">
            {/* 一级菜单：分组标题 */}
            <button
              onClick={() => toggleSection(section.title)}
              className={clsx(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors',
                hasActiveChild
                  ? 'bg-primary-50/60 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200',
              )}
            >
              <span>{section.title}</span>
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 opacity-60" />
              )}
            </button>

            {/* 二级菜单：子菜单项 */}
            {isOpen && (
              <div className="mt-0.5 flex flex-col gap-0.5 pl-2">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        item.indent && 'ml-4 text-[13px]',
                        isActive
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/35 dark:text-primary-300'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

function UserIdentity({ userName, userAvatar }: { userName?: string; userAvatar?: string }) {
  if (!userName) return null
  return (
    <div className="flex items-center gap-2">
      {userAvatar ? (
        <img src={userAvatar} alt={userName} className="h-7 w-7 rounded-full" />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/50 dark:text-primary-200">
          {userName.charAt(0)}
        </div>
      )}
      <span className="max-w-[7rem] truncate text-sm text-slate-600 dark:text-slate-200 md:max-w-none">{userName}</span>
    </div>
  )
}

export function MobileWorkstationLayout({
  title,
  logoText,
  logoClassName = 'bg-primary-600',
  navItems,
  navSections,
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
  const hasNav = navItems.length > 0 || (navSections?.length ?? 0) > 0
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
            className="min-h-11 min-w-11 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            title="退出登录"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }, [onLogout, userAvatar, userName])

  const sidebarNav = navSections?.length ? (
    <SectionedNavigationList sections={navSections} />
  ) : (
    <NavigationList items={navItems} />
  )

  const mobileSidebarNav = navSections?.length ? (
    <SectionedNavigationList sections={navSections} onNavigate={() => setMobileMenuOpen(false)} />
  ) : (
    <NavigationList items={navItems} onNavigate={() => setMobileMenuOpen(false)} />
  )

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] overflow-hidden bg-slate-50 dark:bg-slate-900 md:h-screen">
      <aside className="hidden h-full min-h-0 w-56 flex-shrink-0 flex-col border-r border-slate-200 bg-white dark:border-[#3b434e] dark:bg-slate-800 md:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-slate-200 px-5 dark:border-[#3b434e]">
          <div className="flex items-center gap-2">
            <div
              className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white',
                logoClassName,
              )}
            >
              {logoText}
            </div>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{appName}</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sidebarNav}
        </div>
        {sidebarFooter ? (
          <div className="shrink-0 border-t border-slate-100 dark:border-[#3b434e]">{sidebarFooter}</div>
        ) : null}
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-3 pt-[env(safe-area-inset-top)] dark:border-slate-700/80 dark:bg-slate-800 md:px-6 md:pt-0">
          <div className="flex items-center gap-2">
            {hasNav && (
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="min-h-11 min-w-11 rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 md:hidden"
                aria-label="打开导航菜单"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            <h1 className="text-sm font-semibold text-slate-800 dark:text-slate-100 md:text-base">{title}</h1>
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
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-[#3b434e] dark:bg-slate-800/95 md:hidden">
          <ul className="grid h-14 grid-cols-5 gap-1">
            {primaryNavItems.map((item) => (
              <li key={item.to} className="min-w-0">
                <NavLink
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    clsx(
                      'flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium',
                      isActive
                        ? 'text-primary-700 dark:text-primary-400'
                        : 'text-slate-500 dark:text-slate-400',
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
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-xl dark:border-[#3b434e] dark:bg-slate-800">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4 pt-[env(safe-area-inset-top)] dark:border-[#3b434e]">
              <div className="flex items-center gap-2">
                <div
                  className={clsx(
                    'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white',
                    logoClassName,
                  )}
                >
                  {logoText}
                </div>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{appName}</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="min-h-11 min-w-11 rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                aria-label="关闭导航菜单"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="shrink-0 border-b border-slate-100 px-4 py-3 dark:border-[#3b434e]">
              <UserIdentity userName={userName} userAvatar={userAvatar} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {mobileSidebarNav}
            </div>
            <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />
          </aside>
        </div>
      )}
    </div>
  )
}
