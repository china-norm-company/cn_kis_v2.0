import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DataTable, Button, Badge, Card, Modal, Input, Select, Empty } from '@cn-kis/ui-kit'
import type { Column, BadgeVariant } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { CalendarCheck, Plus, ChevronRight } from 'lucide-react'

interface VisitPlan {
  id: number
  protocol_id: number
  name: string
  description: string
  status: string
  create_time: string
  update_time: string
  [key: string]: unknown
}

interface VisitNode {
  id: number
  plan_id: number
  name: string
  baseline_day: number
  window_before: number
  window_after: number
  status: string
  order: number
  create_time: string
}

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: '草稿', variant: 'default' },
  active: { label: '进行中', variant: 'success' },
  completed: { label: '已完成', variant: 'primary' },
  cancelled: { label: '已取消', variant: 'error' },
}

export function VisitListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', protocol_id: '', description: '' })
  const pageSize = 10

  // 访视计划列表
  const { data, isLoading } = useQuery({
    queryKey: ['visit-plans', page, pageSize],
    queryFn: () =>
      api.get<{ items: VisitPlan[]; total: number; page: number; page_size: number }>(
        '/visit/plans',
        { params: { page, page_size: pageSize } }
      ),
  })

  // 选中计划的节点
  const { data: planDetail } = useQuery({
    queryKey: ['visit-plan-detail', selectedPlanId],
    queryFn: () => api.get<{ id: number; name: string; nodes: VisitNode[] }>(`/visit/plans/${selectedPlanId}`),
    enabled: !!selectedPlanId,
  })

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; protocol_id: number; description: string }) =>
      api.post('/visit/plans/create', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visit-plans'] })
      setShowCreate(false)
      setForm({ name: '', protocol_id: '', description: '' })
    },
  })

  const activateMutation = useMutation({
    mutationFn: (planId: number) => api.post(`/visit/plans/${planId}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visit-plans'] })
      queryClient.invalidateQueries({ queryKey: ['visit-plan-detail'] })
    },
  })

  const plans = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const nodes = planDetail?.data?.nodes ?? []

  const columns: Column<VisitPlan>[] = [
    {
      key: 'name',
      title: '计划名称',
      render: (_, record) => (
        <span className="font-medium text-slate-800">{record.name}</span>
      ),
    },
    {
      key: 'protocol_id',
      title: '协议 ID',
      width: 90,
      render: (_, record) => <span className="font-mono text-sm">#{record.protocol_id}</span>,
    },
    {
      key: 'status',
      title: '状态',
      width: 90,
      render: (_, record) => {
        const info = STATUS_MAP[record.status] ?? { label: record.status, variant: 'default' as BadgeVariant }
        return <Badge variant={info.variant}>{info.label}</Badge>
      },
    },
    {
      key: 'create_time',
      title: '创建时间',
      width: 160,
      render: (_, record) => (
        <span className="text-slate-500 text-sm">{new Date(record.create_time).toLocaleString('zh-CN')}</span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: 160,
      render: (_, record) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setSelectedPlanId(record.id)}>
            查看节点 <ChevronRight className="w-3 h-3" />
          </Button>
          {record.status === 'draft' && (
            <Button size="sm" variant="secondary" onClick={() => activateMutation.mutate(record.id)}>
              激活
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">访视管理</h2>
          <p className="mt-1 text-sm text-slate-500">管理受试者访视计划与执行记录</p>
        </div>
        <PermissionGuard permission="visit.plan.create">
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            新建计划
          </Button>
        </PermissionGuard>
      </div>

      {/* 访视计划列表 */}
      <Card className="!p-0">
        <DataTable<VisitPlan>
          columns={columns}
          data={plans}
          loading={isLoading}
          rowKey="id"
          pagination={{ current: page, pageSize, total, onChange: setPage }}
        />
      </Card>

      {/* 选中计划的节点详情 */}
      {selectedPlanId && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-800">
              访视节点 — {planDetail?.data?.name}
            </h3>
            <Button size="sm" variant="ghost" onClick={() => setSelectedPlanId(null)}>关闭</Button>
          </div>
          {nodes.length > 0 ? (
            <div className="space-y-2">
              {nodes.map((node) => (
                <div key={node.id} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                  <CalendarCheck className="w-5 h-5 text-primary-500 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-slate-800">{node.name}</div>
                    <div className="text-xs text-slate-500">
                      Day {node.baseline_day} (窗口期: -{node.window_before} ~ +{node.window_after} 天)
                    </div>
                  </div>
                  <Badge variant={STATUS_MAP[node.status]?.variant ?? 'default'}>
                    {STATUS_MAP[node.status]?.label ?? node.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="暂无访视节点" description="该计划还未创建访视节点" />
          )}
        </Card>
      )}

      {/* 新建计划弹窗 */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新建访视计划">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">计划名称 *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="输入计划名称" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">协议 ID *</label>
            <Input type="number" value={form.protocol_id} onChange={(e) => setForm({ ...form, protocol_id: e.target.value })} placeholder="关联协议 ID" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="访视计划描述（可选）" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
            <Button
              onClick={() => createMutation.mutate({
                name: form.name,
                protocol_id: parseInt(form.protocol_id),
                description: form.description,
              })}
              disabled={!form.name.trim() || !form.protocol_id}
            >
              创建
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
