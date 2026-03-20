/**
 * 岗位与分工管理页
 * 将 WorkerRoleDefinition 暴露为可编辑的岗位映射配置：
 * 岗位 ↔ Agent / Skill / 工作台 / 输入输出 / 人工确认边界
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  digitalWorkforcePortalApi,
  type PortalAgentItem,
  type RoleCreatePayload,
  type RoleDefinitionItem,
  type RoleUpdatePayload,
  type SkillDefinitionItem,
  type WorkstationBindingItem,
} from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Briefcase, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { AdminNoPermission } from '../components/AdminNoPermission'

const AUTOMATION_OPTIONS = [
  { value: '', label: '未设置' },
  { value: 'L1', label: 'L1 信息辅助' },
  { value: 'L2', label: 'L2 助理执行' },
  { value: 'L3', label: 'L3 受控执行' },
  { value: 'L4', label: 'L4 人工确认' },
]

function parseList(value: string): string[] {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function joinList(items?: string[]): string {
  return Array.isArray(items) ? items.join('\n') : ''
}

function labelById<T extends string>(
  ids: string[] | undefined,
  source: Array<{ id: T; label: string }>
) {
  if (!ids?.length) return '—'
  return ids
    .map((id) => source.find((item) => item.id === id)?.label || id)
    .join('、')
}

function RoleTable({
  items,
  agents,
  skills,
  workstations,
  onEdit,
  onDelete,
}: {
  items: RoleDefinitionItem[]
  agents: PortalAgentItem[]
  skills: SkillDefinitionItem[]
  workstations: WorkstationBindingItem[]
  onEdit: (role: RoleDefinitionItem) => void
  onDelete: (roleCode: string) => void
}) {
  const agentSource = agents.map((item) => ({ id: item.agent_id, label: item.name || item.agent_id }))
  const skillSource = skills.map((item) => ({ id: item.skill_id, label: item.display_name || item.skill_id }))
  const workstationSource = workstations.map((item) => ({
    id: item.workstation_key,
    label: item.display_name || item.workstation_key,
  }))

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-4 py-3 text-left font-medium text-slate-700">岗位</th>
            <th className="px-4 py-3 text-left font-medium text-slate-700">自动化等级</th>
            <th className="px-4 py-3 text-left font-medium text-slate-700">映射 Agent</th>
            <th className="px-4 py-3 text-left font-medium text-slate-700">映射技能</th>
            <th className="px-4 py-3 text-left font-medium text-slate-700">工作台范围</th>
            <th className="px-4 py-3 text-right font-medium text-slate-700">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((role) => (
            <tr key={role.role_code} className="border-b border-slate-100 align-top hover:bg-slate-50">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-800">{role.role_name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{role.role_code}</div>
                {role.role_cluster && <div className="text-xs text-slate-400 mt-0.5">{role.role_cluster}</div>}
              </td>
              <td className="px-4 py-3 text-slate-600">{role.automation_level || '—'}</td>
              <td className="px-4 py-3 text-slate-600">{labelById(role.mapped_agent_ids, agentSource)}</td>
              <td className="px-4 py-3 text-slate-600">{labelById(role.mapped_skill_ids, skillSource)}</td>
              <td className="px-4 py-3 text-slate-600">
                {role.workstation_scope?.length
                  ? labelById(role.workstation_scope, workstationSource)
                  : '全部工作台'}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onEdit(role)}
                  className="p-1.5 text-slate-400 hover:text-primary-600 rounded"
                  title="编辑"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(role.role_code)}
                  className="ml-1 p-1.5 text-slate-400 hover:text-red-600 rounded"
                  title="删除"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RoleFormModal({
  role,
  agents,
  skills,
  workstations,
  onClose,
}: {
  role: RoleDefinitionItem | null
  agents: PortalAgentItem[]
  skills: SkillDefinitionItem[]
  workstations: WorkstationBindingItem[]
  onClose: () => void
}) {
  const isCreate = !role
  const queryClient = useQueryClient()
  const [roleCode, setRoleCode] = useState(role?.role_code ?? '')
  const [roleName, setRoleName] = useState(role?.role_name ?? '')
  const [roleCluster, setRoleCluster] = useState(role?.role_cluster ?? '')
  const [automationLevel, setAutomationLevel] = useState(role?.automation_level ?? '')
  const [baselineManualMinutes, setBaselineManualMinutes] = useState(
    role?.baseline_manual_minutes != null ? String(role.baseline_manual_minutes) : ''
  )
  const [serviceTargets, setServiceTargets] = useState(joinList(role?.service_targets))
  const [coreScenarios, setCoreScenarios] = useState(joinList(role?.core_scenarios))
  const [inputContract, setInputContract] = useState(joinList(role?.input_contract))
  const [outputContract, setOutputContract] = useState(joinList(role?.output_contract))
  const [humanConfirmations, setHumanConfirmations] = useState(joinList(role?.human_confirmation_points))
  const [kpis, setKpis] = useState(joinList(role?.kpi_metrics))
  const [mappedAgents, setMappedAgents] = useState(joinList(role?.mapped_agent_ids))
  const [mappedSkills, setMappedSkills] = useState(joinList(role?.mapped_skill_ids))
  const [workstationScope, setWorkstationScope] = useState(joinList(role?.workstation_scope))
  const [enabled, setEnabled] = useState(role?.enabled ?? true)
  const [error, setError] = useState<string | null>(null)

  const commonPayload = (): Omit<RoleCreatePayload, 'role_code' | 'role_name'> => ({
    role_cluster: roleCluster || undefined,
    automation_level: automationLevel || undefined,
    baseline_manual_minutes: baselineManualMinutes ? Number(baselineManualMinutes) : null,
    service_targets: parseList(serviceTargets),
    core_scenarios: parseList(coreScenarios),
    input_contract: parseList(inputContract),
    output_contract: parseList(outputContract),
    human_confirmation_points: parseList(humanConfirmations),
    kpi_metrics: parseList(kpis),
    mapped_agent_ids: parseList(mappedAgents),
    mapped_skill_ids: parseList(mappedSkills),
    workstation_scope: parseList(workstationScope),
    enabled,
  })

  const createMutation = useMutation({
    mutationFn: (payload: RoleCreatePayload) => digitalWorkforcePortalApi.createRole(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'roles'] })
      queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'portal'] })
      onClose()
    },
    onError: (e: { response?: { data?: { msg?: string } } }) => {
      setError(e?.response?.data?.msg || '创建失败')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: RoleUpdatePayload) => digitalWorkforcePortalApi.updateRole(role!.role_code, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'roles'] })
      queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'portal'] })
      onClose()
    },
    onError: (e: { response?: { data?: { msg?: string } } }) => {
      setError(e?.response?.data?.msg || '更新失败')
    },
  })

  const saving = createMutation.isPending || updateMutation.isPending

  const handleSubmit = () => {
    setError(null)
    if (isCreate) {
      createMutation.mutate({
        role_code: roleCode.trim(),
        role_name: roleName.trim(),
        ...commonPayload(),
      })
      return
    }
    updateMutation.mutate({
      role_name: roleName.trim(),
      ...commonPayload(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{isCreate ? '新建岗位映射' : '编辑岗位映射'}</h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">×</button>
        </div>
        <div className="p-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">岗位编码</label>
            <input
              type="text"
              value={roleCode}
              onChange={(e) => setRoleCode(e.target.value)}
              disabled={!isCreate}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
              placeholder="如 solution_designer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">岗位名称</label>
            <input
              type="text"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="如 方案生成员"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">岗位簇</label>
            <input
              type="text"
              value={roleCluster}
              onChange={(e) => setRoleCluster(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="如 客户与需求簇"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">自动化等级</label>
              <select
                value={automationLevel}
                onChange={(e) => setAutomationLevel(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                aria-label="自动化等级"
              >
                {AUTOMATION_OPTIONS.map((option) => (
                  <option key={option.value || 'empty'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">人工替代基准（分钟/次）</label>
              <input
                type="number"
                min={1}
                max={1440}
                value={baselineManualMinutes}
                onChange={(e) => setBaselineManualMinutes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="如 30"
              />
            </div>
          </div>
          <div className="lg:col-span-2 flex items-center gap-2">
            <input
              id="enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <label htmlFor="enabled" className="text-sm text-slate-700">启用该岗位</label>
          </div>

          {[
            ['服务对象', serviceTargets, setServiceTargets, '如 销售,客户经理'],
            ['核心场景', coreScenarios, setCoreScenarios, '如 新客户需求进入'],
            ['关键输入', inputContract, setInputContract, '如 会议纪要,聊天记录'],
            ['关键输出', outputContract, setOutputContract, '如 需求摘要,缺口清单'],
            ['人工确认事项', humanConfirmations, setHumanConfirmations, '如 对客户正式承诺'],
            ['价值指标', kpis, setKpis, '如 需求澄清轮次下降'],
            ['映射 Agent', mappedAgents, setMappedAgents, `可用：${agents.map((item) => item.agent_id).join('、')}`],
            ['映射技能', mappedSkills, setMappedSkills, `可用：${skills.slice(0, 12).map((item) => item.skill_id).join('、')}${skills.length > 12 ? ' ...' : ''}`],
            ['工作台范围', workstationScope, setWorkstationScope, `可用：${workstations.map((item) => item.workstation_key).join('、')}`],
          ].map(([label, value, setter, placeholder]) => (
            <div key={label as string}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{label as string}</label>
              <textarea
                value={value as string}
                onChange={(e) => (setter as (value: string) => void)(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder={placeholder as string}
              />
            </div>
          ))}
          {error && <p className="lg:col-span-2 text-sm text-red-600">{error}</p>}
        </div>
        <div className="p-6 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100">
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PositionsPage() {
  const queryClient = useQueryClient()
  const [editingRole, setEditingRole] = useState<RoleDefinitionItem | null>(null)
  const [creating, setCreating] = useState(false)

  const { data: rolesRes, isLoading, error } = useQuery({
    queryKey: ['digital-workforce', 'roles'],
    queryFn: () => digitalWorkforcePortalApi.listRoles(true),
  })
  const { data: portalRes } = useQuery({
    queryKey: ['digital-workforce', 'portal'],
    queryFn: () => digitalWorkforcePortalApi.getPortal(),
  })
  const { data: skillsRes } = useQuery({
    queryKey: ['digital-workforce', 'skills'],
    queryFn: () => digitalWorkforcePortalApi.listSkills(),
  })
  const { data: workstationRes } = useQuery({
    queryKey: ['digital-workforce', 'workstation-bindings'],
    queryFn: () => digitalWorkforcePortalApi.getWorkstationBindings(),
  })

  const deleteMutation = useMutation({
    mutationFn: (roleCode: string) => digitalWorkforcePortalApi.deleteRole(roleCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'roles'] })
      queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'portal'] })
    },
  })

  const roles = useMemo(() => rolesRes?.data?.data?.items ?? [], [rolesRes])
  const agents = portalRes?.data?.data?.agents ?? []
  const skills = skillsRes?.data?.data?.items ?? []
  const workstations = workstationRes?.data?.data?.items ?? []

  return (
    <PermissionGuard permission="dashboard.admin.manage" fallback={<AdminNoPermission />}>
      <div data-testid="positions-page" className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">岗位与分工</h2>
            <p className="mt-1 text-sm text-slate-500">
              维护岗位说明书与映射关系：岗位 ↔ Agent / Skill / 工作台 / 输入输出 / 人工确认边界。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            新建岗位
          </button>
        </div>

        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
          <div className="flex items-center gap-2 font-medium">
            <Briefcase className="h-4 w-4" />
            当前已接入岗位映射管理
          </div>
          <p className="mt-1 text-violet-700">
            这里维护的是业务岗位视角，不是纯技术 Agent 列表。修改后会同步影响门户、花名册、价值聚合与运行时岗位归因。
          </p>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">加载中...</div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">岗位映射加载失败，请稍后重试。</div>
        ) : (
          <RoleTable
            items={roles}
            agents={agents}
            skills={skills}
            workstations={workstations}
            onEdit={setEditingRole}
            onDelete={(roleCode) => {
              if (window.confirm(`确认删除岗位 ${roleCode} 吗？`)) {
                deleteMutation.mutate(roleCode)
              }
            }}
          />
        )}

        {(creating || editingRole) && (
          <RoleFormModal
            role={creating ? null : editingRole}
            agents={agents}
            skills={skills}
            workstations={workstations}
            onClose={() => {
              setCreating(false)
              setEditingRole(null)
            }}
          />
        )}
      </div>
    </PermissionGuard>
  )
}
