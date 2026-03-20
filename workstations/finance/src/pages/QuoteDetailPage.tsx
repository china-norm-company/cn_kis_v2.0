import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import {
  Card,
  Badge,
  Button,
  DataTable,
  Modal,
  Input,
  DigitalWorkerActionCard,
  type Column,
} from '@cn-kis/ui-kit'
import {
  ArrowLeft,
  GitBranch,
  FileSignature,
  Plus,
  Trash2,
  Calculator,
  Calendar,
  Building2,
  FileText,
} from 'lucide-react'

interface Quote {
  id: number
  code: string
  project: string
  client: string
  total_amount: string | number
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
  created_at: string
  valid_until: string
  version?: number | string
  [key: string]: unknown
}

interface QuoteItem {
  id: number
  item_name: string
  specification: string
  unit: string
  quantity: number
  unit_price: string | number
  amount: string | number
  cost_estimate: string | number
  [key: string]: unknown
}

const statusMap: Record<
  string,
  { label: string; variant: 'default' | 'primary' | 'success' | 'error' | 'warning' }
> = {
  draft: { label: '草稿', variant: 'default' },
  sent: { label: '已发送', variant: 'primary' },
  accepted: { label: '已接受', variant: 'success' },
  rejected: { label: '已拒绝', variant: 'error' },
  expired: { label: '已过期', variant: 'warning' },
}

function formatAmount(val: string | number | null | undefined): string {
  if (val == null || val === '') return '-'
  const n = typeof val === 'string' ? Number(val) : val
  return `¥${n.toLocaleString()}`
}

