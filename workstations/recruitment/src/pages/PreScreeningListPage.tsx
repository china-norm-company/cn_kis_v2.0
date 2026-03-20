import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { preScreeningApi, recruitmentApi } from '@cn-kis/api-client'
import type { PreScreeningRecord } from '@cn-kis/api-client'
import { StatCard, Badge, Button, Modal, Empty } from '@cn-kis/ui-kit'
import { ErrorAlert } from '../components/ErrorAlert'
import { Pagination } from '../components/Pagination'
import { toast } from '../hooks/useToast'
import {
  Microscope,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  Plus,
  Search,
} from 'lucide-react'

const resultBadge: Record<string, { variant: 'success' | 'error' | 'warning' | 'info'; label: string }> = {
  pass: { variant: 'success', label: '通过' },
  fail: { variant: 'error', label: '不通过' },
  pending: { variant: 'warning', label: '待评估' },
  refer: { variant: 'info', label: '待复核' },
}

export default function PreScreeningListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [resultFilter, setResultFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [planFilter, setPlanFilter] = useState<number | ''>('')
  const [showStartModal, setShowStartModal] = useState(false)

  const summaryQuery = useQuery({
    queryKey: ['pre-screening', 'today-summary'],
    queryFn: async () => {
      const res = await preScreeningApi.todaySummary()
      return res?.data ?? { total: 0, pending: 0, completed: 0, passed: 0, failed: 0, referred: 0, pass_rate: 0 }
    },
  })

  const listQuery = useQuery({
    queryKey: ['pre-screening', 'list', { page, resultFilter, dateFrom, dateTo, planFilter }],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, page_size: 20 }
      if (resultFilter) params.result = resultFilter
      if (dateFrom) params.pre_screening_date = dateFrom
      if (planFilter) params.plan_id = planFilter
      const res = await preScreeningApi.list(params as Parameters<typeof preScreeningApi.list>[0])
      if (!res?.data) throw new Error('获取粗筛列表失败')
      return res.data
    },
  })

  const plansQuery = useQuery({
    queryKey: ['recruitment', 'plans', 'select'],
    queryFn: async () => {
      const res = await recruitmentApi.listPlans({ status: 'active', page_size: 100 })
      return res?.data?.items ?? []
    },
  })

  const summary = summaryQuery.data
  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const plans = plansQuery.data ?? []

  return (
    <div className="space-y-6" data-section="pre-screening-list">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">粗筛管理</h2>
          <p className="text-sm text-slate-500 mt-1">专业评估每一位到场受试者</p>
        </div>
        <Button
          variant="success"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setShowStartModal(true)}
        >
          发起粗筛
        </Button>
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-5 gap-4">
          <StatCard label="今日待粗筛" value={summary.pending} icon={<Clock className="w-5 h-5" />} color="amber" />
          <StatCard label="已完成" value={summary.completed} icon={<CheckCircle2 className="w-5 h-5" />} color="blue" />
          <StatCard label="通过" value={summary.passed} icon={<CheckCircle2 className="w-5 h-5" />} color="green" />
          <StatCard label="不通过" value={summary.failed} icon={<XCircle className="w-5 h-5" />} color="red" />
          <StatCard label="待复核" value={summary.referred} icon={<AlertCircle className="w-5 h-5" />} color="purple" />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">起始</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
            title="起始日期"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">截止</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
            title="截止日期"
          />
        </div>
        <select
          value={resultFilter}
          onChange={(e) => { setResultFilter(e.target.value); setPage(1) }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          title="结果筛选"
        >
          <option value="">全部结果</option>
          <option value="pass">通过</option>
          <option value="fail">不通过</option>
          <option value="pending">待评估</option>
          <option value="refer">待复核</option>
        </select>
        <select
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          title="关联计划"
        >
          <option value="">全部计划</option>
          {plans.map((p: { id: number; plan_no: string; title: string }) => (
            <option key={p.id} value={p.id}>{p.plan_no} - {p.title}</option>
          ))}
        </select>
        <span className="text-sm text-slate-400 ml-auto">共 {total} 条</span>
      </div>

      {/* Error */}
      {listQuery.error && (
        <ErrorAlert message={(listQuery.error as Error).message} onRetry={() => listQuery.refetch()} />
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {listQuery.isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Empty
            icon={<Microscope className="w-16 h-16" />}
            title="暂无粗筛记录"
            description="点击上方按钮发起首次粗筛"
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">粗筛编号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">受试者姓名</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">受试者编号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">日期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">评估员</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">结果</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((rec: PreScreeningRecord) => {
                const badge = resultBadge[rec.result] ?? resultBadge.pending
                return (
                  <tr key={rec.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">{rec.pre_screening_no}</td>
                    <td className="px-4 py-3 text-slate-700">{rec.subject_name}</td>
                    <td className="px-4 py-3 text-slate-500">{rec.subject_no || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{rec.pre_screening_date?.slice(0, 10) ?? rec.create_time?.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-slate-500">{rec.screener_id ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/pre-screening/${rec.id}`)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        查看详情
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} pageSize={20} total={total} onChange={setPage} />

      {/* Start Modal */}
      {showStartModal && (
        <StartPreScreeningModal
          onClose={() => setShowStartModal(false)}
          onSuccess={() => {
            setShowStartModal(false)
            queryClient.invalidateQueries({ queryKey: ['pre-screening'] })
          }}
        />
      )}
    </div>
  )
}

function StartPreScreeningModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [registrationId, setRegistrationId] = useState<number>(0)
  const [protocolId, setProtocolId] = useState<number>(0)
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')

  const regsQuery = useQuery({
    queryKey: ['recruitment', 'registrations', 'for-prescreening', keyword],
    queryFn: async () => {
      const res = await recruitmentApi.listRegistrations({ status: 'contacted', page_size: 50 })
      if (!res?.data) return []
      return res.data.items ?? []
    },
  })

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!registrationId) throw new Error('请选择报名记录')
      if (!protocolId) throw new Error('请选择协议')
      return preScreeningApi.start({ registration_id: registrationId, protocol_id: protocolId })
    },
    onSuccess: () => {
      toast.success('粗筛已发起')
      onSuccess()
    },
    onError: (err) => toast.error((err as Error).message || '发起粗筛失败'),
  })

  const regs = (regsQuery.data ?? []) as Array<{ id: number; registration_no: string; name: string; phone: string }>
  const filtered = keyword
    ? regs.filter((r) => r.name.includes(keyword) || r.registration_no.includes(keyword))
    : regs

  return (
    <Modal isOpen onClose={onClose} title="发起粗筛" size="md" footer={
      <>
        <Button variant="secondary" onClick={onClose}>取消</Button>
        <Button
          variant="success"
          loading={startMutation.isPending}
          disabled={!registrationId || !protocolId}
          onClick={() => startMutation.mutate()}
        >
          确认发起
        </Button>
      </>
    }>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">搜索报名记录</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setKeyword(searchInput)}
              placeholder="输入姓名或编号搜索"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">选择报名记录</label>
          <select
            value={registrationId}
            onChange={(e) => setRegistrationId(Number(e.target.value))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            title="选择报名记录"
          >
            <option value={0}>请选择</option>
            {filtered.map((r) => (
              <option key={r.id} value={r.id}>{r.registration_no} - {r.name} ({r.phone})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">协议 ID</label>
          <input
            type="number"
            value={protocolId || ''}
            onChange={(e) => setProtocolId(Number(e.target.value))}
            placeholder="输入关联协议 ID"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
      </div>
    </Modal>
  )
}
