import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, BarChart2, BookOpen, Check, Copy, Database, FileText, Link2, ListChecks, MailOpen, Sparkles } from 'lucide-react'
import { mailSignalsApi, type AnalysisDraftArtifact, type AnalysisEvidenceRef } from '@/api/mailSignals'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'

const PHASE2_TASK_KEYS = new Set(['market_trend_brief', 'competitive_intel_brief', 'claim_strategy_brief'])

const TASK_KEY_LABELS: Record<string, string> = {
  opportunity_draft: '商机草稿',
  client_profile_update: '客户画像更新',
  market_trend_brief: '品类趋势分析',
  competitive_intel_brief: '竞品情报分析',
  claim_strategy_brief: '宣称策略分析',
  followup_action_draft: '跟进行动草稿',
  research_context_sync: '研究上下文同步',
  client_risk_alert: '客户风险预警',
  capa_trigger: 'CAPA 流程触发',
  writeback_crm: '写回商机',
}

const PHASE2_LABELS: Record<string, { button: string; empty: string; section: string }> = {
  market_trend_brief: {
    button: '执行品类趋势分析',
    empty: '点击"执行品类趋势分析"后，将从邮件正文提取品类/功效信号并生成内部草稿。',
    section: '品类趋势分析',
  },
  competitive_intel_brief: {
    button: '执行竞品情报分析',
    empty: '点击"执行竞品情报分析"后，将从邮件正文提取竞品压力信号并生成内部草稿。',
    section: '竞品情报分析',
  },
  claim_strategy_brief: {
    button: '执行宣称策略分析',
    empty: '点击"执行宣称策略分析"后，将从邮件正文提取宣称/法规信号并生成内部草稿。',
    section: '宣称策略分析',
  },
}

function formatSectionValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => `- ${String(item)}`).join('\n')
  if (value == null) return ''
  return String(value)
}

function buildDraftMarkdown(taskKey: string, artifact: AnalysisDraftArtifact | null): string {
  if (!artifact) return ''
  const detail = (artifact.detail ?? {}) as Record<string, unknown>
  const titleMap: Record<string, string> = {
    market_trend_brief: '品类趋势内部简报',
    competitive_intel_brief: '竞品情报内部简报',
    claim_strategy_brief: '宣称策略内部简报',
  }
  const lines: string[] = [
    `# ${titleMap[taskKey] ?? '专项分析内部简报'}`,
    '',
    `- 生成时间：${artifact.generated_at}`,
    `- 治理级别：${artifact.governance_level}`,
    `- 输出限制：仅内部草稿，不自动对客发送`,
    '',
    '## 摘要',
    artifact.summary,
    '',
  ]

  const simpleFields = [
    ['inferred_category', '推断品类'],
    ['primary_threat', '主要威胁'],
    ['primary_focus', '主要关注方向'],
  ] as const
  simpleFields.forEach(([key, label]) => {
    if (detail[key] != null) {
      lines.push(`- ${label}：${String(detail[key])}`)
    }
  })

  if (Array.isArray(detail.matched_keywords) && detail.matched_keywords.length > 0) {
    lines.push(`- 命中关键词：${(detail.matched_keywords as string[]).join('、')}`)
    lines.push('')
  }

  const aiSections = detail.ai_enhanced_sections as Record<string, unknown> | undefined
  const externalEvidencePlan = Array.isArray(detail.external_evidence_plan)
    ? (detail.external_evidence_plan as Array<Record<string, unknown>>)
    : []
  const evidenceReferenceHints = Array.isArray(detail.evidence_reference_hints)
    ? (detail.evidence_reference_hints as Array<Record<string, unknown>>)
    : []
  const referencedEvidence = Array.isArray(detail.referenced_evidence)
    ? (detail.referenced_evidence as Array<Record<string, unknown>>)
    : []
  const externalEvidenceResults = Array.isArray(detail.external_evidence_results)
    ? (detail.external_evidence_results as Array<Record<string, unknown>>)
    : []
  if (aiSections) {
    lines.push('## AI 增强内容')
    Object.entries(aiSections)
      .filter(([key]) => key !== 'ai_note' && key !== 'confidence')
      .forEach(([key, value]) => {
        if (value == null || (Array.isArray(value) && value.length === 0)) return
        lines.push(`### ${key.replace(/_/g, ' ')}`)
        lines.push(formatSectionValue(value))
        lines.push('')
      })
    if (typeof aiSections.ai_note === 'string') {
      lines.push('> ' + aiSections.ai_note)
      lines.push('')
    }
  }

  if (externalEvidencePlan.length > 0) {
    lines.push('## 外部证据采集计划')
    externalEvidencePlan.forEach((item, index) => {
      lines.push(`### 计划 ${index + 1}`)
      lines.push(`- 来源类型：${String(item.source_type ?? '-')}`)
      lines.push(`- 优先级：${String(item.priority ?? '-')}`)
      lines.push(`- 建议查询词：${String(item.query ?? '-')}`)
      lines.push(`- 用途：${String(item.purpose ?? '-')}`)
      lines.push('')
    })
  }

  if (externalEvidenceResults.length > 0) {
    lines.push('## 外部证据命中结果')
    externalEvidenceResults.forEach((item, index) => {
      lines.push(`### 结果 ${index + 1}`)
      lines.push(`- 来源类型：${String(item.source_type ?? '-')}`)
      lines.push(`- 查询词：${String(item.query ?? '-')}`)
      lines.push(`- 用途：${String(item.purpose ?? '-')}`)
      const hits = Array.isArray(item.hits) ? (item.hits as Array<Record<string, unknown>>) : []
      hits.forEach((hit, hitIndex) => {
        lines.push(`- 命中 ${hitIndex + 1}：${String(hit.title ?? '-')}`)
        lines.push(`  说明：${String(hit.summary ?? '-')}`)
      })
      lines.push('')
    })
  }

  if (evidenceReferenceHints.length > 0) {
    lines.push('## 证据引用回指候选')
    evidenceReferenceHints.forEach((item, index) => {
      lines.push(`- ${index + 1}. ${String(item.evidence_title ?? '-')}`)
      lines.push(`  来源：${String(item.source_type ?? '-')}`)
      lines.push(`  说明：${String(item.why ?? '-')}`)
    })
    lines.push('')
  }

  if (referencedEvidence.length > 0) {
    lines.push('## 已引用证据清单')
    referencedEvidence.forEach((item, index) => {
      lines.push(`- ${index + 1}. ${String(item.evidence_title ?? '-')}`)
      lines.push(`  code：${String(item.reference_code ?? '-')}`)
      lines.push(`  来源：${String(item.source_type ?? '-')}`)
      lines.push(`  支撑：${String(item.supports ?? '-')}`)
      if (item.validated != null) lines.push(`  校验：${String(item.validated) === 'true' ? '通过' : '待验证'}`)
    })
    lines.push('')
  }

  const knowledgeCandidates = Array.isArray(detail.knowledge_deposit_candidates)
    ? (detail.knowledge_deposit_candidates as Array<Record<string, unknown>>)
    : []
  if (knowledgeCandidates.length > 0) {
    lines.push('## 知识沉淀候选')
    knowledgeCandidates.forEach((item, index) => {
      lines.push(`- ${index + 1}. ${String(item.conclusion ?? '-')}`)
      lines.push(`  类型：${String(item.conclusion_type ?? '-')}`)
      lines.push(`  知识库条目类型：${String(item.entry_type ?? '-')}`)
      lines.push(`  证据支撑数：${String(item.evidence_support ?? '0')}`)
      const depositStatus = String(item.deposit_ready)
      if (depositStatus === 'deposited') {
        lines.push(`  状态：已沉淀到知识库 (entry #${String(item.knowledge_entry_id ?? '-')})`)
      } else {
        lines.push(`  状态：待确认后沉淀`)
      }
    })
    lines.push('')
  }

  const sections = Array.isArray(detail.sections) ? (detail.sections as Array<Record<string, unknown>>) : []
  if (sections.length > 0) {
    lines.push('## 基础结构化草稿')
    sections.forEach((section) => {
      lines.push(`### ${String(section.title ?? '未命名章节')}`)
      lines.push(String(section.content ?? ''))
      if (section.note) lines.push(`备注：${String(section.note)}`)
      lines.push('')
    })
  }

  return lines.join('\n').trim()
}