export function QuoteDetailPage() {
  const { quoteId } = useParams<{ quoteId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const id = Number(quoteId)
  const [showAddItem, setShowAddItem] = useState(false)
  const [itemForm, setItemForm] = useState({
    item_name: '',
    specification: '',
    unit: '',
    quantity: '',
    unit_price: '',
    cost_estimate: '',
  })

  const { data: quoteRes, isLoading } = useQuery({
    queryKey: ['quote', 'detail', id],
    queryFn: () => api.get<Quote>(`/finance/quotes/${id}`),
    enabled: !!id,
  })

  const { data: itemsRes } = useQuery({
    queryKey: ['quote', 'items', id],
    queryFn: () =>
      api.get<{ items: QuoteItem[] }>(`/finance/quotes/${id}/items`),
    enabled: !!id,
  })

  const quote = quoteRes?.data
  const items = itemsRes?.data?.items ?? []

  const reviseMutation = useMutation({
    mutationFn: () => api.post<{ id: number }>(`/finance/quotes/${id}/revise`),
    onSuccess: (res) => {
      const newId = res?.data?.id
      if (newId) {
        queryClient.invalidateQueries({ queryKey: ['quotes'] })
        navigate(`/quotes/${newId}`)
      }
    },
  })

  const convertMutation = useMutation({
    mutationFn: () =>
      api.post<{ id?: number }>(`/finance/quotes/${id}/convert-to-contract`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] })
      navigate('/contracts')
    },
  })

  const addItemMutation = useMutation({
    mutationFn: () =>
      api.post(`/finance/quotes/${id}/items/create`, {
        item_name: itemForm.item_name,
        specification: itemForm.specification,
        unit: itemForm.unit,
        quantity: Number(itemForm.quantity) || 0,
        unit_price: Number(itemForm.unit_price) || 0,
        cost_estimate: Number(itemForm.cost_estimate) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote', id] })
      setShowAddItem(false)
      setItemForm({
        item_name: '',
        specification: '',
        unit: '',
        quantity: '',
        unit_price: '',
        cost_estimate: '',
      })
    },
  })

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: number) =>
      api.delete(`/finance/quote-items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote', id] })
    },
  })

  const columns: Column<QuoteItem>[] = [
    { key: 'item_name', title: '项目名称', width: 160 },
    { key: 'specification', title: '规格', width: 120, render: (v) => v ?? '-' },
    { key: 'unit', title: '单位', width: 70, render: (v) => v ?? '-' },
    {
      key: 'quantity',
      title: '数量',
      width: 90,
      align: 'right',
      render: (v) => (v != null ? Number(v).toLocaleString() : '-'),
    },
    {
      key: 'unit_price',
      title: '单价',
      width: 110,
      align: 'right',
      render: (v) => formatAmount(v),
    },
    {
      key: 'amount',
      title: '金额',
      width: 120,
      align: 'right',
      render: (v) => formatAmount(v),
    },
    {
      key: 'cost_estimate',
      title: '成本预估',
      width: 120,
      align: 'right',
      render: (v) => formatAmount(v),
    },
    {
      key: 'id',
      title: '操作',
      width: 80,
      render: (_, row) => (
        <button
          onClick={() => deleteItemMutation.mutate(row.id)}
          disabled={deleteItemMutation.isPending}
          className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          删除
        </button>
      ),
    },
  ]

  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
    )
  }

  if (!quote) {
    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="w-4 h-4" />}
          onClick={() => navigate('/quotes')}
        >
          返回
        </Button>
        <Card>
          <div className="p-8 text-center text-slate-500">报价不存在</div>
        </Card>
      </div>
    )
  }

  const statusInfo = statusMap[quote.status] ?? {
    label: String(quote.status),
    variant: 'default' as const,
  }

  return (
    <div className="space-y-6">
      {/* Top: Back + Title + Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/quotes')}
            className="p-2 hover:bg-slate-100 rounded-lg"
            aria-label="返回报价列表"
          >
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-slate-800">报价详情</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {quote.code}
              {quote.version != null && (
                <span className="ml-2 text-slate-400">v{quote.version}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<GitBranch className="w-4 h-4" />}
            onClick={() => reviseMutation.mutate()}
            disabled={reviseMutation.isPending}
          >
            {reviseMutation.isPending ? '处理中...' : '创建修订版'}
          </Button>
          {quote.status === 'accepted' && (
            <Button
              variant="primary"
              size="sm"
              icon={<FileSignature className="w-4 h-4" />}
              onClick={() => convertMutation.mutate()}
              disabled={convertMutation.isPending}
            >
              {convertMutation.isPending ? '处理中...' : '转为合同'}
            </Button>
          )}
        </div>
      </div>

      {/* Info section */}
      <Card>
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            基本信息
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoItem
              icon={<FileText className="w-4 h-4 text-slate-400" />}
              label="报价编号"
              value={quote.code}
            />
            <InfoItem
              icon={<Calculator className="w-4 h-4 text-slate-400" />}
              label="项目"
              value={quote.project || '-'}
            />
            <InfoItem
              icon={<Building2 className="w-4 h-4 text-slate-400" />}
              label="客户"
              value={quote.client || '-'}
            />
            <InfoItem
              icon={<Calendar className="w-4 h-4 text-slate-400" />}
              label="状态"
              value={
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              }
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-500">报价金额</p>
              <p className="mt-0.5 text-lg font-semibold text-slate-800">
                {formatAmount(quote.total_amount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">创建日期</p>
              <p className="mt-0.5 text-sm text-slate-700">
                {quote.created_at
                  ? new Date(quote.created_at).toLocaleDateString('zh-CN')
                  : '-'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">有效期至</p>
              <p className="mt-0.5 text-sm text-slate-700">
                {quote.valid_until || '-'}
              </p>
            </div>
            {quote.version != null && (
              <div>
                <p className="text-xs text-slate-500">版本</p>
                <p className="mt-0.5 text-sm text-slate-700">v{quote.version}</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 数字员工动作卡片：AI 报价明细建议 */}
      {quote && quote.status === 'draft' && items.length === 0 && (
        <DigitalWorkerActionCard
          roleCode="solution_designer"
          roleName="报价助手"
          title="AI 报价输入项已就绪"
          description="报价助手从编排结果中提取了报价输入项。确认后可一键写入报价明细，也可手动修改后再采纳。"
          items={[
            { key: 'hint', label: '提示', value: '您可以先在秘书台或研究台触发编排（客户需求 → 方案 → 报价），编排完成后这里将自动展示可采纳的报价明细。' },
          ]}
          onTrigger={() => {
            window.open(getWorkstationUrl('digital-workforce', '#/chat?skill=auto-quotation'), '_blank')
          }}
          triggerLabel="前往编排生成报价输入"
        />
      )}

      {/* Items table */}
      <Card>
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700">报价明细</h3>
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowAddItem(true)}
            >
              添加明细
            </Button>
          </div>
          <DataTable<QuoteItem>
            columns={columns}
            data={items}
            loading={false}
            emptyText="暂无明细"
          />
        </div>
      </Card>

      {/* Add item modal */}
      <Modal
        isOpen={showAddItem}
        onClose={() => setShowAddItem(false)}
        title="添加明细"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAddItem(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => addItemMutation.mutate()}
              disabled={
                !itemForm.item_name ||
                addItemMutation.isPending
              }
            >
              {addItemMutation.isPending ? '添加中...' : '添加'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="项目名称"
            value={itemForm.item_name}
            onChange={(e) =>
              setItemForm((p) => ({ ...p, item_name: e.target.value }))
            }
            placeholder="请输入项目名称"
          />
          <Input
            label="规格"
            value={itemForm.specification}
            onChange={(e) =>
              setItemForm((p) => ({ ...p, specification: e.target.value }))
            }
            placeholder="规格型号"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="单位"
              value={itemForm.unit}
              onChange={(e) =>
                setItemForm((p) => ({ ...p, unit: e.target.value }))
              }
              placeholder="如：项、次"
            />
            <Input
              label="数量"
              type="number"
              value={itemForm.quantity}
              onChange={(e) =>
                setItemForm((p) => ({ ...p, quantity: e.target.value }))
              }
              placeholder="0"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="单价"
              type="number"
              value={itemForm.unit_price}
              onChange={(e) =>
                setItemForm((p) => ({ ...p, unit_price: e.target.value }))
              }
              placeholder="0"
            />
            <Input
              label="成本预估"
              type="number"
              value={itemForm.cost_estimate}
              onChange={(e) =>
                setItemForm((p) => ({ ...p, cost_estimate: e.target.value }))
              }
              placeholder="0"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}

function InfoItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <div className="mt-0.5 text-sm font-medium text-slate-800">{value}</div>
      </div>
    </div>
  )
}
