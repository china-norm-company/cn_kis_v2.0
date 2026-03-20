/**
 * 数字员工中心管理页无权限统一展示
 * 用于 Skills、Workflows、Matrix、AgentDirectory 等需 dashboard.admin.manage 的页面
 */
import { Empty } from '@cn-kis/ui-kit'
import { Shield } from 'lucide-react'

export function AdminNoPermission() {
  return (
    <div data-testid="admin-no-permission" className="flex min-h-[280px] items-center justify-center">
      <Empty
        icon={<Shield className="h-16 w-16 text-slate-300" />}
        title="无权限"
        description="您没有数字员工中心管理权限，无法查看此页面。如需开通请联系管理员。"
      />
    </div>
  )
}
