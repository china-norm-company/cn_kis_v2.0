import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Card, DataTable, Button, Modal, Input, Select, type Column } from '@cn-kis/ui-kit'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

type Tab = 'settlements' | 'contributions' | 'rules'

interface Settlement {
  id: number
  period: string
  title: string
  status: string
  total_pool: number
  total_allocated: number
  data_completeness: number
  rule_name: string
  created_by: string
  create_time: string
}

interface SettlementDetail extends Settlement {
  notes: string
  submitted_by: string
  approved_by: string
  submitted_at: string | null
  approved_at: string | null
  lines: SettlementLine[]
  audit_logs: AuditLog[]
}

interface SettlementLine {
  id: number
  staff_id: number
  staff_name: string
  group_name: string
  role_label: string
  base_score: number
  quality_adjust: number
  manual_adjust: number
  manual_adjust_reason: string
  final_score: number
  suggested_bonus: number
  final_bonus: number
  grade: string
  lock_status: string
}

interface AuditLog {
  id: number
  action: string
  from_status: string
  to_status: string
  operator: string
  detail: Record<string, unknown>
  create_time: string
}

interface ContributionItem {
  id: number
  period: string
  source_workstation: string
  staff_id: number | null
  staff_name: string
  project_code: string
  group_name: string
  metrics: Record<string, unknown>
  data_confidence: number
  import_source: string
  create_time: string
}

interface RuleItem {
  id: number
  name: string
  version: string
  effective_from: string
  effective_to: string
  status: string
  weight_config: Record<string, number>
  threshold_config: Record<string, number>
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: 'bg-slate-100 text-slate-700' },
  submitted: { label: '已提交', color: 'bg-blue-100 text-blue-700' },
  reviewing: { label: '审核中', color: 'bg-amber-100 text-amber-700' },
  approved: { label: '已批准', color: 'bg-green-100 text-green-700' },
  released: { label: '已发放', color: 'bg-emerald-100 text-emerald-700' },
  archived: { label: '已归档', color: 'bg-gray-100 text-gray-500' },
  reopened: { label: '已重开', color: 'bg-orange-100 text-orange-700' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_MAP[status] ?? { label: status, color: 'bg-slate-100 text-slate-700' }
  return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
}

function CompletenessBar({ value }: { value: number }) {
  const pct = Math.min(Math.max(value, 0), 100)
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500">{pct.toFixed(0)}%</span>
    </div>
  )
}

