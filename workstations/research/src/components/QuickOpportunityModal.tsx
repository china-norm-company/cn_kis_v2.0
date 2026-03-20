/**
 * 快速商机创建弹窗
 *
 * 研究经理在商务管线页面快速创建商机
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal, Button, Input, Select } from '@cn-kis/ui-kit'
import { crmApi } from '@cn-kis/api-client'

interface QuickOpportunityModalProps {
  isOpen: boolean
  onClose: () => void
}

const STAGE_OPTIONS = [
  { value: 'lead', label: '线索' },
  { value: 'qualification', label: '资质审核' },
  { value: 'proposal', label: '方案阶段' },
  { value: 'negotiation', label: '谈判中' },
]

export function QuickOpportunityModal({ isOpen, onClose }: QuickOpportunityModalProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    title: '',
    client_id: '',
    stage: 'lead',
    estimated_amount: '',
    probability: '50',
    expected_close_date: '',
  })

  const { data: clientsRes } = useQuery({
    queryKey: ['crm', 'clients-for-opportunity'],
    queryFn: () => crmApi.listClients({ page_size: 100 }),
    enabled: isOpen,
  })

  const clients = clientsRes?.data?.items ?? []

  const mutation = useMutation({
    mutationFn: () =>
      crmApi.createOpportunity({
        title: form.title,
        client_id: parseInt(form.client_id),
        stage: form.stage,
        estimated_amount: parseFloat(form.estimated_amount) || 0,
        probability: parseInt(form.probability) || 50,
        expected_close_date: form.expected_close_date || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'business-pipeline'] })
      handleClose()
    },
  })

  function handleClose() {
    setForm({
      title: '', client_id: '', stage: 'lead',
      estimated_amount: '', probability: '50', expected_close_date: '',
    })
    mutation.reset()
    onClose()
  }

  const isValid = form.title && form.client_id

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="新建商机"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!isValid || mutation.isPending}
          >
            {mutation.isPending ? '提交中...' : '创建商机'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">商机标题</label>
          <Input
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            placeholder="输入商机标题"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">客户</label>
          <Select
            value={form.client_id}
            onChange={(val) => setForm((s) => ({ ...s, client_id: String(val) }))}
            options={clients.map((c) => ({ value: String(c.id), label: c.name }))}
            placeholder="选择客户"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">阶段</label>
            <Select
              value={form.stage}
              onChange={(val) => setForm((s) => ({ ...s, stage: String(val) }))}
              options={STAGE_OPTIONS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">概率 (%)</label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.probability}
              onChange={(e) => setForm((s) => ({ ...s, probability: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">预估金额 (¥)</label>
          <Input
            type="number"
            value={form.estimated_amount}
            onChange={(e) => setForm((s) => ({ ...s, estimated_amount: e.target.value }))}
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">预计关闭日期</label>
          <Input
            type="date"
            value={form.expected_close_date}
            onChange={(e) => setForm((s) => ({ ...s, expected_close_date: e.target.value }))}
          />
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-600">创建失败，请重试</p>
        )}
      </div>
    </Modal>
  )
}
