/**
 * 线下时间线排程页：数据来源=线下的排程计划，执行日期/天数固定（来自上传），仅编辑流程，样本量按线上规则计算
 * 路由：/scheduling/schedule-offline/:planId
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@cn-kis/ui-kit'
import { ArrowLeft, Save, Calendar, Plus, Trash2 } from 'lucide-react'
import { schedulingApi } from '@cn-kis/api-client'
import { useTheme } from '../contexts/ThemeContext'

interface ProcessRow {
  code: string
  process: string
  sample_size: string
  exec_dates: string[]
}

interface VisitBlock {
  visit_point: string
  processes: ProcessRow[]
}

interface Segment {
  label?: string
  dayCount?: number
  startDate?: string
  endDate?: string
  formattedDates?: string
  /** 实际执行日期列表（非连续时与 startDate+dayCount 不同） */
  dates?: string[]
}

/** 解析 formattedDates 中文格式为 YYYY-MM-DD 数组，如 "2026年4月6日、2026年4月8日" */
function parseFormattedDatesToArray(formattedDates: string): string[] {
  if (!formattedDates || typeof formattedDates !== 'string') return []
  const parts = formattedDates.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
  const out: string[] = []
  const re = /(\d{4})年(\d{1,2})月(\d{1,2})日/
  for (const p of parts) {
    const m = p.match(re)
    if (m) {
      const y = parseInt(m[1], 10)
      const month = parseInt(m[2], 10) - 1
      const day = parseInt(m[3], 10)
      const d = new Date(y, month, day)
      if (!Number.isNaN(d.getTime())) out.push(d.toISOString().slice(0, 10))
    }
  }
  return out
}

/** 从 segment 取执行日期：优先用 dates，否则解析 formattedDates，否则按 startDate+dayCount 连续天 */
function getExecDatesFromSegment(seg: Segment): string[] {
  if (seg.dates && Array.isArray(seg.dates) && seg.dates.length > 0) {
    return seg.dates.map((d) => String(d).trim().slice(0, 10)).filter(Boolean)
  }
  const fromFormatted = parseFormattedDatesToArray(seg.formattedDates || '')
  if (fromFormatted.length > 0) return fromFormatted
  const start = seg.startDate ? String(seg.startDate).trim().slice(0, 10) : ''
  const k = Math.max(1, Number(seg.dayCount) || 1)
  if (!start) return Array.from({ length: k }, () => '')
  const out: string[] = []
  const d = new Date(start)
  for (let i = 0; i < k; i++) {
    const x = new Date(d)
    x.setDate(d.getDate() + i)
    out.push(x.toISOString().slice(0, 10))
  }
  return out
}

/** 线下：按块用 segment.dayCount 作为 splitDays 计算样本量（与线上规则一致：ceil(maxSample/splitDays)） */
function fillSampleSizesOffline(
  blocks: VisitBlock[],
  maxSample: number,
  segmentDayCounts: number[],
): VisitBlock[] {
  if (maxSample <= 0) return blocks
  return blocks.map((block, i) => {
    const splitDays = segmentDayCounts[i] ?? 1
    const base = Math.ceil(maxSample / splitDays)
    return {
      ...block,
      processes: block.processes.map((p) => ({
        ...p,
        sample_size: String(base),
      })),
    }
  })
}

