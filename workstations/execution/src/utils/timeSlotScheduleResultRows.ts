/**
 * 时间槽详情「排程结果」三维度行数据：项目 / 人员 / 日期（与 personnel + visit_blocks 对齐）
 * 执行日期优先取执行订单首行「执行日期1～4」（与 visit_blocks 下标对齐），无则回退各流程 exec_dates。
 */
import { classifyPersonnelProcessTab, getPersonnelCellsForProcess, type PersonnelPayload } from './personnelProcessTab'

const EXEC_DATE_COL_KEYS = ['执行日期1', '执行日期2', '执行日期3', '执行日期4'] as const

/** 「YYYY年M月D日」→ YYYY-MM-DD */
function chineseDateToIso(s: string): string {
  const m = (s || '').trim().match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return ''
  const y = parseInt(m[1], 10)
  const mo = parseInt(m[2], 10)
  const d = parseInt(m[3], 10)
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 与后端 workorder_sync._parse_date_to_iso 常见情况对齐（ISO、Excel 序列号） */
function excelSerialToIso(n: number): string | null {
  if (n < 1 || n > 2958465) return null
  const epoch = new Date(1899, 11, 30)
  const d = new Date(epoch.getTime() + Math.floor(n) * 86400000)
  const y = d.getFullYear()
  const mo = d.getMonth() + 1
  const day = d.getDate()
  return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseOrderRowDateCell(v: unknown): { iso: string; display: string } | null {
  if (v == null || v === '') return null
  if (typeof v === 'number' && !Number.isNaN(v)) {
    const iso = excelSerialToIso(v)
    if (iso) return { iso, display: iso }
    return null
  }
  const s = String(v).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const iso = s.slice(0, 10)
    return { iso, display: iso }
  }
  const cn = chineseDateToIso(s)
  if (cn) return { iso: cn, display: s }
  return null
}

/** 用于人员 Tab 按角色筛选（行政 / 评估 / 技术） */
export function getPersonnelRoleLabelForProcess(processName: string): string {
  const tab = classifyPersonnelProcessTab(processName)
  return tab === 'admin' ? '行政' : tab === 'eval' ? '评估' : '技术'
}

export type ProjectContext = {
  projectCode: string
  projectName: string
  group: string
  sample: string
  supervisor: string
  visitTimepoint: string
}

/** 项目维度：一行一条流程 */
export type ProjectDimRow = ProjectContext & {
  execDate: string
  visitCount: number
  process: string
  tester: string
  backup: string
  room: string
}

/** 人员维度（role 仅用于筛选，不默认展示列） */
export type PersonDimRow = {
  role: string
  tester: string
  backup: string
  process: string
  room: string
  projectCode: string
  projectName: string
  sample: string
  visitTimepoint: string
  execDate: string
}

/** 日期维度：一行一个执行日 × 流程 */
export type DateDimRow = {
  execDate: string
  visitTimepoint: string
  sample: string
  projectCode: string
  projectName: string
  tester: string
  backup: string
  room: string
}

type VisitBlockProc = {
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

type VisitBlockIn = {
  visit_point?: string
  processes?: VisitBlockProc[]
}

export function buildScheduleResultDimensionRows(
  visitBlocks: VisitBlockIn[],
  personnel: PersonnelPayload | null | undefined,
  ctx: ProjectContext,
  options?: { orderFirstRow?: Record<string, unknown> }
): { project: ProjectDimRow[]; person: PersonDimRow[]; date: DateDimRow[] } {
  const project: ProjectDimRow[] = []
  const person: PersonDimRow[] = []
  const date: DateDimRow[] = []

  const firstRow = options?.orderFirstRow

  for (let bi = 0; bi < visitBlocks.length; bi++) {
    const colKey = EXEC_DATE_COL_KEYS[bi] ?? null
    const cell = colKey && firstRow ? firstRow[colKey] : undefined
    const fromOrder = cell !== undefined && cell !== null && String(cell).trim() !== '' ? parseOrderRowDateCell(cell) : null

    const procs = visitBlocks[bi].processes ?? []
    for (let pi = 0; pi < procs.length; pi++) {
      const proc = procs[pi]
      const pname = ((proc.process || proc.code) || '').trim()
      const fallbackDates = (proc.exec_dates || []).filter(Boolean).map((d) => String(d).trim().slice(0, 10))

      let execDateStr: string
      let visitCount: number
      let datesForDateDim: string[]

      if (fromOrder && fromOrder.iso) {
        execDateStr = fromOrder.display
        visitCount = 1
        datesForDateDim = [fromOrder.iso]
      } else {
        datesForDateDim = fallbackDates
        execDateStr = fallbackDates.length ? fallbackDates.join('、') : '-'
        visitCount = fallbackDates.length
      }

      const cells = getPersonnelCellsForProcess(visitBlocks, personnel, bi, pi)
      const procSample = proc.sample_size != null ? String(proc.sample_size) : ''
      const sampleCol = procSample || ctx.sample

      const tester = cells.executor || '-'
      const backup = cells.backup || '-'
      const room = cells.room || '-'

      project.push({
        ...ctx,
        execDate: execDateStr,
        visitCount,
        process: pname,
        tester,
        backup,
        room,
      })

      person.push({
        role: getPersonnelRoleLabelForProcess(pname),
        tester,
        backup,
        process: pname,
        room,
        projectCode: ctx.projectCode,
        projectName: ctx.projectName,
        sample: ctx.sample,
        visitTimepoint: ctx.visitTimepoint,
        execDate: execDateStr,
      })

      for (const d of datesForDateDim) {
        date.push({
          execDate: d,
          visitTimepoint: ctx.visitTimepoint,
          sample: sampleCol,
          projectCode: ctx.projectCode,
          projectName: ctx.projectName,
          tester,
          backup,
          room,
        })
      }
    }
  }

  date.sort((a, b) => a.execDate.localeCompare(b.execDate) || a.projectCode.localeCompare(b.projectCode))

  return { project, person, date }
}
