/**
 * 数字员工花名册 — 岗位 + Agent 双层视图，工牌卡 + 在线编辑 + 即时生效
 * 有岗位数据时按岗位分组展示 Agent；否则平铺 Agent 卡片
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  digitalWorkforcePortalApi,
  type PortalAgentItem,
  type PortalRoleItem,
  type AgentDetail,
  type AgentUpdatePayload,
} from '@cn-kis/api-client'
import { Users, Wrench, BarChart3, Pencil, Loader2 } from 'lucide-react'

const TIER_LABELS: Record<string, string> = {
  orchestration: '编排中枢',
  digital_human: '数字人',
  agent: '智能体',
  engine: '自动化引擎',
}

function WorkerCard({
  agent,
  execution7d,
  onEdit,
}: {
  agent: PortalAgentItem
  execution7d: Record<string, { total: number; success: number }>
  onEdit: (agentId: string) => void
}) {
  const stat = execution7d[agent.agent_id] ?? { total: 0, success: 0 }
  const rate = stat.total > 0 ? Math.round((stat.success / stat.total) * 100) : null
  const tierLabel = (agent.tier && TIER_LABELS[agent.tier]) || agent.agent_id

  return (
    <div
      data-testid="roster-worker-card"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {agent.avatar_url ? (
            <img src={agent.avatar_url} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0" />
          ) : (
            <div className="h-12 w-12 shrink-0 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600">
              <Users className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-medium text-slate-800 truncate">{agent.name}</p>
            <p className="text-xs text-slate-500">{agent.role_title || agent.agent_id}</p>
            <p className="text-xs text-slate-400 mt-0.5">{tierLabel}</p>
          </div>
        </div>
        {agent.is_editable_via_ui !== false && (
          <button
            type="button"
            onClick={() => onEdit(agent.agent_id)}
            className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg shrink-0"
            title="编辑"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-slate-600">
          <Wrench className="h-3.5 w-3.5 shrink-0" />
          <span>工具 {Array.isArray(agent.capabilities) ? agent.capabilities.length : 0} 项</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-600">
          <BarChart3 className="h-3.5 w-3.5 shrink-0" />
          <span>7 天执行 {stat.total} 次</span>
          {rate !== null && <span className="text-emerald-600">成功率 {rate}%</span>}
        </div>
      </div>
      {agent.description && (
        <p className="mt-2 text-xs text-slate-500 line-clamp-2">{agent.description}</p>
      )}
    </div>
  )
}

function EditDrawer({
  agentId,
  onClose,
  onSaved,
}: {
  agentId: string
  onClose: () => void
  onSaved: () => void
}) {
  const queryClient = useQueryClient()
  const { data: res, isLoading, error } = useQuery({
    queryKey: ['digital-workforce', 'agent', agentId],
    queryFn: () => digitalWorkforcePortalApi.getAgent(agentId),
    enabled: !!agentId,
  })
  const agent = res?.data?.data

  const [form, setForm] = useState<Partial<AgentDetail>>({})
  useEffect(() => setForm({}), [agentId])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const mutate = useMutation({
    mutationFn: (payload: AgentUpdatePayload) => digitalWorkforcePortalApi.putAgent(agentId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'portal'] })
      queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'agent', agentId] })
      onSaved()
      onClose()
    },
    onError: (err: { response?: { data?: { msg?: string } }; message?: string }) => {
      setSaveError(err?.response?.data?.msg || err?.message || '保存失败')
    },
  })

  const current = agent ? { ...agent, ...form } : form
  const handleSave = () => {
    setSaving(true)
    setSaveError(null)
    const payload: AgentUpdatePayload = {
      name: current.name,
      description: current.description,
      role_title: current.role_title,
      system_prompt: current.system_prompt,
      tools: current.tools,
      tier: current.tier || undefined,
      avatar_url: current.avatar_url || undefined,
      phase: current.phase || undefined,
      knowledge_enabled: current.knowledge_enabled,
      knowledge_top_k: current.knowledge_top_k,
      is_editable_via_ui: current.is_editable_via_ui,
      is_active: current.is_active,
    }
    mutate.mutate(payload, { onSettled: () => setSaving(false) })
  }

  if (isLoading || !agent) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-white rounded-xl p-8 shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-center gap-2 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>加载中...</span>
          </div>
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div className="bg-white rounded-xl p-8 shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
          <p className="text-red-600">加载失败</p>
          <button type="button" onClick={onClose} className="mt-4 px-4 py-2 bg-slate-200 rounded-lg">关闭</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">编辑数字员工</h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">×</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">岗位名称</label>
            <input
              type="text"
              value={current.role_title ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, role_title: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="如：协议解析专员"
              aria-label="岗位名称"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">系统提示词</label>
            <textarea
              value={current.system_prompt ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
              rows={6}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="系统提示词"
              aria-label="系统提示词"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">工具列表（逗号或换行）</label>
            <textarea
              value={Array.isArray(current.tools) ? current.tools.join('\n') : ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  tools: e.target.value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
                }))
              }
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="每行一个工具名"
              aria-label="工具列表"
            />
          </div>
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        </div>
        <div className="p-6 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            保存并生效
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RosterPage() {
  const [editAgentId, setEditAgentId] = useState<string | null>(null)
  const { data: res, isLoading, error } = useQuery({
    queryKey: ['digital-workforce', 'portal'],
    queryFn: () => digitalWorkforcePortalApi.getPortal(),
  })

  const data = res?.data?.data
  const agents = data?.agents ?? []
  const roles = data?.roles ?? []
  const execution7d = data?.execution_7d ?? data?.execution_today ?? {}
  const roleFirst = roles.length > 0

  const agentById = Object.fromEntries(agents.map((a) => [a.agent_id, a]))
  const agentsInRoles = new Set(roles.flatMap((r) => r.mapped_agent_ids ?? []))

  if (error) {
    return (
      <div data-testid="roster-page" className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p>加载失败，请稍后重试。</p>
      </div>
    )
  }

  return (
    <div data-testid="roster-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">数字员工花名册</h2>
        <p className="mt-1 text-sm text-slate-500">
          {roleFirst ? '岗位 + Agent 双层视图：按岗位查看与编辑数字员工' : '查看与编辑数字员工身份、能力与行为，保存后立即生效'}
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">加载中...</div>
      ) : roleFirst ? (
        <div className="space-y-8" data-testid="roster-role-first">
          {roles.map((role: PortalRoleItem) => {
            const ids = role.mapped_agent_ids ?? []
            const roleAgents = ids.map((id) => agentById[id]).filter(Boolean)
            if (roleAgents.length === 0) return null
            return (
              <section key={role.role_code} data-testid={`roster-role-${role.role_code}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                    {role.role_name}（{role.role_code}）
                  </h3>
                  <Link
                    to={`/roles/${role.role_code}`}
                    className="text-sm font-medium text-primary-600 hover:underline"
                  >
                    查看岗位详情
                  </Link>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {roleAgents.map((agent) => (
                    <WorkerCard
                      key={agent.agent_id}
                      agent={agent}
                      execution7d={execution7d}
                      onEdit={setEditAgentId}
                    />
                  ))}
                </div>
              </section>
            )
          })}
          {agents.some((a) => !agentsInRoles.has(a.agent_id)) && (
            <section data-testid="roster-role-ungrouped">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">未归属岗位</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {agents.filter((a) => !agentsInRoles.has(a.agent_id)).map((agent) => (
                  <WorkerCard
                    key={agent.agent_id}
                    agent={agent}
                    execution7d={execution7d}
                    onEdit={setEditAgentId}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <WorkerCard
              key={agent.agent_id}
              agent={agent}
              execution7d={execution7d}
              onEdit={setEditAgentId}
            />
          ))}
        </div>
      )}

      {editAgentId && (
        <EditDrawer
          agentId={editAgentId}
          onClose={() => setEditAgentId(null)}
          onSaved={() => setEditAgentId(null)}
        />
      )}
    </div>
  )
}
