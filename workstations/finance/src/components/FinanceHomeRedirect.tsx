import { Navigate } from 'react-router-dom'
import { useFeishuContext } from '@cn-kis/feishu-sdk'
import { getDefaultFinanceLandingPath } from '../navigation/financeNavConfig'

/**
 * 财务台根路径 `#/` 重定向：与侧栏首个可见菜单一致（有仪表板权则 /dashboard，否则如 /invoices）。
 */
export function FinanceHomeRedirect() {
  const ctx = useFeishuContext()
  // 等画像加载完成再算默认落地页，避免在 canSeeMenu 仍「宽判」时跳到仪表板并立刻打 /finance/dashboard 引发竞态或 403
  if (ctx.profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-slate-500 text-sm">
        正在加载权限…
      </div>
    )
  }
  const mode = ctx.getWorkstationMode('finance')
  const to = getDefaultFinanceLandingPath(mode, ctx.profile, ctx.canSeeMenu)
  return <Navigate to={to} replace />
}
