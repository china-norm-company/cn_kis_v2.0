/**
 * 催收工作台 - 逾期回款计划跟进
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, StatCard, Button, Modal, Input, Select, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { AlertTriangle, Plus, X, MessageSquare } from 'lucide-react'
import { useState } from 'react'

interface PaymentPlan {
  id: number
  plan_no: string
  status: string
  milestone: string
  planned_date: string
  planned_amount: string
  received_amount: string
  remaining_amount: string
  overdue_days: number
  client_name: string
  last_followup_date?: string | null
  [key: string]: unknown
}

const FOLLOWUP_TYPE_OPTIONS = [
  { value: 'phone', label: '电话' },
  { value: 'email', label: '邮件' },
  { value: 'visit', label: '拜访' },
  { value: 'letter', label: '函件' },
  { value: 'other', label: '其他' },
]

const RESULT_OPTIONS = [
  { value: 'promise_pay', label: '承诺付款' },
  { value: 'partial_pay', label: '部分付款' },
  { value: 'dispute', label: '有争议' },
  { value: 'unable_pay', label: '无力支付' },
  { value: 'no_response', label: '无回应' },
]

function formatAmount(val: string | number | null | undefined): string {
  if (val == null || val === '') return '-'
  return `¥${Number(val).toLocaleString()}`
}

function OverdueDaysBadge({ days }: { days: number }) {
  if (days > 60) return <Badge variant="error">{days}天</Badge>
  if (days >= 31) return <Badge variant="warning">{days}天</Badge>
  if (days >= 1) return <Badge variant="default" className="bg-amber-100 text-amber-800">{days}天</Badge>
  return <span className="text-slate-400">-</span>
}

const columns: Column<PaymentPlan>[] = [
  { key: 'plan_no', title: '计划编号', width: 140 },
  { key: 'client_name', title: '客户', width: 130 },
  { key: 'milestone', title: '里程碑', width: 120 },
  { key: 'planned_date', title: '计划日期', width: 110 },
  {
    key: 'planned_amount',
    title: '计划金额(¥)',
    width: 120,
    align: 'right',
    render: (v) => formatAmount(v as string),
  },
  {
    key: 'received_amount',
    title: '已收(¥)',
    width: 110,
    align: 'right',
    render: (v) => formatAmount(v as string),
  },
  {
    key: 'remaining_amount',
    title: '待收(¥)',
    width: 110,
    align: 'right',
    render: (v) => formatAmount(v as string),
  },
  {
    key: 'overdue_days',
    title: '逾期天数',
    width: 100,
    align: 'center',
    render: (v, record) => <OverdueDaysBadge days={(record.overdue_days as number) ?? 0} />,
  },
]

export function PaymentCollectionPage() {
  const queryClient = useQueryClient()
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlan | null>(null)
  const [showFollowupModal, setShowFollowupModal] = useState(false)
  const [followupForm, setFollowupForm] = useState({
    followup_date: new Date().toISOString().slice(0, 10),
    followup_type: 'phone',
    content: '',
    result: '',
    promise_date: '',
    promise_amount: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'payment-plans', 'overdue'],
    queryFn: () =>
      api.get<{ items: PaymentPlan[] }>('/finance/payment-plans/list', {
        params: { status: 'overdue' },
      }),
  })

  const { data: dashData } = useQuery({
    queryKey: ['finance', 'dashboard'],
    queryFn: () => api.get<any>('/finance/dashboard'),
  })

  const createFollowupMutation = useMutation({
    mutationFn: (planId: number) =>
      api.post('/finance/overdue-followups/create', {
        plan_id: planId,
        followup_date: followupForm.followup_date,
        followup_type: followupForm.followup_type,
        content: followupForm.content,
        result: followupForm.result,
        promise_date: followupForm.promise_date || undefined,
        promise_amount: followupForm.promise_amount ? Number(followupForm.promise_amount) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance', 'payment-plans', 'overdue'] })
      queryClient.invalidateQueries({ queryKey: ['finance', 'dashboard'] })
      setShowFollowupModal(false)
      setFollowupForm({
        followup_date: new Date().toISOString().slice(0, 10),
        followup_type: 'phone',
        content: '',
        result: '',
        promise_date: '',
        promise_amount: '',
      })
    },
  })

  const items = data?.data?.items ?? []
  const dash = dashData?.data ?? {}
  const totalOverdue = dash.overdue_plans ?? dash.overdue_plans_count ?? items.length
  const overdueAmount = dash.overdue_amount ?? dash.overdue_plans_amount ?? 0
  const followedUpCount = items.filter((p) => p.last_followup_date).length

  const openFollowupModal = () => {
    setFollowupForm({
      followup_date: new Date().toISOString().slice(0, 10),
      followup_type: 'phone',
      content: '',
      result: '',
      promise_date: '',
      promise_amount: '',
    })
    setShowFollowupModal(true)
  }

  const handleAddFollowup = () => {
    if (selectedPlan) {
      createFollowupMutation.mutate(selectedPlan.id)
    }
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">催收工作台</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="逾期笔数"
            value={totalOverdue}
            icon={<AlertTriangle className="w-6 h-6" />}
            color="red"
          />
          <StatCard
            title="逾期金额"
            value={typeof overdueAmount === 'number' ? `¥${overdueAmount.toLocaleString()}` : formatAmount(overdueAmount)}
            icon={<AlertTriangle className="w-6 h-6" />}
            color="amber"
          />
          <StatCard
            title="已跟进"
            value={followedUpCount}
            icon={<MessageSquare className="w-6 h-6" />}
          />
        </div>

        <Card>
          <div className="p-1">
            <DataTable<PaymentPlan>
              columns={columns}
              data={items}
              loading={isLoading}
              emptyText="暂无逾期回款计划"
              onRowClick={(record) => setSelectedPlan(record)}
              rowKey="id"
            />
          </div>
        </Card>
      </div>

      {/* 跟进面板 */}
      {selectedPlan && (
        <div className="w-96 flex-shrink-0">
          <Card className="sticky top-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">计划详情</h3>
              <Button
                variant="ghost"
                size="sm"
                icon={<X className="w-4 h-4" />}
                onClick={() => setSelectedPlan(null)}
              >
                关闭
              </Button>
            </div>
            <div className="space-y-3 text-sm">
              <InfoRow label="计划编号" value={selectedPlan.plan_no} />
              <InfoRow label="客户" value={selectedPlan.client_name} />
              <InfoRow label="里程碑" value={selectedPlan.milestone} />
              <InfoRow label="计划日期" value={selectedPlan.planned_date} />
              <InfoRow label="计划金额" value={formatAmount(selectedPlan.planned_amount)} />
              <InfoRow label="已收金额" value={formatAmount(selectedPlan.received_amount)} />
              <InfoRow label="待收金额" value={formatAmount(selectedPlan.remaining_amount)} />
              <InfoRow
                label="逾期天数"
                value={<OverdueDaysBadge days={selectedPlan.overdue_days ?? 0} />}
              />
              {selectedPlan.last_followup_date && (
                <InfoRow label="最后跟进" value={selectedPlan.last_followup_date} />
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                icon={<Plus className="w-4 h-4" />}
                onClick={openFollowupModal}
              >
                添加跟进
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 添加跟进 Modal */}
      <Modal
        isOpen={showFollowupModal}
        onClose={() => setShowFollowupModal(false)}
        title="添加跟进"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowFollowupModal(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={createFollowupMutation.isPending}
              onClick={handleAddFollowup}
              disabled={!followupForm.content.trim() || !followupForm.result}
            >
              确定
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="跟进日期"
            type="date"
            value={followupForm.followup_date}
            onChange={(e) => setFollowupForm((p) => ({ ...p, followup_date: e.target.value }))}
          />
          <Select
            label="跟进方式"
            options={FOLLOWUP_TYPE_OPTIONS}
            value={followupForm.followup_type}
            onChange={(e) => setFollowupForm((p) => ({ ...p, followup_type: e.target.value }))}
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">跟进内容</label>
            <textarea
              value={followupForm.content}
              onChange={(e) => setFollowupForm((p) => ({ ...p, content: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm min-h-[80px]"
              placeholder="请输入跟进内容"
            />
          </div>
          <Select
            label="跟进结果"
            options={RESULT_OPTIONS}
            placeholder="请选择"
            value={followupForm.result}
            onChange={(e) => setFollowupForm((p) => ({ ...p, result: e.target.value }))}
          />
          <Input
            label="承诺付款日期"
            type="date"
            value={followupForm.promise_date}
            onChange={(e) => setFollowupForm((p) => ({ ...p, promise_date: e.target.value }))}
          />
          <Input
            label="承诺金额"
            type="number"
            value={followupForm.promise_amount}
            onChange={(e) => setFollowupForm((p) => ({ ...p, promise_amount: e.target.value }))}
            placeholder="可选"
          />
        </div>
      </Modal>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800 text-right">{value}</span>
    </div>
  )
}
