import { useState, useEffect, useCallback } from 'react'
import {
  Inbox, RefreshCw, Check, X, Edit3, ChevronDown, ChevronUp,
  AlertTriangle, Zap, Clock, CheckCircle, XCircle, ArrowLeft,
  Database, FileText, Mail, MessageSquare,
} from 'lucide-react'

const API_BASE = '/v2/api/v1'
const getToken = () => localStorage.getItem('cn_kis_token') ?? ''

const WORKSTATION = 'lab_personnel'

// ── 类型定义 ─────────────────────────────────────────────────────────────────

interface CandidateSummary {
  id: number
  source_type: string
  source_raw_id: number
  source_module: string
  source_display_title: string
  target_workstation: string
  target_model: string
  confidence_score: number
  review_status: string
  reviewed_by_name: string
  reviewed_at: string | null
  review_comment: string
  reject_reason: string
  ingested_record_id: number | null
  ingested_model: string
  created_at: string | null
}

interface MappedField {
  value: unknown
  confidence: number
  source_field: string
  label?: string
}

interface CandidateDetail extends CandidateSummary {
  source_snapshot: Record<string, unknown>
  mapped_fields: Record<string, MappedField>
  modified_fields: Record<string, unknown>
  effective_fields: Record<string, unknown>
  ingestion_log: Record<string, unknown>
  is_high_confidence: boolean
}

interface ListResponse {
  items: CandidateSummary[]
  total: number
  page: number
  page_size: number
  status_counts: Record<string, number>
}

// ── 常量 ─────────────────────────────────────────────────────────────────────

const SOURCE_ICON: Record<string, typeof Inbox> = {
  lims: Database,
  feishu_mail: Mail,
  feishu_im: MessageSquare,
  feishu_doc: FileText,
  feishu_approval: FileText,
  ekuaibao: Database,
}

const SOURCE_LABELS: Record<string, string> = {
  lims: 'LIMS',
  feishu_mail: '飞书邮件',
  feishu_im: '飞书消息',
  feishu_doc: '飞书文档',
  feishu_approval: '飞书审批',
  feishu_calendar: '飞书日历',
  ekuaibao: '易快报',
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  pending:      { label: '待审核',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved:     { label: '已批准',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  rejected:     { label: '已拒绝',  cls: 'bg-red-50 text-red-700 border-red-200' },
  ingested:     { label: '已接入',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  auto_ingested:{ label: '自动接入',cls: 'bg-purple-50 text-purple-700 border-purple-200' },
}

const REJECT_REASONS = [
  { value: 'data_quality', label: '数据质量差' },
  { value: 'duplicate',    label: '重复数据' },
  { value: 'wrong_scope',  label: '不属于本系统' },
  { value: 'mapping_error',label: '字段映射错误' },
  { value: 'other',        label: '其他原因' },
]

// ── API 工具 ─────────────────────────────────────────────────────────────────

const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
})

async function apiGet(path: string) {
  const r = await fetch(`${API_BASE}${path}`, { headers: headers() })
  return r.json()
}

async function apiPost(path: string, body: unknown) {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  })
  return r.json()
}

// ── 子组件 ────────────────────────────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number }) {
  if (score >= 0.8) return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
      <Zap className="w-2.5 h-2.5" />高 {Math.round(score * 100)}%
    </span>
  )
  if (score >= 0.5) return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
      <Clock className="w-2.5 h-2.5" />中 {Math.round(score * 100)}%
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
      <AlertTriangle className="w-2.5 h-2.5" />低 {Math.round(score * 100)}%
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_STYLE[status] ?? { label: status, cls: 'bg-slate-50 text-slate-600 border-slate-200' }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── 详情视图（左右对比 + 逐字段确认）───────────────────────────────────────────

