/**
 * 时间槽详情页：从 visit_blocks + schedule + personnel 汇总四维度排程状态
 * 人员排程页写入的是 payload.personnel（executor/备份/房间），不是 visit_blocks 上的 admin_person 等字段；
 * 汇总须与 personnelProcessTab / 后端 _personnel_tab_complete 一致。
 */

import type { PersonnelPayload } from './personnelProcessTab'
import { getProcessIndicesForTab, type PersonnelTabKey } from './personnelProcessTab'

export interface VisitBlockProcess {
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
}

export interface VisitBlockShape {
  visit_point?: string
  processes?: VisitBlockProcess[]
}

export interface ScheduleFlags {
  admin_published?: boolean
  eval_published?: boolean
  tech_published?: boolean
}

export type StatusVariant = 'success' | 'warning' | 'neutral' | 'muted'

export interface DimensionStatus {
  line1: string
  line2?: string
  variant: StatusVariant
}

export type { PersonnelPayload }

function iterProcesses(blocks: VisitBlockShape[]): VisitBlockProcess[] {
  const out: VisitBlockProcess[] = []
  for (const b of blocks) {
    for (const p of b.processes || []) out.push(p)
  }
  return out
}

function countExecDateCoverage(processes: VisitBlockProcess[]): { total: number; withDate: number } {
  let withDate = 0
  for (const p of processes) {
    const dates = (p.exec_dates || []).map((d) => String(d).trim()).filter(Boolean)
    if (dates.length > 0) withDate += 1
  }
  return { total: processes.length, withDate }
}

/** 与 isPersonnelTabFilled 一致：每条流程须执行+备份+房间均非空才算已填 */
function countPersonnelTabCompletion(
  visitBlocks: VisitBlockShape[],
  tabBlocks: Array<{ visit_point?: string; processes?: Array<{ executor?: string; backup?: string; room?: string }> }> | undefined,
  tab: PersonnelTabKey
): { filled: number; total: number } {
  if (!visitBlocks.length) return { filled: 0, total: 0 }
  if (!tabBlocks || tabBlocks.length !== visitBlocks.length) return { filled: 0, total: 0 }
  const idxList = getProcessIndicesForTab(visitBlocks, tab)
  let total = 0
  let filled = 0
  for (let bi = 0; bi < visitBlocks.length; bi++) {
    const expected = idxList[bi].length
    total += expected
    const processes = tabBlocks[bi]?.processes ?? []
    for (let j = 0; j < expected; j++) {
      const row = processes[j]
      const ex = (row?.executor ?? '').trim()
      const bu = (row?.backup ?? '').trim()
      const rm = (row?.room ?? '').trim()
      if (ex && bu && rm) filled += 1
    }
  }
  return { filled, total }
}

/** 旧数据：流程对象上直接写 admin_person / eval_person / tech_person */
function countRoleFromVisitBlocksLegacy(
  visitBlocks: VisitBlockShape[],
  tab: PersonnelTabKey
): { filled: number; total: number } {
  const idxList = getProcessIndicesForTab(visitBlocks, tab)
  let total = 0
  let filled = 0
  for (let bi = 0; bi < visitBlocks.length; bi++) {
    const procs = visitBlocks[bi].processes ?? []
    for (const pi of idxList[bi]) {
      total += 1
      const p = procs[pi]
      const pick =
        tab === 'admin' ? p.admin_person : tab === 'eval' ? p.eval_person : p.tech_person
      if (pick != null && String(pick).trim() !== '') filled += 1
    }
  }
  return { filled, total }
}

function getTabCounts(
  visitBlocks: VisitBlockShape[],
  tab: PersonnelTabKey,
  personnel: PersonnelPayload | null | undefined
): { filled: number; total: number } {
  const tabBlocks = personnel?.[tab]
  if (tabBlocks && tabBlocks.length === visitBlocks.length) {
    return countPersonnelTabCompletion(visitBlocks, tabBlocks, tab)
  }
  return countRoleFromVisitBlocksLegacy(visitBlocks, tab)
}

