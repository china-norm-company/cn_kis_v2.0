/**
 * 将上传解析的表格（明细结构）映射为时间线行
 */
import type { ParsedTable } from '../components/CreateScheduleUploadModal'
import { parseVisitTimepoints, computeSamplePerDay } from './timelineVisitParser'

export type TimelineRow = {
  id: string
  询期编号: string
  申办方: string
  项目状态: string
  项目名称: string
  项目编号: string
  项目编号2: string
  研究: string
  组别: string
  样本量: number
  测量要求: string
  回访时间点: string
  项目开始时间: string
  项目结束时间: string
  交付情况: string
  备注: string
  /** 解析后的回访阶段；详情页每个访视时间点下 3 个 Tab（行政/技术/评估），每 Tab 内 测试流程、样本量、人员、房间 */
  segments: Array<{
    label: string
    dayCount: number
    formattedDates: string
    单天样本量: number
    startDate?: string
    endDate?: string
    测试流程?: string
    样本量?: number
    人员?: string
    房间?: string
    /** 行政 Tab */
    行政?: { 测试流程?: string; 人员?: string; 房间?: string }
    /** 技术 Tab */
    技术?: { 测试流程?: string; 人员?: string; 房间?: string }
    /** 评估 Tab */
    评估?: { 测试流程?: string; 人员?: string; 房间?: string }
  }>
  /** 详情页顶栏：测量时间点（手动填写） */
  测量时间点?: string
}

const MINGXI_HEADERS = ['询期编号', '申办方', '项目状态', '项目名称', '项目编号', '研究', '组别', '样本量', '测量要求', '回访时间点', '项目开始时间', '项目结束时间', '交付情况', '备注']

function isMingxiSheet(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim()))
  return MINGXI_HEADERS.every((h) => set.has(h))
}

function getColIndex(headers: string[], name: string): number {
  const i = headers.findIndex((h) => (h || '').trim() === name)
  return i >= 0 ? i : -1
}

/** Excel 序列日转 yyyy年M月d日 */
function excelSerialToDateStr(v: unknown): string {
  if (v == null || v === '') return ''
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return String(v)
  // Excel date serial (Windows): 25569 = 1970-01-01
  const date = new Date((n - 25569) * 86400 * 1000)
  if (Number.isNaN(date.getTime())) return String(v)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

/**
 * 从 ParsedTable 转为 TimelineRow[]，仅当表头为明细结构时转换
 */
export function mapParsedToTimelineRows(data: ParsedTable): TimelineRow[] {
  const { headers, rows } = data
  const normalizedHeaders = headers.map((h) => (h || '').trim())
  if (!isMingxiSheet(normalizedHeaders)) return []

  const idx = {
    询期编号: getColIndex(normalizedHeaders, '询期编号'),
    申办方: getColIndex(normalizedHeaders, '申办方'),
    项目状态: getColIndex(normalizedHeaders, '项目状态'),
    项目名称: getColIndex(normalizedHeaders, '项目名称'),
    项目编号: getColIndex(normalizedHeaders, '项目编号'),
    研究: getColIndex(normalizedHeaders, '研究'),
    组别: getColIndex(normalizedHeaders, '组别'),
    样本量: getColIndex(normalizedHeaders, '样本量'),
    测量要求: getColIndex(normalizedHeaders, '测量要求'),
    回访时间点: getColIndex(normalizedHeaders, '回访时间点'),
    项目开始时间: getColIndex(normalizedHeaders, '项目开始时间'),
    项目结束时间: getColIndex(normalizedHeaders, '项目结束时间'),
    交付情况: getColIndex(normalizedHeaders, '交付情况'),
    备注: getColIndex(normalizedHeaders, '备注'),
  }
  // 督导：优先用表头名为「督导」的列，否则用第二个「项目编号」列
  const 督导Idx = getColIndex(normalizedHeaders, '督导')
  const firstProjectCode = normalizedHeaders.indexOf('项目编号')
  let 项目编号2Idx = -1
  if (firstProjectCode >= 0) {
    const second = normalizedHeaders.indexOf('项目编号', firstProjectCode + 1)
    if (second >= 0) 项目编号2Idx = second
  }

  const result: TimelineRow[] = []
  rows.forEach((row, ri) => {
    const get = (i: number) => (i >= 0 && i < row.length ? String(row[i] ?? '').trim() : '')
    const getNum = (i: number) => {
      if (i < 0 || i >= row.length) return 0
      const v = row[i]
      if (typeof v === 'number') return v
      const n = Number(String(v).replace(/,/g, ''))
      return Number.isNaN(n) ? 0 : n
    }
    const 回访时间点Raw = get(idx.回访时间点)
    const segments = parseVisitTimepoints(回访时间点Raw)
    const sampleSize = getNum(idx.样本量)
    const firstDayCount = segments[0]?.dayCount ?? 0
    const 单天样本量 = computeSamplePerDay(sampleSize, firstDayCount)
    const segmentsWithSample = segments.map((s) => ({
      ...s,
      单天样本量,
    }))

    result.push({
      id: `timeline-${ri}-${get(idx.询期编号) || ri}`,
      询期编号: get(idx.询期编号),
      申办方: get(idx.申办方),
      项目状态: get(idx.项目状态),
      项目名称: get(idx.项目名称),
      项目编号: get(idx.项目编号),
      项目编号2: 督导Idx >= 0 ? get(督导Idx) : 项目编号2Idx >= 0 ? get(项目编号2Idx) : '',
      研究: get(idx.研究),
      组别: get(idx.组别),
      样本量: sampleSize,
      测量要求: get(idx.测量要求),
      回访时间点: 回访时间点Raw,
      项目开始时间: idx.项目开始时间 >= 0 ? excelSerialToDateStr(row[idx.项目开始时间]) || get(idx.项目开始时间) : get(idx.项目开始时间),
      项目结束时间: idx.项目结束时间 >= 0 ? excelSerialToDateStr(row[idx.项目结束时间]) || get(idx.项目结束时间) : get(idx.项目结束时间),
      交付情况: get(idx.交付情况),
      备注: get(idx.备注),
      segments: segmentsWithSample,
    })
  })
  return result
}

/**
 * 优先取「明细」工作表，否则取第一个
 */
export function pickMingxiSheet(data: ParsedTable): ParsedTable | null {
  if (!data) return null
  return data.sheetName === '明细' ? data : { ...data }
}