export default function ScheduleOfflinePage() {
  const { planId: planIdParam } = useParams<{ planId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const planId = planIdParam ? parseInt(planIdParam, 10) : NaN

  const { data: detailRes, isLoading, error } = useQuery({
    queryKey: ['scheduling', 'timeline-published-detail', planId],
    queryFn: () => schedulingApi.getTimelinePublishedDetail(planId),
    enabled: Number.isInteger(planId),
  })

  const detail = (detailRes as { data?: Record<string, unknown> })?.data
  const snapshot = (detail?.snapshot || {}) as Record<string, unknown>
  const sourceType = (detail?.source_type as string) ?? 'online'
  const segments = (snapshot.segments || []) as Segment[]
  const existingVisitBlocks = (snapshot.visit_blocks || []) as VisitBlock[]

  const maxSample = useMemo(() => Math.max(0, Number(snapshot.样本量) || 0), [snapshot.样本量])
  const segmentDayCounts = useMemo(() => segments.map((s) => Math.max(1, Number(s.dayCount) || 1)), [segments])

  const initialBlocks = useMemo((): VisitBlock[] => {
    if (existingVisitBlocks.length >= segments.length) {
      return existingVisitBlocks.slice(0, segments.length).map((b, i) => {
        const seg = segments[i]
        const execDates = getExecDatesFromSegment(seg || {})
        return {
          visit_point: b.visit_point ?? (seg?.label ?? ''),
          processes: (b.processes || []).map((p) => ({
            code: p.code ?? '',
            process: p.process ?? '',
            sample_size: p.sample_size != null ? String(p.sample_size) : '',
            exec_dates: Array.isArray(p.exec_dates) && p.exec_dates.length >= execDates.length
              ? p.exec_dates.slice(0, execDates.length)
              : execDates,
          })),
        }
      })
    }
    return segments.map((seg, i) => {
      const execDates = getExecDatesFromSegment(seg)
      const existing = existingVisitBlocks[i]
      const processes: ProcessRow[] = existing?.processes?.length
        ? existing.processes.map((p) => ({
            code: p.code ?? '',
            process: p.process ?? '',
            sample_size: p.sample_size != null ? String(p.sample_size) : '',
            exec_dates: execDates,
          }))
        : [{ code: '', process: '', sample_size: '', exec_dates: execDates }]
      return {
        visit_point: (seg?.label ?? existing?.visit_point ?? '').trim() || `访视${i + 1}`,
        processes,
      }
    })
  }, [segments, existingVisitBlocks])

  const [visitBlocks, setVisitBlocks] = useState<VisitBlock[]>(initialBlocks)
  const hasSyncedRef = useRef(false)
  useEffect(() => {
    if (!detail || segments.length === 0 || hasSyncedRef.current) return
    hasSyncedRef.current = true
    setVisitBlocks(initialBlocks)
  }, [detail, segments.length, initialBlocks])
  useEffect(() => {
    hasSyncedRef.current = false
  }, [planId])

  const blocksWithSampleSize = useMemo(
    () => fillSampleSizesOffline(visitBlocks, maxSample, segmentDayCounts),
    [visitBlocks, maxSample, segmentDayCounts],
  )

  const updateMutation = useMutation({
    mutationFn: (payload: { visit_blocks: VisitBlock[] }) =>
      schedulingApi.updateTimelinePublished(planId, {
        visit_blocks: payload.visit_blocks as unknown as Record<string, unknown>[],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'timeline-published-detail', planId] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'timeline-published'] })
    },
  })

  const addProcess = useCallback((blockIndex: number) => {
    setVisitBlocks((prev) => {
      const next = [...prev]
      const block = next[blockIndex]
      if (!block) return prev
      const firstProcess = block.processes[0]
      const execDates = firstProcess?.exec_dates?.length ? [...firstProcess.exec_dates] : []
      next[blockIndex] = {
        ...block,
        processes: [
          ...block.processes,
          { code: '', process: '', sample_size: '', exec_dates: execDates },
        ],
      }
      return next
    })
  }, [])

  const removeProcess = useCallback((blockIndex: number, processIndex: number) => {
    setVisitBlocks((prev) => {
      const next = [...prev]
      const block = next[blockIndex]
      if (!block || block.processes.length <= 1) return prev
      next[blockIndex] = {
        ...block,
        processes: block.processes.filter((_, i) => i !== processIndex),
      }
      return next
    })
  }, [])

  const setProcessRow = useCallback((blockIndex: number, processIndex: number, field: 'code' | 'process', value: string) => {
    setVisitBlocks((prev) => {
      const next = prev.map((b) => ({ ...b, processes: b.processes.map((p) => ({ ...p })) }))
      const block = next[blockIndex]
      if (!block || !block.processes[processIndex]) return prev
      const p = block.processes[processIndex]
      if (field === 'code') p.code = value
      else p.process = value
      return next
    })
  }, [])

  const handleSave = useCallback(() => {
    const toSave = fillSampleSizesOffline(visitBlocks, maxSample, segmentDayCounts)
    updateMutation.mutate(
      { visit_blocks: toSave },
      {
        onSuccess: () => {},
      },
    )
  }, [visitBlocks, maxSample, segmentDayCounts, updateMutation])

  const handleSaveAndGoToPersonnel = useCallback(() => {
    const toSave = fillSampleSizesOffline(visitBlocks, maxSample, segmentDayCounts)
    updateMutation.mutate(
      { visit_blocks: toSave },
      {
        onSuccess: () => navigate(`/scheduling/timeslot/${planId}`),
      },
    )
  }, [visitBlocks, maxSample, segmentDayCounts, updateMutation, navigate, planId])

  if (!Number.isInteger(planId)) {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500">无效的计划 ID</p>
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

  if (sourceType !== 'offline') {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500">该记录为线上来源，请从时间槽列表进入时间槽详情页</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回排程计划
        </Button>
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-200 truncate">
          {String(snapshot.项目名称 || snapshot.项目编号 || snapshot.询期编号 || '线下排程')}
        </h1>
      </div>

      {/* 项目信息只读 */}
      <section
        className={`rounded-xl border p-4 ${isDark ? 'border-[#3b434e] bg-slate-800/50' : 'border-slate-200 bg-white'}`}
      >
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">项目信息（只读，来自上传）</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-slate-500 dark:text-slate-400">项目编号</span>
            <p className="text-slate-800 dark:text-slate-200">{String(snapshot.项目编号 ?? '-')}</p>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">项目名称</span>
            <p className="text-slate-800 dark:text-slate-200 truncate">{String(snapshot.项目名称 ?? '-')}</p>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">组别</span>
            <p className="text-slate-800 dark:text-slate-200">{String(snapshot.组别 ?? '-')}</p>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">样本量</span>
            <p className="text-slate-800 dark:text-slate-200">{String(snapshot.样本量 ?? '-')}</p>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">督导</span>
            <p className="text-slate-800 dark:text-slate-200">{String(snapshot.督导 ?? '-')}</p>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">访视时间点</span>
            <p className="text-slate-800 dark:text-slate-200 text-xs truncate max-w-[200px]">{String(snapshot.访视时间点 ?? '-')}</p>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">项目开始时间</span>
            <p className="text-slate-800 dark:text-slate-200">{String(snapshot.项目开始时间 ?? '-')}</p>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">项目结束时间</span>
            <p className="text-slate-800 dark:text-slate-200">{String(snapshot.项目结束时间 ?? '-')}</p>
          </div>
        </div>
      </section>

      {/* 流程安排：访视点与执行日期只读，仅编辑流程 */}
      <section
        className={`rounded-xl border p-4 ${isDark ? 'border-[#3b434e] bg-slate-800/50' : 'border-slate-200 bg-white'}`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-4 h-4" /> 流程安排（执行日期、天数已固定，请填写流程）
          </h2>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              <Save className="w-4 h-4 mr-1" /> 保存
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveAndGoToPersonnel}
              disabled={updateMutation.isPending}
            >
              <Save className="w-4 h-4 mr-1" /> 保存并进入人员排程
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          {blocksWithSampleSize.map((block, blockIdx) => {
            const seg = segments[blockIdx]
            const execDates = getExecDatesFromSegment(seg || {})
            return (
              <div
                key={blockIdx}
                className={`rounded-lg border p-3 ${isDark ? 'border-[#3b434e]' : 'border-slate-200'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    访视点：{block.visit_point}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    执行日期（只读）：{execDates[0] || '-'}
                    {execDates.length > 1 ? ` 共 ${execDates.length} 天` : ''}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                        <th className="border p-2 text-left w-24">编号</th>
                        <th className="border p-2 text-left">流程名称</th>
                        <th className="border p-2 text-left w-20">样本量</th>
                        <th className="border p-2 w-16" />
                      </tr>
                    </thead>
                    <tbody>
                      {block.processes.map((p, pIdx) => (
                        <tr key={pIdx}>
                          <td className="border p-1">
                            <input
                              type="text"
                              value={p.code}
                              onChange={(e) => setProcessRow(blockIdx, pIdx, 'code', e.target.value)}
                              className={`w-full min-w-0 px-2 py-1 rounded border text-sm ${isDark ? 'bg-slate-800 border-[#3b434e] text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
                              placeholder="编号"
                            />
                          </td>
                          <td className="border p-1">
                            <input
                              type="text"
                              value={p.process}
                              onChange={(e) => setProcessRow(blockIdx, pIdx, 'process', e.target.value)}
                              className={`w-full min-w-0 px-2 py-1 rounded border text-sm ${isDark ? 'bg-slate-800 border-[#3b434e] text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
                              placeholder="流程名称"
                            />
                          </td>
                          <td className="border p-2 text-slate-600 dark:text-slate-400">{p.sample_size || '-'}</td>
                          <td className="border p-1">
                            {block.processes.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeProcess(blockIdx, pIdx)}
                                className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                title="删除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  onClick={() => addProcess(blockIdx)}
                  className="mt-2 text-sm text-primary-600 dark:text-primary-400 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> 添加流程
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
