import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Users,
  Lightbulb,
  ShieldCheck,
  Send,
  X,
} from 'lucide-react'
import {
  getInsight,
  reviewInsight,
  actInsight,
  feedbackInsight,
  convertToAction,
  type ProactiveInsightDetail,
} from '@/api/proactiveInsights'

const TYPE_LABELS: Record<string, string> = {
  trend_alert: '趋势预警',
  client_periodic: '客户洞察',
  project_recommendation: '项目推荐',
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending_review: '待审核',
  approved: '已审核',
  pushed: '已推送',
  acted: '已行动',
  dismissed: '已忽略',
  expired: '已过期',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  pushed: 'bg-blue-100 text-blue-700',
  acted: 'bg-emerald-100 text-emerald-700',
  dismissed: 'bg-red-100 text-red-600',
  expired: 'bg-slate-100 text-slate-400',
}

const PRIORITY_LABELS: Record<string, string> = {
  critical: '紧急', high: '高', medium: '中', low: '低',
}
const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-slate-100 text-slate-500',
}

/** 确认对话框 — 用于高风险操作 */
function ConfirmModal({
  open, title, description, confirmLabel, confirmCls, onConfirm, onCancel,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  confirmCls?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
        data-testid="confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div className="mb-1 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h3 className="text-base font-semibold text-slate-900" id="confirm-modal-title">{title}</h3>
        </div>
        <p className="mb-5 text-sm text-slate-500">{description}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${confirmCls ?? 'bg-primary-600 hover:bg-primary-700'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Toast 通知（内联 — 不引入独立通知库） */
function Toast({ msg, type, onDismiss }: { msg: string; type: 'success' | 'error'; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm shadow-lg ${
        type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
      }`}
      role="alert"
    >
      {type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      {msg}
      <button onClick={onDismiss} className="ml-2 opacity-70 hover:opacity-100" aria-label="关闭通知"><X className="h-3.5 w-3.5" /></button>
    </div>
  )
}

/** 评分星星选择 */
function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="反馈评分">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-lg leading-none transition-colors ${n <= value ? 'text-amber-400' : 'text-slate-200 hover:text-amber-300'}`}
          aria-label={`${n} 分`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

export function ProactiveInsightDetailPage() {
  const { insightId } = useParams<{ insightId: string }>()
  const navigate = useNavigate()
  const [insight, setInsight] = useState<ProactiveInsightDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState('')
  const [fbScore, setFbScore] = useState(4)
  const [fbNote, setFbNote] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [confirming, setConfirming] = useState<null | { action: string; label: string; desc: string; cls?: string }>(null)
  const [submitting, setSubmitting] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
  }

  const load = useCallback(() => {
    if (!insightId) return
    setLoading(true)
    setLoadError(null)
    getInsight(Number(insightId))
      .then((r) => {
        const d = (r as unknown as Record<string, unknown>).data as ProactiveInsightDetail | undefined
        if (d) setInsight(d)
        else setLoadError('洞察数据解析失败')
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : '加载失败，请重试')
      })
      .finally(() => setLoading(false))
  }, [insightId])

  useEffect(() => { load() }, [load])

  const executeReview = async (action: string) => {
    if (!insight) return
    setSubmitting(true)
    try {
      await reviewInsight(insight.id, action, actionNote)
      showToast('操作成功')
      setActionNote('')
      load()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '操作失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmedAction = async () => {
    if (!confirming) return
    setConfirming(null)
    await executeReview(confirming.action)
  }

  const requestReview = (action: string, label: string, desc: string, cls?: string) => {
    // 高危操作弹确认框，否则直接执行
    const highRisk = ['push', 'dismiss']
    if (highRisk.includes(action)) {
      setConfirming({ action, label, desc, cls })
    } else {
      void executeReview(action)
    }
  }

  const doAct = async () => {
    if (!insight || !actionNote.trim()) {
      showToast('请填写行动说明', 'error')
      return
    }
    setSubmitting(true)
    try {
      await actInsight(insight.id, { action_taken: actionNote, action_result: 'converted' })
      showToast('已记录行动')
      setActionNote('')
      load()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '记录行动失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const doFeedback = async () => {
    if (!insight) return
    setSubmitting(true)
    try {
      await feedbackInsight(insight.id, fbScore, fbNote)
      showToast('反馈已提交')
      setFbNote('')
      load()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '提交反馈失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const doConvert = async () => {
    if (!insight) return
    setSubmitting(true)
    try {
      await convertToAction(insight.id)
      showToast('已转为动作任务')
      load()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '转换失败', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-slate-100" />
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-slate-50" />
      </div>
    )
  }

  if (loadError || !insight) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate('/proactive-insights')}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> 返回列表
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {loadError ?? '洞察未找到'}
          <button onClick={load} className="ml-auto underline hover:no-underline">重试</button>
        </div>
      </div>
    )
  }

  const detail = (insight.detail as Record<string, unknown>) || {}
  const keyFindings = (detail.key_findings || []) as string[]
  const actions = (detail.recommended_actions || []) as string[]
  const evidenceChain = (detail.evidence_chain || []) as Array<Record<string, string>>

  const typeLabel = TYPE_LABELS[insight.insight_type] ?? insight.insight_type
  const typeIcon = insight.insight_type === 'trend_alert'
    ? <TrendingUp className="h-3.5 w-3.5" />
    : insight.insight_type === 'client_periodic'
      ? <Users className="h-3.5 w-3.5" />
      : <Lightbulb className="h-3.5 w-3.5" />

  const canAct = ['draft', 'pending_review', 'approved', 'pushed'].includes(insight.status)

  return (
    <div className="p-6">
      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}

      {/* 确认弹框 */}
      {confirming && (
        <ConfirmModal
          open
          title={`确认：${confirming.label}？`}
          description={confirming.desc}
          confirmLabel={confirming.label}
          confirmCls={confirming.cls}
          onConfirm={handleConfirmedAction}
          onCancel={() => setConfirming(null)}
        />
      )}

      {/* 返回 */}
      <button
        onClick={() => navigate('/proactive-insights')}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> 返回列表
      </button>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* 头部 */}
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              {typeIcon} {typeLabel}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[insight.priority] ?? 'bg-slate-100 text-slate-500'}`}>
              {PRIORITY_LABELS[insight.priority] ?? insight.priority}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_COLORS[insight.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {STATUS_LABELS[insight.status] ?? insight.status}
            </span>
            <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" /> {insight.governance_level}
            </span>
          </div>
          <h1 className="text-lg font-semibold text-slate-900">{insight.title}</h1>
          {insight.client_name && (
            <p className="mt-1 text-sm text-slate-500">关联客户：<strong className="text-slate-700">{insight.client_name}</strong></p>
          )}
        </div>

        {/* 正文 */}
        <div className="px-6 py-4 space-y-5">
          <p className="text-sm leading-relaxed text-slate-600">{insight.summary}</p>

          {/* 评分条 */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '相关性', value: insight.relevance_score },
              { label: '紧迫度', value: insight.urgency_score },
              { label: '影响力', value: insight.impact_score },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span>{label}</span>
                  <span className="font-medium text-slate-700">{(value * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-primary-500 transition-all"
                    style={{ width: `${value * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* 核心发现 */}
          {keyFindings.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">核心发现</h3>
              <ul className="space-y-1.5">
                {keyFindings.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600">
                    <span className="mt-0.5 shrink-0 text-primary-500">•</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 建议行动 */}
          {actions.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">建议行动</h3>
              <ul className="space-y-1.5">
                {actions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-600">
                    <span className="mt-0.5 shrink-0 text-emerald-500">→</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 证据来源 */}
          {evidenceChain.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">证据来源</h3>
              <div className="space-y-1.5">
                {evidenceChain.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-500">
                    <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                      {ev.source ?? ev.source_type ?? '—'}
                    </span>
                    {ev.title}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 操作区 */}
        {canAct && (
          <div className="border-t border-slate-100 px-6 py-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">操作</h3>
            <div className="flex flex-wrap gap-2">
              {insight.status === 'draft' && (
                <button
                  disabled={submitting}
                  onClick={() => requestReview('submit_review', '提交审核', '将此洞察提交给审核人，审核通过后可推送给客户经理。')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  data-testid="btn-submit-review"
                >
                  提交审核
                </button>
              )}
              {insight.status === 'pending_review' && (
                <button
                  disabled={submitting}
                  onClick={() => requestReview('approve', '审核通过', '审核通过后此洞察可被推送给客户经理。')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  data-testid="btn-approve"
                >
                  <CheckCircle className="h-4 w-4" /> 审核通过
                </button>
              )}
              {insight.status === 'approved' && (
                <>
                  <button
                    disabled={submitting}
                    onClick={() =>
                      requestReview('push', '推送洞察', '推送后将通知相关客户经理处理此洞察，此操作不可撤销。', 'bg-violet-600 hover:bg-violet-700')
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                    data-testid="btn-push"
                  >
                    <Send className="h-4 w-4" /> 推送给客户经理
                  </button>
                  <button
                    disabled={submitting}
                    onClick={doConvert}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                    data-testid="btn-convert"
                  >
                    转为动作任务
                  </button>
                </>
              )}
              {insight.status === 'pushed' && (
                <button
                  disabled={submitting || !actionNote.trim()}
                  onClick={doAct}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  data-testid="btn-act"
                >
                  <CheckCircle className="h-4 w-4" /> 记录行动
                </button>
              )}
              <button
                disabled={submitting}
                onClick={() =>
                  requestReview('dismiss', '忽略', '忽略后此洞察将不再出现在待处理列表中，该类洞察的推送频率也会相应降低。', 'bg-red-600 hover:bg-red-700')
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                data-testid="btn-dismiss"
              >
                <X className="h-4 w-4" /> 忽略
              </button>
            </div>
            <div className="mt-3">
              <input
                placeholder={insight.status === 'pushed' ? '必填：请描述已采取的行动（例如：已联系客户经理跟进）' : '备注（可选）'}
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                required={insight.status === 'pushed'}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                data-testid="input-action-note"
              />
              {insight.status === 'pushed' && !actionNote.trim() && (
                <p className="mt-1 text-xs text-slate-400">记录行动前请填写行动说明</p>
              )}
            </div>
          </div>
        )}

        {/* 反馈区 */}
        <div className="border-t border-slate-100 px-6 py-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">满意度反馈</h3>
          <div className="flex flex-wrap items-center gap-3">
            <StarRating value={fbScore} onChange={setFbScore} />
            <input
              placeholder="补充说明（可选）"
              value={fbNote}
              onChange={(e) => setFbNote(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
              data-testid="input-feedback-note"
            />
            <button
              disabled={submitting}
              onClick={doFeedback}
              className="shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              data-testid="btn-submit-feedback"
            >
              提交反馈
            </button>
          </div>
          {insight.feedback_score != null && (
            <p className="mt-2 text-xs text-slate-400">
              已有反馈：{'★'.repeat(insight.feedback_score)}{'☆'.repeat(5 - insight.feedback_score)}
              {insight.feedback_note ? ` — ${insight.feedback_note}` : ''}
            </p>
          )}
        </div>

        {/* 时间戳 */}
        <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-400">
          创建 {insight.created_at?.slice(0, 16) ?? '—'}
          {insight.reviewed_at && ` · 审核 ${insight.reviewed_at.slice(0, 16)}`}
          {insight.pushed_at && ` · 推送 ${insight.pushed_at.slice(0, 16)}`}
        </div>
      </div>
    </div>
  )
}
