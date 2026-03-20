/**
 * 合同详情页 - 查看/编辑合同、付款条款、变更记录
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import {
  Card,
  Badge,
  Button,
  DataTable,
  Modal,
  Input,
  Select,
  type Column,
  type BadgeVariant,
} from '@cn-kis/ui-kit'
import {
  FileText,
  ArrowLeft,
  Plus,
  Trash2,
  RefreshCw,
  Check,
  X,
} from 'lucide-react'

interface Contract {
  id: number
  code: string
  project: string
  client: string
  amount: number | string
  signed_date: string
  start_date: string
  end_date: string
  status: 'negotiating' | 'signed' | 'active' | 'completed' | 'terminated'
  [key: string]: unknown
}

interface PaymentTerm {
  id: number
  milestone: string
  percentage: number
  amount: number
  payment_days: number
  trigger_condition: string
}

interface ContractChange {
  id: number
  change_no: string
  change_type: string
  original_amount: number | null
  new_amount: number | null
  reason: string
  approval_status: string
  create_time: string
}

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  negotiating: { label: '谈判中', variant: 'default' },
  signed: { label: '已签署', variant: 'primary' },
  active: { label: '执行中', variant: 'success' },
  completed: { label: '已完成', variant: 'success' },
  terminated: { label: '已终止', variant: 'error' },
}

const CHANGE_STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: '草稿', variant: 'default' },
  submitted: { label: '已提交', variant: 'warning' },
  approved: { label: '已批准', variant: 'success' },
  rejected: { label: '已驳回', variant: 'error' },
}

const CHANGE_TYPE_MAP: Record<string, string> = {
  amount_change: '金额变更',
  scope_change: '范围变更',
  term_change: '条款变更',
  other: '其他',
}

const CHANGE_TYPE_OPTIONS = [
  { value: 'amount_change', label: '金额变更' },
  { value: 'scope_change', label: '范围变更' },
  { value: 'term_change', label: '条款变更' },
  { value: 'other', label: '其他' },
]

function formatAmount(val: number | string | null | undefined): string {
  if (val == null || val === '') return '-'
  return `¥${Number(val).toLocaleString()}`
}

export function ContractDetailPage() {
  const { contractId } = useParams<{ contractId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const id = contractId ?? ''
  const [showPaymentTermModal, setShowPaymentTermModal] = useState(false)
  const [showChangeModal, setShowChangeModal] = useState(false)
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null)

  const [paymentTermForm, setPaymentTermForm] = useState({
    milestone: '',
    percentage: '',
    amount: '',
    payment_days: '30',
    trigger_condition: '',
  })

  const [changeForm, setChangeForm] = useState({
    change_type: '',
    original_amount: '',
    new_amount: '',
    reason: '',
    description: '',
  })

  const { data: contractRes, isLoading } = useQuery({
    queryKey: ['finance', 'contract', id],
    queryFn: () => api.get<Contract>(`/finance/contracts/${id}`),
    enabled: !!id,
  })

  const { data: paymentTermsRes, isLoading: loadingTerms } = useQuery({
    queryKey: ['finance', 'contract', id, 'payment-terms'],
    queryFn: () =>
      api.get<{ items: PaymentTerm[] }>(`/finance/contracts/${id}/payment-terms`),
    enabled: !!id,
  })

  const { data: changesRes, isLoading: loadingChanges } = useQuery({
    queryKey: ['finance', 'contract', id, 'changes'],
    queryFn: () =>
      api.get<{ items: ContractChange[] }>(`/finance/contracts/${id}/changes`),
    enabled: !!id,
  })

  const addPaymentTermMutation = useMutation({
    mutationFn: () =>
      api.post(`/finance/contracts/${id}/payment-terms/create`, {
        milestone: paymentTermForm.milestone,
        percentage: Number(paymentTermForm.percentage) || 0,
        amount: Number(paymentTermForm.amount) || 0,
        payment_days: Number(paymentTermForm.payment_days) || 30,
        trigger_condition: paymentTermForm.trigger_condition,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'contract', id, 'payment-terms'] })
      setShowPaymentTermModal(false)
      setPaymentTermForm({
        milestone: '',
        percentage: '',
        amount: '',
        payment_days: '30',
        trigger_condition: '',
      })
    },
  })

  const deletePaymentTermMutation = useMutation({
    mutationFn: (termId: number) =>
      api.delete(`/finance/contracts/${id}/payment-terms/${termId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'contract', id, 'payment-terms'] })
    },
  })

  const addChangeMutation = useMutation({
    mutationFn: () =>
      api.post(`/finance/contracts/${id}/changes/create`, {
        change_type: changeForm.change_type,
        original_amount: changeForm.original_amount ? Number(changeForm.original_amount) : undefined,
        new_amount: changeForm.new_amount ? Number(changeForm.new_amount) : undefined,
        reason: changeForm.reason,
        description: changeForm.description,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'contract', id, 'changes'] })
      setShowChangeModal(false)
      setChangeForm({
        change_type: '',
        original_amount: '',
        new_amount: '',
        reason: '',
        description: '',
      })
    },
  })

  const generatePlansMutation = useMutation({
    mutationFn: () =>
      api.post<{ count?: number }>(`/finance/contracts/${id}/generate-payment-plans`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'contract', id] })
      const count = res?.data?.count ?? 0
      setGenerateSuccess(`已生成 ${count} 条回款计划`)
      setTimeout(() => setGenerateSuccess(null), 3000)
    },
  })

  const approveChangeMutation = useMutation({
    mutationFn: (changeId: number) =>
      api.post(`/finance/contract-changes/${changeId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'contract', id, 'changes'] })
    },
  })

  const rejectChangeMutation = useMutation({
    mutationFn: (changeId: number) =>
      api.post(`/finance/contract-changes/${changeId}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'contract', id, 'changes'] })
    },
  })

  const contract = contractRes?.data
  const paymentTerms = paymentTermsRes?.data?.items ?? []
  const changes = changesRes?.data?.items ?? []

  const paymentTermColumns: Column<PaymentTerm>[] = [
    { key: 'milestone', title: '里程碑', width: 140 },
    {
      key: 'percentage',
      title: '比例(%)',
      width: 90,
      align: 'right',
      render: (v) => (v != null ? `${v}%` : '-'),
    },
    {
      key: 'amount',
      title: '金额',
      width: 120,
      align: 'right',
      render: (v) => formatAmount(v),
    },
    { key: 'payment_days', title: '付款天数', width: 100, align: 'right' },
    { key: 'trigger_condition', title: '触发条件' },
    {
      key: 'id',
      title: '操作',
      width: 80,
      render: (_, row) => (
        <Button
          variant="ghost"
          size="xs"
          icon={<Trash2 className="w-3.5 h-3.5" />}
          className="text-error-500 hover:text-error-600"
          onClick={(e) => {
            e.stopPropagation()
            if (window.confirm('确定删除此付款条款？')) {
              deletePaymentTermMutation.mutate(row.id)
            }
          }}
        >
          删除
        </Button>
      ),
    },
  ]

  const changeColumns: Column<ContractChange>[] = [
    { key: 'change_no', title: '变更编号', width: 120 },
    {
      key: 'change_type',
      title: '变更类型',
      width: 100,
      render: (v) => CHANGE_TYPE_MAP[v as string] ?? v,
    },
    {
      key: 'original_amount',
      title: '原金额',
      width: 110,
      align: 'right',
      render: (v) => formatAmount(v),
    },
    {
      key: 'new_amount',
      title: '新金额',
      width: 110,
      align: 'right',
      render: (v) => formatAmount(v),
    },
    { key: 'reason', title: '变更原因' },
    {
      key: 'approval_status',
      title: '审批状态',
      width: 100,
      render: (v) => {
        const info = CHANGE_STATUS_MAP[v as string]
        return info ? <Badge variant={info.variant}>{info.label}</Badge> : String(v ?? '-')
      },
    },
    { key: 'create_time', title: '创建时间', width: 160 },
    {
      key: 'actions',
      title: '操作',
      width: 140,
      render: (_, row) => {
        if (row.approval_status !== 'submitted') return null
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              icon={<Check className="w-3.5 h-3.5" />}
              className="text-success-600"
              onClick={(e) => {
                e.stopPropagation()
                approveChangeMutation.mutate(row.id)
              }}
              disabled={approveChangeMutation.isPending}
            >
              批准
            </Button>
            <Button
              variant="ghost"
              size="xs"
              icon={<X className="w-3.5 h-3.5" />}
              className="text-error-500"
              onClick={(e) => {
                e.stopPropagation()
                rejectChangeMutation.mutate(row.id)
              }}
              disabled={rejectChangeMutation.isPending}
            >
              驳回
            </Button>
          </div>
        )
      },
    },
  ]

  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
        加载中...
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="w-4 h-4" />}
          onClick={() => navigate('/contracts')}
        >
          返回
        </Button>
        <Card>
          <div className="p-8 text-center text-slate-500">合同不存在</div>
        </Card>
      </div>
    )
  }

  const statusInfo = STATUS_MAP[contract.status] ?? {
    label: String(contract.status),
    variant: 'default' as BadgeVariant,
  }

  return (
    <div className="space-y-6" data-section="contract-detail">
      {generateSuccess && (
        <div className="rounded-lg bg-success-50 border border-success-200 px-4 py-3 text-sm text-success-700">
          {generateSuccess}
        </div>
      )}

      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate('/contracts')}
          >
            返回
          </Button>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-400" />
            <h1 className="text-2xl font-bold text-slate-800">合同详情</h1>
          </div>
        </div>
      </div>

      {/* 基本信息卡片 */}
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <InfoItem label="合同编号" value={contract.code} />
          <InfoItem label="项目" value={contract.project} />
          <InfoItem label="客户" value={contract.client} />
          <InfoItem label="合同金额" value={formatAmount(contract.amount)} />
          <InfoItem
            label="状态"
            value={<Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>}
          />
          <InfoItem label="签署日期" value={contract.signed_date || '-'} />
          <InfoItem label="开始日期" value={contract.start_date || '-'} />
          <InfoItem label="结束日期" value={contract.end_date || '-'} />
        </div>
      </Card>

      {/* 付款条款 */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">付款条款</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowPaymentTermModal(true)}
            >
              添加
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={() => generatePlansMutation.mutate()}
              disabled={generatePlansMutation.isPending || paymentTerms.length === 0}
            >
              生成回款计划
            </Button>
          </div>
        </div>
        <DataTable<PaymentTerm>
          columns={paymentTermColumns}
          data={paymentTerms}
          loading={loadingTerms}
          emptyText="暂无付款条款"
        />
      </Card>

      {/* 合同变更 */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">合同变更</h2>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setShowChangeModal(true)}
          >
            添加变更
          </Button>
        </div>
        <DataTable<ContractChange>
          columns={changeColumns}
          data={changes}
          loading={loadingChanges}
          emptyText="暂无变更记录"
        />
      </Card>

      {/* 添加付款条款 Modal */}
      <Modal
        isOpen={showPaymentTermModal}
        onClose={() => setShowPaymentTermModal(false)}
        title="添加付款条款"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPaymentTermModal(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={addPaymentTermMutation.isPending}
              onClick={() => addPaymentTermMutation.mutate()}
              disabled={!paymentTermForm.milestone.trim()}
            >
              确定
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="里程碑"
            value={paymentTermForm.milestone}
            onChange={(e) =>
              setPaymentTermForm((p) => ({ ...p, milestone: e.target.value }))
            }
            placeholder="如：签约、首访完成"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="比例(%)"
              type="number"
              value={paymentTermForm.percentage}
              onChange={(e) =>
                setPaymentTermForm((p) => ({ ...p, percentage: e.target.value }))
              }
            />
            <Input
              label="金额"
              type="number"
              value={paymentTermForm.amount}
              onChange={(e) =>
                setPaymentTermForm((p) => ({ ...p, amount: e.target.value }))
              }
            />
          </div>
          <Input
            label="付款天数"
            type="number"
            value={paymentTermForm.payment_days}
            onChange={(e) =>
              setPaymentTermForm((p) => ({ ...p, payment_days: e.target.value }))
            }
          />
          <Input
            label="触发条件"
            value={paymentTermForm.trigger_condition}
            onChange={(e) =>
              setPaymentTermForm((p) => ({ ...p, trigger_condition: e.target.value }))
            }
            placeholder="可选"
          />
        </div>
      </Modal>

      {/* 添加变更 Modal */}
      <Modal
        isOpen={showChangeModal}
        onClose={() => setShowChangeModal(false)}
        title="添加合同变更"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowChangeModal(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={addChangeMutation.isPending}
              onClick={() => addChangeMutation.mutate()}
              disabled={!changeForm.change_type || !changeForm.reason.trim()}
            >
              确定
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="变更类型"
            options={CHANGE_TYPE_OPTIONS}
            placeholder="请选择"
            value={changeForm.change_type}
            onChange={(e) =>
              setChangeForm((p) => ({ ...p, change_type: e.target.value }))
            }
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="原金额"
              type="number"
              value={changeForm.original_amount}
              onChange={(e) =>
                setChangeForm((p) => ({ ...p, original_amount: e.target.value }))
              }
              placeholder="可选"
            />
            <Input
              label="新金额"
              type="number"
              value={changeForm.new_amount}
              onChange={(e) =>
                setChangeForm((p) => ({ ...p, new_amount: e.target.value }))
              }
              placeholder="可选"
            />
          </div>
          <Input
            label="变更原因"
            value={changeForm.reason}
            onChange={(e) =>
              setChangeForm((p) => ({ ...p, reason: e.target.value }))
            }
            placeholder="必填"
          />
          <Input
            label="描述"
            value={changeForm.description}
            onChange={(e) =>
              setChangeForm((p) => ({ ...p, description: e.target.value }))
            }
            placeholder="可选"
          />
        </div>
      </Modal>
    </div>
  )
}

function InfoItem({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
    </div>
  )
}
