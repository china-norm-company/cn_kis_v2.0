/**
 * 变更管理中心
 *
 * 变更列表 + 创建变更 + 影响分析弹窗 + 审批状态跟踪
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowApi } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { DataTable, Badge, Button, Modal, Empty, Card } from '@cn-kis/ui-kit'
import type { Column, BadgeVariant } from '@cn-kis/ui-kit'
import {
  GitPullRequest, Plus, AlertTriangle,
  XCircle, Clock, Search,
  FileText, Loader2,
} from 'lucide-react'
import { ImpactAnalysisPanel } from '../components/ImpactAnalysisPanel'

interface ChangeItem {
  id: number
  business_type: string
  status: string
  current_step: number
  initiator_name: string
  description: string
  create_time: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: '审批中', variant: 'warning' },
  approved: { label: '已批准', variant: 'success' },
  rejected: { label: '已驳回', variant: 'error' },
  cancelled: { label: '已取消', variant: 'default' },
}

const TYPE_MAP: Record<string, string> = {
  protocol_amendment: '方案修正',
  schedule_change: '排程变更',
  deviation_escalation: '偏差升级',
}

export default function ChangeManagementPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState({
    business_type: 'protocol_amendment',
    description: '',
    impact_description: '',
  })

  const { data: listRes, isLoading } = useQuery({
    queryKey: ['workflow', 'changes'],
    queryFn: () => workflowApi.listChanges(),
  })

  const { data: impactRes, isLoading: impactLoading } = useQuery({
    queryKey: ['workflow', 'change-impact', selectedId],
    queryFn: () => workflowApi.getImpact(selectedId!),
    enabled: !!selectedId,
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => workflowApi.createChange(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', 'changes'] })
      setShowCreate(false)
      setForm({ business_type: 'protocol_amendment', description: '', impact_description: '' })
    },
  })

  const changes: ChangeItem[] = (listRes?.data as any)?.items ?? []
  const impact = (impactRes?.data as any)

  const columns: Column<ChangeItem>[] = [
    {
      key: 'id',
      title: 'ID',
      width: 70,
      render: (_, r) => <span className="font-mono text-xs text-slate-400">#{r.id}</span>,
    },
    {
      key: 'business_type',
      title: '变更类型',
      width: 120,
      render: (_, r) => (
        <span className="text-sm text-slate-700">{TYPE_MAP[r.business_type] || r.business_type}</span>
      ),
    },
    {
      key: 'description',
      title: '描述',
      render: (_, r) => (
        <span className="text-sm text-slate-600 truncate block max-w-xs">
          {(r as any).form_data?.description || r.description || '-'}
        </span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (_, r) => {
        const info = STATUS_MAP[r.status] || { label: r.status, variant: 'default' as BadgeVariant }
        return <Badge variant={info.variant}>{info.label}</Badge>
      },
    },
    {
      key: 'create_time',
      title: '创建时间',
      width: 160,
      render: (_, r) => (
        <span className="text-xs text-slate-500">
          {r.create_time ? new Date(r.create_time).toLocaleString('zh-CN') : '-'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">变更管理</h2>
          <p className="mt-1 text-sm text-slate-500">发起变更请求、查看影响分析、跟踪审批状态</p>
        </div>
        <PermissionGuard permission="workflow.change.create">
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            发起变更
          </Button>
        </PermissionGuard>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <div className="text-2xl font-bold text-slate-800">{changes.length}</div>
          <div className="text-xs text-slate-500 mt-1">变更总数</div>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 text-center">
          <div className="text-2xl font-bold text-amber-700">{changes.filter(c => c.status === 'pending').length}</div>
          <div className="text-xs text-amber-600 mt-1">审批中</div>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{changes.filter(c => c.status === 'approved').length}</div>
          <div className="text-xs text-green-600 mt-1">已批准</div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center">
          <div className="text-2xl font-bold text-red-700">{changes.filter(c => c.status === 'rejected').length}</div>
          <div className="text-xs text-red-600 mt-1">已驳回</div>
        </div>
      </div>

      {/* Table */}
      <Card className="!p-0">
        <DataTable<ChangeItem>
          columns={columns}
          data={changes}
          loading={isLoading}
          rowKey="id"
          onRowClick={(r) => setSelectedId(r.id)}
        />
      </Card>

      {/* Impact Analysis Modal */}
      <Modal
        isOpen={!!selectedId}
        onClose={() => setSelectedId(null)}
        title="变更影响分析"
      >
        <ImpactAnalysisPanel impact={impact} isLoading={impactLoading} />
      </Modal>

      {/* Create Change Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="发起变更请求"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">变更类型 *</label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.business_type}
              onChange={(e) => setForm({ ...form, business_type: e.target.value })}
              title="选择变更类型"
            >
              <option value="protocol_amendment">方案修正</option>
              <option value="schedule_change">排程变更</option>
              <option value="deviation_escalation">偏差升级</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">变更描述 *</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="描述变更内容和原因..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">影响评估</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none"
              value={form.impact_description}
              onChange={(e) => setForm({ ...form, impact_description: e.target.value })}
              placeholder="预估影响范围..."
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
            <Button
              onClick={() => createMutation.mutate({
                business_type: form.business_type,
                description: form.description,
                form_data: { description: form.description, impact: form.impact_description },
              })}
              disabled={!form.description.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? '提交中...' : '提交变更'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
