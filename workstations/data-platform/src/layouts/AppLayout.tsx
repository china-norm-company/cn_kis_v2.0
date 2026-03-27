import { Outlet } from 'react-router-dom'
import {
  createWorkstationFeishuConfig,
  FeishuAuthProvider,
  LoginFallback,
  useFeishuContext,
} from '@cn-kis/feishu-sdk'
import { Database } from 'lucide-react'
import { MobileWorkstationLayout } from '@cn-kis/ui-kit'
import { useApiInit } from '@/hooks/useApiInit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('data-platform')

function ApiClientInit() {
  const { logout } = useFeishuContext()
  useApiInit({ onUnauthorized: logout })
  return null
}

const navItems = [{ to: '/', label: '概览', icon: Database }]

function LayoutContent() {
  const { user, logout } = useFeishuContext()
  return (
    <MobileWorkstationLayout
      title="洞明·数据台"
      logoText="洞"
      logoClassName="bg-indigo-600"
      navItems={navItems}
      mobilePrimaryNavItems={navItems}
      userName={user?.name}
      userAvatar={user?.avatar}
      onLogout={logout}
    >
      <Outlet />
    </MobileWorkstationLayout>
  )
}

function DataPlatformLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="洞明·数据台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={(
        <div className="flex h-screen items-center justify-center text-slate-500">
          正在加载洞明·数据台…
        </div>
      )}
      loginFallback={<DataPlatformLoginFallback />}
    >
      <ApiClientInit />
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
