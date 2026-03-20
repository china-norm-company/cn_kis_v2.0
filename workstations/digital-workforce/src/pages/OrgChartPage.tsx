/**
 * 数字员工组织架构图 — 树状层级视图
 * 展示 Agent 之间的汇报关系、暂停状态和能力标签
 */
import { useQuery } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { Bot, Pause, ArrowDown } from 'lucide-react'

type OrgNode = {
  agent_id: string
  name: string
  role_title: string
  tier: string
  parent_agent_id: string
  paused: boolean
  provider: string
  capabilities: string[]
}

const TIER_LABEL: Record<string, string> = {
  orchestration: '编排中枢',
  digital_human: '数字人',
  agent: '智能体',
  engine: '自动化引擎',
}

function OrgNodeCard({ node, children }: { node: OrgNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`w-48 rounded-xl border p-3 text-center shadow-sm ${
          node.paused ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex items-center justify-center gap-2">
          {node.paused ? (
            <Pause className="h-4 w-4 text-red-400" />
          ) : (
            <Bot className="h-4 w-4 text-violet-500" />
          )}
          <span className="text-sm font-semibold text-slate-800">{node.name}</span>
        </div>
        {node.role_title && (
          <p className="text-xs text-slate-500 mt-0.5">{node.role_title}</p>
        )}
        <div className="mt-1 flex flex-wrap justify-center gap-1">
          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-600">
            {TIER_LABEL[node.tier] || node.tier || '智能体'}
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
            {node.provider}
          </span>
        </div>
        {node.paused && (
          <p className="mt-1 text-[10px] text-red-500">已暂停</p>
        )}
      </div>
      {children && (
        <>
          <div className="h-4 w-px bg-slate-300" />
          <ArrowDown className="h-3 w-3 text-slate-300 -mt-1 -mb-1" />
          <div className="h-2 w-px bg-slate-300" />
          <div className="flex flex-wrap justify-center gap-4">
            {children}
          </div>
        </>
      )}
    </div>
  )
}

export default function OrgChartPage() {
  const { data: res, isLoading } = useQuery({
    queryKey: ['digital-workforce', 'org-chart'],
    queryFn: () => digitalWorkforcePortalApi.getOrgChart(),
  })

  const nodes: OrgNode[] = ((res as { data?: { data?: { nodes?: OrgNode[] } } })?.data?.data?.nodes ?? [])

  // 构建树
  const nodeMap = new Map(nodes.map(n => [n.agent_id, n]))
  const rootNodes = nodes.filter(n => !n.parent_agent_id || !nodeMap.has(n.parent_agent_id))
  const childrenOf = (parentId: string) => nodes.filter(n => n.parent_agent_id === parentId)

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-slate-400">加载中...</div>
  }

  return (
    <div data-testid="org-chart-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">数字员工组织架构</h2>
        <p className="mt-1 text-sm text-slate-500">Agent 层级关系 · 汇报链 · 暂停状态</p>
      </div>

      {nodes.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          暂无组织架构数据（请先运行 <code>python manage.py sync_agents</code>）
        </div>
      ) : (
        <div className="overflow-x-auto pb-8">
          <div className="flex flex-col items-center min-w-[800px] py-8">
            {rootNodes.map((root) => {
              const children = childrenOf(root.agent_id)
              return (
                <OrgNodeCard key={root.agent_id} node={root}>
                  {children.length > 0 && (
                    <>
                      {children.map((child) => {
                        const grandchildren = childrenOf(child.agent_id)
                        return (
                          <OrgNodeCard key={child.agent_id} node={child}>
                            {grandchildren.length > 0 && (
                              <>
                                {grandchildren.map(gc => (
                                  <OrgNodeCard key={gc.agent_id} node={gc} />
                                ))}
                              </>
                            )}
                          </OrgNodeCard>
                        )
                      })}
                    </>
                  )}
                </OrgNodeCard>
              )
            })}
          </div>
        </div>
      )}

      {/* 统计摘要 */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{nodes.length}</p>
          <p className="text-xs text-slate-500 mt-1">Agent 总数</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{nodes.filter(n => !n.paused).length}</p>
          <p className="text-xs text-slate-500 mt-1">运行中</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-red-500">{nodes.filter(n => n.paused).length}</p>
          <p className="text-xs text-slate-500 mt-1">已暂停</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">
            {new Set(nodes.map(n => n.tier).filter(Boolean)).size}
          </p>
          <p className="text-xs text-slate-500 mt-1">层级类型</p>
        </div>
      </div>
    </div>
  )
}
