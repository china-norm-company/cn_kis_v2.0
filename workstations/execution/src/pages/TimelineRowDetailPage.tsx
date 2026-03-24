/**
 * 时间线一条记录详情页：查看/编辑 → 保存 → 发布 → 对应排程计划一条记录
 * 路由：/scheduling/timeline/:rowId
 *
 * 详情页结构：
 * - 项目编号、测量时间点（顶栏）
 * - 访视时间点：不显示日期，每个时间点下 3 个 Tab（行政、技术、评估），每 Tab 内 测试流程、样本量、人员、房间
 * - 样本量：基于项目总样本量计算，只读
 */
import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { schedulingApi } from '@cn-kis/api-client'
import { Button, Card, Tabs } from '@cn-kis/ui-kit'
import { ArrowLeft, Save, Send } from 'lucide-react'
import type { TimelineRow } from '../utils/timelineTableMapping'

type SegmentWithFields = TimelineRow['segments'][number]

const VISIT_TABS = [{ key: '行政', label: '行政' }, { key: '技术', label: '技术' }, { key: '评估', label: '评估' }] as const
type VisitTabKey = (typeof VISIT_TABS)[number]['key']

const SEGMENT_FIELDS: { key: '测试流程' | '人员' | '房间'; label: string }[] = [
  { key: '测试流程', label: '测试流程' },
  { key: '人员', label: '人员' },
  { key: '房间', label: '房间' },
]

