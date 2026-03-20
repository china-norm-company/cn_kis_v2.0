import { useFeishuContext } from '@cn-kis/feishu-sdk'
import { canAccessPerformanceSettlement } from '../permissions/performanceSettlementAccess'

/**
 * 绩效结算页面
 * 结项管理 → 绩效结算
 * 方案 A：通过 iframe 嵌入 Master 绩效台完整界面
 * 本地开发：http://localhost:3019（绩效台独立端口，避免与质量台 3003 冲突）
 * 生产环境：同域 /perf-master（由 Nginx 提供静态服务）
 */
const PERF_MASTER_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3019'
  : `${window.location.origin}/perf-master`

export default function PerformanceSettlementPage() {
  const ctx = useFeishuContext()
  const allowed = canAccessPerformanceSettlement(ctx)

  if (!allowed) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="max-w-xl w-full rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <h2 className="text-lg font-semibold">无权限访问绩效结算</h2>
          <p className="mt-2 text-sm leading-6">
            当前账号不在绩效结算白名单内。如需开通，请联系管理员在权限管理中配置账号权限。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-3 flex-shrink-0">
        <h2 className="text-xl font-bold text-slate-800">绩效结算</h2>
        <p className="mt-1 text-sm text-slate-500">管理项目结项后的绩效结算与分配</p>
      </div>
      <div className="flex-1 px-4 pb-4 min-h-0">
        <iframe
          src={PERF_MASTER_URL}
          title="Master 绩效台"
          className="w-full h-full rounded-xl border border-slate-200 bg-white"
          style={{ minHeight: '80vh' }}
          allowFullScreen
        />
      </div>
    </div>
  )
}
