/**
 * 工单详情页
 *
 * 包含：工单信息、关联资源、CRF 录入入口、操作按钮、质量审计结果
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workorderApi, edcApi } from '@cn-kis/api-client'
import type { WorkOrder, WorkOrderQualityAudit, CRFRecord, CRFTemplate } from '@cn-kis/api-client'
import { Badge, Empty } from '@cn-kis/ui-kit'
import {
  ArrowLeft, Play, CheckCircle, Send, XCircle,
  FileText, ShieldCheck, AlertTriangle, Clock, BookOpen,
  ChevronDown, ChevronUp, MessageSquare,
} from 'lucide-react'
import SOPViewer from '../components/SOPViewer'
import WorkOrderChecklist from '../components/WorkOrderChecklist'
import CRFFormRenderer from '../components/CRFFormRenderer'
import { WorkOrderMaterialTab } from '../components/WorkOrderMaterialTab'

const STATUS_LABELS: Record<string, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' }> = {
  pending: { label: '待处理', color: 'default' },
  assigned: { label: '已分配', color: 'primary' },
  in_progress: { label: '进行中', color: 'warning' },
  completed: { label: '已完成', color: 'success' },
  review: { label: '待审核', color: 'warning' },
  approved: { label: '已批准', color: 'success' },
  rejected: { label: '已拒绝', color: 'error' },
  cancelled: { label: '已取消', color: 'default' },
}

const AUDIT_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  auto_pass: { label: '自动通过', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  auto_reject: { label: '未通过', color: 'text-red-600 bg-red-50', icon: XCircle },
  manual_review: { label: '待人工审核', color: 'text-amber-600 bg-amber-50', icon: AlertTriangle },
}

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const workOrderId = Number(id)
  const [allMandatoryChecked, setAllMandatoryChecked] = useState(false)
  const [crfExpanded, setCrfExpanded] = useState(false)
  const [commentText, setCommentText] = useState('')

  const { data: woRes, isLoading } = useQuery({
    queryKey: ['workorder', 'detail', workOrderId],
    queryFn: () => workorderApi.get(workOrderId),
    enabled: !!workOrderId,
  })

  const { data: auditsRes } = useQuery({
    queryKey: ['workorder', 'audits', workOrderId],
    queryFn: () => workorderApi.getQualityAudit(workOrderId),
    enabled: !!workOrderId,
  })

  const { data: crfRecordsRes, refetch: refetchRecords } = useQuery({
    queryKey: ['edc', 'records', workOrderId],
    queryFn: () => edcApi.listRecords({ work_order_id: workOrderId }),
    enabled: !!workOrderId,
  })

  const { data: commentsRes, refetch: refetchComments } = useQuery({
    queryKey: ['workorder', 'comments', workOrderId],
    queryFn: () => workorderApi.listComments(workOrderId),
    enabled: !!workOrderId,
  })

  const comments = Array.isArray(commentsRes?.data) ? commentsRes.data : []

  const addCommentMutation = useMutation({
    mutationFn: (content: string) => workorderApi.addComment(workOrderId, { content }),
    onSuccess: () => {
      setCommentText('')
      refetchComments()
    },
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['workorder'] })
  }

  const startMutation = useMutation({
    mutationFn: () => workorderApi.start(workOrderId),
    onSuccess: invalidate,
  })

  const completeMutation = useMutation({
    mutationFn: () => workorderApi.complete(workOrderId),
    onSuccess: invalidate,
  })

  const wo = woRes?.data as WorkOrder | undefined
  const audits = (auditsRes?.data ?? []) as WorkOrderQualityAudit[]
  const crfRecords = (crfRecordsRes?.data?.items ?? []) as CRFRecord[]

  const templateId = (wo as any)?.crf_template_id as number | undefined
  const { data: templateRes } = useQuery({
    queryKey: ['edc', 'template', templateId],
    queryFn: () => edcApi.getTemplate(templateId!),
    enabled: !!templateId,
  })
  const crfTemplate = templateRes?.data as CRFTemplate | undefined

  const existingDraft = crfRecords.find(r => r.status === 'draft')
  const hasSubmitted = crfRecords.some(r => r.status === 'submitted' || r.status === 'verified' || r.status === 'locked')
  const showCrfForm = wo?.status === 'in_progress' && crfTemplate && !hasSubmitted

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
  }
  if (!wo) {
    return <div className="p-6"><Empty message="工单不存在" /></div>
  }

  const statusInfo = STATUS_LABELS[wo.status] || { label: wo.status, color: 'default' as const }
  const canStart = ['assigned', 'pending'].includes(wo.status)
  const canComplete = wo.status === 'in_progress'

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-800">{wo.title}</h2>
            <Badge variant={statusInfo.color}>{statusInfo.label}</Badge>
            {(wo.status === 'review' || wo.status === 'approved' || wo.status === 'rejected') && (
              <Badge variant={wo.status === 'approved' ? 'success' : wo.status === 'rejected' ? 'error' : 'warning'}>
                {wo.status === 'review' ? '审批中' : wo.status === 'approved' ? '已批准' : '已拒绝'}
              </Badge>
            )}
            <span className="text-xs text-slate-400 font-mono">WO#{wo.id}</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">{wo.description || '无描述'}</p>
        </div>
        <div className="flex gap-2">
          {canStart && (
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {startMutation.isPending ? '处理中...' : '开始执行'}
            </button>
          )}
          {canComplete && (
            <button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending || !allMandatoryChecked}
              title={!allMandatoryChecked ? '请先完成所有必做检查项' : ''}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              {completeMutation.isPending ? '处理中...' : '完成工单'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 左侧：工单信息 */}
        <div className="col-span-2 space-y-4">
          {/* 基本信息 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">基本信息</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="工单类型" value={wo.work_order_type || 'visit'} />
              <InfoRow label="排程日期" value={wo.scheduled_date || '-'} />
              <InfoRow label="截止时间" value={wo.due_date ? new Date(wo.due_date).toLocaleString() : '-'} />
              <InfoRow label="创建时间" value={new Date(wo.create_time).toLocaleString()} />
              {wo.completed_at && (
                <InfoRow label="完成时间" value={new Date(wo.completed_at).toLocaleString()} />
              )}
            </div>
          </div>

          {/* 关联信息 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">关联信息</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoRow label="项目" value={wo.protocol_title || '-'} />
              <InfoRow label="受试者" value={wo.subject_name || '-'} />
              <InfoRow label="访视节点" value={wo.visit_node_name || '-'} />
              <InfoRow label="活动" value={wo.activity_name || '-'} />
            </div>
          </div>

          {/* 物料领用 Tab — M4 跨工作台集成 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <WorkOrderMaterialTab
              workOrderId={workOrderId}
              projectCode={(wo as any).protocol_code ?? wo.protocol_title ?? ''}
            />
          </div>

          {/* 所需资源 */}
          {wo.resources && wo.resources.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">所需资源</h3>
              <div className="space-y-2">
                {wo.resources.map((r) => {
                  let calColor = 'text-green-600'
                  if (r.next_calibration_date) {
                    const daysLeft = Math.ceil(
                      (new Date(r.next_calibration_date).getTime() - Date.now()) / 86400000
                    )
                    if (daysLeft < 0) calColor = 'text-red-600'
                    else if (daysLeft < 30) calColor = 'text-amber-600'
                  }
                  return (
                    <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-700">{r.resource_category_name}</span>
                        {r.resource_item_name && (
                          <span className="text-xs text-slate-400">({r.resource_item_name})</span>
                        )}
                        {r.is_mandatory && <Badge variant="primary">必须</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-500">x{r.required_quantity}</span>
                        {r.next_calibration_date && (
                          <span className={calColor}>
                            校准至 {r.next_calibration_date}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 操作规范（SOP） */}
          {(wo as any).sop_id && (
            <SOPViewer
              sopId={(wo as any).sop_id}
              workOrderId={workOrderId}
              sopConfirmed={(wo as any).sop_confirmed}
            />
          )}

          {/* 操作检查清单 */}
          <WorkOrderChecklist
            workOrderId={workOrderId}
            readOnly={wo.status === 'completed' || wo.status === 'approved'}
            onAllMandatoryChecked={setAllMandatoryChecked}
          />

          {/* CRF 内嵌填写 */}
          {showCrfForm && (
            <div className="bg-white rounded-xl border border-slate-200 p-5" data-section="crf-form">
              <button
                onClick={() => setCrfExpanded(!crfExpanded)}
                className="flex items-center justify-between w-full text-left"
              >
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary-500" />
                  填写 CRF — {crfTemplate.name}
                </h3>
                {crfExpanded
                  ? <ChevronUp className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {crfExpanded && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <CRFFormRenderer
                    template={crfTemplate}
                    workOrderId={workOrderId}
                    existingRecordId={existingDraft?.id}
                    existingData={existingDraft?.data as Record<string, unknown> | undefined}
                    onSaved={() => refetchRecords()}
                    onSubmitted={() => refetchRecords()}
                  />
                </div>
              )}
            </div>
          )}

          {/* CRF 记录列表 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5" data-section="crf-records">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">CRF 数据记录</h3>
            {crfRecords.length === 0 ? (
              <Empty message="暂无 CRF 记录" />
            ) : (
              <div className="space-y-2">
                {crfRecords.map((rec) => (
                  <div key={rec.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-700">
                        {rec.template_name || `CRF #${rec.id}`}
                      </span>
                    </div>
                    <Badge variant={rec.status === 'submitted' ? 'success' : rec.status === 'draft' ? 'default' : 'primary'}>
                      {rec.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：质量审计 */}
        <div className="space-y-4">
          {/* 质量审计结果 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <ShieldCheck className="w-4 h-4" />
              质量审计
            </h3>
            {audits.length === 0 ? (
              <p className="text-xs text-slate-400">工单完成后将自动执行质量审计</p>
            ) : (
              <div className="space-y-3">
                {audits.map((audit) => {
                  const info = AUDIT_LABELS[audit.result] || {
                    label: audit.result, color: 'text-slate-600 bg-slate-50', icon: Clock,
                  }
                  const Icon = info.icon
                  return (
                    <div key={audit.id} className={`rounded-lg p-3 ${info.color}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{info.label}</span>
                      </div>
                      <div className="text-xs space-y-1">
                        <div>数据完整度: {(audit.completeness * 100).toFixed(1)}%</div>
                        <div>异常: {audit.has_anomaly ? '是' : '无'}</div>
                        {audit.reviewer_comment && (
                          <div>审核意见: {audit.reviewer_comment}</div>
                        )}
                        <div className="text-[10px] opacity-60 mt-1">
                          {new Date(audit.create_time).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 时间线 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <Clock className="w-4 h-4" />
              时间线
            </h3>
            <div className="space-y-2 text-xs text-slate-500">
              <TimelineItem label="创建" time={wo.create_time} />
              {wo.scheduled_date && <TimelineItem label="排程" time={wo.scheduled_date} />}
              {wo.completed_at && <TimelineItem label="完成" time={wo.completed_at} />}
            </div>
          </div>

          {/* 评论区 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5" data-testid="comments-section">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <MessageSquare className="w-4 h-4" />
              评论 ({comments.length})
            </h3>
            {comments.length > 0 && (
              <div className="space-y-3 mb-3 max-h-60 overflow-y-auto">
                {comments.map((c: any) => (
                  <div key={c.id} className="border-l-2 border-primary-200 pl-3 py-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-slate-700">{c.author_name || `#${c.author_id}`}</span>
                      <span className="text-slate-400">{new Date(c.create_time).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5">{c.content}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2"
                placeholder="添加评论..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && commentText.trim()) {
                    addCommentMutation.mutate(commentText.trim())
                  }
                }}
              />
              <button
                onClick={() => commentText.trim() && addCommentMutation.mutate(commentText.trim())}
                disabled={!commentText.trim() || addCommentMutation.isPending}
                className="px-3 py-2 bg-primary-600 text-white rounded-lg text-sm disabled:opacity-50"
                title="发送评论"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-400">{label}：</span>
      <span className="text-slate-700">{value}</span>
    </div>
  )
}

function TimelineItem({ label, time }: { label: string; time: string }) {
  const formatted = time.includes('T')
    ? new Date(time).toLocaleString()
    : time
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="text-slate-400">{formatted}</span>
    </div>
  )
}
