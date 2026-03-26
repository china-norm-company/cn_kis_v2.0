/**
 * 人员排程：按流程名称划分行政 / 评估 / 技术 Tab。
 * 规则与后端 scheduling.api._personnel_process_tab_class 保持一致。
 */
export type PersonnelTabKey = 'admin' | 'eval' | 'tech'

const ADMIN_KEYWORDS = ['前台', '知情', '产品', '问卷', '清洁'] as const

/** 含「评估」→ 评估 Tab；含前台/知情/产品/问卷/清洁 → 行政 Tab；其余 → 技术 Tab（评估优先于行政关键词） */
export function classifyPersonnelProcessTab(processName: string): PersonnelTabKey {
  const n = (processName || '').trim()
  if (n.includes('评估')) return 'eval'
  if (ADMIN_KEYWORDS.some((k) => n.includes(k))) return 'admin'
  return 'tech'
}

export type VisitBlockLike = {
  visit_point?: string
  processes?: Array<{ code?: string; process?: string }>
}

function processLabel(p: { code?: string; process?: string } | undefined): string {
  return ((p?.process || p?.code || '') as string).trim()
}

/** 每个访视点下，属于指定 Tab 的流程在 visit_blocks 中的下标列表（顺序与排期一致） */
export function getProcessIndicesForTab(visitBlocks: VisitBlockLike[], tab: PersonnelTabKey): number[][] {
  return visitBlocks.map((b) => {
    const procs = b.processes ?? []
    const out: number[] = []
    procs.forEach((p, pi) => {
      if (classifyPersonnelProcessTab(processLabel(p)) === tab) out.push(pi)
    })
    return out
  })
}

export type PersonnelBlockLike = {
  visit_point?: string
  processes?: Array<{ executor?: string; backup?: string; room?: string }>
}

/** 与后端 _personnel_tab_complete 一致：该 Tab 下每条流程均有执行/备份/房间 */
export function isPersonnelTabFilled(
  visitBlocks: VisitBlockLike[],
  tabBlocks: PersonnelBlockLike[] | undefined,
  tab: PersonnelTabKey
): boolean {
  if (!visitBlocks.length) return false
  if (!tabBlocks || tabBlocks.length !== visitBlocks.length) return false
  const idxList = getProcessIndicesForTab(visitBlocks, tab)
  for (let bi = 0; bi < visitBlocks.length; bi++) {
    const expected = idxList[bi].length
    const processes = tabBlocks[bi]?.processes ?? []
    if (processes.length !== expected) return false
    for (let j = 0; j < expected; j++) {
      const row = processes[j]
      const ex = (row?.executor ?? '').trim()
      const bu = (row?.backup ?? '').trim()
      const rm = (row?.room ?? '').trim()
      if (!ex || !bu || !rm) return false
    }
  }
  return true
}

export type PersonnelPayload = {
  admin?: PersonnelBlockLike[]
  eval?: PersonnelBlockLike[]
  tech?: PersonnelBlockLike[]
}

/** 流程行（用于回退到 visit_blocks 上的 *_person 字段） */
export type ProcessPersonnelLike = {
  process?: string
  code?: string
  admin_person?: string
  admin_room?: string
  eval_person?: string
  eval_room?: string
  tech_person?: string
  tech_room?: string
}

/**
 * 取某访视点下某条流程的测试人员/备份人员/房间：优先 personnel，其次 visit_blocks 上旧字段。
 */
export function getPersonnelCellsForProcess(
  visitBlocks: Array<{ visit_point?: string; processes?: ProcessPersonnelLike[] }>,
  personnel: PersonnelPayload | null | undefined,
  blockIndex: number,
  processIndex: number
): { executor: string; backup: string; room: string } {
  const proc = visitBlocks[blockIndex]?.processes?.[processIndex]
  if (!proc) return { executor: '', backup: '', room: '' }
  const tab = classifyPersonnelProcessTab(processLabel(proc))
  const idxList = getProcessIndicesForTab(visitBlocks, tab)
  const j = idxList[blockIndex]?.indexOf(processIndex) ?? -1
  if (j >= 0) {
    const row = personnel?.[tab]?.[blockIndex]?.processes?.[j]
    if (row) {
      return {
        executor: String(row.executor ?? '').trim(),
        backup: String(row.backup ?? '').trim(),
        room: String(row.room ?? '').trim(),
      }
    }
  }
  if (tab === 'admin') {
    return {
      executor: String(proc.admin_person ?? '').trim(),
      backup: '',
      room: String(proc.admin_room ?? '').trim(),
    }
  }
  if (tab === 'eval') {
    return {
      executor: String(proc.eval_person ?? '').trim(),
      backup: '',
      room: String(proc.eval_room ?? '').trim(),
    }
  }
  return {
    executor: String(proc.tech_person ?? '').trim(),
    backup: '',
    room: String(proc.tech_room ?? '').trim(),
  }
}

const TAB_LABEL: Record<PersonnelTabKey, string> = { admin: '行政', eval: '评估', tech: '技术' }

/** 从 personnel 快照生成「按人员」列表行（与人员排程页数据源一致） */
export function buildPersonRowsFromPersonnelPayload(
  visitBlocks: VisitBlockLike[],
  personnel: PersonnelPayload | null | undefined
): Array<{ role: string; person: string; room: string; visit_point: string; process: string; dates: string }> {
  const out: Array<{ role: string; person: string; room: string; visit_point: string; process: string; dates: string }> = []
  if (!personnel || !visitBlocks.length) return out
  for (const tab of ['admin', 'eval', 'tech'] as const) {
    const blocks = personnel[tab]
    if (!blocks || blocks.length !== visitBlocks.length) continue
    const idxList = getProcessIndicesForTab(visitBlocks, tab)
    for (let bi = 0; bi < visitBlocks.length; bi++) {
      const vp = (visitBlocks[bi].visit_point || '').trim()
      const procs = visitBlocks[bi].processes ?? []
      const rowList = blocks[bi]?.processes ?? []
      const indices = idxList[bi]
      for (let j = 0; j < indices.length; j++) {
        const pi = indices[j]
        const proc = procs[pi] as { process?: string; code?: string; exec_dates?: string[] } | undefined
        const processName = ((proc?.process || proc?.code) || '').trim()
        const dates = (proc?.exec_dates || []).filter(Boolean).map((d) => String(d).slice(0, 10))
        const datesStr = dates.length ? dates.join('、') : '-'
        const r = rowList[j]
        const ex = (r?.executor ?? '').trim()
        if (!ex) continue
        out.push({
          role: TAB_LABEL[tab],
          person: ex,
          room: (r?.room ?? '').trim() || '-',
          visit_point: vp,
          process: processName,
          dates: datesStr,
        })
      }
    }
  }
  return out
}
