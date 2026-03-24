import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { receptionApi } from '@cn-kis/api-client'
import { Button, Modal } from '@cn-kis/ui-kit'
import {
  QrCode, UserPlus, Printer, CalendarSearch,
  MessageSquare, AlertTriangle,
} from 'lucide-react'
import QRScanner from '../components/QRScanner'

type ModalType = 'scan' | 'new-subject' | 'print' | 'appointment' | 'ticket' | 'incident' | null

const QUICK_ACTIONS = [
  { key: 'scan' as const,        icon: QrCode,         label: '扫码签到' },
  { key: 'new-subject' as const, icon: UserPlus,       label: '新受试者建档' },
  { key: 'print' as const,       icon: Printer,        label: '打印流程卡' },
  { key: 'appointment' as const, icon: CalendarSearch,  label: '预约查询' },
  { key: 'ticket' as const,      icon: MessageSquare,   label: '答疑工单' },
  { key: 'incident' as const,    icon: AlertTriangle,   label: '事件上报' },
] as const

export default function ReceptionQuickActions() {
  const [openModal, setOpenModal] = useState<ModalType>(null)
  const close = () => setOpenModal(null)

  return (
    <div data-section="quick-actions">
      <div className="grid grid-cols-6 gap-3">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => setOpenModal(a.key)}
            className="flex flex-col items-center gap-2 py-4 px-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 hover:shadow-sm transition-all text-slate-700"
            data-action={a.key}
          >
            <a.icon className="w-6 h-6" />
            <span className="text-xs font-medium">{a.label}</span>
          </button>
        ))}
      </div>

      <ScanModal isOpen={openModal === 'scan'} onClose={close} />
      <NewSubjectModal isOpen={openModal === 'new-subject'} onClose={close} />
      <PrintFlowcardModal isOpen={openModal === 'print'} onClose={close} />
      <PlaceholderModal isOpen={openModal === 'appointment'} onClose={close} title="预约查询" />
      <TicketModal isOpen={openModal === 'ticket'} onClose={close} />
      <IncidentModal isOpen={openModal === 'incident'} onClose={close} />
    </div>
  )
}

/* ---- Scan Modal ---- */

function ScanModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="扫码签到" size="md">
      <QRScanner
        onResolved={() => {
          qc.invalidateQueries({ queryKey: ['reception'] })
        }}
      />
    </Modal>
  )
}

/* ---- New Subject Modal ---- */

function NewSubjectModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', gender: 'male', age: '' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    window.alert('该入口已下线，请在“招募台/受试者管理”中执行建档。')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="新受试者建档" size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit}>保存</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="ns-name" className="block text-sm font-medium text-slate-700 mb-1">姓名</label>
          <input
            id="ns-name" required value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label htmlFor="ns-phone" className="block text-sm font-medium text-slate-700 mb-1">手机号</label>
          <input
            id="ns-phone" required value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ns-gender" className="block text-sm font-medium text-slate-700 mb-1">性别</label>
            <select
              id="ns-gender" value={form.gender}
              onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </div>
          <div>
            <label htmlFor="ns-age" className="block text-sm font-medium text-slate-700 mb-1">年龄</label>
            <input
              id="ns-age" type="number" min={0} max={150} value={form.age}
              onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </form>
    </Modal>
  )
}

/* ---- Print Flowcard Modal ---- */

function PrintFlowcardModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [checkinId, setCheckinId] = useState('')
  const printMutation = useMutation({
    mutationFn: (id: number) => receptionApi.printFlowcard(id),
    onSuccess: () => onClose(),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="打印流程卡" size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            loading={printMutation.isPending}
            onClick={() => { if (checkinId) printMutation.mutate(Number(checkinId)) }}
          >
            打印
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label htmlFor="pf-checkin-id" className="block text-sm font-medium text-slate-700">签到记录 ID</label>
        <input
          id="pf-checkin-id" type="number" value={checkinId}
          onChange={(e) => setCheckinId(e.target.value)}
          placeholder="请输入签到记录 ID"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        {printMutation.isError && (
          <p className="text-sm text-red-500">打印失败，请重试</p>
        )}
      </div>
    </Modal>
  )
}

/* ---- Placeholder Modal ---- */

function PlaceholderModal({ isOpen, onClose, title }: { isOpen: boolean; onClose: () => void; title: string }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex flex-col items-center py-8 text-slate-400">
        <CalendarSearch className="w-12 h-12 mb-3" />
        <p className="text-sm">该入口已下线，请使用“受试者队列/预约列表”页面进行查询。</p>
      </div>
    </Modal>
  )
}

/* ---- Ticket Modal ---- */

function TicketModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ title: '', content: '', category: 'general' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    window.alert('该入口已下线，请在“执行台 > 工单中心”创建答疑工单。')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="答疑工单" size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit}>提交</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="tk-title" className="block text-sm font-medium text-slate-700 mb-1">标题</label>
          <input
            id="tk-title" required value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label htmlFor="tk-category" className="block text-sm font-medium text-slate-700 mb-1">分类</label>
          <select
            id="tk-category" value={form.category}
            onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="general">一般咨询</option>
            <option value="protocol">协议相关</option>
            <option value="schedule">排程相关</option>
            <option value="other">其他</option>
          </select>
        </div>
        <div>
          <label htmlFor="tk-content" className="block text-sm font-medium text-slate-700 mb-1">内容</label>
          <textarea
            id="tk-content" required rows={4} value={form.content}
            onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </form>
    </Modal>
  )
}

/* ---- Incident Modal ---- */

function IncidentModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ type: 'deviation', description: '' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    window.alert('该入口已下线，请在“质量台 > 偏差/CAPA”完成事件上报。')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="事件上报" size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="danger" onClick={handleSubmit}>上报</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="inc-type" className="block text-sm font-medium text-slate-700 mb-1">类型</label>
          <select
            id="inc-type" value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="deviation">偏差</option>
            <option value="adverse_event">不良事件</option>
          </select>
        </div>
        <div>
          <label htmlFor="inc-desc" className="block text-sm font-medium text-slate-700 mb-1">描述</label>
          <textarea
            id="inc-desc" required rows={5} value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="请详细描述事件经过..."
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </form>
    </Modal>
  )
}
