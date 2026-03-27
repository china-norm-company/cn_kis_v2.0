import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { preScreeningApi, receptionApi, recruitmentApi } from '@cn-kis/api-client'
import type {
  PreScreeningRecord,
  QueueItem,
  RecruitmentPlan,
  TodayQueueProjectSummaryItem,
} from '@cn-kis/api-client'
import { useActiveRecruitmentPlans } from '../hooks/useActiveRecruitmentPlans'
import { Badge, Button, Modal, Empty } from '@cn-kis/ui-kit'
import { ErrorAlert } from '../components/ErrorAlert'
import { Pagination } from '../components/Pagination'
import { AppointmentQueuePanel } from '../components/AppointmentQueuePanel'
import { toast } from '../hooks/useToast'
import {
  Microscope,
  Eye,
  Plus,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronUp,
  FileDown,
} from 'lucide-react'

const QUEUE_EXPORT_PAGE_SIZE = 99999

function formatGenderForExport(value: unknown): string {
  if (value === undefined || value === null) return '—'
  const s = String(value).trim()
  if (!s) return '—'
  const lower = s.toLowerCase()
  if (lower === 'male' || lower === 'm') return '男'
  if (lower === 'female' || lower === 'f') return '女'
  if (lower === 'other') return '其他'
  return s
}

/** 导出列：项目编号、姓名、年龄、性别、手机、联络员、入组情况（与筛选列表 queueList 同源） */
function queueItemToExportRow(item: QueueItem) {
  return {
    项目编号: item.project_code?.trim() ? item.project_code : '—',
    姓名: item.subject_name || '—',
    年龄: item.age != null ? item.age : '—',
    性别: formatGenderForExport(item.gender),
    手机: item.phone?.trim() ? item.phone : '—',
    联络员: item.liaison?.trim() ? item.liaison : '—',
    入组情况: item.enrollment_status?.trim() ? item.enrollment_status : '—',
  }
}

/** 与到访队列筛选一致（初筛汇总同源） */
const SUMMARY_QUEUE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'waiting', label: '待签到' },
  { value: 'checked_in', label: '已签到' },
  { value: 'in_progress', label: '执行中' },
  { value: 'checked_out', label: '已签出' },
  { value: 'no_show', label: '缺席' },
]
const SUMMARY_ENROLLMENT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部入组' },
  { value: '__none__', label: '无入组' },
  ...(['初筛合格', '正式入组', '不合格', '复筛不合格', '退出', '缺席'] as const).map((s) => ({ value: s, label: s })),
]

const resultBadge: Record<string, { variant: 'success' | 'error' | 'warning' | 'info'; label: string }> = {
  pass: { variant: 'success', label: '通过' },
  fail: { variant: 'error', label: '不通过' },
  pending: { variant: 'warning', label: '待评估' },
  refer: { variant: 'info', label: '待复核' },
}

