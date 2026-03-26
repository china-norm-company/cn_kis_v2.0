import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, Badge, Button, DataTable, type Column } from '@cn-kis/ui-kit'
import { safetyApi, type AdverseEvent, type AEFollowUp } from '@cn-kis/api-client'
import { ArrowLeft } from 'lucide-react'

const severityMap: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'error' }> = {
  mild: { label: '轻微', variant: 'info' },
  moderate: { label: '中度', variant: 'default' },
  severe: { label: '严重', variant: 'warning' },
  very_severe: { label: '非常严重', variant: 'error' },
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'warning' | 'success' | 'error' | 'info' }> = {
  reported: { label: '已上报', variant: 'info' },
  under_review: { label: '审核中', variant: 'warning' },
  approved: { label: '已确认', variant: 'primary' },
  following: { label: '随访中', variant: 'primary' },
  closed: { label: '已关闭', variant: 'success' },
}

const relationMap: Record<string, string> = {
  unrelated: '无关',
  possible: '可能有关',
  probable: '很可能有关',
  certain: '肯定有关',
}

const outcomeMap: Record<string, string> = {
  recovered: '痊愈',
  recovering: '好转',
  not_recovered: '未好转',
  sequelae: '有后遗症',
  death: '死亡',
  unknown: '未知',
}

const followColumns: Column<AEFollowUp>[] = [
  { key: 'sequence', title: '序号', width: 64 },
  { key: 'followup_date', title: '随访日期', width: 120 },
  { key: 'current_status', title: '当前状态' },
  { key: 'outcome_update', title: '转归更新' },
  {
    key: 'requires_further_followup',
    title: '需继续随访',
    width: 110,
    render: (v) => (v ? '是' : '否'),
  },
]

export function AdverseEventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const aeId = id ? parseInt(id, 10) : NaN

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['quality-ae-detail', aeId],
    queryFn: () => safetyApi.getAdverseEvent(aeId),
    enabled: Number.isFinite(aeId),
  })

  const ae = data?.data as (AdverseEvent & { follow_ups?: AEFollowUp[] }) | undefined
  const followUps = ae?.follow_ups ?? []

  if (!Number.isFinite(aeId)) {
    return (
      <div className="p-4 text-slate-600">
        <p>无效的记录 ID</p>
        <Button variant="ghost" className="mt-2" onClick={() => navigate('/adverse-events')}>
          返回列表
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return <div className="p-6 text-slate-500">加载中...</div>
  }

  if (isError || !ae) {
    return (
      <div className="p-4 text-slate-600">
        <p>{error instanceof Error ? error.message : '记录不存在或无权限查看'}</p>
        <Button variant="ghost" className="mt-2" onClick={() => navigate('/adverse-events')}>
          返回列表
        </Button>
      </div>
    )
  }

  const sev = severityMap[ae.severity]
  const st = statusMap[ae.status]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/adverse-events')}>
          返回
        </Button>
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">不良反应 #{ae.id}</h1>
      </div>

      <Card title="概要">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-500">项目编号</dt>
            <dd className="font-medium">{ae.project_code?.trim() || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">项目名称</dt>
            <dd className="font-medium">{ae.project_name?.trim() || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">受试者姓名</dt>
            <dd className="font-medium">{ae.subject_name?.trim() || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">SC 号</dt>
            <dd className="font-medium">{ae.sc_number?.trim() || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">RD 号</dt>
            <dd className="font-medium">{ae.rd_number?.trim() || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">入组 ID</dt>
            <dd className="font-medium">{ae.enrollment_id}</dd>
          </div>
          <div>
            <dt className="text-slate-500">工单 ID</dt>
            <dd className="font-medium">{ae.work_order_id ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">严重程度</dt>
            <dd>{sev ? <Badge variant={sev.variant}>{sev.label}</Badge> : ae.severity}</dd>
          </div>
          <div>
            <dt className="text-slate-500">状态</dt>
            <dd>{st ? <Badge variant={st.variant}>{st.label}</Badge> : ae.status}</dd>
          </div>
          <div>
            <dt className="text-slate-500">SAE</dt>
            <dd>{ae.is_sae ? <Badge variant="error">是</Badge> : '否'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">因果关系</dt>
            <dd>{relationMap[ae.relation] || ae.relation}</dd>
          </div>
          <div>
            <dt className="text-slate-500">发生日期</dt>
            <dd>{ae.start_date}</dd>
          </div>
          <div>
            <dt className="text-slate-500">结束日期</dt>
            <dd>{ae.end_date ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">上报日期</dt>
            <dd>{ae.report_date}</dd>
          </div>
          <div>
            <dt className="text-slate-500">转归</dt>
            <dd>{outcomeMap[ae.outcome] || ae.outcome}</dd>
          </div>
          {ae.deviation_id != null && (
            <div>
              <dt className="text-slate-500">关联偏差 ID</dt>
              <dd>{ae.deviation_id}</dd>
            </div>
          )}
          {ae.change_request_id != null && (
            <div>
              <dt className="text-slate-500">关联变更 ID</dt>
              <dd>{ae.change_request_id}</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card title="事件描述">
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{ae.description}</p>
      </Card>

      {ae.action_taken ? (
        <Card title="处理措施">
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{ae.action_taken}</p>
        </Card>
      ) : null}

      <Card title={`随访记录（${followUps.length}）`}>
        <DataTable<AEFollowUp>
          columns={followColumns}
          data={followUps}
          emptyText="暂无随访"
        />
      </Card>
    </div>
  )
}
