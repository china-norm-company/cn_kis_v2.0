import { Navigate } from 'react-router-dom'
import { useFeishuContext } from '@cn-kis/feishu-sdk'
import { getDefaultFinanceLandingPath } from '../navigation/financeNavConfig'

/**
 * 财务台根路径 `#/` 重定向：与侧栏首个可见菜单一致（有仪表板权则 /dashboard，否则如 /invoices）。
 */
export function FinanceHomeRedirect() {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('finance')
  const to = getDefaultFinanceLandingPath(mode, ctx.profile, ctx.canSeeMenu)
  return <Navigate to={to} replace />
}
