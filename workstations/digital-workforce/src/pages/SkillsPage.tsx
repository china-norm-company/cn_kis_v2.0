/**
 * 技能管理 — 从 SkillDefinition 读取，安装/卸载/新建技能，工作台绑定
 * 需 dashboard.admin.manage 权限
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  digitalWorkforcePortalApi,
  type SkillDefinitionItem,
  type SkillCreatePayload,
  type SkillUpdatePayload,
  type WorkstationBindingItem,
} from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Wrench, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { AdminNoPermission } from '../components/AdminNoPermission'

function SkillTable({
  items,
  workstations,
  onEdit,
  onDelete,
}: {
  items: SkillDefinitionItem[]
  workstations: WorkstationBindingItem[]
  onEdit: (s: SkillDefinitionItem) => void
  onDelete: (skillId: string) => void
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="text-left py-3 px-4 font-medium text-slate-700">技能 ID</th>
            <th className="text-left py-3 px-4 font-medium text-slate-700">名称</th>
            <th className="text-left py-3 px-4 font-medium text-slate-700">执行器</th>
            <th className="text-left py-3 px-4 font-medium text-slate-700">风险</th>
            <th className="text-left py-3 px-4 font-medium text-slate-700">绑定工作台</th>
            <th className="text-right py-3 px-4 font-medium text-slate-700">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.skill_id} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-3 px-4 font-mono text-slate-800">{s.skill_id}</td>
              <td className="py-3 px-4">{s.display_name || '-'}</td>
              <td className="py-3 px-4">{s.executor}</td>
              <td className="py-3 px-4">
                <span
                  className={
                    s.risk_level === 'high'
                      ? 'text-red-600'
                      : s.risk_level === 'medium'
                        ? 'text-amber-600'
                        : 'text-slate-600'
                  }
                >
                  {s.risk_level}
                </span>
              </td>
              <td className="py-3 px-4">
                <div className="flex flex-wrap gap-1">
                  {(s.bound_workstations || []).map((ws) => {
                    const w = workstations.find((x) => x.workstation_key === ws)
                    return (
                      <span
                        key={ws}
                        className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs"
                      >
                        {w?.display_name || ws}
                      </span>
                    )
                  })}
                  {(s.bound_workstations || []).length === 0 && <span className="text-slate-400">未绑定</span>}
                </div>
              </td>
              <td className="py-3 px-4 text-right">
                <button
                  type="button"
                  onClick={() => onEdit(s)}
                  className="p-1.5 text-slate-400 hover:text-primary-600 rounded"
                  title="编辑"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(s.skill_id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded ml-1"
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

function SkillFormModal({
  skill,
  workstations,
  onClose,
  onSaved,
}: {
  skill: SkillDefinitionItem | null
  workstations: WorkstationBindingItem[]
  onClose: () => void
  onSaved: () => void
}) {
  const isCreate = !skill
  const [skillId, setSkillId] = useState(skill?.skill_id ?? '')
  const [displayName, setDisplayName] = useState(skill?.display_name ?? '')
  const [executor, setExecutor] = useState(skill?.executor ?? 'script')
  const [riskLevel, setRiskLevel] = useState(skill?.risk_level ?? 'medium')
  const [requiresApproval, setRequiresApproval] = useState(skill?.requires_approval ?? false)
  const [boundWorkstations, setBoundWorkstations] = useState<string[]>(skill?.bound_workstations ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const createMu = useMutation({
    mutationFn: (payload: SkillCreatePayload) => digitalWorkforcePortalApi.createSkill(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'skills'] })
      queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'workstation-bindings'] })
      onSaved()
      onClose()
    },
    onError: (e: { response?: { data?: { msg?: string } } }) => {
      setError(e?.response?.data?.msg || '创建失败')
    },
  })
  const updateMu = useMutation({
    mutationFn: (payload: SkillUpdatePayload) => digitalWorkforcePortalApi.updateSkill(skill!.skill_id, payload),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'skills'] })
      const bindRes = await digitalWorkforcePortalApi.getWorkstationBindings()
      const items = bindRes?.data?.data?.items ?? []
      const updated = items.map((w) => ({
        ...w,
        skill_ids: boundWorkstations.includes(w.workstation_key)
          ? Array.from(new Set([...(w.skill_ids || []), skill!.skill_id]))
          : (w.skill_ids || []).filter((id) => id !== skill!.skill_id),
      }))
      await digitalWorkforcePortalApi.putWorkstationBindings(updated)
      queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'workstation-bindings'] })
      onSaved()
      onClose()
    },
    onError: (e: { response?: { data?: { msg?: string } } }) => {
      setError(e?.response?.data?.msg || '更新失败')
    },
  })

  const handleSubmit = () => {
    setError(null)
    setSaving(true)
    if (isCreate) {
      createMu.mutate(
        {
          skill_id: skillId,
          display_name: displayName || undefined,
          executor,
          risk_level: riskLevel,
          requires_approval: requiresApproval,
          bound_workstations: boundWorkstations,
        },
        { onSettled: () => setSaving(false) }
      )
    } else {
      updateMu.mutate(
        {
          display_name: displayName || undefined,
          executor,
          risk_level: riskLevel,
          requires_approval: requiresApproval,
          bound_workstations: boundWorkstations,
        },
        { onSettled: () => setSaving(false) }
      )
    }
  }

  const toggleWorkstation = (key: string) => {
    setBoundWorkstations((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{isCreate ? '新建技能' : '编辑技能'}</h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            ×
          </button>
        </div>
        <div className="p-6 space-y-4">
          {isCreate && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">技能 ID</label>
              <input
                type="text"
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="如 protocol-parser"
                aria-label="技能 ID"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">展示名称</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="如：协议解析"
              aria-label="展示名称"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">执行器</label>
            <select
              value={executor}
              onChange={(e) => setExecutor(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              aria-label="执行器"
            >
              <option value="script">script</option>
              <option value="service">service</option>
              <option value="agent">agent</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">风险等级</label>
            <select
              value={riskLevel}
              onChange={(e) => setRiskLevel(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              aria-label="风险等级"
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="requires_approval"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              aria-label="需审批后执行"
            />
            <label htmlFor="requires_approval" className="text-sm text-slate-700">
              需审批后执行
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">绑定工作台</label>
            <div className="flex flex-wrap gap-2">
              {workstations.map((w) => (
                <label key={w.workstation_key} className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={boundWorkstations.includes(w.workstation_key)}
                    onChange={() => toggleWorkstation(w.workstation_key)}
                    aria-label={`绑定到 ${w.display_name}`}
                  />
                  <span className="text-sm">{w.display_name}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="p-6 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || (isCreate && !skillId.trim())}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

type TabId = 'list' | 'market'

export default function SkillsPage() {
  const [editingSkill, setEditingSkill] = useState<SkillDefinitionItem | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [tab, setTab] = useState<TabId>('list')

  const { data: skillsRes, isLoading: loadingSkills, error: skillsError } = useQuery({
    queryKey: ['digital-workforce', 'skills'],
    queryFn: () => digitalWorkforcePortalApi.listSkills(),
  })
  const { data: bindingsRes } = useQuery({
    queryKey: ['digital-workforce', 'workstation-bindings'],
    queryFn: () => digitalWorkforcePortalApi.getWorkstationBindings(),
  })

  const skills = skillsRes?.data?.data?.items ?? []
  const workstations = bindingsRes?.data?.data?.items ?? []

  const queryClient = useQueryClient()
  const deleteMu = useMutation({
    mutationFn: (skillId: string) => digitalWorkforcePortalApi.deleteSkill(skillId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'skills'] }),
  })

  const handleDelete = (skillId: string) => {
    if (window.confirm(`确定删除技能「${skillId}」？`)) deleteMu.mutate(skillId)
  }

  return (
    <PermissionGuard permission="dashboard.admin.manage" fallback={<AdminNoPermission />}>
      {skillsError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700" data-testid="skills-error">
          <p>加载失败，请稍后重试。</p>
        </div>
      ) : (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">技能管理</h2>
          <p className="mt-1 text-sm text-slate-500">安装/卸载技能，配置工作台绑定与审批要求</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setTab('list')}
              className={`px-3 py-1.5 text-sm rounded-md ${tab === 'list' ? 'bg-white shadow text-slate-800' : 'text-slate-600'}`}
            >
              技能列表
            </button>
            <button
              type="button"
              onClick={() => setTab('market')}
              className={`px-3 py-1.5 text-sm rounded-md ${tab === 'market' ? 'bg-white shadow text-slate-800' : 'text-slate-600'}`}
            >
              技能市场
            </button>
          </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          新建技能
        </button>
        </div>
      </div>

      {tab === 'market' && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-600 mb-2">
            OpenClaw / ClawHub 技能市场：可从社区浏览并安装通用技能。
          </p>
          <p className="text-sm text-slate-500">
            配置后端 CLAWHUB_API_URL 或前端 VITE_CLAWHUB_API_URL 后可对接 ClawHub API，在此展示可安装技能列表。
          </p>
        </div>
      )}

      {tab === 'list' && (loadingSkills ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">加载中...</div>
      ) : (
        <SkillTable
          items={skills}
          workstations={workstations}
          onEdit={setEditingSkill}
          onDelete={handleDelete}
        />
      ))}

      {showCreate && (
        <SkillFormModal
          skill={null}
          workstations={workstations}
          onClose={() => setShowCreate(false)}
          onSaved={() => setShowCreate(false)}
        />
      )}
      {editingSkill && (
        <SkillFormModal
          skill={editingSkill}
          workstations={workstations}
          onClose={() => setEditingSkill(null)}
          onSaved={() => setEditingSkill(null)}
        />
      )}
    </div>
      )}
    </PermissionGuard>
  )
}