/** 时间线：按流程是否填写执行日期汇总 */
export function computeTimelineStatus(visitBlocks: VisitBlockShape[]): DimensionStatus {
  const processes = iterProcesses(visitBlocks)
  if (processes.length === 0) {
    return {
      line1: '无访视流程',
      line2: '暂无访视点与流程数据',
      variant: 'muted',
    }
  }
  const { total, withDate } = countExecDateCoverage(processes)
  if (withDate === 0) {
    return {
      line1: '未排执行日期',
      line2: '流程已维护，但未填写执行日期',
      variant: 'warning',
    }
  }
  if (withDate === total) {
    return {
      line1: '已排程',
      line2: `共 ${total} 条流程均已填写日期`,
      variant: 'success',
    }
  }
  return {
    line1: '部分排程',
    line2: `${withDate}/${total} 条流程已填写执行日期`,
    variant: 'warning',
  }
}

const TAB_LABEL: Record<PersonnelTabKey, string> = { admin: '行政', eval: '评估', tech: '技术' }

function computeRoleDimensionForTab(
  tab: PersonnelTabKey,
  visitBlocks: VisitBlockShape[],
  personnel: PersonnelPayload | null | undefined,
  published: boolean | undefined
): DimensionStatus {
  const label = TAB_LABEL[tab]
  const allProc = iterProcesses(visitBlocks)
  if (allProc.length === 0) {
    return {
      line1: '无流程数据',
      line2: `暂无流程，无法汇总${label}排程`,
      variant: 'muted',
    }
  }
  const { filled, total } = getTabCounts(visitBlocks, tab, personnel)
  if (total === 0) {
    return {
      line1: '无本模块流程',
      line2: `当前访视流程中无归入「${label}」模块的流程`,
      variant: 'muted',
    }
  }
  if (published) {
    if (filled === total) {
      return {
        line1: '已发布·已齐备',
        line2: `${label}人员已覆盖本模块全部 ${total} 条流程`,
        variant: 'success',
      }
    }
    if (filled === 0) {
      return {
        line1: '已发布·未录入人员',
        line2: `发布侧已标记发布，但「${label}」模块在人员排程中尚无完整记录（0/${total} 条）。请打开「继续编辑排程 → 人员排程」核对。`,
        variant: 'warning',
      }
    }
    return {
      line1: '已发布·存在缺口',
      line2: `${label}已完整填写 ${filled}/${total} 条流程，尚有 ${total - filled} 条待补全（执行/备份/房间均需填写）`,
      variant: 'warning',
    }
  }
  if (filled === 0) {
    return {
      line1: '未发布',
      line2: `「${label}」模块尚未填写完整人员信息`,
      variant: 'neutral',
    }
  }
  if (filled === total) {
    return {
      line1: '未发布',
      line2: `${label}模块人员已填齐，待发布后生效`,
      variant: 'warning',
    }
  }
  return {
    line1: '未发布',
    line2: `${label}已填 ${filled}/${total} 条流程，待补全并发布`,
    variant: 'warning',
  }
}

/** 行政 / 评估 / 技术：优先读 payload.personnel，与人员排程页一致 */
export function computeScheduleDimensionStatuses(
  visitBlocks: VisitBlockShape[],
  schedule: ScheduleFlags | null | undefined,
  personnel?: PersonnelPayload | null
): { admin: DimensionStatus; eval: DimensionStatus; tech: DimensionStatus } {
  const s = schedule || {}
  const p = personnel ?? null
  return {
    admin: computeRoleDimensionForTab('admin', visitBlocks, p, s.admin_published),
    eval: computeRoleDimensionForTab('eval', visitBlocks, p, s.eval_published),
    tech: computeRoleDimensionForTab('tech', visitBlocks, p, s.tech_published),
  }
}

export function computeAllFourDimensions(
  visitBlocks: VisitBlockShape[],
  schedule: ScheduleFlags | null | undefined,
  personnel?: PersonnelPayload | null
): { timeline: DimensionStatus; admin: DimensionStatus; eval: DimensionStatus; tech: DimensionStatus } {
  const { admin, eval: ev, tech } = computeScheduleDimensionStatuses(visitBlocks, schedule, personnel)
  return {
    timeline: computeTimelineStatus(visitBlocks),
    admin,
    eval: ev,
    tech,
  }
}
