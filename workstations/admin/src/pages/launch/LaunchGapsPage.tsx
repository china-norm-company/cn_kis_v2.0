import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { launchGovernanceApi, type LaunchGapItem } from '@cn-kis/api-client'
import { AlertTriangle, Plus } from 'lucide-react'

export function LaunchGapsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [gapType, setGapType] = useState('')
  const [relatedNode, setRelatedNode] = useState('')
  const [relatedWs, setRelatedWs] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [nextAction, setNextAction] = useState('')
  const [githubUrl, setGithubUrl] = useState('')
  const [feishuRef, setFeishuRef] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'launch-gaps'],
    queryFn: () => launchGovernanceApi.listGaps(),
  })

  const createMut = useMutation({
    mutationFn: () =>
      launchGovernanceApi.createGap({
        title,
        gap_type: gapType,
        related_node: relatedNode,
        related_workstation: relatedWs,
        blocked_loop: blocked,
        next_action: nextAction,
        github_issue_url: githubUrl,
        feishu_ref: feishuRef,
        severity: 'medium',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'launch-gaps'] })
      setShowForm(false)
      setTitle('')
      setGapType('')
      setRelatedNode('')
      setRelatedWs('')
      setBlocked(false)
      setNextAction('')
      setGithubUrl('')
      setFeishuRef('')
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      launchGovernanceApi.updateGap(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'launch-gaps'] }),
  })

  const items: LaunchGapItem[] = data?.items || []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800">问题与缺口</h2>
          <p className="text-sm text-slate-500 mt-1">承接开发群结论、GitHub、飞书线索的结构化沉淀</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1 rounded-lg bg-primary-600 text-white text-sm px-3 py-2 hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          登记缺口
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-sm">
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2"
            placeholder="标题 *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              className="border border-slate-200 rounded-lg px-3 py-2"
              placeholder="类型（如 流程断点）"
              value={gapType}
              onChange={(e) => setGapType(e.target.value)}
            />
            <input
              className="border border-slate-200 rounded-lg px-3 py-2"
              placeholder="闭环节点 key（如 workorder）"
              value={relatedNode}
              onChange={(e) => setRelatedNode(e.target.value)}
            />
            <input
              className="border border-slate-200 rounded-lg px-3 py-2"
              placeholder="工作台 key（如 recruitment）"
              value={relatedWs}
              onChange={(e) => setRelatedWs(e.target.value)}
            />
            <label className="flex items-center gap-2 text-slate-600">
              <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} />
              阻塞主闭环
            </label>
          </div>
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2"
            placeholder="GitHub Issue URL"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
          />
          <input
            className="w-full border border-slate-200 rounded-lg px-3 py-2"
            placeholder="飞书消息/文档引用"
            value={feishuRef}
            onChange={(e) => setFeishuRef(e.target.value)}
          />
          <textarea
            className="w-full border border-slate-200 rounded-lg px-3 py-2 min-h-[72px]"
            placeholder="下一步动作"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
          />
          <button
            type="button"
            disabled={!title.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
            className="rounded-lg bg-slate-800 text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            提交
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-slate-400 py-8 text-center">加载中…</div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">暂无缺口，可从开发群同步登记</div>
            ) : (
              items.map((g) => (
                <div key={g.id} className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">
                  <AlertTriangle
                    className={`w-5 h-5 shrink-0 mt-0.5 ${
                      g.blocked_loop ? 'text-red-500' : 'text-amber-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800">{g.title}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {g.gap_type || '未分类'} · 节点 {g.related_node || '—'} · 台 {g.related_workstation || '—'} ·
                      打开 {g.days_open} 天
                    </div>
                    {g.next_action ? (
                      <div className="text-sm text-slate-600 mt-2">{g.next_action}</div>
                    ) : null}
                    <div className="flex flex-wrap gap-2 mt-2 text-xs">
                      {g.github_issue_url ? (
                        <a
                          href={g.github_issue_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline"
                        >
                          GitHub
                        </a>
                      ) : null}
                      <span className="text-slate-400">状态: {g.status}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {g.status === 'open' ? (
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                        onClick={() => updateMut.mutate({ id: g.id, status: 'in_progress' })}
                      >
                        处理中
                      </button>
                    ) : null}
                    {g.status !== 'resolved' ? (
                      <button
                        type="button"
                        className="text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        onClick={() => updateMut.mutate({ id: g.id, status: 'resolved' })}
                      >
                        已解决
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
