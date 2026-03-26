/**
 * 变更管理
 *
 * 管理项目执行过程中的所有变更：
 * - 协议变更（Protocol Amendment）
 * - 排程变更（Schedule Change）
 * - 偏差升级（Deviation Escalation → CAPA）
 * - 影响分析：变更对排程/工单/受试者的级联影响
 * - 审批流程跟踪（对接飞书审批）
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workflowApi, protocolApi } from '@cn-kis/api-client'
import type { WorkflowInstance, ImpactAnalysis } from '@cn-kis/api-client'
import { DataTable, Badge, Empty, StatCard, Modal, Button } from '@cn-kis/ui-kit'
import { GitBranch, AlertTriangle, FileText, Calendar, Plus, Eye } from 'lucide-react'

const CHANGE_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  protocol_amendment: { label: '协议变更', icon: <FileText className="w-4 h-4" /> },
  schedule_change: { label: '排程变更', icon: <Calendar className="w-4 h-4" /> },
  deviation_escalation: { label: '偏差升级', icon: <AlertTriangle className="w-4 h-4" /> },
}

const STATUS_LABELS: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' }> = {
  pending: { label: '审批中', color: 'warning' },
  approved: { label: '已通过', color: 'success' },
  rejected: { label: '已驳回', color: 'error' },
  cancelled: { label: '已撤销', color: 'default' },
}

export default function ChangeManagementPage() {
  const queryClient = useQueryClient()
  const [filterType, setFilterType] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [page, setPage] = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedChangeId, setSelectedChangeId] = useState<number | null>(null)
  const [impactData, setImpactData] = useState<ImpactAnalysis | null>(null)
  const [showImpact, setShowImpact] = useState(false)

  // Change list
  const { data: changesRes, isLoading } = useQuery({
    queryKey: ['workflow', 'changes', filterType, filterStatus, page],
    queryFn: () => workflowApi.listChanges({
      business_type: filterType || undefined,
      status: filterStatus || undefined,
      page,
      page_size: 20,
    }),
    refetchInterval: 30_000,
  })

  const changes = ((changesRes?.data as any)?.items ?? []) as (WorkflowInstance & { business_type: string; business_id: string; initiator_id: number })[]
  const totalChanges = (changesRes?.data as any)?.total ?? 0

  // Impact analysis mutation
  const impactMutation = useMutation({
    mutationFn: (id: number) => workflowApi.getImpact(id),
    onSuccess: (res) => {
      setImpactData(res.data as any)
      setShowImpact(true)
    },
  })

  // Stats
  const pendingCount = changes.filter(c => c.status === 'pending').length
  const approvedCount = changes.filter(c => c.status === 'approved').length

  const columns = [
    { key: 'id', header: 'ID', render: (c: any) => <span className="text-xs text-slate-500">#{c.id}</span> },
    { key: 'title', header: '变更标题', render: (c: any) => <span className="font-medium text-slate-800">{c.title}</span> },
    {
      key: 'business_type', header: '类型', render: (c: any) => {
        const info = CHANGE_TYPE_LABELS[c.business_type]
        return (
          <div className="flex items-center gap-1.5">
            {info?.icon}
            <span className="text-sm">{info?.label || c.business_type}</span>
          </div>
        )
      },
    },
    {
      key: 'status', header: '状态', render: (c: any) => {
        const info = STATUS_LABELS[c.status] || { label: c.status, color: 'default' as const }
        return <Badge variant={info.color}>{info.label}</Badge>
      },
    },
    { key: 'create_time', header: '创建时间', render: (c: any) => c.create_time?.split('T')[0] || '-' },
    {
      key: 'actions', header: '操作', render: (c: any) => (
        <button
          onClick={(e) => { e.stopPropagation(); impactMutation.mutate(c.id) }}
          className="text-primary-600 hover:text-primary-700 text-sm flex items-center gap-1"
        >
          <Eye className="w-3.5 h-3.5" /> 影响分析
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">变更管理</h2>
          <p className="text-sm text-slate-500 mt-1">协议变更、排程调整、偏差升级的审批流程跟踪</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4 mr-1" /> 发起变更
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="总变更" value={totalChanges} icon={<GitBranch className="w-5 h-5" />} color="blue" />
        <StatCard label="审批中" value={pendingCount} icon={<AlertTriangle className="w-5 h-5" />} color="amber" />
        <StatCard label="已通过" value={approvedCount} icon={<FileText className="w-5 h-5" />} color="green" />
      </div>

      {/* Type Cards */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(CHANGE_TYPE_LABELS).map(([key, info]) => (
          <div
            key={key}
            onClick={() => setFilterType(filterType === key ? '' : key)}
            className={`bg-white rounded-xl border p-4 cursor-pointer transition-colors ${
              filterType === key ? 'border-primary-400 bg-primary-50/30' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {info.icon}
              <span className="text-sm font-semibold text-slate-700">{info.label}</span>
            </div>
            <p className="text-xs text-slate-500">
              {key === 'protocol_amendment' ? '方案修正，含影响分析' : key === 'schedule_change' ? '排程调整，自动检测冲突' : '偏差 → CAPA 流转跟踪'}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          className="text-sm border border-slate-200 rounded-lg px-3 py-2"
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Change List */}
      <div className="bg-white rounded-xl border border-slate-200">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400">加载中...</div>
        ) : changes.length === 0 ? (
          <div className="p-12"><Empty message="暂无变更记录" /></div>
        ) : (
          <>
            <DataTable columns={columns} data={changes} />
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
              <span className="text-xs text-slate-500">共 {totalChanges} 条</span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 text-sm rounded border border-slate-200 disabled:opacity-50">上一页</button>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(totalChanges / 20)} className="px-3 py-1 text-sm rounded border border-slate-200 disabled:opacity-50">下一页</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Impact Analysis Modal */}
      {showImpact && impactData && (
        <Modal title="变更影响分析" onClose={() => setShowImpact(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{(impactData as any).affected_slots ?? 0}</div>
                <div className="text-xs text-blue-600 mt-1">受影响排程槽位</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-amber-700">{(impactData as any).affected_work_orders ?? 0}</div>
                <div className="text-xs text-amber-600 mt-1">受影响工单</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-purple-700">{(impactData as any).affected_enrollments ?? 0}</div>
                <div className="text-xs text-purple-600 mt-1">受影响受试者</div>
              </div>
            </div>

            {(impactData as any).slot_details?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-2">受影响的排程</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(impactData as any).slot_details.map((s: any) => (
                    <div key={s.id} className="text-xs p-2 bg-slate-50 rounded flex justify-between">
                      <span>{s.visit_node_name}</span>
                      <span className="text-slate-500">{s.scheduled_date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(impactData as any).workorder_details?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-2">受影响的工单</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(impactData as any).workorder_details.map((w: any) => (
                    <div key={w.id} className="text-xs p-2 bg-slate-50 rounded flex justify-between">
                      <span>{w.title}</span>
                      <Badge variant={w.status === 'in_progress' ? 'warning' : 'default'}>{w.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Create Change Modal */}
      {showCreateModal && (
        <CreateChangeModal onClose={() => setShowCreateModal(false)} onCreated={() => {
          setShowCreateModal(false)
          queryClient.invalidateQueries({ queryKey: ['workflow'] })
        }} />
      )}
    </div>
  )
}

function CreateChangeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [businessType, setBusinessType] = useState('protocol_amendment')
  const [title, setTitle] = useState('')
  const [businessId, setBusinessId] = useState('')
  const [description, setDescription] = useState('')

  const createMutation = useMutation({
    mutationFn: () => workflowApi.createChange({
      business_type: businessType,
      title,
      business_id: businessId || undefined,
      form_data: { description },
    }),
    onSuccess: () => onCreated(),
  })

  return (
    <Modal title="发起变更" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">变更类型</label>
          <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={businessType} onChange={e => setBusinessType(e.target.value)}>
            <option value="protocol_amendment">协议变更</option>
            <option value="schedule_change">排程变更</option>
            <option value="deviation_escalation">偏差升级</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">变更标题</label>
          <input type="text" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={title} onChange={e => setTitle(e.target.value)} placeholder="简要描述变更内容" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">关联业务 ID（协议/排程计划/偏差 ID）</label>
          <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={businessId} onChange={e => setBusinessId(e.target.value)} placeholder="可选" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">变更描述</label>
          <textarea className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm h-24" value={description} onChange={e => setDescription(e.target.value)} placeholder="详细描述变更原因和内容" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => createMutation.mutate()} disabled={!title || createMutation.isPending}>
            {createMutation.isPending ? '提交中...' : '提交'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
