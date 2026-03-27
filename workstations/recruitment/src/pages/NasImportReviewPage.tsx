import { useState, useEffect, useCallback } from 'react'
import {
  Inbox, RefreshCw, Check, X, Edit3, ChevronDown, ChevronUp,
  AlertTriangle, Zap, Clock, CheckCircle, XCircle, ArrowLeft,
  FileSpreadsheet, Users, Database,
} from 'lucide-react'

const API_BASE = '/v2/api/v1'
const getToken = () =>
  localStorage.getItem('auth_token') ??
  localStorage.getItem('cn_kis_token') ??
  ''

const WORKSTATION = 'subject'

// ── 类型定义 ──────────────────────────────────────────────────────────────────

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

// ── 常量 ──────────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  nas_xls_import: 'NAS表格导入',
  nas_csv_import: 'NAS表格导入',
  lims: 'LIMS',
  feishu_mail: '飞书邮件',
  feishu_im: '飞书消息',
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  pending_review:  { label: '待审核',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  pending:         { label: '待审核',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  matched:         { label: '已匹配',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  approved:        { label: '已批准',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  rejected:        { label: '已拒绝',  cls: 'bg-red-50 text-red-700 border-red-200' },
  needs_more_info: { label: '待补信息',cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  ingested:        { label: '已接入',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  auto_ingested:   { label: '自动接入',cls: 'bg-purple-50 text-purple-700 border-purple-200' },
}

const REJECT_REASONS = [
  { value: 'data_quality', label: '数据质量差' },
  { value: 'duplicate',    label: '重复数据' },
  { value: 'wrong_scope',  label: '不属于本系统' },
  { value: 'mapping_error',label: '字段映射错误' },
  { value: 'other',        label: '其他原因' },
]

// ── API 工具 ──────────────────────────────────────────────────────────────────

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
  if (score >= 0.8)
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <Zap className="w-2.5 h-2.5" />
        高 {Math.round(score * 100)}%
      </span>
    )
  if (score >= 0.5)
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-2.5 h-2.5" />
        中 {Math.round(score * 100)}%
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
      <AlertTriangle className="w-2.5 h-2.5" />
      低 {Math.round(score * 100)}%
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

// ── 详情视图 ──────────────────────────────────────────────────────────────────

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

  const isPending = detail.review_status === 'pending_review' || detail.review_status === 'pending'

  const handleModifyApprove = async () => {
    const modified: Record<string, { value: string; note: string }> = {}
    for (const [k, v] of Object.entries(modifiedValues)) {
      if (v.trim()) modified[k] = { value: v, note: '人工修正' }
    }
    try {
      await apiPost(`/data-intake/${WORKSTATION}/candidates/${detail.id}/modify`, {
        modified_fields: modified,
        comment,
      })
      onApprove(comment)
    } catch {
      alert('操作失败，请重试')
    }
  }

  // 渲染原始快照的关键字段（NAS导入通常有姓名/手机/项目信息）
  const snapshotEntries = Object.entries(detail.source_snapshot)
  const keyFields = ['name', 'phone', 'project_code', 'id_card', 'source_file', 'nas_file', 'sheet']
  const orderedEntries = [
    ...snapshotEntries.filter(([k]) => keyFields.some(kf => k.toLowerCase().includes(kf))),
    ...snapshotEntries.filter(([k]) => !keyFields.some(kf => k.toLowerCase().includes(kf))),
  ]
  const displayEntries = expandSnapshot ? orderedEntries : orderedEntries.slice(0, 12)

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
        {detail.ingested_record_id && (
          <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5">
            受试者ID: {detail.ingested_record_id}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* 原始数据快照 */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-600">
              原始数据
              <span className="ml-2 text-xs font-normal text-slate-400">
                来源：{SOURCE_LABELS[detail.source_type] ?? detail.source_type}
              </span>
            </h3>
            {orderedEntries.length > 12 && (
              <button
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                onClick={() => setExpandSnapshot(!expandSnapshot)}
              >
                {expandSnapshot ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expandSnapshot ? '收起' : `展开全部 (${orderedEntries.length}个字段)`}
              </button>
            )}
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {displayEntries.map(([k, v]) => (
              <div key={k} className="text-xs">
                <span className="text-slate-400 font-mono">{k}</span>
                <span className="mx-1 text-slate-300">:</span>
                <span className="text-slate-700">
                  {typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 映射字段预览 */}
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
                    <span className="text-xs font-medium text-slate-600">
                      {fieldData.label ?? fieldName}
                    </span>
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
                        setModifiedValues((prev) => ({ ...prev, [fieldName]: e.target.value }))
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
                      原始字段：{fieldData.source_field}
                    </p>
                  )}
                </div>
              )
            })}
            {Object.keys(detail.mapped_fields).length === 0 && (
              <p className="text-sm text-slate-400">未生成字段映射</p>
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
                批准入库
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
              <h4 className="text-sm font-medium text-slate-700">确认批准入库</h4>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="审核备注（可选，如：已核实手机与姓名匹配）"
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
                <button
                  onClick={() => setMode('view')}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  取消
                </button>
              </div>
            </div>
          )}
          {mode === 'reject' && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-slate-700">拒绝原因</h4>
              <div className="flex flex-wrap gap-2">
                {REJECT_REASONS.map((r) => (
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
                <button
                  onClick={() => setMode('view')}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  取消
                </button>
              </div>
            </div>
          )}
          {mode === 'modify' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">在右侧字段中直接修改后，点击确认批准。</p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="修改说明（必填，如：已核实并修正受试者信息）"
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

      {/* 已处理状态展示 */}
      {!isPending && (
        <div
          className={`rounded-xl border p-4 ${
            detail.review_status === 'ingested' || detail.review_status === 'auto_ingested' || detail.review_status === 'matched'
              ? 'bg-emerald-50 border-emerald-200'
              : detail.review_status === 'rejected'
              ? 'bg-red-50 border-red-200'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            {detail.review_status === 'matched' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            ) : detail.review_status === 'rejected' ? (
              <XCircle className="w-4 h-4 text-red-600" />
            ) : (
              <Clock className="w-4 h-4 text-blue-600" />
            )}
            <span className="text-sm font-medium text-slate-700">
              {detail.review_status === 'matched'
                ? '已匹配到现有受试者档案'
                : detail.reviewed_by_name
                ? `审核人：${detail.reviewed_by_name}`
                : '系统自动处理'}
            </span>
            {detail.reviewed_at && (
              <span className="text-xs text-slate-400">
                {new Date(detail.reviewed_at).toLocaleString()}
              </span>
            )}
          </div>
          {detail.review_comment && <p className="text-sm text-slate-600">{detail.review_comment}</p>}
        </div>
      )}
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────────────────

export default function NasImportReviewPage() {
  const [listData, setListData] = useState<ListResponse | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<CandidateDetail | null>(null)
  const [statusFilter, setStatusFilter] = useState('pending_review')
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
      source_type: 'nas_xls_import',
    })
    const res = await apiGet(`/data-intake/${WORKSTATION}/candidates?${params}`)
    setListData(res?.data ?? null)
    setLoading(false)
  }, [statusFilter, page])

  useEffect(() => {
    loadList()
  }, [loadList])

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
      limit: 200,
      dry_run: false,
    })
    setBulkResult(res?.data?.message ?? '操作完成')
    setActionLoading(false)
    loadList()
  }

  const statusCounts = listData?.status_counts ?? {}
  const totalImported =
    (statusCounts['pending_review'] ?? 0) +
    (statusCounts['matched'] ?? 0) +
    (statusCounts['needs_more_info'] ?? 0) +
    (statusCounts['approved'] ?? 0) +
    (statusCounts['rejected'] ?? 0)

  return (
    <div className="space-y-5">
      {/* 标题 + 快速统计 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">NAS 受试者档案导入审核</h2>
          <p className="text-sm text-slate-500 mt-1">
            从 NAS 历史文件导入的受试者信息，需人工确认后正式入档
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(statusCounts['pending_review'] ?? 0) > 0 && (
            <button
              onClick={() => setShowBulk(!showBulk)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              批量批准高置信度
            </button>
          )}
          <button
            onClick={loadList}
            aria-label="刷新"
            className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 总体数据概览 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '总导入条目', value: totalImported, icon: FileSpreadsheet, color: 'text-slate-600', bg: 'bg-slate-50' },
          { label: '待人工审核', value: statusCounts['pending_review'] ?? 0, icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: '已匹配现有档案', value: statusCounts['matched'] ?? 0, icon: CheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: '待补充信息', value: statusCounts['needs_more_info'] ?? 0, icon: AlertTriangle, color: 'text-orange-700', bg: 'bg-orange-50' },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.bg} rounded-xl p-4 border border-slate-100`}>
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-xs text-slate-500">{stat.label}</span>
            </div>
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* 批量操作面板 */}
      {showBulk && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-amber-800">
            对置信度 ≥ 80% 的 NAS 待审核受试者记录进行批量批准入档（单次最多200条）。
          </p>
          {bulkResult && <p className="text-sm font-medium text-amber-900">{bulkResult}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleBulkApprove}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              <Zap className="w-4 h-4" />
              {actionLoading ? '处理中…' : '执行批量批准'}
            </button>
            <button
              onClick={() => setShowBulk(false)}
              className="px-4 py-2 text-sm text-amber-700 hover:bg-amber-100 rounded-lg"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 状态过滤 */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: 'pending_review', label: '待审核' },
          { key: 'needs_more_info', label: '待补信息' },
          { key: 'matched', label: '已匹配' },
          { key: 'approved', label: '已批准' },
          { key: 'rejected', label: '已拒绝' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setStatusFilter(key); setPage(1) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              statusFilter === key
                ? 'bg-slate-800 text-white border-slate-800'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
            {statusCounts[key] != null && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  statusFilter === key ? 'bg-white text-slate-800' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {statusCounts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 详情或列表 */}
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
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">
                {statusFilter === 'pending_review' ? '暂无待审核受试者记录' : '暂无记录'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">受试者信息</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">来源</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">置信度</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">导入时间</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {listData?.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div>
                          <p
                            className="font-medium text-slate-800 truncate max-w-xs"
                            title={item.source_display_title}
                          >
                            {item.source_display_title}
                          </p>
                          {item.ingested_record_id && (
                            <p className="text-xs text-emerald-600">
                              受试者ID: {item.ingested_record_id}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {SOURCE_LABELS[item.source_type] ?? item.source_type}
                    </td>
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
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        审核详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* 分页 */}
          {listData && listData.total > listData.page_size && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <span className="text-xs text-slate-500">
                共 {listData.total} 条，第 {page} 页
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * (listData.page_size) >= listData.total}
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