function SettlementListTab() {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState({ period: '', title: '', total_pool: '' })
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['hr-settlements'],
    queryFn: () => api.get<{ items: Settlement[]; total: number }>('/hr/settlements/list', {
      params: { page: 1, page_size: 50 },
    }),
  })
  const items = data?.data?.items ?? []

  const createMut = useMutation({
    mutationFn: () => api.post('/hr/settlements/create', {
      period: form.period,
      title: form.title,
      total_pool: Number(form.total_pool || 0),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-settlements'] })
      setShowCreate(false)
      setForm({ period: '', title: '', total_pool: '' })
    },
  })

  const columns: Column<Settlement>[] = useMemo(() => [
    { key: 'period', title: '月份', width: 90 },
    { key: 'title', title: '标题' },
    {
      key: 'status', title: '状态', width: 90,
      render: (_v, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'total_pool', title: '奖金池', width: 110, align: 'right' as const,
      render: (v) => `¥${Number(v).toLocaleString()}`,
    },
    {
      key: 'total_allocated', title: '已分配', width: 110, align: 'right' as const,
      render: (v) => `¥${Number(v).toLocaleString()}`,
    },
    {
      key: 'data_completeness', title: '完整度', width: 130,
      render: (v) => <CompletenessBar value={Number(v)} />,
    },
    { key: 'rule_name', title: '规则', width: 120 },
    {
      key: 'id', title: '操作', width: 80,
      render: (_v, row) => (
        <Button size="sm" variant="ghost" onClick={() => setSelectedId(row.id)}>详情</Button>
      ),
    },
  ], [])

  if (selectedId) {
    return <SettlementDetailView id={selectedId} onBack={() => setSelectedId(null)} />
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">绩效结算单</h2>
        <PermissionGuard permission="hr.staff.manage">
          <Button onClick={() => setShowCreate(true)}>新建结算单</Button>
        </PermissionGuard>
      </div>
      <Card>
        <div className="p-4">
          <DataTable<Settlement> columns={columns} data={items} loading={isLoading} emptyText="暂无结算单" />
        </div>
      </Card>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新建绩效结算单"
        footer={<>
          <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
          <Button loading={createMut.isPending} onClick={() => createMut.mutate()}>创建</Button>
        </>}
      >
        <div className="space-y-4">
          <Input label="结算月份" placeholder="YYYY-MM" value={form.period}
            onChange={(e) => setForm({ ...form, period: e.target.value })} />
          <Input label="标题（可选）" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input label="奖金池总额" type="number" value={form.total_pool}
            onChange={(e) => setForm({ ...form, total_pool: e.target.value })} />
        </div>
      </Modal>
    </>
  )
}

function LineEditCell({ line, field, settlementId }: {
  line: SettlementLine; field: 'manual_adjust' | 'final_bonus'; settlementId: number
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(line[field]))
  const queryClient = useQueryClient()

  const mut = useMutation({
    mutationFn: (val: number) => api.put(`/hr/settlements/lines/${line.id}`, { [field]: val }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-settlement-detail', settlementId] })
      setEditing(false)
    },
  })

  if (!editing) {
    return (
      <span className="cursor-pointer hover:bg-slate-100 px-1 rounded" onClick={() => setEditing(true)}>
        {field === 'final_bonus'
          ? <span className="font-semibold text-emerald-700">¥{Number(line[field]).toLocaleString()}</span>
          : Number(line[field]).toFixed(2)
        }
      </span>
    )
  }
  return (
    <input type="number" className="w-20 border rounded px-1 py-0.5 text-sm text-right"
      autoFocus value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => mut.mutate(Number(value))}
      onKeyDown={(e) => { if (e.key === 'Enter') mut.mutate(Number(value)) }}
    />
  )
}