function DetailView({
  detail,
  onApprove,
  onReject,
  onBack,
  loading,
}: {
  detail: CandidateDetail
  onApprove: (comment: string) => void
  onReject: (reason: string, comment: string) => void
  onBack: () => void
  loading: boolean
}) {
  const [mode, setMode] = useState<'view' | 'approve' | 'reject' | 'modify'>('view')
  const [comment, setComment] = useState('')
  const [rejectReason, setRejectReason] = useState('data_quality')
  const [modifiedValues, setModifiedValues] = useState<Record<string, string>>({})
  const [expandSnapshot, setExpandSnapshot] = useState(false)

  const isPending = detail.review_status === 'pending'

  const handleModifyApprove = async () => {
    const modified: Record<string, { value: string; note: string }> = {}
    for (const [k, v] of Object.entries(modifiedValues)) {
      if (v.trim()) {
        modified[k] = { value: v, note: '人工修正' }
      }
    }
    try {
      await apiPost(
        `/data-intake/${WORKSTATION}/candidates/${detail.id}/modify`,
        { modified_fields: modified, comment },
      )
      onApprove(comment)
    } catch {
      alert('操作失败，请重试')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回列表
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-700 font-medium truncate max-w-md">
          {detail.source_display_title}
        </span>
        <StatusBadge status={detail.review_status} />
        <ConfidenceBadge score={detail.confidence_score} />
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* 左侧：原始数据快照（只读） */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-600">
              原始数据
              <span className="ml-2 text-xs font-normal text-slate-400">
                来源：{SOURCE_LABELS[detail.source_type] ?? detail.source_type}
                {detail.source_module ? ` · ${detail.source_module}` : ''}
              </span>
            </h3>
            <button
              className="text-xs text-slate-400 hover:text-slate-600"
              onClick={() => setExpandSnapshot(!expandSnapshot)}
            >
              {expandSnapshot ? '收起' : '展开全部'}
            </button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {Object.entries(detail.source_snapshot).map(([k, v]) => (
              (!expandSnapshot && ['raw_content'].includes(k)) ? null : (
                <div key={k} className="text-xs">
                  <span className="text-slate-400 font-mono">{k}</span>
                  <span className="mx-1 text-slate-300">:</span>
                  <span className="text-slate-700">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}
                  </span>
                </div>
              )
            ))}
          </div>
        </div>

        {/* 右侧：映射字段（可编辑） */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">
              映射字段预览
              <span className="ml-2 text-xs font-normal text-slate-400">
                目标：{detail.target_model || detail.target_workstation}
              </span>
            </h3>
          </div>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {Object.entries(detail.mapped_fields).map(([fieldName, fieldData]) => {
              const isModified = fieldName in modifiedValues
              return (
                <div key={fieldName} className="border-b border-slate-50 pb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-600">{fieldName}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">
                        置信度 {Math.round(fieldData.confidence * 100)}%
                      </span>
                      {fieldData.confidence < 0.7 && (
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                      )}
                    </div>
                  </div>
                  {mode === 'modify' ? (
                    <input
                      type="text"
                      aria-label={`修改字段 ${fieldName}`}
                      placeholder={String(fieldData.value ?? '')}
                      value={isModified ? modifiedValues[fieldName] : String(fieldData.value ?? '')}
                      onChange={(e) =>
                        setModifiedValues(prev => ({ ...prev, [fieldName]: e.target.value }))
                      }
                      className={`w-full text-xs px-2 py-1.5 rounded border transition-colors ${
                        isModified
                          ? 'border-blue-300 bg-blue-50 text-blue-800'
                          : 'border-slate-200 text-slate-700'
                      }`}
                    />
                  ) : (
                    <div className="text-xs text-slate-800 bg-slate-50 rounded px-2 py-1.5">
                      {String(fieldData.value ?? '')}
                    </div>
                  )}
                  {fieldData.source_field && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      来源字段：{fieldData.source_field}
                    </p>
                  )}
                </div>
              )
            })}
            {Object.keys(detail.mapped_fields).length === 0 && (
              <p className="text-sm text-slate-400">未生成自动映射字段</p>
            )}
          </div>
        </div>
      </div>

      {/* 操作区 */}
      {isPending && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          {mode === 'view' && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMode('approve')}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <Check className="w-4 h-4" />
                批准接入
              </button>
              <button
                onClick={() => setMode('modify')}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                修改后批准
              </button>
              <button
                onClick={() => setMode('reject')}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                <X className="w-4 h-4" />
                拒绝
              </button>
            </div>
          )}

          {mode === 'approve' && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-slate-700">确认批准接入</h4>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="审核备注（可选）"
                rows={2}
                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-emerald-400 outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => onApprove(comment)}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {loading ? '处理中…' : '确认批准'}
                </button>
                <button onClick={() => setMode('view')} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              </div>
            </div>
          )}

          {mode === 'reject' && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-slate-700">拒绝原因</h4>
              <div className="flex flex-wrap gap-2">
                {REJECT_REASONS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => setRejectReason(r.value)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      rejectReason === r.value
                        ? 'bg-red-100 border-red-300 text-red-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="补充说明"
                rows={2}
                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-red-300 outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => onReject(rejectReason, comment)}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  {loading ? '处理中…' : '确认拒绝'}
                </button>
                <button onClick={() => setMode('view')} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              </div>
            </div>
          )}

          {mode === 'modify' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                在右侧字段中直接修改后，点击确认批准。
              </p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="修改说明（必填，如：已核实并修正受试者编号）"
                rows={2}
                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:ring-1 focus:ring-blue-400 outline-none resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleModifyApprove}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  {loading ? '处理中…' : '修改并批准'}
                </button>
                <button
                  onClick={() => { setMode('view'); setModifiedValues({}) }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 已审核状态展示 */}
      {!isPending && (
        <div className={`rounded-xl border p-4 ${
          detail.review_status === 'ingested' || detail.review_status === 'auto_ingested'
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {(detail.review_status === 'ingested' || detail.review_status === 'auto_ingested')
              ? <CheckCircle className="w-4 h-4 text-emerald-600" />
              : detail.review_status === 'rejected'
              ? <XCircle className="w-4 h-4 text-red-600" />
              : <Clock className="w-4 h-4 text-blue-600" />
            }
            <span className="text-sm font-medium text-slate-700">
              审核人：{detail.reviewed_by_name || '—'}
            </span>
            {detail.reviewed_at && (
              <span className="text-xs text-slate-400">{new Date(detail.reviewed_at).toLocaleString()}</span>
            )}
          </div>
          {detail.review_comment && (
            <p className="text-sm text-slate-600">{detail.review_comment}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function ExternalDataInboxPage() {
  const [listData, setListData] = useState<ListResponse | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<CandidateDetail | null>(null)
  const [statusFilter, setStatusFilter] = useState('pending')
  const [sourceFilter, setSourceFilter] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)
  const [showBulk, setShowBulk] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({
      status: statusFilter,
      page: String(page),
      page_size: '20',
    })
    if (sourceFilter) params.set('source_type', sourceFilter)
    const res = await apiGet(`/data-intake/${WORKSTATION}/candidates?${params}`)
    setListData(res?.data ?? null)
    setLoading(false)
  }, [statusFilter, sourceFilter, page])

  useEffect(() => { loadList() }, [loadList])

  const loadDetail = async (id: number) => {
    setSelectedId(id)
    const res = await apiGet(`/data-intake/${WORKSTATION}/candidates/${id}`)
    setDetail(res?.data ?? null)
  }

  const handleApprove = async (comment: string) => {
    if (!selectedId) return
    setActionLoading(true)
    await apiPost(`/data-intake/${WORKSTATION}/candidates/${selectedId}/approve`, { comment })
    setActionLoading(false)
    setSelectedId(null)
    setDetail(null)
    loadList()
  }

  const handleReject = async (reason: string, comment: string) => {
    if (!selectedId) return
    setActionLoading(true)
    await apiPost(`/data-intake/${WORKSTATION}/candidates/${selectedId}/reject`, { reason, comment })
    setActionLoading(false)
    setSelectedId(null)
    setDetail(null)
    loadList()
  }

  const handleBulkApprove = async () => {
    setActionLoading(true)
    setBulkResult(null)
    const res = await apiPost(`/data-intake/${WORKSTATION}/candidates/bulk-approve`, {
      confidence_threshold: 0.8,
      limit: 100,
      dry_run: false,
    })
    setBulkResult(res?.data?.message ?? '操作完成')
    setActionLoading(false)
    loadList()
  }

  const statusCounts = listData?.status_counts ?? {}

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">外部数据接入审核</h2>
          <p className="text-sm text-slate-500 mt-1">
            外部数据经自动映射后，需人工审核后方可接入系统
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulk(!showBulk)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            批量批准高置信度
          </button>
          <button
            onClick={loadList}
            aria-label="刷新列表"
            className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 批量操作面板 */}
      {showBulk && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-amber-800">
            将对置信度 ≥ 80% 的待审核记录进行批量批准并接入（单次最多100条）。
          </p>
          {bulkResult && (
            <p className="text-sm font-medium text-amber-900">{bulkResult}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleBulkApprove}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              {actionLoading ? '处理中…' : '执行批量批准'}
            </button>
            <button onClick={() => setShowBulk(false)} className="px-4 py-2 text-sm text-amber-700 hover:bg-amber-100 rounded-lg">
              取消
            </button>
          </div>
        </div>
      )}

      {/* 状态过滤 + 统计 */}
      <div className="flex items-center gap-2 flex-wrap">
        {Object.entries({
          pending: '待审核',
          approved: '已批准',
          rejected: '已拒绝',
          ingested: '已接入',
        }).map(([s, label]) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              statusFilter === s
                ? 'bg-slate-800 text-white border-slate-800'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
            {statusCounts[s] != null && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                statusFilter === s ? 'bg-white text-slate-800' : 'bg-slate-100 text-slate-500'
              }`}>
                {statusCounts[s]}
              </span>
            )}
          </button>
        ))}

        <div className="ml-auto">
          <select
            value={sourceFilter}
            aria-label="按来源类型筛选"
            onChange={(e) => { setSourceFilter(e.target.value); setPage(1) }}
            className="text-sm px-2 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white"
          >
            <option value="">全部来源</option>
            {Object.entries(SOURCE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 详情或列表视图 */}
      {detail ? (
        <DetailView
          detail={detail}
          onApprove={handleApprove}
          onReject={handleReject}
          onBack={() => { setDetail(null); setSelectedId(null) }}
          loading={actionLoading}
        />
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-5 space-y-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-14 bg-slate-100 rounded animate-pulse" />
              ))}
            </div>
          ) : listData?.items.length === 0 ? (
            <div className="py-16 text-center">
              <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">
                {statusFilter === 'pending' ? '暂无待审核记录' : '暂无记录'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">来源 / 标题</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">目标模型</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">置信度</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">创建时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {listData?.items.map((item) => {
                  const Icon = SOURCE_ICON[item.source_type] ?? Inbox
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <div>
                            <p className="font-medium text-slate-800 truncate max-w-xs" title={item.source_display_title}>
                              {item.source_display_title}
                            </p>
                            <p className="text-xs text-slate-400">
                              {SOURCE_LABELS[item.source_type] ?? item.source_type}
                              {item.source_module ? ` · ${item.source_module}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{item.target_model || '—'}</td>
                      <td className="px-4 py-3">
                        <ConfidenceBadge score={item.confidence_score} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={item.review_status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => loadDetail(item.id)}
                          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                        >
                          查看详情
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* 分页 */}
          {listData && listData.total > listData.page_size && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <span className="text-xs text-slate-500">共 {listData.total} 条</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                >
                  上一页
                </button>
                <span className="px-2 text-xs text-slate-600">第 {page} 页</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * listData.page_size >= listData.total}
                  className="px-2 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
