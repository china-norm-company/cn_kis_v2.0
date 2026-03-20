/**
 * B4: 结项管理
 *
 * 结项列表 + 检查清单详情 + 复盘区域
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, closeoutApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import { StatCard, Badge, DataTable, Empty, Card, Button, Modal, Input, DigitalWorkerActionCard } from '@cn-kis/ui-kit'
import type { Column, BadgeVariant } from '@cn-kis/ui-kit'
import {
  Archive, PlayCircle, CheckCircle2, XCircle, ArrowLeft,
  ClipboardCheck, FileText, Database, ShieldCheck, Banknote,
  RotateCcw, Loader2, BookOpen, ExternalLink,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CloseoutItem {
  id: number
  project_name: string
  status: string
  initiated_at: string
  check_progress: number
  [key: string]: unknown
}

interface ChecklistItem {
  id: number
  group: string
  label: string
  type: 'auto' | 'manual'
  passed: boolean | null
  confirmed: boolean
}

interface CloseoutDetail {
  id: number
  project_name: string
  status: string
  initiated_at: string
  check_progress: number
  checklist: ChecklistItem[]
  retrospective: {
    went_well: string
    to_improve: string
    action_items: string
    lessons_learned: string
  } | null
  retrospectives?: Array<{
    id: number
    what_went_well: string[]
    what_to_improve: string[]
    action_items: string[]
    lessons_learned: string[]
    create_time: string
    knowledge_entry_id: number | null
    knowledge_entry_status: string | null
  }>
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  initiated: { label: '已发起', variant: 'info' },
  checking: { label: '检查中', variant: 'warning' },
  review: { label: '审核中', variant: 'primary' },
  archived: { label: '已归档', variant: 'default' },
}

const GROUP_META: Record<string, { label: string; icon: React.ReactNode }> = {
  document_completeness: { label: '文档完整性', icon: <FileText className="w-4 h-4" /> },
  data_completeness: { label: '数据完整性', icon: <Database className="w-4 h-4" /> },
  quality_compliance: { label: '质量合规', icon: <ShieldCheck className="w-4 h-4" /> },
  business_settlement: { label: '商务结算', icon: <Banknote className="w-4 h-4" /> },
}

const GROUP_ORDER = [
  'document_completeness',
  'data_completeness',
  'quality_compliance',
  'business_settlement',
]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CloseoutPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showInitiate, setShowInitiate] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  // retrospective form state
  const [retroForm, setRetroForm] = useState({
    went_well: '',
    to_improve: '',
    action_items: '',
    lessons_learned: '',
  })

  const pageSize = 10

  /* ----- Queries ----- */

  const { data: listRes, isLoading: listLoading } = useQuery({
    queryKey: ['closeout', 'list', page, pageSize],
    queryFn: () =>
      api.get<{ items: CloseoutItem[]; total: number }>(
        '/closeout/list',
        { params: { page, page_size: pageSize } },
      ),
  })

  const { data: detailRes, isLoading: detailLoading } = useQuery({
    queryKey: ['closeout', 'detail', selectedId],
    queryFn: () => api.get<CloseoutDetail>(`/closeout/${selectedId}`),
    enabled: !!selectedId,
  })

  /* ----- Mutations ----- */

  const initiateMutation = useMutation({
    mutationFn: (payload: { project_name: string }) =>
      api.post('/closeout/initiate', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closeout', 'list'] })
      setShowInitiate(false)
      setNewProjectName('')
    },
  })

  const autoCheckMutation = useMutation({
    mutationFn: (id: number) => api.post(`/closeout/${id}/auto-check`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closeout', 'detail', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['closeout', 'list'] })
    },
  })

  const confirmItemMutation = useMutation({
    mutationFn: ({ closeoutId, itemId }: { closeoutId: number; itemId: number }) =>
      api.post(`/closeout/${closeoutId}/checklist/${itemId}/confirm`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closeout', 'detail', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['closeout', 'list'] })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (id: number) => api.post(`/closeout/${id}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closeout', 'detail', selectedId] })
      queryClient.invalidateQueries({ queryKey: ['closeout', 'list'] })
    },
  })

  const retroMutation = useMutation({
    mutationFn: (closeoutId: number) =>
      api.post(`/closeout/${closeoutId}/retrospective`, {
        what_went_well: retroForm.went_well.split('\n').filter(Boolean),
        what_to_improve: retroForm.to_improve.split('\n').filter(Boolean),
        action_items: retroForm.action_items.split('\n').filter(Boolean),
        lessons_learned: retroForm.lessons_learned.split('\n').filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closeout', 'detail', selectedId] })
      setRetroForm({ went_well: '', to_improve: '', action_items: '', lessons_learned: '' })
    },
  })
  const generateReportRetroMutation = useMutation({
    mutationFn: (closeoutId: number) =>
      closeoutApi.createRetrospective(closeoutId, {
        what_went_well: ['数字员工已完成结项检查信息汇总'],
        what_to_improve: ['补充最终报告审阅与交付确认'],
        action_items: ['生成结项报告初稿', '复核交付清单'],
        lessons_learned: ['将本次结项经验沉淀为知识条目'],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closeout', 'detail', selectedId] })
    },
  })

  /* ----- Derived data ----- */

  const items = listRes?.data?.items ?? []
  const total = listRes?.data?.total ?? 0
  const detail = detailRes?.data

  const groupedChecklist = detail
    ? GROUP_ORDER.map((group) => ({
        group,
        ...GROUP_META[group],
        items: detail.checklist.filter((c) => c.group === group),
      }))
    : []

  /* ----- Table columns ----- */

  const columns: Column<CloseoutItem>[] = [
    {
      key: 'id',
      title: 'ID',
      width: 80,
      render: (_, r) => <span className="font-mono text-sm text-slate-500">#{r.id}</span>,
    },
    { key: 'project_name', title: '项目名称' },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (_, r) => {
        const info = STATUS_MAP[r.status] ?? { label: r.status, variant: 'default' as BadgeVariant }
        return <Badge variant={info.variant}>{info.label}</Badge>
      },
    },
    {
      key: 'initiated_at',
      title: '发起时间',
      width: 170,
      render: (_, r) => (
        <span className="text-sm text-slate-500">
          {r.initiated_at ? new Date(r.initiated_at).toLocaleString('zh-CN') : '-'}
        </span>
      ),
    },
    {
      key: 'check_progress',
      title: '检查进度',
      width: 160,
      render: (_, r) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${Math.min(r.check_progress, 100)}%` }}
            />
          </div>
          <span className="text-xs text-slate-500 w-10 text-right">{r.check_progress}%</span>
        </div>
      ),
    },
  ]

  /* ----- Detail view ----- */

  if (selectedId && detail) {
    const statusInfo = STATUS_MAP[detail.status] ?? { label: detail.status, variant: 'default' as BadgeVariant }

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedId(null)}
            className="p-2 hover:bg-slate-100 rounded-lg"
            title="返回列表"
          >
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-slate-800">{detail.project_name}</h2>
            <p className="text-sm text-slate-500 mt-1">
              结项检查 · 发起于 {new Date(detail.initiated_at).toLocaleString('zh-CN')}
            </p>
          </div>
          <Badge variant={statusInfo.variant} size="md">{statusInfo.label}</Badge>
        </div>

        {/* Progress bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">整体检查进度</span>
            <span className="text-sm font-semibold text-slate-800">{detail.check_progress}%</span>
          </div>
          <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{ width: `${Math.min(detail.check_progress, 100)}%` }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <Button
            icon={<RotateCcw className="w-4 h-4" />}
            variant="secondary"
            onClick={() => autoCheckMutation.mutate(detail.id)}
            loading={autoCheckMutation.isPending}
          >
            触发自动检查
          </Button>
          {detail.status !== 'archived' && (
            <Button
              icon={<Archive className="w-4 h-4" />}
              variant="primary"
              disabled={detail.check_progress < 100}
              loading={archiveMutation.isPending}
              onClick={() => {
                if (confirm('确定要归档此项目吗？归档后项目状态将变为已完成。')) {
                  archiveMutation.mutate(detail.id)
                }
              }}
            >
              归档项目
            </Button>
          )}
        </div>

        <DigitalWorkerActionCard
          roleCode="report_generator"
          roleName="报告生成员"
          title="生成结项报告与复盘摘要"
          description="报告生成员可基于当前结项检查进度、检查清单与复盘内容，生成结项报告初稿和复盘摘要。"
          items={[]}
          onAccept={() => generateReportRetroMutation.mutate(detail.id)}
          loading={generateReportRetroMutation.isPending}
          acceptLabel="写入复盘摘要"
        />

        {/* Checklist groups */}
        <div className="grid grid-cols-2 gap-6">
          {groupedChecklist.map((group) => (
            <div key={group.group} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-slate-100 rounded-lg text-slate-600">
                  {group.icon}
                </div>
                <h3 className="text-sm font-semibold text-slate-700">{group.label}</h3>
                <span className="text-xs text-slate-400 ml-auto">
                  {group.items.filter((i) => i.passed === true || i.confirmed).length}/{group.items.length}
                </span>
              </div>
              <div className="space-y-2">
                {group.items.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">暂无检查项</p>
                ) : (
                  group.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-50"
                    >
                      {item.type === 'auto' ? (
                        item.passed === true ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : item.passed === false ? (
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                        )
                      ) : (
                        <input
                          type="checkbox"
                          checked={item.confirmed}
                          title={`确认: ${item.label}`}
                          onChange={() =>
                            confirmItemMutation.mutate({
                              closeoutId: detail.id,
                              itemId: item.id,
                            })
                          }
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      )}
                      <span className="text-sm text-slate-700 flex-1">{item.label}</span>
                      <Badge variant={item.type === 'auto' ? 'info' : 'default'} size="sm">
                        {item.type === 'auto' ? '自动' : '手动'}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Retrospective */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-5">
            <ClipboardCheck className="w-5 h-5 text-slate-600" />
            <h3 className="text-base font-semibold text-slate-700">项目复盘</h3>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">做得好的方面</label>
              <textarea
                className="w-full h-28 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                placeholder="每行一条..."
                value={retroForm.went_well}
                onChange={(e) => setRetroForm((f) => ({ ...f, went_well: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">待改进之处</label>
              <textarea
                className="w-full h-28 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                placeholder="每行一条..."
                value={retroForm.to_improve}
                onChange={(e) => setRetroForm((f) => ({ ...f, to_improve: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">行动项</label>
              <textarea
                className="w-full h-28 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                placeholder="每行一条..."
                value={retroForm.action_items}
                onChange={(e) => setRetroForm((f) => ({ ...f, action_items: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">经验教训</label>
              <textarea
                className="w-full h-28 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                placeholder="每行一条..."
                value={retroForm.lessons_learned}
                onChange={(e) => setRetroForm((f) => ({ ...f, lessons_learned: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              variant="primary"
              loading={retroMutation.isPending}
              disabled={!retroForm.went_well && !retroForm.to_improve && !retroForm.action_items && !retroForm.lessons_learned}
              onClick={() => selectedId && retroMutation.mutate(selectedId)}
            >
              保存复盘
            </Button>
          </div>

          {/* 已有复盘记录与知识条目反向状态 */}
          {(detail.retrospectives ?? []).length > 0 && (
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-slate-500" />
                <h4 className="text-sm font-medium text-slate-700">已保存的复盘记录</h4>
                <span className="text-xs text-slate-400">（含知识沉淀状态）</span>
              </div>
              {(detail.retrospectives ?? []).map((retro) => {
                const entryStatus = retro.knowledge_entry_status
                const statusConfig: Record<string, { label: string; color: string }> = {
                  pending_review: { label: '待审核', color: 'text-amber-600 bg-amber-50 border-amber-200' },
                  published: { label: '已发布', color: 'text-green-700 bg-green-50 border-green-200' },
                  rejected: { label: '已拒绝', color: 'text-red-600 bg-red-50 border-red-200' },
                  draft: { label: '草稿', color: 'text-slate-500 bg-slate-50 border-slate-200' },
                }
                const config = entryStatus ? statusConfig[entryStatus] ?? { label: entryStatus, color: 'text-slate-500 bg-slate-50 border-slate-200' } : null

                return (
                  <div key={retro.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-500 mb-2">
                          {new Date(retro.create_time).toLocaleString('zh-CN')}
                        </div>
                        {retro.lessons_learned.length > 0 && (
                          <div className="text-sm text-slate-700">
                            <span className="font-medium">经验教训：</span>
                            {retro.lessons_learned.slice(0, 2).join('；')}
                            {retro.lessons_learned.length > 2 && `…（共 ${retro.lessons_learned.length} 条）`}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {retro.knowledge_entry_id && config ? (
                          <>
                            <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${config.color}`}>
                              <BookOpen className="w-3 h-3" />
                              知识条目 #{retro.knowledge_entry_id} · {config.label}
                            </span>
                            {entryStatus === 'pending_review' && (
                              <a
                                href={getWorkstationUrl('digital-workforce', '#/knowledge-review')}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              >
                                去审核 <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">未生成知识条目</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ----- Detail loading state ----- */

  if (selectedId && detailLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        <span className="ml-2 text-sm text-slate-400">加载中...</span>
      </div>
    )
  }

  /* ----- List view ----- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">结项管理</h2>
          <p className="mt-1 text-sm text-slate-500">管理项目结项流程，确保结项合规完整</p>
        </div>
        <Button
          icon={<PlayCircle className="w-4 h-4" />}
          onClick={() => setShowInitiate(true)}
        >
          发起结项
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="结项总数"
          value={total}
          icon={<ClipboardCheck className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="检查中"
          value={items.filter((i) => i.status === 'checking').length}
          icon={<RotateCcw className="w-5 h-5" />}
          color="amber"
        />
        <StatCard
          title="审核中"
          value={items.filter((i) => i.status === 'review').length}
          icon={<ShieldCheck className="w-5 h-5" />}
          color="purple"
        />
        <StatCard
          title="已归档"
          value={items.filter((i) => i.status === 'archived').length}
          icon={<Archive className="w-5 h-5" />}
          color="green"
        />
      </div>

      {/* Table */}
      <Card className="!p-0">
        <DataTable<CloseoutItem>
          columns={columns}
          data={items}
          loading={listLoading}
          rowKey="id"
          onRowClick={(record) => setSelectedId(record.id)}
          pagination={{ current: page, pageSize, total, onChange: setPage }}
        />
      </Card>

      {/* Initiate modal */}
      <Modal
        isOpen={showInitiate}
        onClose={() => setShowInitiate(false)}
        title="发起结项"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">项目名称 *</label>
            <Input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="输入需要结项的项目名称"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowInitiate(false)}>取消</Button>
            <Button
              onClick={() => initiateMutation.mutate({ project_name: newProjectName })}
              disabled={!newProjectName.trim()}
              loading={initiateMutation.isPending}
            >
              发起
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
