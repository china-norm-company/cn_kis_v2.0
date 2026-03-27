import type { ReactNode } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, Badge, Button } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { ArrowLeft, Pencil } from 'lucide-react'
import { opportunityStageLabel } from '../constants/opportunityStages'
import { displayOwnerName } from '../utils/displayOwnerName'

type OpportunityDetail = {
  id: number
  code: string
  title: string
  client_id: number
  client_name: string
  stage: string
  estimated_amount: string
  probability: number
  owner: string
  commercial_owner_name: string
  research_group: string
  business_segment: string
  business_type?: string
  client_pm: string
  client_contact_info: string
  client_department_line: string
  is_decision_maker: string
  actual_decision_maker: string
  actual_decision_maker_department_line: string
  actual_decision_maker_level: string
  demand_stages: string[]
  project_detail: Record<string, unknown>
  necessity_pct: number | null
  urgency_pct: number | null
  uniqueness_pct: number | null
  expected_close_date: string
  planned_start_date: string
  demand_name: string
  sales_amount_total: string
  sales_by_year: Record<string, string>
  sales_amount_change: string
  key_opportunity: boolean
  description: string
  remark: string
  cancel_reason: string
  lost_reason: string
  create_time: string
}

function money(v: string | number | undefined | null) {
  if (v === undefined || v === null || v === '') return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return `¥${n.toLocaleString()}`
}

function ynLabel(v: unknown) {
  if (v === 'yes' || v === true) return '是'
  if (v === 'no' || v === false) return '否'
  return v != null && String(v) !== '' ? String(v) : '—'
}

