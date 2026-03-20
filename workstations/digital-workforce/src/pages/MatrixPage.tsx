/**
 * Phase 2：工作台绑定矩阵 — 15 工作台 × 16 Agent
 * 数据来源：portal agents + 前端与后端一致的工作台绑定常量
 * 需 dashboard.admin.manage 权限
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { AdminNoPermission } from '../components/AdminNoPermission'

const WORKSTATION_AGENTS: Record<string, string[]> = {
  secretary: ['general-assistant', 'orchestration-agent', 'knowledge-agent'],
  research: ['protocol-agent', 'knowledge-agent'],
  quality: ['quality-guardian', 'knowledge-agent'],
  finance: ['finance-agent'],
  execution: ['execution-agent'],
  hr: ['talent-agent'],
  crm: ['crm-agent'],
  recruitment: ['recruitment-bot'],
  equipment: ['equipment-agent'],
  material: ['execution-agent'],
  facility: ['execution-agent'],
  evaluator: ['execution-agent', 'knowledge-agent'],
  'lab-personnel': ['talent-agent'],
  ethics: ['ethics-agent', 'knowledge-agent'],
  reception: ['reception-assistant'],
}

const WORKSTATION_LABELS: Record<string, string> = {
  secretary: '秘书台',
  research: '研究台',
  quality: '质量台',
  finance: '财务台',
  execution: '执行台',
  hr: '人事台',
  crm: '客户台',
  recruitment: '招募台',
  equipment: '设备台',
  material: '物料台',
  facility: '设施台',
  evaluator: '评估台',
  'lab-personnel': '人员台',
  ethics: '伦理台',
  reception: '接待台',
}

export default function MatrixPage() {
  const { data: res } = useQuery({
    queryKey: ['digital-workforce', 'portal'],
    queryFn: () => digitalWorkforcePortalApi.getPortal(),
  })
  const agents = res?.data?.data?.agents ?? []
  const agentIds = useMemo(() => agents.map((a) => a.agent_id), [agents])
  const workstations = useMemo(() => Object.keys(WORKSTATION_AGENTS).sort(), [])

  return (
    <PermissionGuard permission="dashboard.admin.manage" fallback={<AdminNoPermission />}>
    <div data-testid="matrix-page" className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-800">工作台绑定矩阵</h2>
        <p className="mt-1 text-sm text-slate-500">15 工作台 × Agent 绑定关系（勾表示已绑定）</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2 text-left font-medium text-slate-600">工作台</th>
              {agentIds.slice(0, 16).map((id) => (
                <th key={id} className="px-2 py-2 text-center font-medium text-slate-600" title={id}>
                  {id.replace(/-agent$|-bot$|-assistant$/, '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workstations.map((ws) => (
              <tr key={ws} className="border-b border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-700">{WORKSTATION_LABELS[ws] || ws}</td>
                {agentIds.slice(0, 16).map((aid) => {
                  const bound = (WORKSTATION_AGENTS[ws] ?? []).includes(aid)
                  return (
                    <td key={aid} className="px-2 py-1 text-center">
                      {bound ? (
                        <span className="inline-block h-4 w-4 rounded-full bg-emerald-500" title={`${ws} ↔ ${aid}`} />
                      ) : (
                        <span className="text-slate-200">—</span>
                      )}
                    </td>
                  )
                })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
    </PermissionGuard>
  )
}
