/**
 * 人员排程：行政 / 评估 / 技术三 Tab；流程按名称归入对应模块（见 personnelProcessTab），每类流程填写执行人员、备份人员、房间。
 * 路由：/scheduling/schedule-core/:executionOrderId/personnel（时间线已保存后可进入）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Button, Modal } from '@cn-kis/ui-kit'
import { ArrowLeft, ClipboardList, Users, Wrench, Save } from 'lucide-react'
import { schedulingApi } from '@cn-kis/api-client'
import { useTheme } from '../contexts/ThemeContext'
import {
  getProcessIndicesForTab,
  isPersonnelTabFilled,
  type PersonnelTabKey,
} from '../utils/personnelProcessTab'
import { getFirstRowAsDict } from '../utils/executionOrderFirstRow'

type VisitBlock = {
  visit_point?: string
  processes?: Array<{ code?: string; process?: string; sample_size?: string; exec_dates?: string[] }>
}

export type PersonnelProcessRow = { executor: string; backup: string; room: string }
export type PersonnelBlock = { visit_point: string; processes: PersonnelProcessRow[] }

function getByKeys(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]?.trim()
    if (v) return v
  }
  return ''
}

function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue
    const s = String(v).trim()
    if (s !== '') return s
  }
  return ''
}

/** 表头与模板不完全一致时，按列名关键词匹配首行 */
function scanFirstRowByKeyPattern(row: Record<string, string>, re: RegExp): string {
  for (const [k, v] of Object.entries(row)) {
    if (!v?.trim()) continue
    const nk = k.trim()
    if (re.test(nk)) return v.trim()
  }
  return ''
}

/** 与后端时间槽快照一致：用各访视点 visit_point 拼接 */
function visitTimepointsFromVisitBlocks(blocks: VisitBlock[]): string {
  const pts = blocks.map((b) => (b.visit_point ?? '').trim()).filter(Boolean)
  if (pts.length === 0) return ''
  return [...new Set(pts)].join('，')
}

/** 订单无样本量时，从各流程 sample_size 数字汇总作展示兜底 */
function sampleTotalHintFromVisitBlocks(blocks: VisitBlock[]): string {
  let sum = 0
  for (const b of blocks) {
    for (const p of b.processes ?? []) {
      const n = parseInt(String(p.sample_size ?? '').replace(/\s/g, ''), 10)
      if (!Number.isNaN(n) && n > 0) sum += n
    }
  }
  return sum > 0 ? String(sum) : ''
}

function emptyBlocksForTab(visitBlocks: VisitBlock[], tab: PersonnelTabKey): PersonnelBlock[] {
  const indices = getProcessIndicesForTab(visitBlocks, tab)
  return visitBlocks.map((b, bi) => ({
    visit_point: (b.visit_point ?? '').trim(),
    processes: indices[bi].map(() => ({ executor: '', backup: '', room: '' })),
  }))
}

function mergePersonnel(
  visitBlocks: VisitBlock[],
  existing: { admin?: PersonnelBlock[]; eval?: PersonnelBlock[]; tech?: PersonnelBlock[] } | undefined
): { admin: PersonnelBlock[]; eval: PersonnelBlock[]; tech: PersonnelBlock[] } {
  const keys = ['admin', 'eval', 'tech'] as const
  const out = {
    admin: emptyBlocksForTab(visitBlocks, 'admin'),
    eval: emptyBlocksForTab(visitBlocks, 'eval'),
    tech: emptyBlocksForTab(visitBlocks, 'tech'),
  }
  for (const k of keys) {
    const prev = existing?.[k]
    if (!prev || !Array.isArray(prev) || prev.length !== visitBlocks.length) continue
    const idxList = getProcessIndicesForTab(visitBlocks, k)
    out[k] = out[k].map((blk, bi) => {
      const pb = prev[bi]
      if (!pb || !Array.isArray(pb.processes)) return blk
      const vlen = (visitBlocks[bi]?.processes ?? []).length
      const legacyFull = pb.processes.length === vlen && vlen > 0
      return {
        visit_point: blk.visit_point,
        processes: blk.processes.map((def, j) => {
          const globalPi = idxList[bi][j]
          const row = legacyFull ? pb.processes[globalPi] : pb.processes[j]
          if (!row || typeof row !== 'object') return def
          return {
            executor: String((row as PersonnelProcessRow).executor ?? ''),
            backup: String((row as PersonnelProcessRow).backup ?? ''),
            room: String((row as PersonnelProcessRow).room ?? ''),
          }
        }),
      }
    })
  }
  return out
}

type TabKey = PersonnelTabKey

