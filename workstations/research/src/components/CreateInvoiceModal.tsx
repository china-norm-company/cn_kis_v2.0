/**
 * 快速创建发票弹窗
 *
 * 从项目商务卡片触发，为已有合同创建发票
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Button, Input, Select } from '@cn-kis/ui-kit'
import { financeApi } from '@cn-kis/api-client'

interface CreateInvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  client: string
  projectTitle: string
}

const INVOICE_TYPE_OPTIONS = [
  { value: 'normal', label: '普通发票' },
  { value: 'special', label: '增值税专用发票' },
]

export function CreateInvoiceModal({ isOpen, onClose, client, projectTitle }: CreateInvoiceModalProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    contract_id: '',
    amount: '',
    tax_rate: '6',
    type: 'normal',
    invoice_date: new Date().toISOString().slice(0, 10),
  })

  const { data: contractsRes } = useQuery({
    queryKey: ['finance', 'contracts-for-invoice', client],
    queryFn: () => financeApi.listContracts({ client, page_size: 50 }),
    enabled: isOpen && !!client,
  })

  const contracts = contractsRes?.data?.items ?? []

  const mutation = useMutation({
    mutationFn: () => {
      const code = `INV-${Date.now().toString(36).toUpperCase()}`
      const amount = parseFloat(form.amount) || 0
      const taxRate = parseFloat(form.tax_rate) / 100
      const taxAmount = Math.round(amount * taxRate * 100) / 100
      return financeApi.createInvoice({
        code,
        contract_id: parseInt(form.contract_id),
        client,
        amount,
        tax_amount: taxAmount,
        total: amount + taxAmount,
        type: form.type,
        invoice_date: form.invoice_date || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'business-pipeline'] })
      handleClose()
    },
  })

  function handleClose() {
    setForm({ contract_id: '', amount: '', tax_rate: '6', type: 'normal', invoice_date: new Date().toISOString().slice(0, 10) })
    mutation.reset()
    onClose()
  }

  const isValid = form.contract_id && form.amount

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`创建发票 — ${projectTitle}`}
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
          >
            {mutation.isPending ? '提交中...' : '创建发票'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">关联合同</label>
          <Select
            value={form.contract_id}
            onChange={(val) => setForm((s) => ({ ...s, contract_id: String(val) }))}
            options={contracts.map((c) => ({
              value: String(c.id),
              label: `${c.code} — ${c.client} — ¥${c.amount}`,
            }))}
            placeholder="选择合同"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">开票金额 (¥)</label>
            <Input
              type="number"
              value={form.amount}
              onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">税率 (%)</label>
            <Input
              type="number"
              value={form.tax_rate}
              onChange={(e) => setForm((s) => ({ ...s, tax_rate: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">发票类型</label>
            <Select
              value={form.type}
              onChange={(val) => setForm((s) => ({ ...s, type: String(val) }))}
              options={INVOICE_TYPE_OPTIONS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">开票日期</label>
            <Input
              type="date"
              value={form.invoice_date}
              onChange={(e) => setForm((s) => ({ ...s, invoice_date: e.target.value }))}
            />
          </div>
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-600">创建失败，请重试</p>
        )}
      </div>
    </Modal>
  )
}
