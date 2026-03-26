/**
 * 时间槽详情页：项目信息 + 排程状态（四维度）+ 排程结果（项目 / 人员 / 日期 TAB，可筛选、可导出）
 * 路由：/scheduling/timeslot/:id （id 为 TimelinePublishedPlan.id）
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { schedulingApi } from '@cn-kis/api-client'
import { Button, Card, Tabs, Input, Select } from '@cn-kis/ui-kit'
import { ArrowLeft, Calendar, Users, FolderOpen, Download, Pencil } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { ExecutionOrderDetailReadOnly } from '../components/ExecutionOrderDetailReadOnly'
import { formatExecutionPeriodToMMMMDDYY } from '../utils/executionOrderPlanConfig'
import { computeAllFourDimensions, type StatusVariant } from '../utils/timeSlotDetailAggregation'
import type { PersonnelPayload } from '../utils/personnelProcessTab'
import { buildScheduleResultDimensionRows } from '../utils/timeSlotScheduleResultRows'
import { downloadXlsxMultiSheet } from '../utils/exportTableXlsx'
import { getFirstRowAsDict } from '../utils/executionOrderFirstRow'

type ViewTabKey = 'byProject' | 'byPerson' | 'byDate'

interface VisitBlock {
  visit_point?: string
  processes?: Array<{
    process?: string
    code?: string
    exec_dates?: string[]
    sample_size?: string | number
    admin_person?: string
    admin_room?: string
    eval_person?: string
    eval_room?: string
    tech_person?: string
    tech_room?: string
  }>
}

/** 依次取第一个「非空字符串」；避免 snapshot 里为 '' 时 ?? 无法回退到订单/schedule */
function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue
    const s = String(v).trim()
    if (s !== '') return s
  }
  return ''
}

const STATUS_VARIANT_CLASS: Record<StatusVariant, string> = {
  success:
    'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-900/25 dark:text-emerald-200 dark:border-emerald-800',
  warning:
    'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-900/25 dark:text-amber-200 dark:border-amber-800',
  neutral:
    'bg-slate-50 text-slate-800 border-slate-200 dark:bg-slate-700/40 dark:text-slate-200 dark:border-slate-600',
  muted: 'bg-slate-100/80 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-600',
}

