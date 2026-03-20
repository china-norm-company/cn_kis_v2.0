/**
 * 协作流程定义 — 编排路由可视化与编辑
 * 领域→Agent、领域→技能、关键词→领域 映射，保存后可刷新配置立即生效
 * 需 dashboard.admin.manage 权限
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Activity, RefreshCw, Loader2, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { AdminNoPermission } from '../components/AdminNoPermission'

type DomainAgentRow = { domain_code: string; agent_id: string; display_name: string; priority: number }
type DomainSkillRow = { domain_code: string; skill_id: string; priority: number }
type KeywordDomainRow = { keyword: string; domain_code: string }

function isBlankRow(row: Record<string, string | number>) {
  return Object.values(row).every((value) => String(value ?? '').trim() === '' || Number(value) === 0)
}

function SectionHeader({
  title,
  onAdd,
  editing,
}: {
  title: string
  onAdd?: () => void
  editing: boolean
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      {title ? <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</h3> : <span />}
      {editing && onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
          新增
        </button>
      )}
    </div>
  )
}

export default function WorkflowsPage() {
  const queryClient = useQueryClient()
  const { data: res, isLoading, error } = useQuery({
    queryKey: ['digital-workforce', 'routing'],
    queryFn: () => digitalWorkforcePortalApi.getRouting(),
  })

  const [reloading, setReloading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const data = res?.data.data
  const domainAgent = data?.domain_agent ?? []
  const domainSkill = data?.domain_skill ?? []
  const keywordDomain = data?.keyword_domain ?? []

  const [editDomainAgent, setEditDomainAgent] = useState<DomainAgentRow[]>([])
  const [editDomainSkill, setEditDomainSkill] = useState<DomainSkillRow[]>([])
  const [editKeywordDomain, setEditKeywordDomain] = useState<KeywordDomainRow[]>([])

  const putMu = useMutation({
    mutationFn: (payload: Parameters<typeof digitalWorkforcePortalApi.putRouting>[0]) =>
      digitalWorkforcePortalApi.putRouting(payload),
    onSuccess: async () => {
      await digitalWorkforcePortalApi.reloadConfig()
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'routing'] })
      setEditing(false)
      setSaveError(null)
    },
    onError: (e: { response?: { data?: { msg?: string } } }) => {
      setSaveError(e?.response?.data?.msg || '保存失败')
    },
  })

  const startEdit = () => {
    setEditDomainAgent(domainAgent.map((row) => ({ ...row })))
    setEditDomainSkill(domainSkill.map((row) => ({ ...row })))
    setEditKeywordDomain(keywordDomain.map((row) => ({ ...row })))
    setEditing(true)
    setSaveError(null)
  }

  const cancelEdit = () => {
    setEditing(false)
    setSaveError(null)
  }

  const handleSave = () => {
    putMu.mutate({
      domain_agent: editDomainAgent
        .filter((row) => !isBlankRow(row))
        .map((row) => ({
          domain_code: row.domain_code.trim(),
          agent_id: row.agent_id.trim(),
          display_name: row.display_name.trim() || row.domain_code.trim(),
          priority: row.priority ?? 0,
        })),
      domain_skill: editDomainSkill
        .filter((row) => !isBlankRow(row))
        .map((row) => ({
          domain_code: row.domain_code.trim(),
          skill_id: row.skill_id.trim(),
          priority: row.priority ?? 0,
        })),
      keyword_domain: editKeywordDomain
        .filter((row) => !isBlankRow(row))
        .map((row) => ({
          keyword: row.keyword.trim(),
          domain_code: row.domain_code.trim(),
        })),
    })
  }

  const handleReloadConfig = async () => {
    setReloading(true)
    try {
      await digitalWorkforcePortalApi.reloadConfig()
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'routing'] })
    } finally {
      setReloading(false)
    }
  }

  return (
    <PermissionGuard permission="dashboard.admin.manage" fallback={<AdminNoPermission />}>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700" data-testid="workflows-error">
          <p>加载失败，请稍后重试。</p>
        </div>
      ) : (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">协作流程定义</h2>
          <p className="mt-1 text-sm text-slate-500">
            领域→Agent、领域→技能、关键词→领域 映射，编辑后点击「保存并生效」立即刷新到运行平面
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <button
              type="button"
              onClick={startEdit}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-4 w-4" />
              编辑路由
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={putMu.isPending}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={putMu.isPending}
                className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {putMu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存并生效
              </button>
            </>
          )}
          <a
            href="#/n8n"
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
          >
            高级编排 (n8n)
          </a>
          <button
            type="button"
            onClick={handleReloadConfig}
            disabled={reloading}
            className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {reloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新配置
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">加载中...</div>
      ) : (
        <div className="space-y-8">
          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{saveError}</div>
          )}

          <section>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              <Activity className="h-4 w-4" />
              领域 → Agent
            </div>
            <SectionHeader
              title=""
              editing={editing}
              onAdd={() =>
                setEditDomainAgent((rows) => [...rows, { domain_code: '', agent_id: '', display_name: '', priority: 0 }])
              }
            />
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium text-slate-700">领域</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">Agent ID</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">展示名</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">优先级</th>
                    {editing && <th className="px-4 py-3 text-right font-medium text-slate-700">操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {(editing ? editDomainAgent : domainAgent).map((row, idx) => (
                    <tr key={`${row.domain_code || 'new'}-${idx}`} className="border-b border-slate-100">
                      {editing ? (
                        <>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editDomainAgent[idx]?.domain_code ?? ''}
                              onChange={(e) =>
                                setEditDomainAgent((rows) =>
                                  rows.map((item, i) => (i === idx ? { ...item, domain_code: e.target.value } : item))
                                )
                              }
                              aria-label="领域代码"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm font-mono"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editDomainAgent[idx]?.agent_id ?? ''}
                              onChange={(e) =>
                                setEditDomainAgent((rows) =>
                                  rows.map((item, i) => (i === idx ? { ...item, agent_id: e.target.value } : item))
                                )
                              }
                              aria-label="Agent ID"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editDomainAgent[idx]?.display_name ?? ''}
                              onChange={(e) =>
                                setEditDomainAgent((rows) =>
                                  rows.map((item, i) => (i === idx ? { ...item, display_name: e.target.value } : item))
                                )
                              }
                              aria-label="展示名"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={editDomainAgent[idx]?.priority ?? 0}
                              onChange={(e) =>
                                setEditDomainAgent((rows) =>
                                  rows.map((item, i) =>
                                    i === idx ? { ...item, priority: parseInt(e.target.value, 10) || 0 } : item
                                  )
                                )
                              }
                              aria-label="优先级"
                              className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setEditDomainAgent((rows) => rows.filter((_, i) => i !== idx))}
                              className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              删除
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-mono">{row.domain_code}</td>
                          <td className="px-4 py-3">{row.agent_id}</td>
                          <td className="px-4 py-3">{row.display_name || '-'}</td>
                          <td className="px-4 py-3">{row.priority}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <SectionHeader
              title="领域 → 技能"
              editing={editing}
              onAdd={() => setEditDomainSkill((rows) => [...rows, { domain_code: '', skill_id: '', priority: 0 }])}
            />
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium text-slate-700">领域</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">技能 ID</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">优先级</th>
                    {editing && <th className="px-4 py-3 text-right font-medium text-slate-700">操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {(editing ? editDomainSkill : domainSkill).map((row, idx) => (
                    <tr key={`${row.domain_code || 'new'}-${row.skill_id || 'skill'}-${idx}`} className="border-b border-slate-100">
                      {editing ? (
                        <>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editDomainSkill[idx]?.domain_code ?? ''}
                              onChange={(e) =>
                                setEditDomainSkill((rows) =>
                                  rows.map((item, i) => (i === idx ? { ...item, domain_code: e.target.value } : item))
                                )
                              }
                              aria-label="技能领域代码"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm font-mono"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editDomainSkill[idx]?.skill_id ?? ''}
                              onChange={(e) =>
                                setEditDomainSkill((rows) =>
                                  rows.map((item, i) => (i === idx ? { ...item, skill_id: e.target.value } : item))
                                )
                              }
                              aria-label="技能 ID"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={editDomainSkill[idx]?.priority ?? 0}
                              onChange={(e) =>
                                setEditDomainSkill((rows) =>
                                  rows.map((item, i) =>
                                    i === idx ? { ...item, priority: parseInt(e.target.value, 10) || 0 } : item
                                  )
                                )
                              }
                              aria-label="技能优先级"
                              className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setEditDomainSkill((rows) => rows.filter((_, i) => i !== idx))}
                              className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              删除
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-mono">{row.domain_code}</td>
                          <td className="px-4 py-3">{row.skill_id}</td>
                          <td className="px-4 py-3">{row.priority}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <SectionHeader
              title="关键词 → 领域"
              editing={editing}
              onAdd={() => setEditKeywordDomain((rows) => [...rows, { keyword: '', domain_code: '' }])}
            />
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-left font-medium text-slate-700">关键词</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-700">领域</th>
                    {editing && <th className="px-4 py-3 text-right font-medium text-slate-700">操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {(editing ? editKeywordDomain : keywordDomain).map((row, idx) => (
                    <tr key={`${row.keyword || 'new'}-${idx}`} className="border-b border-slate-100">
                      {editing ? (
                        <>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editKeywordDomain[idx]?.keyword ?? ''}
                              onChange={(e) =>
                                setEditKeywordDomain((rows) =>
                                  rows.map((item, i) => (i === idx ? { ...item, keyword: e.target.value } : item))
                                )
                              }
                              aria-label="关键词"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="text"
                              value={editKeywordDomain[idx]?.domain_code ?? ''}
                              onChange={(e) =>
                                setEditKeywordDomain((rows) =>
                                  rows.map((item, i) => (i === idx ? { ...item, domain_code: e.target.value } : item))
                                )
                              }
                              aria-label="关键词映射领域"
                              className="w-full rounded border border-slate-300 px-2 py-1 text-sm font-mono"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setEditKeywordDomain((rows) => rows.filter((_, i) => i !== idx))}
                              className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              删除
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3">{row.keyword}</td>
                          <td className="px-4 py-3 font-mono">{row.domain_code}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
      )}
    </PermissionGuard>
  )
}