export default function TimelineRowDetailPage() {
  const { rowId } = useParams<{ rowId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const stateRow = (location.state as { row?: TimelineRow })?.row

  const [row, setRow] = useState<TimelineRow | null>(stateRow ?? null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<TimelineRow>>({})
  const [activeVisitTab, setActiveVisitTab] = useState<VisitTabKey>('行政')

  const { data: uploadRes } = useQuery({
    queryKey: ['scheduling', 'timeline-upload'],
    queryFn: () => schedulingApi.getTimelineUpload(),
    enabled: !stateRow && !!rowId,
  })
  const uploadItems: TimelineRow[] = ((uploadRes as any)?.data?.items ?? []) as TimelineRow[]

  useEffect(() => {
    if (stateRow) {
      setRow(stateRow)
      setForm({ ...stateRow, segments: stateRow.segments?.map((s) => ({ ...s })) ?? [] })
      return
    }
    if (!rowId || uploadItems.length === 0) return
    const found = uploadItems.find((r) => r.id === decodeURIComponent(rowId))
    if (found) {
      setRow(found)
      setForm({ ...found, segments: found.segments?.map((s) => ({ ...s })) ?? [] })
    }
  }, [stateRow, rowId, uploadItems])

  const saveMutation = useMutation({
    mutationFn: (rows: TimelineRow[]) => schedulingApi.saveTimelineUpload(rows),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'timeline-upload'] })
      setEditing(false)
      if (row && row.id) setRow({ ...row, ...form, segments: form.segments ?? row.segments } as TimelineRow)
    },
  })

  const publishMutation = useMutation({
    mutationFn: (payload: TimelineRow) => schedulingApi.publishTimelineRow(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'plans'] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'timeline-published'] })
      navigate('/scheduling', { state: { tab: 'plans' } })
    },
  })

  const handleSave = () => {
    if (!row) return
    const updated: TimelineRow = {
      ...row,
      ...form,
      segments: (form.segments ?? row.segments) as TimelineRow['segments'],
    }
    const list = uploadItems.length ? uploadItems.map((r) => (r.id === row.id ? updated : r)) : [updated]
    saveMutation.mutate(list)
  }

  const handlePublish = () => {
    const target = row
      ? ({ ...row, ...form, segments: (form.segments ?? row.segments) as TimelineRow['segments'] } as TimelineRow)
      : null
    if (target) publishMutation.mutate(target)
  }

  const segments = (form.segments ?? row?.segments) ?? []

  /** 项目总样本量（来自列表/上传）；用于计算各段样本量 */
  const totalSampleSize = row?.样本量 ?? 0
  /** 单天样本量 = 项目总样本量 / 第一段天数（与 timeline 解析逻辑一致） */
  const samplePerDay = useMemo(() => {
    const firstDayCount = segments[0]?.dayCount || 1
    return firstDayCount > 0 ? totalSampleSize / firstDayCount : 0
  }, [totalSampleSize, segments])
  /** 某段的样本量 = 单天样本量 × 该段天数 */
  const getSegmentSampleSize = (seg: SegmentWithFields) =>
    Math.round(samplePerDay * (seg.dayCount || 0))

  const setSegmentValue = (segIndex: number, key: keyof SegmentWithFields, value: string | number) => {
    setForm((prev) => ({
      ...prev,
      segments: (prev.segments ?? row?.segments ?? []).map((s, i) =>
        i === segIndex ? { ...s, [key]: value } : s,
      ) as TimelineRow['segments'],
    }))
  }

  /** 当前 Tab 下某段的 测试流程/人员/房间（优先读 seg[tab]，兼容旧数据 seg 顶层的 测试流程/人员/房间） */
  const getTabData = (seg: SegmentWithFields, tabKey: VisitTabKey) => {
    const tab = seg[tabKey as keyof SegmentWithFields]
    if (tab && typeof tab === 'object' && !Array.isArray(tab)) {
      return { 测试流程: (tab as { 测试流程?: string }).测试流程 ?? '', 人员: (tab as { 人员?: string }).人员 ?? '', 房间: (tab as { 房间?: string }).房间 ?? '' }
    }
    return { 测试流程: seg.测试流程 ?? '', 人员: seg.人员 ?? '', 房间: seg.房间 ?? '' }
  }

  const setSegmentTabValue = (segIndex: number, tabKey: VisitTabKey, field: '测试流程' | '人员' | '房间', value: string) => {
    setForm((prev) => {
      const segs = prev.segments ?? row?.segments ?? []
      return {
        ...prev,
        segments: segs.map((s, i) => {
          if (i !== segIndex) return s
          const tab = (s as any)[tabKey] ?? {}
          return { ...s, [tabKey]: { ...tab, [field]: value } } as SegmentWithFields
        }) as TimelineRow['segments'],
      }
    })
  }

  if (!row && uploadItems.length === 0 && !stateRow) {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500">未找到该记录或时间线数据未加载</p>
      </div>
    )
  }

  if (!row) {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500">加载中...</p>
      </div>
    )
  }

  const inputCls =
    'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200'
  const blockCls =
    'text-sm text-slate-700 dark:text-slate-300 py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 min-h-[40px]'

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => navigate('/scheduling')}>
            <ArrowLeft className="w-4 h-4 mr-1" /> 返回
          </Button>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="secondary" onClick={() => setForm({ ...row, segments: row.segments?.map((s) => ({ ...s })) ?? [] })}>
                取消
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={saveMutation.isPending}>
                <Save className="w-4 h-4 mr-1" /> {saveMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              编辑
            </Button>
          )}
          <Button variant="primary" onClick={handlePublish} disabled={publishMutation.isPending}>
            <Send className="w-4 h-4 mr-1" /> {publishMutation.isPending ? '发布中...' : '发布'}
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mb-6">详情</h3>
        <div className="flex flex-col gap-6">
          {/* 项目编号 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400">项目编号</label>
            {editing ? (
              <input
                type="text"
                className={inputCls}
                value={form.项目编号 ?? row.项目编号 ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, 项目编号: e.target.value }))}
              />
            ) : (
              <p className={blockCls}>{row.项目编号 || '—'}</p>
            )}
          </div>
          {/* 测量时间点 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400">测量时间点</label>
            {editing ? (
              <input
                type="text"
                className={inputCls}
                value={form.测量时间点 ?? row.测量时间点 ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, 测量时间点: e.target.value }))}
              />
            ) : (
              <p className={blockCls}>{row.测量时间点 || '—'}</p>
            )}
          </div>
          {/* 访视时间点：标题下统一 3 个 Tab（行政/技术/评估），下方为各时间点内容 */}
          <div className="flex flex-col gap-4">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-400">访视时间点</label>
            {segments.length === 0 ? (
              <p className="text-sm text-slate-500 py-2">暂无访视时间点</p>
            ) : (
              <>
                <Tabs
                  tabs={[...VISIT_TABS]}
                  value={activeVisitTab}
                  onChange={(key) => setActiveVisitTab(key as VisitTabKey)}
                  className="dark:border-slate-600"
                />
                <div className="flex flex-col gap-6 pt-1">
                  {segments.map((seg, segIndex) => {
                    const tabData = getTabData(seg, activeVisitTab)
                    return (
                      <div
                        key={segIndex}
                        className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/30 p-4"
                      >
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-4">
                          {seg.label}
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          <div className="flex flex-col gap-1.5 min-w-0">
                            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
                              样本量
                            </label>
                            <p className={`${blockCls} truncate`} title={String(getSegmentSampleSize(seg))}>
                              {getSegmentSampleSize(seg)}
                            </p>
                          </div>
                          {SEGMENT_FIELDS.map(({ key, label }) => {
                            const value = tabData[key]
                            return (
                              <div key={key} className="flex flex-col gap-1.5 min-w-0">
                                <label className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
                                  {label}
                                </label>
                                {editing ? (
                                  <input
                                    type="text"
                                    className={`${inputCls} min-w-0`}
                                    value={value}
                                    onChange={(e) => setSegmentTabValue(segIndex, activeVisitTab, key, e.target.value)}
                                  />
                                ) : (
                                  <p className={`${blockCls} truncate`} title={value || undefined}>
                                    {value || '—'}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