export default function SchedulePersonnelPage() {
  const { executionOrderId } = useParams<{ executionOrderId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const orderId = executionOrderId ? parseInt(executionOrderId, 10) : NaN

  const [activeTab, setActiveTab] = useState<TabKey>('admin')
  const [personnel, setPersonnel] = useState<{
    admin: PersonnelBlock[]
    eval: PersonnelBlock[]
    tech: PersonnelBlock[]
  }>({ admin: [], eval: [], tech: [] })
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [personnelTabsSaved, setPersonnelTabsSaved] = useState({
    admin: false,
    eval: false,
    tech: false,
  })

  const { data: orderRes, isLoading: orderLoading } = useQuery({
    queryKey: ['scheduling', 'execution-order', orderId],
    queryFn: () => schedulingApi.getExecutionOrderById(orderId),
    enabled: Number.isInteger(orderId),
  })

  const { data: scheduleRes, isLoading: scheduleLoading } = useQuery({
    queryKey: ['scheduling', 'schedule-core', orderId],
    queryFn: () => schedulingApi.getScheduleCore(orderId),
    enabled: Number.isInteger(orderId),
  })

  // 与 ScheduleCorePage 一致：api 返回 { code, msg, data: { id, headers, rows } }，勿用 .data.data
  const orderPayload =
    (orderRes as { data?: { data?: { id?: number; headers?: string[]; rows?: unknown[] } } })?.data?.data
    ?? (orderRes as { data?: { id?: number; headers?: string[]; rows?: unknown[] } })?.data
  const schedule = (
    (scheduleRes as { data?: { data?: Record<string, unknown> } })?.data?.data
    ?? (scheduleRes as { data?: Record<string, unknown> })?.data
  ) as
    | {
        status?: string
        payload?: Record<string, unknown>
        post_publish_edit_count?: number
      }
    | undefined

  const headers = (orderPayload?.headers ?? []) as string[]
  const rows = (orderPayload?.rows ?? []) as unknown[]
  const firstRow = getFirstRowAsDict(headers, rows)
  const payload = (schedule?.payload ?? {}) as {
    visit_blocks?: VisitBlock[]
    personnel?: Record<string, PersonnelBlock[]>
    personnel_tabs_saved?: { admin?: boolean; eval?: boolean; tech?: boolean }
  }
  const visitBlocks = payload.visit_blocks ?? []

  const personnelTabsSavedKey = JSON.stringify(payload.personnel_tabs_saved ?? null)
  useEffect(() => {
    const pts = payload.personnel_tabs_saved
    setPersonnelTabsSaved({
      admin: !!pts?.admin,
      eval: !!pts?.eval,
      tech: !!pts?.tech,
    })
  }, [orderId, personnelTabsSavedKey])

  const isTimelinePublished =
    schedule?.status === 'timeline_published' || schedule?.status === 'completed'

  const personnelServerKey = JSON.stringify((payload.personnel as unknown) ?? null)
  useEffect(() => {
    if (!visitBlocks.length) return
    const merged = mergePersonnel(visitBlocks, payload.personnel as any)
    setPersonnel(merged)
  }, [orderId, visitBlocks.length, personnelServerKey])

  const updateMutation = useMutation({
    mutationFn: (body: { payload: Record<string, unknown> }) =>
      schedulingApi.updateScheduleCore(orderId, { payload: body.payload }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'schedule-core', orderId] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'timeline-published'] })
      const wrap = res as { data?: { status?: string } }
      if (wrap?.data?.status === 'completed') {
        window.alert('三个模块均已分别保存且人员信息填写完整，系统已自动发布。')
      }
    },
  })

  const withdrawMutation = useMutation({
    mutationFn: () => schedulingApi.withdrawSchedulePersonnelForReedit(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'schedule-core', orderId] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'timeline-published'] })
      setWithdrawOpen(false)
      window.alert('已撤回，可继续编辑人员排程。')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { msg?: string } } })?.response?.data?.msg ?? '撤回失败'
      window.alert(msg)
    },
  })

  const setProcessField = useCallback(
    (tab: TabKey, blockIdx: number, procIdx: number, field: keyof PersonnelProcessRow, value: string) => {
      setPersonnelTabsSaved((s) => ({ ...s, [tab]: false }))
      setPersonnel((prev) => {
        const next = { ...prev, [tab]: prev[tab].map((b) => ({ ...b, processes: [...b.processes] })) }
        const block = next[tab][blockIdx]
        if (!block) return prev
        const procs = [...block.processes]
        procs[procIdx] = { ...procs[procIdx], [field]: value }
        next[tab][blockIdx] = { ...block, processes: procs }
        return next
      })
    },
    []
  )

  const buildMergedPayload = useCallback(() => {
    const pl = typeof schedule?.payload === 'object' && schedule?.payload ? { ...schedule.payload } : {}
    return {
      ...pl,
      personnel: {
        admin: personnel.admin,
        eval: personnel.eval,
        tech: personnel.tech,
      },
    }
  }, [schedule?.payload, personnel])

  const handleSaveTab = (tab: TabKey) => {
    if (!isPersonnelTabFilled(visitBlocks, personnel[tab], tab)) {
      window.alert('请在本模块为每条流程填写执行人员、备份人员、房间后再保存。')
      return
    }
    const merged = {
      ...buildMergedPayload(),
      personnel_tabs_saved: {
        ...personnelTabsSaved,
        [tab]: true,
      },
    }
    updateMutation.mutate({ payload: merged })
  }

  const firstRowSnapshot = JSON.stringify(firstRow)

  const projectCodeDisplay = useMemo(
    () =>
      firstNonEmpty(
        getByKeys(firstRow, '项目编号', '订单编号', '询期编号', '协议编号', '协议号', '项目代码'),
        scanFirstRowByKeyPattern(firstRow, /项目编号|询期编号|协议编号|协议号|Protocol|Study\s*ID/i),
      ),
    [firstRowSnapshot]
  )

  const sampleDisplay = useMemo(
    () =>
      firstNonEmpty(
        getByKeys(firstRow, '样本量', '样本数量', '备份样本量', '最大样本量'),
        scanFirstRowByKeyPattern(firstRow, /^样本量$|^样本数$|样本数量|备份样本|总样本/i),
        sampleTotalHintFromVisitBlocks(visitBlocks),
      ),
    [firstRowSnapshot, visitBlocks]
  )

  const visitTpDisplay = useMemo(
    () =>
      firstNonEmpty(
        getByKeys(firstRow, '访视时间点', '访视时间', '访视计划', '访视点'),
        scanFirstRowByKeyPattern(firstRow, /访视时间|访视点|访视计划|visit\s*time/i),
        visitTimepointsFromVisitBlocks(visitBlocks),
      ),
    [firstRowSnapshot, visitBlocks]
  )

  const tabDefs: { key: TabKey; label: string; icon: typeof ClipboardList }[] = [
    { key: 'admin', label: '行政', icon: ClipboardList },
    { key: 'eval', label: '评估', icon: Users },
    { key: 'tech', label: '技术', icon: Wrench },
  ]

  const editUsed = schedule?.post_publish_edit_count ?? 0
  const canWithdraw =
    schedule?.status === 'completed' && (editUsed ?? 0) < 3

  if (!Number.isInteger(orderId)) {
    return (
      <div className="p-6">
        <Button variant="secondary" onClick={() => navigate('/scheduling')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回
        </Button>
        <p className="mt-4 text-slate-500">无效的执行订单 ID</p>
      </div>
    )
  }

  if (orderLoading || scheduleLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse text-slate-500">加载中…</div>
      </div>
    )
  }

  if (!isTimelinePublished) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="secondary" onClick={() => navigate(`/scheduling/schedule-core/${orderId}`)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回排程核心
        </Button>
        <p className="text-slate-600 dark:text-slate-400">
          请先在该执行订单的「项目排期」中保存并发布时间线后，再进入人员排程。
        </p>
      </div>
    )
  }

  if (!visitBlocks.length) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="secondary" onClick={() => navigate(`/scheduling/schedule-core/${orderId}`)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> 返回排程核心
        </Button>
        <p className="text-amber-600 dark:text-amber-400">项目排期中暂无访视点与流程，请先在排程核心页维护项目排期。</p>
      </div>
    )
  }

  const currentBlocks = personnel[activeTab]

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => navigate(`/scheduling/schedule-core/${orderId}`)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> 返回排程核心
          </Button>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-200">人员排程</h1>
        </div>
        {canWithdraw && (
          <Button variant="secondary" size="sm" onClick={() => setWithdrawOpen(true)}>
            撤回再编辑（已用 {editUsed}/3 次）
          </Button>
        )}
      </div>

      <section
        className={clsx(
          'rounded-xl border p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm',
          isDark ? 'border-[#3b434e] bg-slate-800/50' : 'border-slate-200 bg-white'
        )}
      >
        <div>
          <span className="text-slate-500 dark:text-slate-400">项目编号</span>
          <p className="font-medium text-slate-800 dark:text-slate-100">{projectCodeDisplay || '—'}</p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">样本量</span>
          <p className="font-medium text-slate-800 dark:text-slate-100">{sampleDisplay || '—'}</p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">访视时间点</span>
          <p className="font-medium text-slate-800 dark:text-slate-100 break-all">{visitTpDisplay || '—'}</p>
        </div>
      </section>

      <div className="flex gap-2 border-b border-slate-200 dark:border-[#3b434e] pb-px flex-wrap">
        {tabDefs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={clsx(
              'shrink-0 min-h-10 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors flex items-center gap-1.5 flex-wrap',
              activeTab === key
                ? 'bg-primary-600 text-white dark:bg-primary-500'
                : 'bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700'
            )}
          >
            <Icon className="w-4 h-4" /> {label}
            <span
              className={clsx(
                'text-[10px] font-normal px-1.5 py-0.5 rounded',
                activeTab === key
                  ? 'bg-white/20 text-white'
                  : personnelTabsSaved[key]
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-200/80 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
              )}
            >
              {personnelTabsSaved[key] ? '已保存' : '待保存'}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {currentBlocks.map((block, blockIdx) => {
          const tabIndices = getProcessIndicesForTab(visitBlocks, activeTab)[blockIdx]
          return (
          <div
            key={blockIdx}
            className={clsx(
              'rounded-xl border p-4',
              isDark ? 'border-[#3b434e] bg-slate-800/50' : 'border-slate-200 bg-white'
            )}
          >
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              访视点：{block.visit_point || `访视 ${blockIdx + 1}`}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm border-collapse">
                <thead>
                  <tr className={clsx('border-b', isDark ? 'border-slate-600' : 'border-slate-200')}>
                    <th className="px-2 py-2 text-left">流程</th>
                    <th className="px-2 py-2 text-left">执行人员</th>
                    <th className="px-2 py-2 text-left">备份人员</th>
                    <th className="px-2 py-2 text-left">房间</th>
                  </tr>
                </thead>
                <tbody>
                  {tabIndices.length === 0 ? (
                    <tr className={clsx('border-b', isDark ? 'border-slate-700' : 'border-slate-100')}>
                      <td colSpan={4} className="px-2 py-3 text-slate-500 dark:text-slate-400">
                        本访视点下暂无本模块流程
                      </td>
                    </tr>
                  ) : null}
                  {tabIndices.map((globalProcIdx, rowIdx) => {
                    const proc = visitBlocks[blockIdx]?.processes?.[globalProcIdx]
                    const pname =
                      (proc?.process || proc?.code || '').trim() || `流程 ${globalProcIdx + 1}`
                    const row = block.processes[rowIdx] ?? { executor: '', backup: '', room: '' }
                    return (
                      <tr key={`${globalProcIdx}-${rowIdx}`} className={clsx('border-b', isDark ? 'border-slate-700' : 'border-slate-100')}>
                        <td className="px-2 py-2 align-top text-slate-700 dark:text-slate-200">{pname}</td>
                        <td className="px-2 py-2">
                          <input
                            className={clsx(
                              'w-full min-h-9 rounded border px-2 text-sm',
                              isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white'
                            )}
                            value={row.executor}
                            onChange={(e) =>
                              setProcessField(activeTab, blockIdx, rowIdx, 'executor', e.target.value)
                            }
                            placeholder="执行人员"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={clsx(
                              'w-full min-h-9 rounded border px-2 text-sm',
                              isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white'
                            )}
                            value={row.backup}
                            onChange={(e) =>
                              setProcessField(activeTab, blockIdx, rowIdx, 'backup', e.target.value)
                            }
                            placeholder="备份人员"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            className={clsx(
                              'w-full min-h-9 rounded border px-2 text-sm',
                              isDark ? 'border-[#3b434e] bg-slate-700 text-slate-200' : 'border-slate-200 bg-white'
                            )}
                            value={row.room}
                            onChange={(e) =>
                              setProcessField(activeTab, blockIdx, rowIdx, 'room', e.target.value)
                            }
                            placeholder="房间"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )
        })}
      </div>

      <div
        className={clsx(
          'flex flex-wrap gap-2 items-center mt-6 pt-4 border-t',
          isDark ? 'border-[#3b434e]' : 'border-slate-200'
        )}
      >
        <Button
          variant="primary"
          onClick={() => handleSaveTab(activeTab)}
          disabled={updateMutation.isPending}
        >
          <Save className="w-4 h-4 mr-1" />
          {updateMutation.isPending ? '保存中…' : '保存'}
        </Button>
      </div>

      <Modal
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        title="撤回再编辑"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setWithdrawOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => withdrawMutation.mutate()}
              disabled={withdrawMutation.isPending}
            >
              {withdrawMutation.isPending ? '处理中…' : '确认撤回'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          撤回后行政、评估、技术发布标记将清除，可继续编辑。发布后合计最多可撤回再编辑 3 次（当前已用 {editUsed} 次）。
        </p>
      </Modal>
    </div>
  )
}
