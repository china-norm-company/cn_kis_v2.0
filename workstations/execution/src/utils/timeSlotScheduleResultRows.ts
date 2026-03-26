/**
 * 时间槽详情「排程结果」三维度行数据：项目 / 人员 / 日期（与 personnel + visit_blocks 对齐）
 */
import { classifyPersonnelProcessTab, getPersonnelCellsForProcess, type PersonnelPayload } from './personnelProcessTab'

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
  ctx: ProjectContext
): { project: ProjectDimRow[]; person: PersonDimRow[]; date: DateDimRow[] } {
  const project: ProjectDimRow[] = []
  const person: PersonDimRow[] = []
  const date: DateDimRow[] = []

  for (let bi = 0; bi < visitBlocks.length; bi++) {
    const procs = visitBlocks[bi].processes ?? []
    for (let pi = 0; pi < procs.length; pi++) {
      const proc = procs[pi]
      const pname = ((proc.process || proc.code) || '').trim()
      const dates = (proc.exec_dates || []).filter(Boolean).map((d) => String(d).trim().slice(0, 10))
      const execDateStr = dates.length ? dates.join('、') : '-'
      const visitCount = dates.length
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

      for (const d of dates) {
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