export default function PreScreeningListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'list' | 'summary'>('list')
  const [page, setPage] = useState(1)
  const [resultFilter, setResultFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [planFilter, setPlanFilter] = useState<number | ''>('')
  const [selectedQueueProjectCode, setSelectedQueueProjectCode] = useState('')
  const [sharedQueueDateFrom, setSharedQueueDateFrom] = useState('')
  const [sharedQueueDateTo, setSharedQueueDateTo] = useState('')
  const [sharedQueueProjectCodeInput, setSharedQueueProjectCodeInput] = useState('')
  const [sharedQueueProjectCodeFilter, setSharedQueueProjectCodeFilter] = useState('')
  const [sharedQueueStatus, setSharedQueueStatus] = useState('')
  const [sharedQueueEnrollment, setSharedQueueEnrollment] = useState('')
  const [summaryPage, setSummaryPage] = useState(1)
  /** 初筛记录列表默认收起，展开后再请求列表 */
  const [showPrescreeningRecords, setShowPrescreeningRecords] = useState(false)
  const [showStartModal, setShowStartModal] = useState(false)
  const summaryPageSize = 10

  const queueProjectSummaryQuery = useQuery({
    queryKey: [
      'reception',
      'today-queue-project-summary',
      'all-visit-points',
      sharedQueueDateFrom,
      sharedQueueDateTo,
      sharedQueueProjectCodeFilter,
      sharedQueueStatus,
      sharedQueueEnrollment,
      summaryPage,
      summaryPageSize,
    ],
    queryFn: async () => {
      const res = await receptionApi.todayQueueProjectSummary({
        source: 'execution',
        date_from: sharedQueueDateFrom || undefined,
        date_to: sharedQueueDateTo || undefined,
        project_code: sharedQueueProjectCodeFilter || undefined,
        status: sharedQueueStatus || undefined,
        enrollment_status: sharedQueueEnrollment || undefined,
        page: summaryPage,
        page_size: summaryPageSize,
      })
      return res?.data ?? { date: '', total_projects: 0, total: 0, page: 1, page_size: summaryPageSize, items: [] }
    },
  })

  const listQuery = useQuery({
    queryKey: ['pre-screening', 'list', { page, resultFilter, dateFrom, dateTo, planFilter }],
    queryFn: async () => {
      const params: Record<string, unknown> = { page, page_size: 20 }
      if (resultFilter) params.result = resultFilter
      if (dateFrom && dateTo) {
        params.pre_screening_date_from = dateFrom
        params.pre_screening_date_to = dateTo
      } else if (dateFrom) {
        params.pre_screening_date_from = dateFrom
      } else if (dateTo) {
        params.pre_screening_date_to = dateTo
      }
      if (planFilter) params.plan_id = planFilter
      const res = await preScreeningApi.list(params as Parameters<typeof preScreeningApi.list>[0])
      if (!res?.data) throw new Error('获取初筛列表失败')
      return res.data
    },
    enabled: activeTab === 'list' && showPrescreeningRecords,
  })

  const plansQuery = useActiveRecruitmentPlans()

  const syncFromAppointmentsMutation = useMutation({
    mutationFn: () =>
      preScreeningApi.syncFromAppointments(dateFrom ? { target_date: dateFrom } : {}),
    onSuccess: (res) => {
      const d = res.data
      const parts = [`新增 ${d.created} 条`, `跳过 ${d.skipped} 条`]
      if (d.errors?.length) {
        parts.push(`未成功 ${d.errors.length} 条（示例：${d.errors[0].msg}）`)
      }
      toast.success(parts.join('；'))
      void queryClient.invalidateQueries({ queryKey: ['pre-screening'] })
    },
    onError: (e) => toast.error((e as Error).message || '同步失败'),
  })

  const queueExportProjectCode = (sharedQueueProjectCodeFilter || selectedQueueProjectCode).trim()

  const exportQueueListMutation = useMutation({
    mutationFn: async () => {
      const pc = (sharedQueueProjectCodeFilter || selectedQueueProjectCode).trim()
      if (!pc) {
        throw new Error('请先在下方筛选列表中选择项目编号')
      }
      const res = await receptionApi.queueList({
        date_from: sharedQueueDateFrom || undefined,
        date_to: sharedQueueDateTo || undefined,
        page: 1,
        page_size: QUEUE_EXPORT_PAGE_SIZE,
        project_code: pc,
        project_code_exact: true,
        status: sharedQueueStatus || undefined,
        enrollment_status: sharedQueueEnrollment || undefined,
      })
      const raw = res.data?.items ?? []
      const rows = raw.map(queueItemToExportRow)
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '筛选名单')
      const safe = pc.replace(/[\\/:*?"<>|]/g, '_')
      const filename = `初筛筛选名单_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`
      XLSX.writeFile(wb, filename)
      return raw.length
    },
    onSuccess: (n) => toast.success(n > 0 ? `已导出 ${n} 条` : '已导出（当前筛选下无数据）'),
    onError: (e) => toast.error((e as Error).message || '导出失败'),
  })

  const queueProjectSummary = queueProjectSummaryQuery.data
  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const plans = plansQuery.data ?? []

  return (
    <div className="space-y-6" data-section="pre-screening-list">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">初筛管理</h2>
          <p className="text-sm text-slate-500 mt-1">专业评估每一位到场受试者</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button
            variant="secondary"
            icon={
              <RefreshCw
                className={`w-4 h-4 ${syncFromAppointmentsMutation.isPending ? 'animate-spin' : ''}`}
              />
            }
            loading={syncFromAppointmentsMutation.isPending}
            disabled={syncFromAppointmentsMutation.isPending}
            onClick={() => syncFromAppointmentsMutation.mutate()}
            title={
              dateFrom
                ? `同步预约日为「${dateFrom}」的全部访视点预约（需已有对应招募报名与协议编号）`
                : '同步今日全部访视点预约名单（需已有对应招募报名与协议编号）'
            }
          >
            从预约同步
          </Button>
          {activeTab === 'list' ? (
            <>
              <Button
                variant="secondary"
                icon={<FileDown className="w-4 h-4" />}
                loading={exportQueueListMutation.isPending}
                disabled={exportQueueListMutation.isPending || !queueExportProjectCode}
                onClick={() => exportQueueListMutation.mutate()}
                title={
                  queueExportProjectCode
                    ? '按当前筛选列表的日期范围、状态、入组情况，导出所选项目下全部队列行（Excel）'
                    : '请先在下方「到访队列」区域将「项目编号」选为具体项目（不能为「全部项目」）'
                }
              >
                导出名单
              </Button>
              {!queueExportProjectCode ? (
                <span className="text-xs text-slate-500 max-w-[14rem] leading-snug">
                  灰色为未可选：请先在下方选择项目编号
                </span>
              ) : null}
            </>
          ) : null}
          <Button
            variant="success"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setShowStartModal(true)}
          >
            发起初筛
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-1 inline-flex gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            activeTab === 'summary' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          初筛汇总
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('list')}
          className={`px-3 py-1.5 rounded-lg text-sm ${
            activeTab === 'list' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          筛选列表
        </button>
      </div>

      {activeTab === 'summary' ? (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-800">项目汇总</h3>
            <p className="text-xs text-slate-500 mt-1">按项目编号汇总预约人数、状态与入组情况（同源预约管理）</p>
          </div>
          <span className="text-xs text-slate-500">
            {queueProjectSummary?.date ? `日期：${queueProjectSummary.date}` : '日期：全部日期（全量）'}
          </span>
        </div>
        <form
          className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const next = sharedQueueProjectCodeInput.trim().toUpperCase()
            setSharedQueueProjectCodeFilter(next)
            setSummaryPage(1)
          }}
        >
          <label htmlFor="summary-date-from" className="text-xs font-medium text-slate-600">
            起始
          </label>
          <input
            id="summary-date-from"
            type="date"
            value={sharedQueueDateFrom}
            onChange={(e) => {
              setSharedQueueDateFrom(e.target.value)
              setSummaryPage(1)
            }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
          />
          <label htmlFor="summary-date-to" className="text-xs font-medium text-slate-600">
            截止
          </label>
          <input
            id="summary-date-to"
            type="date"
            value={sharedQueueDateTo}
            onChange={(e) => {
              setSharedQueueDateTo(e.target.value)
              setSummaryPage(1)
            }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
          />
          <label htmlFor="summary-project-prefix" className="text-xs font-medium text-slate-600">
            项目编号
          </label>
          <input
            id="summary-project-prefix"
            value={sharedQueueProjectCodeInput}
            onChange={(e) => setSharedQueueProjectCodeInput(e.target.value)}
            placeholder="例如 C260（包含匹配）"
            className="w-40 px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
          />
          <label htmlFor="summary-queue-status" className="text-xs font-medium text-slate-600">
            状态
          </label>
          <select
            id="summary-queue-status"
            value={sharedQueueStatus}
            onChange={(e) => {
              setSharedQueueStatus(e.target.value)
              setSummaryPage(1)
            }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
          >
            {SUMMARY_QUEUE_STATUS_OPTIONS.map((o) => (
              <option key={o.value || 'all-st'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label htmlFor="summary-enrollment" className="text-xs font-medium text-slate-600">
            入组情况
          </label>
          <select
            id="summary-enrollment"
            value={sharedQueueEnrollment}
            onChange={(e) => {
              setSharedQueueEnrollment(e.target.value)
              setSummaryPage(1)
            }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
          >
            {SUMMARY_ENROLLMENT_OPTIONS.map((o) => (
              <option key={o.value || 'all-en'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="submit" className="px-3 py-1.5 rounded border border-slate-200 text-sm text-slate-700 hover:bg-slate-50">
            筛选
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => {
              setSharedQueueDateFrom('')
              setSharedQueueDateTo('')
              setSharedQueueProjectCodeInput('')
              setSharedQueueProjectCodeFilter('')
              setSharedQueueStatus('')
              setSharedQueueEnrollment('')
              setSummaryPage(1)
            }}
          >
            重置
          </button>
        </form>
        {queueProjectSummaryQuery.isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : queueProjectSummaryQuery.error ? (
          <div className="p-4">
            <ErrorAlert
              message={(queueProjectSummaryQuery.error as Error).message || '加载项目汇总失败'}
              onRetry={() => queueProjectSummaryQuery.refetch()}
            />
          </div>
        ) : (queueProjectSummary?.items?.length ?? 0) === 0 ? (
          <div className="p-6 text-sm text-slate-500 text-center">暂无项目汇总数据</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">项目编号</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">预约人数</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">状态</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">入组情况</th>
                </tr>
              </thead>
              <tbody>
                {(queueProjectSummary?.items ?? []).map((row: TodayQueueProjectSummaryItem) => {
                  const status = row.status_counts
                  const statusLabel = `待签到 ${status.waiting || 0} / 已签到 ${(status.checked_in || 0) + (status.in_progress || 0)} / 已签出 ${status.checked_out || 0} / 缺席 ${status.no_show || 0}`
                  const enrollmentEntries = Object.entries(row.enrollment_status_counts || {})
                  const enrollmentLabel = enrollmentEntries.length
                    ? enrollmentEntries
                        .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
                        .map(([k, v]) => `${k}${v}`)
                        .join(' / ')
                    : '—'
                  return (
                    <tr
                      key={row.project_code}
                      className={`border-b border-slate-100 cursor-pointer ${
                        selectedQueueProjectCode === row.project_code ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                      onClick={() =>
                        setSelectedQueueProjectCode((prev) => {
                          const next = prev === row.project_code ? '' : row.project_code
                          setSharedQueueProjectCodeInput(next)
                          setSharedQueueProjectCodeFilter(next)
                          return next
                        })
                      }
                      title={
                        selectedQueueProjectCode === row.project_code
                          ? '再次点击取消筛选'
                          : `点击筛选下方到访队列：${row.project_code}`
                      }
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">{row.project_code}</td>
                      <td className="px-4 py-2.5 text-slate-700">{row.appointment_count}</td>
                      <td className="px-4 py-2.5 text-slate-600">{statusLabel}</td>
                      <td className="px-4 py-2.5 text-slate-600">{enrollmentLabel}</td>
                    </tr>
                  )
                })}
              </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-slate-200">
              <Pagination
                page={summaryPage}
                pageSize={summaryPageSize}
                total={queueProjectSummary?.total ?? queueProjectSummary?.total_projects ?? 0}
                onChange={setSummaryPage}
              />
            </div>
          </>
        )}
      </div>
      ) : null}

      {activeTab === 'list' ? (
        <AppointmentQueuePanel
          hideCalendar
          listTitle="到访队列"
          subtitle="与预约管理同源（全部访视点），默认全部日期；支持日期范围、状态、入组情况与项目编号（下拉选项随日期范围变化）。"
          historicalMode
          historicalFilters={{
            dateFrom: sharedQueueDateFrom,
            dateTo: sharedQueueDateTo,
            projectCode: sharedQueueProjectCodeFilter || selectedQueueProjectCode,
            status: sharedQueueStatus,
            enrollmentStatus: sharedQueueEnrollment,
          }}
          onHistoricalFiltersChange={({ dateFrom, dateTo, projectCode, status, enrollmentStatus }) => {
            setSharedQueueDateFrom(dateFrom)
            setSharedQueueDateTo(dateTo)
            setSharedQueueProjectCodeInput(projectCode)
            setSharedQueueProjectCodeFilter(projectCode)
            setSharedQueueStatus(status)
            setSharedQueueEnrollment(enrollmentStatus)
          }}
          projectFilter={sharedQueueProjectCodeFilter || selectedQueueProjectCode}
          onProjectFilterChange={(projectCode) => {
            setSelectedQueueProjectCode(projectCode)
            setSharedQueueProjectCodeInput(projectCode)
            setSharedQueueProjectCodeFilter(projectCode)
          }}
        />
      ) : null}

      {activeTab === 'list' ? (
      <>
      {/* 与上方「到访队列」数据源不同：本区为初筛评估记录；默认收起 */}
      <section
        className="mt-8 pt-8 border-t border-slate-200 space-y-4"
        aria-labelledby="prescreening-records-heading"
      >
        {!showPrescreeningRecords ? (
          <button
            type="button"
            onClick={() => setShowPrescreeningRecords(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-100"
          >
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" aria-hidden />
            <div>
              <div id="prescreening-records-heading" className="font-semibold text-slate-800">
                初筛记录
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                已登记的初筛评估列表（与到访队列数据源不同）。默认收起，点击展开后加载列表。
              </p>
            </div>
          </button>
        ) : (
          <>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="flex items-start gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setShowPrescreeningRecords(false)}
              className="mt-0.5 shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
              title="收起初筛记录"
              aria-expanded="true"
            >
              <ChevronUp className="h-4 w-4" aria-hidden />
            </button>
            <div>
            <h3 id="prescreening-records-heading" className="text-base font-semibold text-slate-800">
              初筛记录
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              筛选对象为已登记的初筛评估（初筛日期 / 结果 / 关联计划）。与上方「到访队列」的预约日期、项目等筛选相互独立。
            </p>
            </div>
          </div>
          <span className="text-sm text-slate-600 shrink-0">
            本列表共 <span className="font-medium text-slate-800">{total}</span> 条
          </span>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="text-xs font-medium text-slate-600 sm:mr-1">初筛日期</span>
          <div className="flex items-center gap-2">
            <label htmlFor="prescreen-date-from" className="text-xs text-slate-500 whitespace-nowrap">
              起
            </label>
            <input
              id="prescreen-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              title="仅填「起」：按该初筛日精确匹配；与「止」同时填写则为日期区间"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="prescreen-date-to" className="text-xs text-slate-500 whitespace-nowrap">
              止
            </label>
            <input
              id="prescreen-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              title="仅填「止」：初筛日不晚于该日；与「起」同时填写为闭区间"
            />
          </div>
          <div className="hidden sm:block w-px h-6 bg-slate-200 shrink-0" aria-hidden />
          <div className="flex items-center gap-2">
            <label htmlFor="prescreen-result" className="text-xs text-slate-500 whitespace-nowrap">
              评估结果
            </label>
            <select
              id="prescreen-result"
              value={resultFilter}
              onChange={(e) => { setResultFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white min-w-[7rem]"
              title="初筛评估结论"
            >
              <option value="">全部</option>
              <option value="pass">通过</option>
              <option value="fail">不通过</option>
              <option value="pending">待评估</option>
              <option value="refer">待复核</option>
            </select>
          </div>
          <div className="flex items-center gap-2 min-w-0 sm:flex-1 sm:max-w-md">
            <label htmlFor="prescreen-plan" className="text-xs text-slate-500 whitespace-nowrap shrink-0">
              关联计划
            </label>
            <select
              id="prescreen-plan"
              value={planFilter}
              onChange={(e) => { setPlanFilter(e.target.value ? Number(e.target.value) : ''); setPage(1) }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white min-w-0 flex-1 max-w-full"
              title="初筛所关联的招募计划"
            >
              <option value="">全部计划</option>
              {plans.map((p: RecruitmentPlan) => {
                const code = (p.protocol_code || '').trim()
                const label = code
                  ? `${p.plan_no} · ${p.title} · ${code}`
                  : `${p.plan_no} · ${p.title} · （未配置协议编号）`
                return (
                  <option key={p.id} value={p.id}>{label}</option>
                )
              })}
            </select>
          </div>
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
            title="暂无初筛记录"
            description="可放宽筛选条件，或使用「发起初筛」创建记录"
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">初筛编号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">受试者姓名</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">受试者编号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">初筛日期</th>
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
          </>
        )}
      </section>
      </>
      ) : null}

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
      toast.success('初筛已发起')
      onSuccess()
    },
    onError: (err) => toast.error((err as Error).message || '发起初筛失败'),
  })

  const regs = (regsQuery.data ?? []) as Array<{ id: number; registration_no: string; name: string; phone: string }>
  const filtered = keyword
    ? regs.filter((r) => r.name.includes(keyword) || r.registration_no.includes(keyword))
    : regs

  return (
    <Modal isOpen onClose={onClose} title="发起初筛" size="md" footer={
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
