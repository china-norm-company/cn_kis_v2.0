import { Outlet } from 'react-router-dom'
import { LayoutDashboard, Package, Beaker, Warehouse, ArrowRightLeft, AlertTriangle, FlaskConical, ClipboardCheck, PackageCheck, Layers, Trash2, Archive, ClipboardList, FolderTree, Thermometer, ShieldCheck, ScanLine, PackageOpen, Calendar, Link2 } from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('material')

const navItems = [
  { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard, permissions: ['resource.material.read'] },
  { path: '/schedule', label: '我的排程', icon: Calendar, permissions: ['scheduling.plan.read'] },
  { path: '/scan-issue', label: '扫码出库', icon: ScanLine, permissions: ['resource.inventory.write'] },
  { path: '/products', label: '产品台账', icon: Package, permissions: ['resource.material.read'] },
  { path: '/project-sample-links', label: '项目样品关联', icon: Link2, permissions: ['resource.material.read'] },
  { path: '/consumables', label: '耗材管理', icon: Beaker, permissions: ['resource.material.read'] },
  { path: '/inventory', label: '库存管理', icon: Warehouse, permissions: ['resource.inventory.read'] },
  { path: '/transactions', label: '出入库流水', icon: ArrowRightLeft, permissions: ['resource.inventory.write'] },
  { path: '/expiry-alerts', label: '效期预警', icon: AlertTriangle, permissions: ['resource.material.read'] },
  { path: '/samples', label: '样品管理', icon: FlaskConical, permissions: ['resource.sample.read'] },
  { path: '/sample-distribution', label: '样品发放', icon: PackageOpen, permissions: ['resource.material.read'] },
  { path: '/receipts', label: '样品接收', icon: ClipboardCheck, permissions: ['resource.material.read'] },
  { path: '/batches', label: '批次管理', icon: Layers, permissions: ['resource.material.read'] },
  { path: '/kits', label: '套件与分发', icon: PackageCheck, permissions: ['resource.material.read'] },
  { path: '/destructions', label: '销毁审批', icon: Trash2, permissions: ['resource.material.write'] },
  { path: '/retention', label: '留样管理', icon: Archive, permissions: ['resource.sample.read'] },
  { path: '/inventory-execution', label: '盘点执行', icon: ClipboardList, permissions: ['resource.inventory.write'] },
  { path: '/storage-hierarchy', label: '库位管理', icon: FolderTree, permissions: ['resource.material.read'] },
  { path: '/temperature', label: '温湿度监控', icon: Thermometer, permissions: ['resource.material.read'] },
  { path: '/compliance', label: '依从性管理', icon: ShieldCheck, permissions: ['resource.material.read'] },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('material')

  if (mode === 'blank') return []

  return navItems.flatMap((item) => {
    if (mode === 'pilot') {
      const pilotMenus = ctx.profile?.visible_menu_items?.['material'] ?? []
      const menuKey = item.path.replace(/^\//, '')
      if (!pilotMenus.includes(menuKey)) return []
    }
    if (!ctx.canSeeMenu('material', item.path.replace(/^\//, ''), item.permissions)) return []
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
  if (getWorkstationMode('material') === 'blank') return <WorkstationPlaceholder />
  return (
    <MobileWorkstationLayout
      title="度支·物料台"
      logoText="料"
      logoClassName="bg-amber-600"
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

function MaterialLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="度支·物料台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex items-center justify-center h-screen text-slate-500">正在加载度支·物料台...</div>}
      loginFallback={<MaterialLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
