/**
 * 快速报价创建弹窗
 *
 * 研究经理在商务管线页面快速创建报价
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Button, Input, Select } from '@cn-kis/ui-kit'
import { financeApi, crmApi } from '@cn-kis/api-client'

interface QuickQuoteModalProps {
  isOpen: boolean
  onClose: () => void
}

export function QuickQuoteModal({ isOpen, onClose }: QuickQuoteModalProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    client: '',
    project: '',
    total_amount: '',
    valid_until: '',
  })

  const { data: clientsRes } = useQuery({
    queryKey: ['crm', 'clients-for-quote'],
    queryFn: () => crmApi.listClients({ page_size: 100 }),
    enabled: isOpen,
  })

  const clients = clientsRes?.data?.items ?? []

  const mutation = useMutation({
    mutationFn: () => {
      const today = new Date().toISOString().slice(0, 10)
      const code = `QT-${Date.now().toString(36).toUpperCase()}`
      return financeApi.createQuote({
        code,
        project: form.project,
        client: form.client,
        total_amount: parseFloat(form.total_amount) || 0,
        created_at: today,
        valid_until: form.valid_until || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'business-pipeline'] })
      handleClose()
    },
  })

  function handleClose() {
    setForm({ client: '', project: '', total_amount: '', valid_until: '' })
    mutation.reset()
    onClose()
  }

  const isValid = form.client && form.project && form.total_amount

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="新建报价"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
          >
            {mutation.isPending ? '提交中...' : '创建报价'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">客户</label>
          <Select
            value={form.client}
            onChange={(val) => setForm((s) => ({ ...s, client: String(val) }))}
            options={clients.map((c) => ({ value: c.name, label: c.name }))}
            placeholder="选择客户"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">项目名称</label>
          <Input
            value={form.project}
            onChange={(e) => setForm((s) => ({ ...s, project: e.target.value }))}
            placeholder="输入关联项目名称"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">报价金额 (¥)</label>
          <Input
            type="number"
            value={form.total_amount}
            onChange={(e) => setForm((s) => ({ ...s, total_amount: e.target.value }))}
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">有效期至</label>
          <Input
            type="date"
            value={form.valid_until}
            onChange={(e) => setForm((s) => ({ ...s, valid_until: e.target.value }))}
          />
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-600">创建失败，请重试</p>
        )}
      </div>
    </Modal>
  )
}
