import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import type { SampleDestructionItem } from '@cn-kis/api-client'
import { Trash2, Plus, ChevronLeft, ChevronRight, X, Eye, CheckCircle, Play } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

const DESTRUCTION_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  approved: 'bg-blue-50 text-blue-700 border-blue-200',
  destroyed: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
}

const DESTRUCTION_STATUS_LABELS: Record<string, string> = {
  pending: '待审批',
  approved: '已批准',
  destroyed: '已销毁',
  cancelled: '已取消',
}

const DESTRUCTION_METHODS = [
  { value: '焚烧', label: '焚烧' },
  { value: '化学处理', label: '化学处理' },
  { value: '高压灭菌', label: '高压灭菌' },
  { value: '粉碎', label: '粉碎' },
  { value: '其他', label: '其他' },
]

export function DestructionApprovalPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [approveId, setApproveId] = useState<number | null>(null)
  const [executeId, setExecuteId] = useState<number | null>(null)

  // Stats
  const { data: pendingData } = useQuery({
    queryKey: ['material', 'destructions', 'stats-pending'],
    queryFn: () => materialApi.listDestructions({ status: 'pending', page: 1, page_size: 1 }),
  })
  const { data: approvedData } = useQuery({
    queryKey: ['material', 'destructions', 'stats-approved'],
    queryFn: () => materialApi.listDestructions({ status: 'approved', page: 1, page_size: 1 }),
  })
  const { data: destroyedData } = useQuery({
    queryKey: ['material', 'destructions', 'stats-destroyed'],
    queryFn: () => materialApi.listDestructions({ status: 'destroyed', page: 1, page_size: 1 }),
  })
  const { data: cancelledData } = useQuery({
    queryKey: ['material', 'destructions', 'stats-cancelled'],
    queryFn: () => materialApi.listDestructions({ status: 'cancelled', page: 1, page_size: 1 }),
  })

  const pendingCount = (pendingData as any)?.data?.total ?? 0
  const approvedCount = (approvedData as any)?.data?.total ?? 0
  const destroyedCount = (destroyedData as any)?.data?.total ?? 0
  const cancelledCount = (cancelledData as any)?.data?.total ?? 0

  // Destruction list
  const { data: listData, isLoading } = useQuery({
    queryKey: ['material', 'destructions', { statusFilter, page }],
    queryFn: () =>
      materialApi.listDestructions({
        status: statusFilter || undefined,
        page,
        page_size: 20,
      }),
  })
  const list = (listData as any)?.data as { items: SampleDestructionItem[]; total: number } | undefined
  const items = list?.items ?? []
  const totalPages = Math.ceil((list?.total ?? 0) / 20)

  const statCards = [
    { label: '待审批', value: pendingCount, color: 'text-yellow-700' },
    { label: '已批准', value: approvedCount, color: 'text-blue-700' },
    { label: '已销毁', value: destroyedCount, color: 'text-green-700' },
    { label: '已取消', value: cancelledCount, color: 'text-red-600' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">销毁审批</h2>
          <p className="text-sm text-slate-500 mt-1">样品销毁申请、审批与执行</p>
        </div>
        <PermissionGuard permission="material.destruction.create">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
          >
            <Plus className="w-4 h-4" />申请销毁
          </button>
        </PermissionGuard>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500"
          aria-label="状态筛选"
        >
          <option value="">全部状态</option>
          <option value="pending">待审批</option>
          <option value="approved">已批准</option>
          <option value="destroyed">已销毁</option>
          <option value="cancelled">已取消</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Trash2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无销毁记录</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">销毁单号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">销毁原因</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">销毁方式</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">样品数量</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">申请人</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">申请时间</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.destruction_no}</td>
                  <td className="px-4 py-3 text-slate-800 max-w-[200px] truncate" title={item.destruction_reason}>
                    {item.destruction_reason}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.destruction_method}</td>
                  <td className="px-4 py-3 text-slate-600">{item.sample_count}</td>
                  <td className="px-4 py-3 text-slate-600">{item.applicant_name || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{item.create_time}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                        DESTRUCTION_STATUS_STYLES[item.status] || 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {DESTRUCTION_STATUS_LABELS[item.status] || item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {item.status === 'pending' && (
                        <button
                          onClick={() => setApproveId(item.id)}
                          className="p-1.5 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                          title="审批"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}
                      {item.status === 'approved' && (
                        <button
                          onClick={() => setExecuteId(item.id)}
                          className="p-1.5 text-green-500 hover:bg-green-50 rounded transition-colors"
                          title="执行销毁"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setDetailId(item.id)}
                        className="p-1.5 text-slate-400 hover:text-amber-600 transition-colors"
                        title="查看"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">共 {list?.total ?? 0} 条记录</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="上一页"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-600 px-3">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
              title="下一页"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateDestructionModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false)
            queryClient.invalidateQueries({ queryKey: ['material', 'destructions'] })
          }}
        />
      )}

      {/* Approve Modal */}
      {approveId && (
        <ApproveDestructionModal
          id={approveId}
          onClose={() => setApproveId(null)}
          onSuccess={() => {
            setApproveId(null)
            queryClient.invalidateQueries({ queryKey: ['material', 'destructions'] })
          }}
        />
      )}

      {/* Execute Modal */}
      {executeId && (
        <ExecuteDestructionModal
          id={executeId}
          onClose={() => setExecuteId(null)}
          onSuccess={() => {
            setExecuteId(null)
            queryClient.invalidateQueries({ queryKey: ['material', 'destructions'] })
          }}
        />
      )}

      {/* Detail Drawer */}
      {detailId && (
        <DestructionDetailDrawer
          item={items.find((i) => i.id === detailId)}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}

// ============================================================================
// Create Destruction Modal
// ============================================================================
function CreateDestructionModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    sampleIdsText: '',
    destruction_reason: '',
    destruction_method: '焚烧',
    destruction_location: '',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      const sampleIds = form.sampleIdsText
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.match(/^\d+$/) ? Number(s) : null))
        .filter((n): n is number => n !== null)
      if (sampleIds.length === 0) {
        throw new Error('请输入至少一个样品ID')
      }
      return materialApi.createDestruction({
        sample_ids: sampleIds,
        destruction_reason: form.destruction_reason,
        destruction_method: form.destruction_method,
        destruction_location: form.destruction_location || undefined,
      })
    },
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || err?.message || '申请失败'),
  })

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[520px] bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-semibold">申请销毁</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">样品ID *</span>
            <textarea
              value={form.sampleIdsText}
              onChange={(e) => set('sampleIdsText', e.target.value)}
              rows={3}
              placeholder="输入样品ID，多个用逗号或空格分隔，如：1, 2, 3"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">销毁原因 *</span>
            <textarea
              value={form.destruction_reason}
              onChange={(e) => set('destruction_reason', e.target.value)}
              rows={3}
              placeholder="请输入销毁原因"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">销毁方式 *</span>
            <select
              value={form.destruction_method}
              onChange={(e) => set('destruction_method', e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              {DESTRUCTION_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">销毁地点</span>
            <input
              value={form.destruction_location}
              onChange={(e) => set('destruction_location', e.target.value)}
              placeholder="销毁执行地点"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <div className="pt-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={!form.sampleIdsText || !form.destruction_reason || mutation.isPending}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '提交中...' : '提交申请'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Approve Destruction Modal
// ============================================================================
function ApproveDestructionModal({ id, onClose, onSuccess }: { id: number; onClose: () => void; onSuccess: () => void }) {
  const [approvalNotes, setApprovalNotes] = useState('')
  const [error, setError] = useState('')
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)

  const approveMut = useMutation({
    mutationFn: () => materialApi.approveDestruction(id, { approval_notes: approvalNotes || undefined }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '审批失败'),
  })

  const rejectMut = useMutation({
    mutationFn: () => materialApi.rejectDestruction(id, { approval_notes: approvalNotes || undefined }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '拒绝失败'),
  })

  const handleApprove = () => {
    setAction('approve')
    approveMut.mutate()
  }

  const handleReject = () => {
    setAction('reject')
    rejectMut.mutate()
  }

  const isPending = approveMut.isPending || rejectMut.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-[440px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">审批销毁</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">审批意见</span>
            <textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              rows={3}
              placeholder="审批备注（可选）"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <div className="pt-2 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleReject}
              disabled={isPending}
              className="flex-1 px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {action === 'reject' && isPending ? '拒绝中...' : '拒绝'}
            </button>
            <button
              onClick={handleApprove}
              disabled={isPending}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {action === 'approve' && isPending ? '批准中...' : '批准'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Execute Destruction Modal
// ============================================================================
function ExecuteDestructionModal({ id, onClose, onSuccess }: { id: number; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    witness: '',
    destruction_certificate: '',
    destruction_photo_urls: '',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      materialApi.executeDestruction(id, {
        witness: form.witness || undefined,
        destruction_photos: form.destruction_photo_urls
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean),
        destruction_certificate: form.destruction_certificate || undefined,
      }),
    onSuccess: () => onSuccess(),
    onError: (err: any) => setError(err?.response?.data?.msg || '执行失败'),
  })

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[480px] bg-white rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold">执行销毁</h3>
          <button onClick={onClose} title="关闭" className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">见证人</span>
            <input
              value={form.witness}
              onChange={(e) => set('witness', e.target.value)}
              placeholder="销毁见证人姓名"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">销毁照片</span>
            <textarea
              value={form.destruction_photo_urls}
              onChange={(e) => set('destruction_photo_urls', e.target.value)}
              rows={3}
              placeholder="每行一个照片 URL（例如对象存储地址）"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">支持先上传到对象存储，再粘贴链接执行销毁留痕。</p>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">销毁证明</span>
            <input
              value={form.destruction_certificate}
              onChange={(e) => set('destruction_certificate', e.target.value)}
              placeholder="销毁证明编号或说明"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </label>

          <div className="pt-2 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {mutation.isPending ? '执行中...' : '确认执行'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Destruction Detail Drawer
// ============================================================================
function DestructionDetailDrawer({
  item,
  onClose,
}: {
  item: SampleDestructionItem | undefined
  onClose: () => void
}) {
  const detail = item

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-[480px] bg-white h-full shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">销毁详情</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded" title="关闭">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {!detail ? (
            <div className="text-center text-slate-400 py-8">记录不存在</div>
          ) : (
            <>
              <InfoRow label="销毁单号" value={detail.destruction_no} />
              <InfoRow label="销毁原因" value={detail.destruction_reason} />
              <InfoRow label="销毁方式" value={detail.destruction_method} />
              <InfoRow label="销毁地点" value={detail.destruction_location || '-'} />
              <InfoRow label="样品数量" value={String(detail.sample_count)} />
              <InfoRow label="申请人" value={detail.applicant_name || '-'} />
              <InfoRow label="申请时间" value={detail.create_time} />
              <InfoRow label="状态" value={DESTRUCTION_STATUS_LABELS[detail.status] || detail.status} />
              <InfoRow label="见证人" value={detail.witness || '-'} />
              <InfoRow label="销毁证明" value={detail.destruction_certificate || '-'} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-sm text-slate-500 w-24 shrink-0">{label}</span>
      <span className="text-sm text-slate-800">{value}</span>
    </div>
  )
}