function SettlementDetailView({ id, onBack }: { id: number; onBack: () => void }) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['hr-settlement-detail', id],
    queryFn: () => api.get<SettlementDetail>(`/hr/settlements/${id}`),
  })
  const detail = data?.data

  const calcMut = useMutation({
    mutationFn: () => api.post(`/hr/settlements/${id}/calculate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-settlement-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['hr-settlements'] })
    },
  })

  const transitionMut = useMutation({
    mutationFn: (target: string) => api.post(`/hr/settlements/${id}/transition`, { target_status: target }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-settlement-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['hr-settlements'] })
    },
  })

  const lockMut = useMutation({
    mutationFn: ({ lineId, lock }: { lineId: number; lock: boolean }) =>
      api.put(`/hr/settlements/lines/${lineId}`, { lock_status: lock ? 'locked' : 'unlocked' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-settlement-detail', id] })
    },
  })

  const editable = detail?.status === 'draft' || detail?.status === 'reopened'

  const lineColumns: Column<SettlementLine>[] = useMemo(() => [
    { key: 'staff_name', title: '姓名' },
    { key: 'group_name', title: '组别', width: 80 },
    { key: 'role_label', title: '角色', width: 80 },
    { key: 'base_score', title: '基础分', width: 80, align: 'right' as const },
    { key: 'quality_adjust', title: '质量校正', width: 80, align: 'right' as const },
    {
      key: 'manual_adjust', title: '人工调整', width: 90, align: 'right' as const,
      render: (_v, row) => editable
        ? <LineEditCell line={row} field="manual_adjust" settlementId={id} />
        : Number(row.manual_adjust).toFixed(2),
    },
    { key: 'final_score', title: '最终分', width: 80, align: 'right' as const },
    { key: 'grade', title: '等级', width: 60, align: 'center' as const },
    {
      key: 'suggested_bonus', title: '建议奖金', width: 110, align: 'right' as const,
      render: (v) => `¥${Number(v).toLocaleString()}`,
    },
    {
      key: 'final_bonus', title: '确认奖金', width: 120, align: 'right' as const,
      render: (_v, row) => editable
        ? <LineEditCell line={row} field="final_bonus" settlementId={id} />
        : <span className="font-semibold text-emerald-700">¥{Number(row.final_bonus).toLocaleString()}</span>,
    },
    {
      key: 'lock_status', title: '锁定', width: 60, align: 'center' as const,
      render: (_v, row) => editable ? (
        <button className="text-sm"
          onClick={() => lockMut.mutate({ lineId: row.id, lock: row.lock_status !== 'locked' })}>
          {row.lock_status === 'locked' ? '🔒' : '🔓'}
        </button>
      ) : (row.lock_status === 'locked' ? '🔒' : ''),
    },
  ], [editable, id, lockMut])

  if (isLoading || !detail) {
    return <div className="text-center py-12 text-slate-400">加载中...</div>
  }

  const canCalculate = detail.status === 'draft' || detail.status === 'reopened'
  const canSubmit = detail.status === 'draft'
  const canApprove = detail.status === 'reviewing'

  const NEXT_ACTIONS: Record<string, { label: string; target: string; variant?: 'primary' | 'outline' }[]> = {
    draft: [{ label: '提交审核', target: 'submitted' }],
    submitted: [
      { label: '开始审核', target: 'reviewing' },
      { label: '退回修改', target: 'draft', variant: 'outline' },
    ],
    reviewing: [
      { label: '批准', target: 'approved' },
      { label: '退回', target: 'submitted', variant: 'outline' },
    ],
    approved: [
      { label: '确认发放', target: 'released' },
      { label: '重新打开', target: 'reopened', variant: 'outline' },
    ],
    released: [{ label: '归档', target: 'archived' }],
    reopened: [{ label: '重新提交', target: 'submitted' }],
  }
  const actions = NEXT_ACTIONS[detail.status] ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onBack}>← 返回</Button>
        <h2 className="text-lg font-semibold text-slate-800">{detail.title || detail.period}</h2>
        <StatusBadge status={detail.status} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><div className="p-4 text-center">
          <div className="text-xs text-slate-500 mb-1">奖金池</div>
          <div className="text-xl font-bold text-slate-800">¥{detail.total_pool.toLocaleString()}</div>
        </div></Card>
        <Card><div className="p-4 text-center">
          <div className="text-xs text-slate-500 mb-1">已分配</div>
          <div className="text-xl font-bold text-emerald-700">¥{detail.total_allocated.toLocaleString()}</div>
        </div></Card>
        <Card><div className="p-4 text-center">
          <div className="text-xs text-slate-500 mb-1">数据完整度</div>
          <CompletenessBar value={detail.data_completeness} />
        </div></Card>
        <Card><div className="p-4 text-center">
          <div className="text-xs text-slate-500 mb-1">规则</div>
          <div className="text-sm font-medium text-slate-700">{detail.rule_name}</div>
        </div></Card>
      </div>

      {detail.data_completeness < 80 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          数据完整度较低（{detail.data_completeness.toFixed(0)}%），部分维度数据缺失。
          系统已按可用数据完成计算，结果仅供参考。可通过"贡献快照"补录数据后重新计算。
        </div>
      )}

      <PermissionGuard permission="hr.staff.manage">
        <div className="flex gap-2 flex-wrap">
          {canCalculate && (
            <Button loading={calcMut.isPending} onClick={() => calcMut.mutate()}>
              {detail.lines.length > 0 ? '重新计算' : '执行计算'}
            </Button>
          )}
          {actions.map((a) => (
            <Button key={a.target} variant={a.variant ?? 'primary'}
              loading={transitionMut.isPending}
              onClick={() => transitionMut.mutate(a.target)}>
              {a.label}
            </Button>
          ))}
        </div>
      </PermissionGuard>

      <Card>
        <div className="p-4">
          <h3 className="font-semibold text-slate-800 mb-3">
            结算明细（{detail.lines.length} 人）
          </h3>
          <DataTable<SettlementLine> columns={lineColumns} data={detail.lines} emptyText="尚未计算，请点击「执行计算」" />
        </div>
      </Card>

      {detail.audit_logs.length > 0 && (
        <Card>
          <div className="p-4">
            <h3 className="font-semibold text-slate-800 mb-3">操作日志</h3>
            <div className="space-y-2">
              {detail.audit_logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-violet-400 mt-1.5 shrink-0" />
                  <div>
                    <span className="font-medium text-slate-700">{log.action}</span>
                    {log.operator && <span className="text-slate-500 ml-2">by {log.operator}</span>}
                    <span className="text-slate-400 ml-2">{new Date(log.create_time).toLocaleString('zh-CN')}</span>
                    {log.from_status && log.to_status && (
                      <span className="text-slate-400 ml-2">{log.from_status} → {log.to_status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function ContributionTab() {
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [collectPeriod, setCollectPeriod] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [collectResult, setCollectResult] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['hr-contributions'],
    queryFn: () => api.get<{ items: ContributionItem[]; total: number }>('/hr/contributions/list', {
      params: { page: 1, page_size: 100 },
    }),
  })

  const importMut = useMutation({
    mutationFn: (items: Record<string, unknown>[]) => api.post('/hr/contributions/import', { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-contributions'] })
      setShowImport(false)
      setImportText('')
    },
  })

  const collectMut = useMutation({
    mutationFn: (period: string) => api.post<{ period: string; collected_count: number }>(
      '/hr/contributions/collect', null, { params: { period } },
    ),
    onSuccess: (res) => {
      const d = res?.data
      setCollectResult(`已采集 ${d?.collected_count ?? 0} 条 ${d?.period ?? ''} 贡献数据`)
      queryClient.invalidateQueries({ queryKey: ['hr-contributions'] })
    },
    onError: () => setCollectResult('采集失败，请检查后端日志'),
  })

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importText)
      const items = Array.isArray(parsed) ? parsed : [parsed]
      importMut.mutate(items)
    } catch {
      alert('JSON 格式错误，请检查')
    }
  }

  const columns: Column<ContributionItem>[] = useMemo(() => [
    { key: 'period', title: '月份', width: 90 },
    { key: 'staff_name', title: '姓名' },
    { key: 'project_code', title: '项目', width: 120 },
    { key: 'group_name', title: '组别', width: 80 },
    { key: 'source_workstation', title: '来源', width: 80 },
    {
      key: 'data_confidence', title: '置信度', width: 80, align: 'center' as const,
      render: (v) => {
        const n = Number(v)
        const color = n >= 0.8 ? 'text-green-600' : n >= 0.5 ? 'text-amber-600' : 'text-red-500'
        return <span className={`font-medium ${color}`}>{(n * 100).toFixed(0)}%</span>
      },
    },
    { key: 'import_source', title: '导入方式', width: 80 },
    {
      key: 'create_time', title: '时间', width: 140,
      render: (v) => new Date(String(v)).toLocaleString('zh-CN'),
    },
  ], [])

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">贡献快照</h2>
        <PermissionGuard permission="hr.staff.manage">
          <div className="flex items-center gap-2">
            <Input value={collectPeriod} onChange={(e) => setCollectPeriod(e.target.value)}
              className="w-28" placeholder="YYYY-MM" />
            <Button variant="outline" loading={collectMut.isPending}
              onClick={() => collectMut.mutate(collectPeriod)}>
              自动采集
            </Button>
            <Button onClick={() => setShowImport(true)}>手工导入</Button>
          </div>
        </PermissionGuard>
      </div>

      {collectResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800 mb-4 flex items-center justify-between">
          <span>{collectResult}</span>
          <button className="text-blue-500 hover:text-blue-700 text-xs" onClick={() => setCollectResult(null)}>关闭</button>
        </div>
      )}

      <Card>
        <div className="p-4">
          <DataTable<ContributionItem> columns={columns} data={data?.data?.items ?? []}
            loading={isLoading} emptyText="暂无贡献数据，可通过手工录入或自动采集获取" />
        </div>
      </Card>

      <Modal isOpen={showImport} onClose={() => setShowImport(false)} title="导入贡献数据"
        footer={<>
          <Button variant="outline" onClick={() => setShowImport(false)}>取消</Button>
          <Button loading={importMut.isPending} onClick={handleImport}>导入</Button>
        </>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            粘贴 JSON 数组，每项包含 period, staff_name, group_name, metrics 等字段。
            数据不完整也可导入，系统会标注置信度。
          </p>
          <textarea className="w-full h-48 border rounded-lg p-3 text-sm font-mono"
            placeholder={`[{"period":"2026-03","staff_name":"张三","group_name":"C01","metrics":{"workorder_count":12}}]`}
            value={importText} onChange={(e) => setImportText(e.target.value)} />
        </div>
      </Modal>
    </>
  )
}

function RulesTab() {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', version: '', effective_from: '' })
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['hr-perf-rules'],
    queryFn: () => api.get<{ items: RuleItem[]; total: number }>('/hr/performance-rules/list', {
      params: { page: 1, page_size: 20 },
    }),
  })

  const createMut = useMutation({
    mutationFn: () => api.post('/hr/performance-rules/create', {
      name: form.name,
      version: form.version,
      effective_from: form.effective_from || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-perf-rules'] })
      setShowCreate(false)
      setForm({ name: '', version: '', effective_from: '' })
    },
  })

  const columns: Column<RuleItem>[] = useMemo(() => [
    { key: 'name', title: '规则名称' },
    { key: 'version', title: '版本', width: 100 },
    { key: 'effective_from', title: '生效日期', width: 110 },
    { key: 'effective_to', title: '失效日期', width: 110, render: (v) => v || '长期' },
    {
      key: 'status', title: '状态', width: 80,
      render: (v) => {
        const map: Record<string, string> = { active: '启用', inactive: '停用', draft: '草稿' }
        return map[String(v)] ?? v
      },
    },
  ], [])

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">绩效规则</h2>
        <PermissionGuard permission="hr.staff.manage">
          <Button onClick={() => setShowCreate(true)}>新建规则</Button>
        </PermissionGuard>
      </div>

      <Card>
        <div className="p-4">
          <DataTable<RuleItem> columns={columns} data={data?.data?.items ?? []}
            loading={isLoading} emptyText="暂无规则，系统将使用默认等比分配" />
        </div>
      </Card>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新建绩效规则"
        footer={<>
          <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
          <Button loading={createMut.isPending} onClick={() => createMut.mutate()}>创建</Button>
        </>}
      >
        <div className="space-y-4">
          <Input label="规则名称" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="版本号" placeholder="如 v2026.03" value={form.version}
            onChange={(e) => setForm({ ...form, version: e.target.value })} />
          <Input label="生效日期" type="date" value={form.effective_from}
            onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
        </div>
      </Modal>
    </>
  )
}

export function PerformanceOpsPage() {
  const [tab, setTab] = useState<Tab>('settlements')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'settlements', label: '绩效结算' },
    { key: 'contributions', label: '贡献快照' },
    { key: 'rules', label: '计算规则' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">绩效管理</h1>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.key}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'settlements' && <SettlementListTab />}
      {tab === 'contributions' && <ContributionTab />}
      {tab === 'rules' && <RulesTab />}
    </div>
  )
}
