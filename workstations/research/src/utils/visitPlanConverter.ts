/**
 * 将 AI 解析的 parsed_data 转为访视计划预览结构（与 KIS 逻辑一致，简化版）
 */
export interface VisitPlanItem {
  visitId: string
  visitCode: string
  visitName: string
  visitTimePoint: string
  dayOffset: number
  visitSequence: number
  testTimePoint?: string
  visitType?: string
  allowedWindowDeviation?: string
  isInterimDelivery?: boolean
  groupName?: string
  equipments: Array<{ equipmentName: string; testIndicator?: string; measurementArea?: string }>
  evaluators: Array<{ evaluationType: string; evaluationCategory?: string }>
  resourceTimeMinutes: number
}

interface ParsedData {
  visit_plan?: Array<{
    group_name?: string
    visit_time_point: string
    test_time_point?: string
    visit_sequence?: string | number
    visit_type?: string
    allowed_window_deviation?: string
    is_interim_delivery?: boolean
    day_offset?: number
  }>
  equipment_plan?: Array<{ test_equipment: string; test_indicator?: string; test_location?: string; visit_time_point?: string }>
  evaluation_plan?: Array<{ evaluator_category: string; evaluation_category?: string; visit_time_point?: string }>
}

function extractVisitCode(visitTimePoint: string | undefined | null): string {
  if (!visitTimePoint || typeof visitTimePoint !== 'string') return 'V0'
  const bracket = visitTimePoint.match(/\(([^)]+)\)/)
  if (bracket) return bracket[1].trim()
  const code = visitTimePoint.match(/\b(V\d*|T[-\w\d]+)\b/i)
  return code ? code[1] : visitTimePoint.substring(0, 10) || 'V0'
}

function extractDayOffset(visitTimePoint: string): number {
  if (/基线|V0/.test(visitTimePoint)) return 0
  const w = visitTimePoint.match(/第(\d+)周/)
  if (w) return parseInt(w[1], 10) * 7
  const d = visitTimePoint.match(/第(\d+)天/)
  if (d) return parseInt(d[1], 10)
  return 0
}

function parseVisitTimePoints(str: string): string[] {
  if (!str) return []
  return str.split(/[,，;；\s]+/).map((v) => v.trim()).filter(Boolean)
}

function isApplicableToVisit(visitCode: string, visitTimePointStr: string): boolean {
  if (!visitTimePointStr) return false
  if (/所有访视|全部访视/.test(visitTimePointStr)) return true
  const points = parseVisitTimePoints(visitTimePointStr)
  return points.some((vp) => vp === visitCode || vp.toLowerCase() === visitCode.toLowerCase())
}

export function convertParsedDataToVisitPlan(parsedData: ParsedData | null | undefined): VisitPlanItem[] {
  if (!parsedData?.visit_plan?.length) return []

  const visitMap = new Map<string, VisitPlanItem>()
  parsedData.visit_plan.forEach((visit, index) => {
    const visitTimePoint = visit.visit_time_point || `V${index}`
    const visitCode = extractVisitCode(visitTimePoint)
    const dayOffset = visit.day_offset ?? extractDayOffset(visitTimePoint)
    const key = `${visitCode}-${dayOffset}`
    if (visitMap.has(key)) return
    const seq = typeof visit.visit_sequence === 'string' ? parseInt(visit.visit_sequence, 10) : (visit.visit_sequence ?? index + 1)
    visitMap.set(key, {
      visitId: key,
      visitCode,
      visitName: visitTimePoint,
      visitTimePoint,
      dayOffset,
      visitSequence: seq || index + 1,
      testTimePoint: visit.test_time_point,
      visitType: visit.visit_type || '现场访视',
      allowedWindowDeviation: visit.allowed_window_deviation,
      isInterimDelivery: visit.is_interim_delivery ?? false,
      groupName: visit.group_name,
      equipments: [],
      evaluators: [],
      resourceTimeMinutes: 0,
    })
  })

  if (parsedData.equipment_plan?.length) {
    parsedData.equipment_plan.forEach((eq) => {
      visitMap.forEach((item) => {
        if (isApplicableToVisit(item.visitCode, eq.visit_time_point || '')) {
          if (!item.equipments.some((e) => e.equipmentName === eq.test_equipment)) {
            item.equipments.push({
              equipmentName: eq.test_equipment,
              testIndicator: eq.test_indicator,
              measurementArea: eq.test_location,
            })
          }
        }
      })
    })
  }
  if (parsedData.evaluation_plan?.length) {
    parsedData.evaluation_plan.forEach((ev) => {
      visitMap.forEach((item) => {
        if (isApplicableToVisit(item.visitCode, ev.visit_time_point || '')) {
          if (!item.evaluators.some((e) => e.evaluationType === ev.evaluator_category && e.evaluationCategory === ev.evaluation_category)) {
            item.evaluators.push({
              evaluationType: ev.evaluator_category,
              evaluationCategory: ev.evaluation_category,
            })
          }
        }
      })
    })
  }

  const list = Array.from(visitMap.values())
  list.sort((a, b) => (a.groupName && b.groupName && a.groupName !== b.groupName ? a.groupName.localeCompare(b.groupName, 'zh-CN') : a.visitSequence - b.visitSequence))
  return list
}