export default function TimeSlotDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [activeView, setActiveView] = useState<ViewTabKey>('byProject')

  const [projectKeyword, setProjectKeyword] = useState('')
  /** 按人员 Tab：按「流程」名称精确筛选（选项来自当前 visit_blocks 展开后的流程集合） */
  const [personProcessFilter, setPersonProcessFilter] = useState('')
  const [personKeyword, setPersonKeyword] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dateKeyword, setDateKeyword] = useState('')

  const planId = id ? parseInt(id, 10) : NaN
  const { data: detailRes, isLoading, error } = useQuery({
    queryKey: ['scheduling', 'timeline-published-detail', planId],
    queryFn: () => schedulingApi.getTimelinePublishedDetail(planId),
    enabled: Number.isInteger(planId),
  })

  const detail = (detailRes as { data?: unknown })?.data as Record<string, unknown> | undefined
  const snapshot = (detail?.snapshot || {}) as Record<string, unknown>
  const sourceType = String(detail?.source_type ?? 'online')
  const order = detail?.order as { headers?: string[]; rows?: unknown[] } | undefined
  const schedule = detail?.schedule as
    | {
        admin_published?: boolean
        eval_published?: boolean
        tech_published?: boolean
        execution_order_id?: number | null
        supervisor?: string
        research_group?: string
        payload?: { visit_blocks?: VisitBlock[]; personnel?: PersonnelPayload }
      }
    | undefined
  const executionOrderId =
    schedule?.execution_order_id != null && !Number.isNaN(Number(schedule.execution_order_id))
      ? Number(schedule.execution_order_id)
      : null
  const payload = (schedule?.payload || {}) as { visit_blocks?: VisitBlock[]; personnel?: PersonnelPayload }
  const visitBlocks = payload.visit_blocks || []
  /** 人员排程保存在 payload.personnel；时间槽快照 snapshot 也会同步 personnel，与 schedule.payload 二选一合并 */
  const personnelMerged = useMemo(() => {
    return (payload.personnel ?? (snapshot.personnel as PersonnelPayload | undefined)) ?? null
  }, [payload.personnel, snapshot])

  const headers = order?.headers || []
  const rows = order?.rows || []
  const firstRow = order ? getFirstRowAsDict(headers, rows) : {}

  const four = useMemo(
    () => computeAllFourDimensions(visitBlocks, schedule, personnelMerged),
    [visitBlocks, schedule, personnelMerged]
  )

  const projectCtx = useMemo(
    () => ({
      projectCode: firstNonEmpty(snapshot['项目编号'], firstRow['项目编号']),
      projectName: firstNonEmpty(snapshot['项目名称'], firstRow['项目名称'], firstRow['项目名'], firstRow['名称']),
      group: firstNonEmpty(snapshot['组别'], firstRow['组别'], schedule?.research_group),
      sample: firstNonEmpty(snapshot['样本量'], firstRow['样本量']),
      supervisor: firstNonEmpty(snapshot['督导'], firstRow['督导'], schedule?.supervisor),
      visitTimepoint: firstNonEmpty(snapshot['访视时间点'], firstRow['访视时间点']),
    }),
    [snapshot, firstRow, schedule]
  )

  const { project: projectRows, person: personRows, date: dateRows } = useMemo(
    () => buildScheduleResultDimensionRows(visitBlocks, personnelMerged, projectCtx),
    [visitBlocks, personnelMerged, projectCtx]
  )

  const personProcessOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of personRows) {
      const p = (r.process || '').trim()
      if (p) set.add(p)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [personRows])

  useEffect(() => {
    if (personProcessFilter && !personProcessOptions.includes(personProcessFilter)) {
      setPersonProcessFilter('')
    }
  }, [personProcessFilter, personProcessOptions])

  const filteredProjectRows = useMemo(() => {
    const q = projectKeyword.trim().toLowerCase()
    if (!q) return projectRows
    return projectRows.filter((r) => {
      const blob = [
        r.projectCode,
        r.projectName,
        r.sample,
        r.group,
        r.supervisor,
        r.visitTimepoint,
        r.execDate,
        String(r.visitCount),
        r.process,
        r.tester,
        r.backup,
        r.room,
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [projectRows, projectKeyword])

  const filteredPersonRows = useMemo(() => {
    let list = personRows
    if (personProcessFilter) list = list.filter((r) => r.process === personProcessFilter)
    const q = personKeyword.trim().toLowerCase()
    if (q) {
      list = list.filter((r) => {
        const blob = [
          r.tester,
          r.backup,
          r.process,
          r.room,
          r.projectCode,
          r.projectName,
          r.sample,
          r.visitTimepoint,
          r.execDate,
        ]
          .join(' ')
          .toLowerCase()
        return blob.includes(q)
      })
    }
    return list
  }, [personRows, personProcessFilter, personKeyword])

  const filteredDateRows = useMemo(() => {
    let list = dateRows
    const q = dateKeyword.trim().toLowerCase()
    if (q) {
      list = list.filter((r) => {
        const blob = [
          r.execDate,
          r.visitTimepoint,
          r.sample,
          r.projectCode,
          r.projectName,
          r.tester,
          r.backup,
          r.room,
        ]
          .join(' ')
          .toLowerCase()
        return blob.includes(q)
      })
    }
    const from = dateFrom.trim()
    const to = dateTo.trim()
    if (from) list = list.filter((r) => r.execDate === '-' || r.execDate >= from)
    if (to) list = list.filter((r) => r.execDate === '-' || r.execDate <= to)
    return list
  }, [dateRows, dateKeyword, dateFrom, dateTo])

  const safeFileStem = useMemo(() => {
    const code = String(snapshot['项目编号'] ?? 'timeslot')
    return code.replace(/[^\w\u4e00-\u9fa5-]+/g, '_').slice(0, 40) || 'timeslot'
  }, [snapshot])

  /** 一次导出：工作簿含 3 个 Sheet（按项目 / 按人员 / 按日期），数据为各 Tab 当前筛选结果 */
  const exportAllTabs = () => {
    const projHeaders: (string | number)[] = [
      '项目编号',
      '项目名称',
      '样本量',
      '组别',
      '督导',
      '访视时间点',
      '执行日期',
      '访视次数',
      '流程',
      '测试人员',
      '备份人员',
      '房间',
    ]
    const projData = filteredProjectRows.map((r) => [
      r.projectCode,
      r.projectName,
      r.sample,
      r.group,
      r.supervisor,
      r.visitTimepoint,
      r.execDate,
      r.visitCount,
      r.process,
      r.tester,
      r.backup,
      r.room,
    ])
    const personHeaders: (string | number)[] = [
      '测试人员',
      '备份人员',
      '流程',
      '房间',
      '项目编号',
      '项目名称',
      '样本量',
      '访视时间点',
      '执行日期',
    ]
    const personData = filteredPersonRows.map((r) => [
      r.tester,
      r.backup,
      r.process,
      r.room,
      r.projectCode,
      r.projectName,
      r.sample,
      r.visitTimepoint,
      r.execDate,
    ])
    const dateHeaders: (string | number)[] = [
      '执行日期',
      '访视时间点',
      '样本量',
      '项目编号',
      '项目名称',
      '测试人员',
      '备份人员',
      '房间',
    ]
    const dateData = filteredDateRows.map((r) => [
      r.execDate,
      r.visitTimepoint,
      r.sample,
      r.projectCode,
      r.projectName,
      r.tester,
      r.backup,
      r.room,
    ])
    downloadXlsxMultiSheet(`时间槽排程-${safeFileStem}.xlsx`, [
      { name: '按项目', rowsAoA: [projHeaders, ...projData] },
      { name: '按人员', rowsAoA: [personHeaders, ...personData] },
      { name: '按日期', rowsAoA: [dateHeaders, ...dateData] },
    ])
  }

  const viewTabs = [
    { key: 'byProject' as const, label: '按项目', icon: <FolderOpen className="w-4 h-4" /> },
    { key: 'byPerson' as const, label: '按人员', icon: <Users className="w-4 h-4" /> },
    { key: 'byDate' as const, label: '按日期', icon: <Calendar className="w-4 h-4" /> },
  ]

  const dimensionHeaders = [
    { key: 'timeline', label: '时间线', status: four.timeline },
    { key: 'admin', label: '行政', status: four.admin },
    { key: 'eval', label: '评估', status: four.eval },
    { key: 'tech', label: '技术', status: four.tech },
  ]

  if (!Number.isInteger(planId)) {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500">无效的时间槽 ID</p>
      </div>
    )
  }

  if (isLoading || error) {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500">{isLoading ? '加载中…' : '加载失败'}</p>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500">未找到该记录</p>
      </div>
    )
  }

  const exportScheduleButton = (
    <Button
      type="button"
      variant="secondary"
      onClick={exportAllTabs}
      className="shrink-0 w-fit"
      icon={<Download className="w-4 h-4" aria-hidden />}
      iconPosition="left"
    >
      导出
    </Button>
  )

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => navigate('/scheduling', { state: { tab: 'slots' } })}>
            <ArrowLeft className="w-4 h-4 mr-1" /> 返回
          </Button>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-200">时间槽详情</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sourceType === 'online' && executionOrderId != null && (
            <Button
              variant="primary"
              onClick={() => navigate(`/scheduling/schedule-core/${executionOrderId}`, { state: { from: 'timeslot' } })}
            >
              <Pencil className="w-4 h-4 mr-1" /> 继续编辑排程
            </Button>
          )}
          {sourceType === 'offline' && (
            <Button
              variant="primary"
              onClick={() => navigate(`/scheduling/schedule-offline/${planId}`, { state: { from: 'timeslot' } })}
            >
              <Pencil className="w-4 h-4 mr-1" /> 继续编辑线下排程
            </Button>
          )}
        </div>
      </div>

      <Card className={clsx('p-4', isDark && 'bg-slate-800/50 border-[#3b434e]')}>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">项目信息</h2>
        {order && headers.length > 0 && Object.keys(firstRow).length > 0 ? (
          <ExecutionOrderDetailReadOnly headers={headers} row={firstRow} isDark={isDark} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
            {['项目编号', '项目名称', '组别', '样本量', '督导', '访视时间点', '实际执行周期'].map((key) => (
              <div key={key} className={clsx('rounded-lg p-2', isDark ? 'bg-slate-700/30' : 'bg-slate-50')}>
                <span className="text-slate-500 dark:text-slate-400">{key}</span>
                <div className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                  {key === '样本量' ? Number(snapshot[key]) : String(snapshot[key] ?? '-')}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 排程状态：表头一行 + 内容一行，四列并排，小屏横向滚动；不随 TAB/筛选变化 */}
      <Card className={clsx('p-4', isDark && 'bg-slate-800/50 border-[#3b434e]')}>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">排程状态</h2>
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-[720px] grid grid-cols-4 gap-3">
            {dimensionHeaders.map((col) => (
              <div key={col.key} className="flex flex-col gap-2 min-w-0">
                <div
                  className={clsx(
                    'text-center text-xs font-semibold uppercase tracking-wide py-2 rounded-t-lg border-b',
                    isDark ? 'bg-slate-700/40 text-slate-200 border-slate-600' : 'bg-slate-100 text-slate-700 border-slate-200'
                  )}
                >
                  {col.label}
                </div>
                <div
                  className={clsx(
                    'rounded-lg border p-3 min-h-[5.5rem] flex flex-col justify-center',
                    STATUS_VARIANT_CLASS[col.status.variant]
                  )}
                >
                  <p className="text-sm font-medium leading-snug">{col.status.line1}</p>
                  {col.status.line2 && <p className="text-xs mt-1.5 opacity-90 leading-relaxed">{col.status.line2}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 排程结果：项目 / 人员 / 日期 */}
      <Card className={clsx('p-4', isDark && 'bg-slate-800/50 border-[#3b434e]')}>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">排程结果</h2>
        <Tabs
          tabs={viewTabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
          value={activeView}
          onChange={(key) => setActiveView(key as ViewTabKey)}
          className={clsx('mb-0', isDark && 'border-slate-600')}
        />

        {activeView === 'byProject' && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end min-w-0">
                <div className="w-full min-w-[200px] sm:flex-1">
                  <Input
                    placeholder="筛选：项目编号、流程、测试人员、房间等"
                    value={projectKeyword}
                    onChange={(e) => setProjectKeyword(e.target.value)}
                    className={isDark ? 'bg-slate-900/40 border-slate-600' : undefined}
                  />
                </div>
              </div>
              {exportScheduleButton}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[1400px]">
                <thead>
                  <tr className={clsx('border-b', isDark ? 'border-slate-600' : 'border-slate-200')}>
                    {[
                      '项目编号',
                      '项目名称',
                      '样本量',
                      '组别',
                      '督导',
                      '访视时间点',
                      '执行日期',
                      '访视次数',
                      '流程',
                      '测试人员',
                      '备份人员',
                      '房间',
                    ].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredProjectRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-6 text-slate-500 text-center">
                        <p>按项目：暂无匹配数据。</p>
                        <p className="text-xs mt-1">请调整关键词，或确认已维护访视流程与人员排程。</p>
                      </td>
                    </tr>
                  ) : (
                    filteredProjectRows.map((r, i) => (
                      <tr key={i} className={clsx('border-b', isDark ? 'border-slate-700' : 'border-slate-100')}>
                        <td className="px-3 py-2 whitespace-nowrap">{r.projectCode || '-'}</td>
                        <td className="px-3 py-2">{r.projectName || '-'}</td>
                        <td className="px-3 py-2">{r.sample || '-'}</td>
                        <td className="px-3 py-2">{r.group || '-'}</td>
                        <td className="px-3 py-2">{r.supervisor || '-'}</td>
                        <td className="px-3 py-2">{r.visitTimepoint || '-'}</td>
                        <td className="px-3 py-2 text-xs whitespace-pre-wrap max-w-[220px]">{r.execDate}</td>
                        <td className="px-3 py-2">{r.visitCount}</td>
                        <td className="px-3 py-2">{r.process || '-'}</td>
                        <td className="px-3 py-2">{r.tester}</td>
                        <td className="px-3 py-2">{r.backup}</td>
                        <td className="px-3 py-2">{r.room}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeView === 'byPerson' && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end min-w-0">
                <div className="w-full sm:min-w-[200px] sm:max-w-[min(100%,320px)]">
                  <Select
                    options={[
                      { value: '', label: '全部流程' },
                      ...personProcessOptions.map((name) => ({ value: name, label: name })),
                    ]}
                    value={personProcessFilter}
                    onChange={(e) => setPersonProcessFilter(e.target.value)}
                    className={isDark ? 'bg-slate-900/40 border-slate-600 text-slate-200' : undefined}
                  />
                </div>
                <div className="w-full flex-1 min-w-[200px]">
                  <Input
                    placeholder="筛选：测试/备份人员、项目编号、流程、执行日期等"
                    value={personKeyword}
                    onChange={(e) => setPersonKeyword(e.target.value)}
                    className={isDark ? 'bg-slate-900/40 border-slate-600' : undefined}
                  />
                </div>
              </div>
              {exportScheduleButton}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[1100px]">
                <thead>
                  <tr className={clsx('border-b', isDark ? 'border-slate-600' : 'border-slate-200')}>
                    {['测试人员', '备份人员', '流程', '房间', '项目编号', '项目名称', '样本量', '访视时间点', '执行日期'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPersonRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-slate-500 text-center">
                        <p>按人员：暂无匹配数据。</p>
                        <p className="text-xs mt-1">请在「人员排程」中填写执行/备份/房间，或调整筛选条件。</p>
                      </td>
                    </tr>
                  ) : (
                    filteredPersonRows.map((r, i) => (
                      <tr key={i} className={clsx('border-b', isDark ? 'border-slate-700' : 'border-slate-100')}>
                        <td className="px-3 py-2">{r.tester}</td>
                        <td className="px-3 py-2">{r.backup}</td>
                        <td className="px-3 py-2">{r.process}</td>
                        <td className="px-3 py-2">{r.room}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.projectCode}</td>
                        <td className="px-3 py-2">{r.projectName}</td>
                        <td className="px-3 py-2">{r.sample}</td>
                        <td className="px-3 py-2">{r.visitTimepoint}</td>
                        <td className="px-3 py-2 text-xs whitespace-pre-wrap">{r.execDate}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeView === 'byDate' && (
          <div className="mt-4 space-y-3">
            {/*
              Input 根节点为 w-full，需用定宽容器包住日期框，否则在 flex 里会各占一整行。
              开始日期、结束日期、关键词三框与导出按钮同一行横向排列（窄屏自动换行）。
            */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-1 flex-wrap items-end gap-2 min-w-0">
                <div className="w-[148px] shrink-0">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className={clsx(isDark && 'bg-slate-900/40 border-slate-600')}
                    placeholder="开始日期"
                  />
                </div>
                <div className="w-[148px] shrink-0">
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className={clsx(isDark && 'bg-slate-900/40 border-slate-600')}
                    placeholder="结束日期"
                  />
                </div>
                <div className="flex-1 min-w-[min(100%,200px)] basis-[200px]">
                  <Input
                    placeholder="筛选：执行日期、项目编号、测试人员、房间等"
                    value={dateKeyword}
                    onChange={(e) => setDateKeyword(e.target.value)}
                    className={isDark ? 'bg-slate-900/40 border-slate-600' : undefined}
                  />
                </div>
              </div>
              {exportScheduleButton}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[960px]">
                <thead>
                  <tr className={clsx('border-b', isDark ? 'border-slate-600' : 'border-slate-200')}>
                    {['执行日期', '访视时间点', '样本量', '项目编号', '项目名称', '测试人员', '备份人员', '房间'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDateRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-slate-500 text-center">
                        <p>按日期：暂无匹配数据。</p>
                        <p className="text-xs mt-1">请为流程填写执行日期，或调整日期范围 / 关键词筛选。</p>
                      </td>
                    </tr>
                  ) : (
                    filteredDateRows.map((r, i) => (
                      <tr key={i} className={clsx('border-b', isDark ? 'border-slate-700' : 'border-slate-100')}>
                        <td className="px-3 py-2 whitespace-nowrap">{r.execDate}</td>
                        <td className="px-3 py-2">{r.visitTimepoint}</td>
                        <td className="px-3 py-2">{r.sample}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.projectCode}</td>
                        <td className="px-3 py-2">{r.projectName}</td>
                        <td className="px-3 py-2">{r.tester}</td>
                        <td className="px-3 py-2">{r.backup}</td>
                        <td className="px-3 py-2">{r.room}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
