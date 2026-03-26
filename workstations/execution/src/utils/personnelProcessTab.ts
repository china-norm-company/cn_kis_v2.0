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