export function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  const goBack = () => {
    if (from) navigate(from, { replace: true })
    else navigate(-1)
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['crm', 'opportunity', id],
    queryFn: () => api.get<OpportunityDetail>(`/crm/opportunities/${id}`),
    enabled: !!id,
  })

  const opp = data?.data

  if (isLoading || !opp) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">
        {isError ? '加载失败' : '加载中…'}
      </div>
    )
  }

  const stageLabel = opportunityStageLabel(opp.stage)
  const stageVariant =
    opp.stage === 'won'
      ? 'success'
      : opp.stage === 'lost' || opp.stage === 'cancelled'
        ? 'error'
        : 'primary'

  const pd = opp.project_detail || {}
  const editFrom = location.pathname + location.search

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Button variant="ghost" size="sm" type="button" onClick={goBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-slate-800">{opp.title}</h1>
            {opp.code ? <p className="text-sm text-slate-500">商机编号 {opp.code}</p> : null}
          </div>
        </div>
        <PermissionGuard permission="crm.opportunity.update">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => navigate(`/opportunities/${id}/edit`, { state: { from: editFrom } })}
          >
            <Pencil className="mr-1 h-4 w-4" />
            编辑
          </Button>
        </PermissionGuard>
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">基本信息</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="客户" value={opp.client_name} />
          <Field label="商机阶段">
            <Badge variant={stageVariant}>{stageLabel}</Badge>
          </Field>
          <Field label="业务板块" value={opp.business_segment || '—'} />
          <Field label="业务类型" value={opp.business_type || '—'} />
          <Field label="研究组" value={opp.research_group || '—'} />
          <Field label="重点商机" value={opp.key_opportunity ? '是' : '否'} />
          <Field
            label="商务负责人"
            value={
              opp.commercial_owner_name || opp.owner
                ? displayOwnerName(opp.commercial_owner_name || opp.owner || '')
                : '—'
            }
          />
          <Field label="商机名称" value={opp.demand_name || '—'} />
          <Field label="预估金额" value={money(opp.estimated_amount)} />
          <Field label="销售额（赢单）" value={money(opp.sales_amount_total)} />
          <Field label="预计成交日" value={opp.expected_close_date ? String(opp.expected_close_date).slice(0, 10) : '—'} />
          <Field label="预计启动时间" value={opp.planned_start_date ? String(opp.planned_start_date).slice(0, 10) : '—'} />
          <Field label="创建时间" value={opp.create_time ? new Date(opp.create_time).toLocaleString('zh-CN') : '—'} />
          {opp.sales_amount_change ? (
            <Field label="销售额变化" value={String(opp.sales_amount_change)} />
          ) : null}
        </div>
      </Card>

      {Object.keys(opp.sales_by_year || {}).length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">分年度销售额</h2>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
            {Object.entries(opp.sales_by_year).map(([y, amt]) => (
              <div key={y} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                <div className="text-xs text-slate-500">{y} 年</div>
                <div className="font-medium text-slate-800">{money(amt)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(opp.cancel_reason || opp.lost_reason) && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">终端说明</h2>
          {opp.cancel_reason ? <p className="text-sm text-slate-700">取消原因：{opp.cancel_reason}</p> : null}
          {opp.lost_reason ? <p className="mt-2 text-sm text-slate-700">输单原因：{opp.lost_reason}</p> : null}
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">客户侧信息</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="PM" value={opp.client_pm || '—'} />
          <Field label="联系方式" value={opp.client_contact_info || '—'} />
          <Field label="部门/条线" value={opp.client_department_line || '—'} />
          <Field label="是否为决策人" value={opp.is_decision_maker || '—'} />
          <Field label="实际决策人" value={opp.actual_decision_maker || '—'} />
          <Field label="实际决策人-部门/条线" value={opp.actual_decision_maker_department_line || '—'} />
          <Field label="实际决策人-职级" value={opp.actual_decision_maker_level || '—'} />
        </div>
      </Card>

      {Array.isArray(opp.demand_stages) && opp.demand_stages.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">需求阶段</h2>
          <ul className="list-inside list-disc text-sm text-slate-700">
            {opp.demand_stages.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">项目要素</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="产品类型" value={String(pd.product_type ?? '') || '—'} />
          <Field label="产品阶段" value={String(pd.product_stage ?? '') || '—'} />
          <Field label="项目发起人" value={String(pd.project_initiator ?? '') || '—'} />
          <Field label="实验目的" value={String(pd.experiment_purpose ?? '') || '—'} />
          <Field label="实验类型" value={String(pd.experiment_type ?? '') || '—'} />
          <Field label="已有样品" value={ynLabel(pd.has_sample)} />
          <Field label="样品名称" value={String(pd.sample_name ?? '') || '—'} />
          <Field label="样品类型" value={String(pd.sample_type ?? '') || '—'} />
          <Field label="样品信息" value={String(pd.sample_info ?? '') || '—'} />
          <Field label="测试信息" value={String(pd.test_info ?? '') || '—'} />
          <Field label="随访周期" value={String(pd.follow_up_period ?? '') || '—'} />
          <Field label="测试地点" value={String(pd.test_location ?? '') || '—'} />
          <Field label="伦理" value={ynLabel(pd.ethics_required)} />
          <Field label="人遗" value={ynLabel(pd.human_genetic_resource_required)} />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">商机评分</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="必要性" value={opp.necessity_pct != null ? `${opp.necessity_pct}%` : '—'} />
          <Field label="紧迫性" value={opp.urgency_pct != null ? `${opp.urgency_pct}%` : '—'} />
          <Field label="唯一性" value={opp.uniqueness_pct != null ? `${opp.uniqueness_pct}%` : '—'} />
          <Field label="成交概率（系统）" value={`${opp.probability ?? 0}%`} />
        </div>
      </Card>

      {opp.description ? (
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">描述</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{opp.description}</p>
        </Card>
      ) : null}

      {opp.remark ? (
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">备注</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{opp.remark}</p>
        </Card>
      ) : null}
    </div>
  )
}

function Field({
  label,
  value,
  children,
}: {
  label: string
  value?: string
  children?: ReactNode
}) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-800">{children ?? value ?? '—'}</div>
    </div>
  )
}