function KnowledgeCandidatesBlock({
  candidates,
  signalId,
  taskId,
  onDeposited,
}: {
  candidates: Array<Record<string, unknown>>
  signalId: string
  taskId: number
  onDeposited?: () => void
}) {
  const depositMutation = useMutation({
    mutationFn: (indices: number[]) =>
      mailSignalsApi.depositKnowledge(signalId, taskId, indices),
    onSuccess: () => onDeposited?.(),
  })

  return (
    <div className="mt-2 rounded-lg border border-cyan-100 bg-cyan-50 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-700">
        <Database className="h-3.5 w-3.5" />
        知识沉淀候选（Phase 3）
      </div>
      {depositMutation.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {depositMutation.error instanceof Error ? depositMutation.error.message : '沉淀失败'}
        </div>
      )}
      {depositMutation.isSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          已成功沉淀 {(depositMutation.data as { total_deposited: number })?.total_deposited ?? 0} 条知识，已写入知识库。
        </div>
      )}
      {candidates.map((item, index) => {
        const isDeposited = String(item.deposit_ready) === 'deposited'
        const entryId = item.knowledge_entry_id != null ? Number(item.knowledge_entry_id) : null
        return (
          <div key={index} className="rounded-md bg-white/70 p-2 text-xs text-cyan-900">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 flex-1">
                <div className="font-medium">{String(item.conclusion ?? '-')}</div>
                <div className="flex flex-wrap gap-3 text-cyan-700">
                  <span>类型：{String(item.conclusion_type ?? '-')}</span>
                  <span>证据支撑：{String(item.evidence_support ?? '0')} 条</span>
                  {isDeposited && entryId != null ? (
                    <span className="text-emerald-600 font-medium">已沉淀 · entry #{entryId}</span>
                  ) : (
                    <span>待人工确认后沉淀</span>
                  )}
                </div>
              </div>
              {!isDeposited && (
                <button
                  type="button"
                  onClick={() => depositMutation.mutate([index])}
                  disabled={depositMutation.isPending}
                  className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-cyan-300 bg-white px-2.5 py-1 text-xs font-medium text-cyan-700 hover:bg-cyan-50 disabled:opacity-50"
                >
                  <Database className="h-3 w-3" />
                  {depositMutation.isPending ? '沉淀中…' : '确认沉淀'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const REVIEW_STATE_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: '初稿', color: 'text-slate-500' },
  under_review: { label: '审核中', color: 'text-amber-600' },
  revision_required: { label: '退回修改', color: 'text-red-500' },
  approved_internal: { label: '内部可用', color: 'text-emerald-600' },
  approved_external: { label: '可对客发送', color: 'text-indigo-600' },
  sent: { label: '已发送', color: 'text-sky-600' },
  archived: { label: '已归档', color: 'text-slate-400' },
}

function ReportPanel({
  signalId,
  taskId,
  detail,
}: {
  signalId: string
  taskId: number
  detail: Record<string, unknown>
}) {
  const queryClient = useQueryClient()
  const [activeType, setActiveType] = useState<'internal_brief' | 'specialist_report' | 'proposal_outline'>('internal_brief')

  const generateMutation = useMutation({
    mutationFn: () => mailSignalsApi.generateReport(signalId, taskId, activeType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'analysis-result', signalId, taskId] }),
  })

  const reviewMutation = useMutation({
    mutationFn: ({ idx, action }: { idx: number; action: 'submit_review' | 'approve_internal' | 'approve_external' | 'revision_required' | 'send' | 'archive' | 'approve' | 'reject' }) =>
      mailSignalsApi.reviewReport(signalId, taskId, idx, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'analysis-result', signalId, taskId] }),
  })

  const reports = Array.isArray(detail.generated_reports)
    ? (detail.generated_reports as Array<Record<string, unknown>>)
    : []

  const REPORT_TYPE_OPTIONS = [
    { value: 'internal_brief', label: '内部简报' },
    { value: 'specialist_report', label: '专项分析报告' },
    { value: 'proposal_outline', label: '建议书提纲' },
  ] as const

  const actionsByState: Record<string, Array<{ action: 'submit_review' | 'approve_internal' | 'approve_external' | 'revision_required' | 'send' | 'archive'; label: string; className: string }>> = {
    draft: [{ action: 'submit_review', label: '提交审核', className: 'border-amber-200 bg-amber-50 text-amber-700' }],
    under_review: [
      { action: 'approve_internal', label: '内部通过', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
      { action: 'revision_required', label: '退回修改', className: 'border-red-200 bg-red-50 text-red-600' },
    ],
    approved_internal: [{ action: 'approve_external', label: '升级为可对客发送', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' }],
    approved_external: [{ action: 'send', label: '标记已发送', className: 'border-sky-200 bg-sky-50 text-sky-700' }],
    sent: [{ action: 'archive', label: '归档', className: 'border-slate-200 bg-slate-50 text-slate-700' }],
    revision_required: [{ action: 'submit_review', label: '重新提交审核', className: 'border-amber-200 bg-amber-50 text-amber-700' }],
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-slate-600">报告输出（Phase 4）</div>
        <div className="flex items-center gap-2">
          <select
            value={activeType}
            onChange={(e) => setActiveType(e.target.value as typeof activeType)}
            aria-label="报告类型"
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
          >
            {REPORT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {generateMutation.isPending ? '生成中…' : '生成报告'}
          </button>
        </div>
      </div>

      {(generateMutation.isError || reviewMutation.isError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {generateMutation.error instanceof Error
            ? generateMutation.error.message
            : reviewMutation.error instanceof Error
              ? reviewMutation.error.message
              : '报告操作失败'}
        </div>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        所有报告输出物默认为内部草稿。只有升级到“可对客发送”后，才允许进入发送步骤；系统不会自动发送给客户。
      </div>

      {reports.length === 0 ? (
        <p className="text-xs text-slate-400">尚未生成任何报告。选择报告类型后点击"生成报告"。</p>
      ) : (
        <div className="space-y-3">
          {reports.map((report, idx) => {
            const reviewState = String(report.review_state || 'draft')
            const stateInfo = REVIEW_STATE_LABELS[reviewState] ?? { label: reviewState, color: 'text-slate-500' }
            const actionButtons = actionsByState[reviewState] ?? []
            return (
              <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium text-slate-800">
                      #{idx + 1} {String(report.report_label ?? '-')}
                    </div>
                    <div className={`text-[11px] font-medium ${stateInfo.color}`}>{stateInfo.label}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {actionButtons.map((btn) => (
                      <button
                        key={btn.action}
                        type="button"
                        onClick={() => reviewMutation.mutate({ idx, action: btn.action })}
                        disabled={reviewMutation.isPending}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-50 border ${btn.className}`}
                      >
                        {reviewMutation.isPending ? '处理中…' : btn.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-slate-600">{String(report.executive_summary ?? '-')}</div>
                {report.review_note ? (
                  <div className="text-xs text-slate-500">审核备注：{String(report.review_note)}</div>
                ) : null}
                {report.sent_at ? <div className="text-xs text-slate-400">发送时间：{String(report.sent_at)}</div> : null}
                {report.archived_at ? <div className="text-xs text-slate-400">归档时间：{String(report.archived_at)}</div> : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getTone(status: string): 'new' | 'parsed' | 'linked' | 'tasked' | 'completed' | 'ignored' | 'error' {
  if (status === 'parsed' || status === 'linked' || status === 'tasked' || status === 'completed' || status === 'ignored' || status === 'error') {
    return status
  }
  return 'new'
}

function getSuggestedTaskKeys(signalType: string): string[] {
  if (signalType === 'project_followup') {
    return ['research_context_sync', 'followup_action_draft']
  }
  if (signalType === 'competitor_pressure') {
    return ['client_risk_alert', 'competitive_intel_brief']
  }
  if (signalType === 'complaint') {
    return ['client_risk_alert', 'followup_action_draft']
  }
  return ['opportunity_draft', 'client_profile_update']
}

function Phase2TaskCard({
  task,
  signalId,
}: {
  task: Record<string, unknown>
  signalId: string
}) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [showEvidenceViewer, setShowEvidenceViewer] = useState(false)
  const [evidenceFilter, setEvidenceFilter] = useState('all')
  const [opportunityIdInput, setOpportunityIdInput] = useState('')
  const [feedbackScore, setFeedbackScore] = useState('5')
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackReused, setFeedbackReused] = useState(false)
  const taskId = Number(task.id)
  const taskKey = String(task.task_key || '')
  const isPhase2 = PHASE2_TASK_KEYS.has(taskKey)

  const resultQuery = useQuery({
    queryKey: ['digital-workforce', 'analysis-result', signalId, taskId],
    queryFn: () => mailSignalsApi.getAnalysisResult(signalId, taskId),
    enabled: isPhase2 && String(task.status) !== 'pending_confirm',
    retry: false,
  })

  const executeMutation = useMutation({
    mutationFn: () => mailSignalsApi.executeAnalysis(signalId, taskId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'analysis-result', signalId, taskId] })
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-signals', signalId] })
    },
  })

  const adoptMutation = useMutation({
    mutationFn: (adopted: boolean) => mailSignalsApi.recordAdoption(signalId, taskId, adopted),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-signals', signalId] })
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-task-plans'] })
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-analytics'] })
    },
  })

  const linkOpportunityMutation = useMutation({
    mutationFn: (opportunityId: number) => mailSignalsApi.linkOpportunity(signalId, taskId, opportunityId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'analysis-result', signalId, taskId] })
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-analytics'] })
      setOpportunityIdInput('')
    },
  })

  const feedbackMutation = useMutation({
    mutationFn: () => mailSignalsApi.recordFeedback(signalId, taskId, {
      source: 'customer',
      satisfaction_score: Number(feedbackScore),
      reused: feedbackReused,
      feedback_text: feedbackText,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-analytics'] })
      setFeedbackText('')
      setFeedbackReused(false)
    },
  })

  const artifact: AnalysisDraftArtifact | null = resultQuery.data?.draft_artifact_refs?.[0] ?? null
  const evidence: AnalysisEvidenceRef[] = resultQuery.data?.evidence_refs ?? []
  const hasResult = resultQuery.data?.has_result ?? false
  const aiStatus = resultQuery.data?.ai_status ?? 'pending'
  const p2Label = PHASE2_LABELS[taskKey] ?? { button: '执行分析', empty: '点击执行分析后将生成内部草稿。', section: '专项分析' }

  const aiStatusLabel: Record<string, string> = {
    done: 'AI 增强',
    done_kw: '关键词模式',
    running: '分析中…',
    failed: 'AI 降级',
    pending: '待执行',
  }
  const markdownDraft = useMemo(() => buildDraftMarkdown(taskKey, artifact), [artifact, taskKey])
  const evidenceItems = useMemo(() => {
    return evidence.filter((ev) => evidenceFilter === 'all' || ev.source === evidenceFilter)
  }, [evidence, evidenceFilter])

  const evidenceSources = useMemo(() => {
    return Array.from(new Set(evidence.map((ev) => ev.source))).sort()
  }, [evidence])

  async function handleCopyDraft() {
    if (!markdownDraft) return
    await navigator.clipboard.writeText(markdownDraft)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  function getEvidenceQualityLabel(quality: string): { label: string; className: string } {
    if (quality === 'ai_generated') return { label: 'AI', className: 'bg-emerald-50 text-emerald-700' }
    if (quality === 'catalog_match') return { label: '命中', className: 'bg-violet-50 text-violet-700' }
    if (quality === 'planned') return { label: '计划', className: 'bg-blue-50 text-blue-700' }
    if (quality === 'raw') return { label: '原始', className: 'bg-slate-100 text-slate-600' }
    return { label: quality || '未知', className: 'bg-slate-100 text-slate-600' }
  }

  return (
    <div className="rounded-xl bg-slate-50 p-3 text-slate-700 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="font-medium text-slate-800">
            {String(task.title || taskKey).replace(
              new RegExp(` - ${taskKey}$`),
              ` - ${TASK_KEY_LABELS[taskKey] ?? taskKey}`
            )}
          </div>
          <div className="text-xs text-slate-500">
            {TASK_KEY_LABELS[taskKey] ?? taskKey}
            {' · '}
            状态：{String(task.status || '-')}
            {isPhase2 ? ' · Phase 2 专项' : ''}
          </div>
        </div>
        <StatusBadge tone={String(task.risk_level) === 'high' ? 'high' : String(task.risk_level) === 'medium' ? 'medium' : 'low'}>
          {String(task.risk_level || 'low')}
        </StatusBadge>
      </div>

      {isPhase2 && (
        <div className="border-t border-slate-200 pt-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <BarChart2 className="h-3.5 w-3.5" />
              {p2Label.section}
              {hasResult && (
                <span className={`ml-1 ${aiStatus === 'done' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  · {aiStatusLabel[aiStatus] ?? aiStatus}
                </span>
              )}
            </div>
            {!hasResult && (
              <button
                type="button"
                onClick={() => executeMutation.mutate()}
                disabled={executeMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                <Sparkles className="h-3 w-3" />
                {executeMutation.isPending ? '分析中…' : p2Label.button}
              </button>
            )}
          </div>

          {executeMutation.isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {executeMutation.error instanceof Error ? executeMutation.error.message : '分析执行失败'}
            </div>
          )}

          {hasResult && artifact && (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                仅限内部草稿 · 需人工审核 · 不自动对客发送
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <BookOpen className="h-3.5 w-3.5" />
                    分析摘要
                  </div>
                  {markdownDraft ? (
                    <button
                      type="button"
                      onClick={handleCopyDraft}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? '已复制' : '复制草稿'}
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{artifact.summary}</p>
                {(() => {
                  const det = artifact.detail as Record<string, unknown> | undefined
                  if (!det) return null
                  const cat = det.inferred_category
                  const kws = Array.isArray(det.matched_keywords) ? (det.matched_keywords as string[]) : []
                  const aiSections = det.ai_enhanced_sections as Record<string, unknown> | undefined
                  const externalEvidencePlan = Array.isArray(det.external_evidence_plan)
                    ? (det.external_evidence_plan as Array<Record<string, unknown>>)
                    : []
                  const referencedEvidence = Array.isArray(det.referenced_evidence)
                    ? (det.referenced_evidence as Array<Record<string, unknown>>)
                    : []
                  const externalEvidenceResults = Array.isArray(det.external_evidence_results)
                    ? (det.external_evidence_results as Array<Record<string, unknown>>)
                    : []
                  return (
                    <>
                      {cat != null && (
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>推断品类：</span>
                          <span className="rounded-md bg-primary-50 px-2 py-0.5 text-primary-700 font-medium">
                            {String(cat)}
                          </span>
                        </div>
                      )}
                      {kws.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {kws.slice(0, 8).map((kw) => (
                            <span key={kw} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{kw}</span>
                          ))}
                        </div>
                      )}
                      {aiSections && (
                        <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 p-3 space-y-2">
                          <div className="text-xs font-medium text-emerald-700">AI 增强内容（Kimi · 仅内部参考）</div>
                          {Object.entries(aiSections)
                            .filter(([k]) => k !== 'ai_note' && k !== 'confidence')
                            .map(([k, v]) => {
                              if (!v || (Array.isArray(v) && v.length === 0)) return null
                              return (
                                <div key={k} className="text-xs text-emerald-900">
                                  <span className="font-medium capitalize">{k.replace(/_/g, ' ')}：</span>
                                  {Array.isArray(v)
                                    ? (v as string[]).map((s, i) => <span key={i}>{String(s)}{i < v.length - 1 ? '、' : ''}</span>)
                                    : String(v)}
                                </div>
                              )
                            })}
                          {typeof aiSections.ai_note === 'string' && (
                            <div className="text-xs text-emerald-600 border-t border-emerald-200 pt-1">{aiSections.ai_note}</div>
                          )}
                        </div>
                      )}
                      {externalEvidencePlan.length > 0 && (
                        <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3 space-y-2">
                          <div className="text-xs font-medium text-blue-700">外部证据采集计划</div>
                          {externalEvidencePlan.map((item, index) => (
                            <div key={index} className="rounded-md bg-white/70 p-2 text-xs text-blue-900">
                              <div className="font-medium">
                                {String(item.source_type ?? 'unknown')} · {String(item.priority ?? 'medium')}
                              </div>
                              <div className="mt-1">查询词：{String(item.query ?? '-')}</div>
                              <div className="mt-1 text-blue-700">用途：{String(item.purpose ?? '-')}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {externalEvidenceResults.length > 0 && (
                        <div className="mt-2 rounded-lg border border-violet-100 bg-violet-50 p-3 space-y-2">
                          <div className="text-xs font-medium text-violet-700">外部证据命中结果</div>
                          {externalEvidenceResults.map((item, index) => {
                            const hits = Array.isArray(item.hits) ? (item.hits as Array<Record<string, unknown>>) : []
                            return (
                              <div key={index} className="rounded-md bg-white/70 p-2 text-xs text-violet-900 space-y-2">
                                <div className="font-medium">
                                  {String(item.source_type ?? 'regulation_search')} · 查询词：{String(item.query ?? '-')}
                                </div>
                                <div className="text-violet-700">用途：{String(item.purpose ?? '-')}</div>
                                {hits.map((hit, hitIndex) => (
                                  <div key={hitIndex} className="rounded bg-white p-2">
                                    <div className="font-medium">{String(hit.title ?? '未命名法规条目')}</div>
                                    <div className="mt-1 text-violet-700">{String(hit.summary ?? '-')}</div>
                                  </div>
                                ))}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {Array.isArray(det.evidence_reference_hints) && det.evidence_reference_hints.length > 0 && (
                        <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 p-3 space-y-2">
                          <div className="text-xs font-medium text-amber-700">证据引用回指候选</div>
                          {(det.evidence_reference_hints as Array<Record<string, unknown>>).map((item, index) => (
                            <div key={index} className="rounded-md bg-white/70 p-2 text-xs text-amber-900">
                              <div className="font-medium">{String(item.evidence_title ?? '-')}</div>
                              <div className="mt-1">来源：{String(item.source_type ?? '-')}</div>
                              <div className="mt-1 text-amber-700">说明：{String(item.why ?? '-')}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {referencedEvidence.length > 0 && (
                        <div className="mt-2 rounded-lg border border-teal-100 bg-teal-50 p-3 space-y-2">
                          <div className="text-xs font-medium text-teal-700">已引用证据清单</div>
                          {referencedEvidence.map((item, index) => (
                            <div key={index} className="rounded-md bg-white/70 p-2 text-xs text-teal-900">
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-medium">{String(item.evidence_title ?? '-')}</div>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${String(item.validated) === 'true' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {String(item.validated) === 'true' ? '已校验' : '待验证'}
                                </span>
                              </div>
                              <div className="mt-1">code：{String(item.reference_code ?? '-')}</div>
                              <div className="mt-1">来源：{String(item.source_type ?? '-')}</div>
                              <div className="mt-1 text-teal-700">支撑：{String(item.supports ?? '-')}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {(() => {
                        const knowledgeCandidates = Array.isArray(det.knowledge_deposit_candidates)
                          ? (det.knowledge_deposit_candidates as Array<Record<string, unknown>>)
                          : []
                        if (knowledgeCandidates.length === 0) return null
                        return (
                          <KnowledgeCandidatesBlock
                            candidates={knowledgeCandidates}
                            signalId={signalId}
                            taskId={taskId}
                            onDeposited={() => {
                              queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'analysis-result', signalId, taskId] })
                            }}
                          />
                        )
                      })()}
                    </>
                  )
                })()}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-slate-600">统一证据浏览</div>
                  <div className="flex items-center gap-2">
                    <select
                      value={evidenceFilter}
                      onChange={(e) => setEvidenceFilter(e.target.value)}
                      aria-label="证据来源过滤"
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600"
                    >
                      <option value="all">全部来源</option>
                      {evidenceSources.map((source) => (
                        <option key={source} value={source}>{source}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowEvidenceViewer((value) => !value)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {showEvidenceViewer ? '收起' : '展开'}
                    </button>
                  </div>
                </div>
                {showEvidenceViewer ? (
                  <div className="space-y-3">
                    {evidenceItems.map((ev, idx) => {
                      const qualityInfo = getEvidenceQualityLabel(ev.quality)
                      return (
                      <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium text-slate-700">
                            {String(ev.source || 'unknown')}
                          </div>
                          <div className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${qualityInfo.className}`}>
                            {qualityInfo.label}
                          </div>
                        </div>
                        <div className="text-xs text-slate-600">{ev.description}</div>
                        {ev.keywords && ev.keywords.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {ev.keywords.map((kw) => (
                              <span key={kw} className="rounded-md bg-white px-2 py-0.5 text-xs text-slate-600">
                                {kw}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {Array.isArray((ev as unknown as { items?: unknown }).items) ? (
                          <div className="space-y-2">
                            {((ev as unknown as { items?: Array<Record<string, unknown>> }).items ?? []).map((item, itemIdx) => {
                              const hits = Array.isArray(item.hits) ? (item.hits as Array<Record<string, unknown>>) : []
                              return (
                                <div key={itemIdx} className="rounded-md bg-white p-2 text-xs text-slate-700 space-y-1">
                                  {'source_type' in item ? (
                                    <div className="font-medium">
                                      {String(item.source_type ?? '-')}
                                      {item.query ? ` · ${String(item.query)}` : ''}
                                    </div>
                                  ) : null}
                                  {'purpose' in item ? (
                                    <div className="text-slate-500">用途：{String(item.purpose ?? '-')}</div>
                                  ) : null}
                                  {hits.length > 0 ? (
                                    <div className="space-y-1">
                                      {hits.map((hit, hitIdx) => (
                                        <div key={hitIdx} className="rounded bg-slate-50 p-2">
                                          <div className="font-medium">{String(hit.title ?? '未命名证据')}</div>
                                          <div className="mt-1 text-slate-500">{String(hit.summary ?? '-')}</div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                    )})}
                    {evidenceItems.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                        当前筛选条件下没有证据项。
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">
                    集中查看邮件证据、外部计划、外部命中和 AI 证据，便于研究经理统一审阅。
                  </div>
                )}
              </div>

              {markdownDraft ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                  <div className="text-xs font-medium text-slate-600">Markdown 草稿预览</div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                    {markdownDraft}
                  </pre>
                </div>
              ) : null}

              <ReportPanel signalId={signalId} taskId={taskId} detail={(artifact?.detail ?? {}) as Record<string, unknown>} />

              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                <div className="text-xs font-medium text-slate-600">采纳反馈（Phase 5）</div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => adoptMutation.mutate(true)}
                    disabled={adoptMutation.isPending}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {adoptMutation.isPending ? '记录中…' : '采纳建议'}
                  </button>
                  <button
                    type="button"
                    onClick={() => adoptMutation.mutate(false)}
                    disabled={adoptMutation.isPending}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    不采纳
                  </button>
                  <span className="text-xs text-slate-400">采纳率将纳入复盘看板统计</span>
                </div>
                {adoptMutation.isSuccess ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    已记录采纳情况。
                  </div>
                ) : null}

                <div className="border-t border-slate-200 pt-3 space-y-2">
                  <div className="text-xs font-medium text-slate-600">商机关联</div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={opportunityIdInput}
                      onChange={(e) => setOpportunityIdInput(e.target.value)}
                      placeholder="输入商机 ID"
                      className="w-36 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => opportunityIdInput && linkOpportunityMutation.mutate(Number(opportunityIdInput))}
                      disabled={linkOpportunityMutation.isPending || !opportunityIdInput}
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      {linkOpportunityMutation.isPending ? '关联中…' : '关联商机'}
                    </button>
                  </div>
                  {linkOpportunityMutation.isSuccess ? (
                    <div className="text-xs text-indigo-600">已关联商机推进。</div>
                  ) : null}
                </div>

                <div className="border-t border-slate-200 pt-3 space-y-2">
                  <div className="text-xs font-medium text-slate-600">客户反馈</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-slate-500">满意度</label>
                    <select
                      value={feedbackScore}
                      onChange={(e) => setFeedbackScore(e.target.value)}
                      aria-label="客户满意度"
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                    >
                      {[1,2,3,4,5].map((n) => <option key={n} value={String(n)}>{n}</option>)}
                    </select>
                    <label className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <input type="checkbox" checked={feedbackReused} onChange={(e) => setFeedbackReused(e.target.checked)} />
                      报告已复用
                    </label>
                  </div>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="记录客户反馈 / 内部复盘要点"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 min-h-20"
                  />
                  <button
                    type="button"
                    onClick={() => feedbackMutation.mutate()}
                    disabled={feedbackMutation.isPending}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {feedbackMutation.isPending ? '提交中…' : '提交反馈'}
                  </button>
                  {feedbackMutation.isSuccess ? (
                    <div className="text-xs text-emerald-600">客户反馈已记录，复盘看板指标已更新。</div>
                  ) : null}
                </div>
              </div>

              {evidence.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <FileText className="h-3.5 w-3.5" />
                    证据引用
                  </div>
                  {evidence.map((ev, idx) => (
                    <div key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <span>{ev.description}</span>
                      {ev.keywords && ev.keywords.length > 0 && (
                        <span className="text-slate-400">（{ev.keywords.slice(0, 5).join('、')}）</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!hasResult && !executeMutation.isPending && String(task.status) === 'pending_confirm' && (
            <p className="text-xs text-slate-500">{p2Label.empty}</p>
          )}
        </div>
      )}
    </div>
  )
}

export function MailSignalDetailPage() {
  const { signalId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['digital-workforce', 'mail-signals', signalId],
    queryFn: () => mailSignalsApi.getDetail(signalId),
    enabled: Boolean(signalId),
  })
  const generateTasksMutation = useMutation({
    mutationFn: () => mailSignalsApi.generateTasks(signalId, getSuggestedTaskKeys(String(data?.mail_signal_type || 'unknown'))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-signals', signalId] })
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-signals'] })
    },
  })
  const confirmLinkMutation = useMutation({
    mutationFn: ({ linkType, targetId }: { linkType: string; targetId: number }) => mailSignalsApi.confirmLink(signalId, linkType, targetId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-signals', signalId] })
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-signals'] })
    },
  })
  const writebackMutation = useMutation({
    mutationFn: () => mailSignalsApi.writebackOpportunityDraft(signalId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-signals', signalId] })
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-signals'] })
    },
  })
  const writebackResearchMutation = useMutation({
    mutationFn: () => mailSignalsApi.writebackResearchContext(signalId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-signals', signalId] })
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-signals'] })
    },
  })

  if (isLoading) return <QueryLoading loadingText="正在加载邮件事件详情..." />
  if (error) return <QueryError error={error} />
  if (!data) return <QueryError error={new Error('邮件事件不存在')} />

  const links = Array.isArray(data.links) ? data.links : []
  const tasks = Array.isArray(data.tasks) ? data.tasks : []
  const clientLinks = links.filter((link) => String((link as Record<string, unknown>).link_type) === 'client')
  const protocolLinks = links.filter((link) => String((link as Record<string, unknown>).link_type) === 'protocol')
  const hasConfirmedClient = clientLinks.some((link) => Boolean((link as Record<string, unknown>).confirmed))
  const hasConfirmedProtocol = protocolLinks.some((link) => Boolean((link as Record<string, unknown>).confirmed))
  const suggestedTaskKeys = Array.isArray((data as Record<string, unknown>).suggested_task_keys)
    ? ((data as Record<string, unknown>).suggested_task_keys as string[])
    : getSuggestedTaskKeys(String(data.mail_signal_type || 'unknown'))

  return (
    <div className="space-y-6">
      {/* 返回导航 */}
      <button
        onClick={() => navigate('/mail-signals')}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        data-testid="btn-back-to-list"
      >
        <ArrowLeft className="h-4 w-4" /> 返回邮件列表
      </button>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 text-xs text-slate-500">
              <MailOpen className="h-3.5 w-3.5" />
              <span>邮件事件 #{data.id}</span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-800">{data.subject || '(无主题)'}</h1>
            <p className="text-sm text-slate-500">
              {(data.sender_name as string) || data.sender_email}
              {' · '}
              {data.sender_email}
            </p>
          </div>
          <StatusBadge tone={getTone(data.status)}>{data.status}</StatusBadge>
        </div>
        <div className="grid gap-4 md:grid-cols-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-slate-500">类型</div>
            <div className="mt-1 font-medium text-slate-800">{String(data.mail_signal_type || 'unknown')}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-slate-500">时间</div>
            <div className="mt-1 font-medium text-slate-800">{String(data.received_at || '待补')}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-slate-500">解析版本</div>
            <div className="mt-1 font-medium text-slate-800">{String(data.parse_version || 'v1')}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-3 flex items-center gap-2 text-slate-700">
            <FileText className="h-4 w-4" />
            <h2 className="font-semibold">邮件正文</h2>
          </div>
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-600">{String(data.body_text || data.body_preview || '暂无正文')}</pre>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-3 flex items-center gap-2 text-slate-700">
              <Link2 className="h-4 w-4" />
              <h2 className="font-semibold">关联候选</h2>
            </div>
            {confirmLinkMutation.isError ? (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {confirmLinkMutation.error instanceof Error ? confirmLinkMutation.error.message : '确认关联失败'}
              </div>
            ) : null}
            {links.length === 0 ? (
              <p className="text-sm text-slate-500">暂未发现匹配的客户或项目，系统将持续比对邮件发件人和邮件内容，匹配成功后在此显示候选关联。</p>
            ) : (
              <div className="space-y-3 text-sm">
                {links.map((link, index) => (
                  <div key={index} className="rounded-xl bg-slate-50 p-3 text-slate-700">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-medium text-slate-800">
                          {String((link as Record<string, unknown>).target_label || `${String((link as Record<string, unknown>).link_type)} #${String((link as Record<string, unknown>).target_id)}`)}
                        </div>
                        <div className="text-xs text-slate-500">
                          匹配方式：{String((link as Record<string, unknown>).match_method || 'unknown')}
                          {' · '}
                          分数：{String((link as Record<string, unknown>).match_score ?? '-')}
                          {' · '}
                          确认：{Boolean((link as Record<string, unknown>).confirmed) ? '是' : '否'}
                        </div>
                      </div>
                      {!Boolean((link as Record<string, unknown>).confirmed) ? (
                        <button
                          type="button"
                          onClick={() => confirmLinkMutation.mutate({
                            linkType: String((link as Record<string, unknown>).link_type),
                            targetId: Number((link as Record<string, unknown>).target_id),
                          })}
                          disabled={confirmLinkMutation.isPending}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {confirmLinkMutation.isPending ? '确认中…' : '确认关联'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-3 flex items-center justify-between gap-2 text-slate-700">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                <h2 className="font-semibold">任务草稿</h2>
              </div>
              <button
                type="button"
                onClick={() => generateTasksMutation.mutate()}
                disabled={generateTasksMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {generateTasksMutation.isPending ? '生成中…' : '生成草稿'}
              </button>
            </div>
            {generateTasksMutation.isError ? (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {generateTasksMutation.error instanceof Error ? generateTasksMutation.error.message : '任务草稿生成失败'}
              </div>
            ) : null}
            {generateTasksMutation.isSuccess ? (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                已触发任务草稿生成，请查看下方列表刷新结果。
              </div>
            ) : null}
            <div className="mb-3 text-xs text-slate-500">
              本邮件类型默认建议生成：{suggestedTaskKeys.map((k) => TASK_KEY_LABELS[k] ?? k).join(' / ')}
            </div>
            {writebackMutation.isError ? (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {writebackMutation.error instanceof Error ? writebackMutation.error.message : '写回商机草稿失败'}
              </div>
            ) : null}
            {writebackMutation.isSuccess ? (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                已完成最小回写闭环，请在 CRM 中查看商机草稿。
              </div>
            ) : null}
            {writebackResearchMutation.isError ? (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {writebackResearchMutation.error instanceof Error ? writebackResearchMutation.error.message : '同步研究上下文失败'}
              </div>
            ) : null}
            {writebackResearchMutation.isSuccess ? (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                已同步到研究上下文，请在采苓侧查看沟通记录。
              </div>
            ) : null}
            {tasks.length === 0 ? (
              <p className="text-sm text-slate-500">暂无任务草稿。先在上方确认关联后，点击"生成草稿"可自动创建对应的分析任务。</p>
            ) : (
              <div className="space-y-3 text-sm">
                {tasks.map((task, index) => (
                  <Phase2TaskCard key={index} task={task as Record<string, unknown>} signalId={signalId} />
                ))}
              </div>
            )}
            <div className="mt-4 border-t border-slate-200 pt-4 space-y-3">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => writebackMutation.mutate()}
                  disabled={writebackMutation.isPending || !hasConfirmedClient}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {writebackMutation.isPending ? '写回中…' : '写回商机草稿'}
                </button>
                <button
                  type="button"
                  onClick={() => writebackResearchMutation.mutate()}
                  disabled={writebackResearchMutation.isPending || !hasConfirmedProtocol}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {writebackResearchMutation.isPending ? '同步中…' : '同步研究上下文'}
                </button>
              </div>
              {!hasConfirmedClient ? (
                <p className="text-xs text-slate-500">写回商机草稿前，请先确认至少一个客户关联。</p>
              ) : null}
              {!hasConfirmedProtocol ? (
                <p className="text-xs text-slate-500">同步研究上下文前，请先确认至少一个项目关联。</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
