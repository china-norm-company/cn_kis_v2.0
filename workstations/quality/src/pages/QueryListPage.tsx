/**
 * P2.3: 数据质疑管理
 *
 * 列表展示所有 DataQuery，支持创建/回复/关闭
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Card, DataTable, Badge, StatCard, Modal, Button, Input, Select, type Column } from '@cn-kis/ui-kit'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { MessageSquare, AlertCircle, CheckCircle, Plus, MessageCircle } from 'lucide-react'

interface Query {
  id: number
  crf_record_id: number
  field_name: string
  query_text: string
  severity: string
  status: 'open' | 'answered' | 'closed'
  answer_text: string | null
  raised_by: number | null
  answered_by: number | null
  closed_by: number | null
  create_time: string
  answer_time: string | null
  close_time: string | null
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'error' | 'warning' | 'success' }> = {
  open: { label: '待回复', variant: 'error' },
  answered: { label: '已回复', variant: 'warning' },
  closed: { label: '已关闭', variant: 'success' },
}

const filterStatusOptions = [
  { value: '', label: '全部状态' },
  { value: 'open', label: '待回复' },
  { value: 'answered', label: '已回复' },
  { value: 'closed', label: '已关闭' },
]

const severityOptions = [
  { value: 'normal', label: '普通' },
  { value: 'critical', label: '严重' },
]

export function QueryListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [filterStatus, setFilterStatus] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showAnswer, setShowAnswer] = useState(false)
  const [answerTarget, setAnswerTarget] = useState<Query | null>(null)
  const [form, setForm] = useState({ crf_record_id: '', field_name: '', query_text: '', severity: 'normal' })
  const [answerText, setAnswerText] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['queries', page, pageSize, filterStatus],
    queryFn: () => api.get<{ items: Query[]; total: number }>('/edc/queries/list', {
      params: { page, page_size: pageSize, ...(filterStatus ? { status: filterStatus } : {}) },
    }),
  })

  const { data: statsRes } = useQuery({
    queryKey: ['query-stats'],
    queryFn: () => api.get<Record<string, number>>('/edc/queries/stats'),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/edc/queries/create', {
      crf_record_id: Number(form.crf_record_id),
      field_name: form.field_name,
      query_text: form.query_text,
      severity: form.severity,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['queries'] }); setShowCreate(false) },
  })

  const answerMutation = useMutation({
    mutationFn: () => api.post<any>(`/edc/queries/${answerTarget?.id}/answer`, { answer_text: answerText }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['queries'] }); setShowAnswer(false); setAnswerText('') },
  })

  const closeMutation = useMutation({
    mutationFn: (id: number) => api.post<any>(`/edc/queries/${id}/close`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['queries'] }),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsRes?.data ?? {}

  const columns: Column<Query>[] = [
    { key: 'id', title: 'ID', width: 60, render: (val) => <span className="font-mono text-xs">Q#{val as number}</span> },
    { key: 'crf_record_id', title: 'CRF记录', width: 100, render: (val) => `#${val}` },
    { key: 'field_name', title: '字段', width: 120 },
    { key: 'query_text', title: '质疑内容' },
    { key: 'severity', title: '级别', width: 70, render: (val) => <Badge variant={val === 'critical' ? 'error' : 'default'}>{val as string}</Badge> },
    {
      key: 'status',
      title: '状态',
      width: 80,
      render: (val) => {
        const info = statusMap[val as string]
        return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
      },
    },
    { key: 'answer_text', title: '回复', render: (val) => val ? <span className="text-xs text-slate-600 truncate max-w-[200px] block">{val as string}</span> : <span className="text-xs text-slate-300">--</span> },
    {
      key: 'create_time',
      title: '创建时间',
      width: 100,
      render: (val) => val ? new Date(val as string).toLocaleDateString() : '-',
    },
    {
      key: 'id' as any,
      title: '操作',
      width: 120,
      render: (_, row) => {
        const q = row as Query
        return (
          <div className="flex gap-1">
            {q.status === 'open' && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => { setAnswerTarget(q); setShowAnswer(true) }}
              >
                回复
              </Button>
            )}
            {(q.status === 'open' || q.status === 'answered') && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => closeMutation.mutate(q.id)}
              >
                关闭
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">数据质疑</h1>
        <PermissionGuard permission="quality.query.create">
          <Button className="min-h-11" title="发起数据质疑" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            发起质疑
          </Button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="待回复" value={stats.open ?? 0} icon={<AlertCircle className="w-6 h-6" />} />
        <StatCard title="已回复" value={stats.answered ?? 0} icon={<MessageCircle className="w-6 h-6" />} />
        <StatCard title="已关闭" value={stats.closed ?? 0} icon={<CheckCircle className="w-6 h-6" />} />
        <StatCard title="总计" value={stats.total ?? 0} icon={<MessageSquare className="w-6 h-6" />} />
      </div>

      <div className="flex items-center gap-3 overflow-x-auto bg-white rounded-lg border border-slate-200 p-3">
        <Select
          label="状态"
          value={filterStatus}
          className="min-h-11"
          title="状态筛选"
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          options={filterStatusOptions}
        />
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[1200px]">
          <DataTable<Query>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无数据质疑"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
          </div>
        </div>
      </Card>

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="发起数据质疑"
        size="md"
        footer={
          <>
            <Button variant="ghost" className="min-h-11" title="取消发起" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              className="min-h-11"
              title="提交质疑"
              loading={createMutation.isPending}
              disabled={!form.crf_record_id || !form.field_name || !form.query_text}
              onClick={() => createMutation.mutate()}
            >
              提交
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="CRF 记录 ID *"
              type="number"
              value={form.crf_record_id}
              inputClassName="min-h-11"
              title="CRF记录ID"
              onChange={e => setForm(p => ({ ...p, crf_record_id: e.target.value }))}
              placeholder=""
            />
            <Input
              label="字段名称 *"
              value={form.field_name}
              inputClassName="min-h-11"
              title="字段名称"
              onChange={e => setForm(p => ({ ...p, field_name: e.target.value }))}
              placeholder=""
            />
          </div>
          <div>
            <label htmlFor="query-text" className="text-xs text-slate-500">质疑内容 *</label>
            <textarea
              id="query-text"
              title="质疑内容"
              value={form.query_text}
              onChange={e => setForm(p => ({ ...p, query_text: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
              rows={3}
              placeholder="输入质疑内容"
            />
          </div>
          <Select
            label="级别"
            value={form.severity}
            className="min-h-11"
            title="质疑级别"
            onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}
            options={severityOptions}
          />
        </div>
      </Modal>

      <Modal
        isOpen={showAnswer && !!answerTarget}
        onClose={() => { setShowAnswer(false); setAnswerTarget(null) }}
        title="回复质疑"
        size="md"
        footer={
          <>
            <Button variant="ghost" className="min-h-11" title="取消回复" onClick={() => { setShowAnswer(false); setAnswerTarget(null) }}>
              取消
            </Button>
            <Button
              className="min-h-11"
              title="提交回复"
              loading={answerMutation.isPending}
              disabled={!answerText}
              onClick={() => answerMutation.mutate()}
            >
              回复
            </Button>
          </>
        }
      >
        {answerTarget && (
          <>
            <div className="text-sm text-slate-500 mb-4 p-3 bg-slate-50 rounded-lg">
              <div className="font-medium text-slate-700 mb-1">Q#{answerTarget.id} · 字段: {answerTarget.field_name}</div>
              <div>{answerTarget.query_text}</div>
            </div>
            <div>
              <label htmlFor="query-answer-text" className="text-xs text-slate-500">回复内容 *</label>
              <textarea
                id="query-answer-text"
              title="回复内容"
                value={answerText}
                onChange={e => setAnswerText(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                rows={3}
                placeholder="输入回复..."
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
