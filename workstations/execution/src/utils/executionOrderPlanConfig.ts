/**
 * 测试执行订单解析结果 - 按计划模块展示的配置
 *
 * 解析规则：
 * - 根据「资源需求」的字段（及别名）与「测试执行订单模版」的表头进行匹配
 * - 模版中匹配到的列，其单元格值填入对应的资源需求字段并展示
 * - 空值非必填：未匹配到的列、或单元格为空时，该字段留空即可
 *
 * 每个计划为一个模块：左上角模块标题，下方为字段名与解析出的内容（上下布局）
 */

/** 将日期片段格式化为中文 YYYY年M月D日（如 2026年3月12日） */
function formatOneDateToChinese(part: string, defaultYear: number): string {
  const s = part.trim()
  if (!s) return ''
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    const y = parseInt(iso[1], 10)
    const m = parseInt(iso[2], 10)
    const d = parseInt(iso[3], 10)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}年${m}月${d}日`
    }
  }
  /** 2026年3月2日 */
  const cnYmd = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  if (cnYmd) {
    const y = parseInt(cnYmd[1], 10)
    const m = parseInt(cnYmd[2], 10)
    const d = parseInt(cnYmd[3], 10)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}年${m}月${d}日`
    }
  }
  const dotDate = s.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/)
  if (dotDate) {
    const y = parseInt(dotDate[1], 10)
    const m = parseInt(dotDate[2], 10)
    const d = parseInt(dotDate[3], 10)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}年${m}月${d}日`
    }
  }
  const ymdSlash = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (ymdSlash) {
    const y = parseInt(ymdSlash[1], 10)
    const m = parseInt(ymdSlash[2], 10)
    const d = parseInt(ymdSlash[3], 10)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}年${m}月${d}日`
    }
  }
  /** 年/月.日 或 年-月.日 混写，如 2026/3.15、2026-3.15（与全斜杠 2026/3/15 已由 ymdSlash 处理） */
  const yMixedMd = s.match(/^(\d{4})[\/\-](\d{1,2})[.\/](\d{1,2})$/)
  if (yMixedMd) {
    const y = parseInt(yMixedMd[1], 10)
    const m = parseInt(yMixedMd[2], 10)
    const d = parseInt(yMixedMd[3], 10)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}年${m}月${d}日`
    }
  }
  const md = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (md) {
    const m = parseInt(md[1], 10)
    const d = parseInt(md[2], 10)
    const y = md[3] != null
      ? (md[3].length === 2 ? 2000 + parseInt(md[3], 10) : parseInt(md[3], 10))
      : defaultYear
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}年${m}月${d}日`
    }
  }
  /** 仅月.日，继承段首年份，如 4.17 → 同年4月17日 */
  const mdDot = s.match(/^(\d{1,2})\.(\d{1,2})$/)
  if (mdDot) {
    const m = parseInt(mdDot[1], 10)
    const d = parseInt(mdDot[2], 10)
    const y = defaultYear
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}年${m}月${d}日`
    }
  }
  /** 仅月-日，继承段首年份，如 4-12 → 同年4月12日 */
  const mdHyphen = s.match(/^(\d{1,2})-(\d{1,2})$/)
  if (mdHyphen) {
    const m = parseInt(mdHyphen[1], 10)
    const d = parseInt(mdHyphen[2], 10)
    const y = defaultYear
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}年${m}月${d}日`
    }
  }
  /** 仅「M月D日」，继承段首年份，如 3月2日 → 同年3月2日 */
  const cnMd = s.match(/^(\d{1,2})月(\d{1,2})日$/)
  if (cnMd) {
    const m = parseInt(cnMd[1], 10)
    const d = parseInt(cnMd[2], 10)
    const y = defaultYear
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}年${m}月${d}日`
    }
  }
  return s
}

/**
 * 执行周期展示用：统一为中文 YYYY年M月D日，范围用 ~ 连接。
 * 支持原始格式：3/2~4/8、2025-03-02~2025-04-08、2026.03.02-2026.03.25、2026/1/16-1/23、
 * 2026/3.15～4.17、2026-3-30 ~ 4-12、3月2日-3月24日 等。
 */
export function formatExecutionPeriodToMMMMDDYY(value: string): string {
  const s = (value || '')
    .trim()
    .replace(/[－–—]/g, '-')
  if (!s) return ''
  const defaultYear = new Date().getFullYear()
  // 范围分隔符：~ ～ ; ； 或「-」后接四位年、中文年、M月D日、M/D、M.D 等
  const parts = s
    .split(
      /\s*[~～;；]\s*|-\s*(?=\d{4}年)|-\s*(?=\d{4}[.\-\/])|-\s*(?=\d{1,2}月\d{1,2}日)|-\s*(?=\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?:\s|$))|-\s*(?=\d{1,2}\.\d{1,2}(?:\s|$))/
    )
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return s
  let yearForRest = defaultYear
  const formatted = parts.map((p, i) => {
    const out = formatOneDateToChinese(p, yearForRest)
    if (i === 0 && out) {
      const fromFirst = out.match(/^(\d{4})年/)
      if (fromFirst) yearForRest = parseInt(fromFirst[1], 10)
    }
    return out
  })
  return formatted.join('~')
}

/** Excel 日期序列数（自 1900-01-01 起天数）转中文 YYYY年M月D日；非序列数原样返回 */
function excelSerialToDateStr(v: unknown): string {
  if (v == null || v === '') return ''
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  if (Number.isNaN(n) || n < 1 || n > 2958465) return String(v).trim()
  const date = new Date((n - 25569) * 86400 * 1000)
  if (Number.isNaN(date.getTime())) return String(v).trim()
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

/** 将可能含 Excel 序列日期的字符串转为年月日展示（多值用 "; " 分隔时逐段转换）；供详情页兜底用 */
export function formatExcelSerialToDateDisplay(value: string): string {
  const s = (value ?? '').trim()
  if (!s) return ''
  const parts = s.split(/\s*[;；]\s*/).map((p) => p.trim()).filter(Boolean)
  const converted = parts.map((p) => {
    const n = Number(p)
    if (!Number.isNaN(n) && n >= 1 && n <= 2958465) return excelSerialToDateStr(n)
    return p
  })
  return converted.join('；')
}

/** 解析阶段需将 Excel 序列数转为年月日的字段 */
const DATE_LIKE_FIELD_LABELS = new Set(['预计到样时间', '生产日期', '保质期/有效日期'])

/** 标准化表头用于匹配：去除首尾空白、全角转半角、合并连续空白，便于模版列名与资源需求字段匹配 */
function normalizeHeaderForMatch(s: string): string {
  if (typeof s !== 'string') return ''
  return s
    .replace(/\s+/g, ' ')
    .replace(/　/g, ' ')
    .trim()
}

/** 查找表头中包含任一关键字的列索引（用于复合表头先行后列匹配）；未找到返回 -1 */
function findColumnIndexByKeyword(headers: string[], ...keywords: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const n = normalizeHeaderForMatch(String(headers[i] ?? ''))
    const match = keywords.some((kw) => n.includes(kw) || n.includes(normalizeHeaderForMatch(kw)))
    if (match) return i
  }
  return -1
}

export interface PlanSectionDef {
  key: string
  title: string
  /** 该模块下的字段名（与 Excel 表头匹配，支持别名） */
  fields: { label: string; aliases?: string[] }[]
}

/** 各计划模块及字段定义（与产品要求的解析结果一一对应） */
export const EXECUTION_ORDER_PLAN_SECTIONS: PlanSectionDef[] = [
  {
    key: 'project',
    title: '项目信息',
    fields: [
      { label: '项目编号' },
      { label: '项目名称' },
      { label: '业务类型' },
      { label: '组别' },
      { label: '研究目的' },
      { label: '执行时间周期', aliases: ['排期时间', 'Field work', '执行周期'] },
      { label: '研究员' },
      { label: '督导' },
    ],
  },
  {
    key: 'facility',
    title: '场地计划',
    fields: [
      { label: '场地要求', aliases: ['外场地要求'] },
      { label: '场地环境要求', aliases: ['场地环境要求（主要是温度、湿度）'] },
      // 场地类型：温控、暗室、评估间、沙龙间 为其选项，Excel 中对应列会合并到本字段展示
      { label: '场地类型', aliases: ['温控', '暗室', '评估间', '沙龙间'] },
    ],
  },
  {
    key: 'sample',
    title: '样品计划',
    fields: [
      { label: '样品名称' },
      { label: '样品代码' },
      { label: '样品配方号' },
      { label: '批号' },
      { label: '物态' },
      { label: '颜色' },
      { label: '规格' },
      { label: '数量' },
      { label: '生产日期' },
      { label: '保质期/有效日期' },
      { label: '预计到样时间', aliases: ['样品预计到样时间', '到样时间'] },
      { label: '样品储存要求', aliases: ['样品特殊储存要求'] },
      { label: '用量要求', aliases: ['样品标准用量'] },
      { label: '使用访视点' },
      { label: '依从性管理要求', aliases: ['依从性管理频率与要求'] },
    ],
  },
  {
    key: 'recruitment',
    title: '招募计划',
    fields: [
      { label: '样本组别', aliases: ['样本其他要求'] },
      { label: '样本数量', aliases: ['最低样本量'] },
      { label: '备份数量' },
      { label: '年龄范围', aliases: ['样本年龄'] },
      { label: '年龄配额' },
      { label: '性别要求', aliases: ['样本性别'] },
      { label: '性别配额' },
      { label: '肤质类型', aliases: ['皮肤类型'] },
      { label: '肤质配额', aliases: ['皮肤类型配额'] },
      { label: '入组标准' },
      { label: '排除标准' },
    ],
  },
  {
    key: 'consumable',
    title: '耗材计划',
    fields: [
      { label: '耗材名称' },
      { label: '耗材数量' },
      { label: '特殊要求' },
      { label: '耗材使用访视点' },
      { label: '耗材使用场景' },
      { label: '耗材使用要求' },
    ],
  },
  {
    key: 'visit',
    title: '访视计划',
    fields: [
      { label: '样本组别' },
      { label: '访视时间点' },
      { label: '访视次数' },
      { label: '当日测量时间点', aliases: ['当日测试时间点'] },
      { label: '访视顺序' },
      { label: '访视类型' },
      { label: '允许窗口期', aliases: ['允许超窗期'] },
    ],
  },
  {
    key: 'equipment',
    title: '设备计划',
    fields: [
      { label: '测试设备', aliases: ['测试/评估方法'] },
      { label: '测试指标', aliases: ['测试/评估指标'] },
      { label: '测试部位', aliases: ['测试/评估位置'] },
      { label: '测试点位', aliases: ['详述要求'] },
      { label: '访视时间点' },
    ],
  },
  {
    key: 'evaluation',
    title: '评估计划',
    fields: [
      { label: '评估人员类别' },
      { label: '评估指标类别' },
      { label: '评估指标' },
      { label: '访视时间点' },
      { label: '比如特殊人员资质' },
    ],
  },
  {
    key: 'auxiliary',
    title: '辅助测量计划',
    fields: [
      { label: '辅助操作名称' },
      { label: '操作部位' },
      { label: '操作方法' },
      { label: '访视时间点' },
    ],
  },
  {
    key: 'schedule_plan',
    title: '排期计划',
    fields: [
      { label: '执行排期', aliases: ['执行排期', '测试具体排期'] },
    ],
  },
  {
    key: 'delivery_plan',
    title: '交付计划',
    fields: [
      { label: '交付节点' },
      { label: '交付形式' },
    ],
  },
]

/** 所有字段标签按模块顺序（用于纵向模版转表头时的列顺序） */
export const EXECUTION_ORDER_ALL_FIELD_LABELS: string[] = (() => {
  const list: string[] = []
  for (const sec of EXECUTION_ORDER_PLAN_SECTIONS) {
    for (const f of sec.fields) {
      list.push(f.label)
    }
  }
  return list
})()

/**
 * 解析「执行排期」文本：每行 "访视点: 日期1、日期2、..."，首行标题忽略。
 * 日期简写（、4、5、6 或 、4/1、2、3）按前一个日期的年/月补全，输出为 YYYY年M月D日。
 */
export interface ParsedScheduleRow {
  visitPoint: string
  startDate: string
  endDate: string
  dates: string[]
}

export function parseExecutionScheduleText(raw: string): ParsedScheduleRow[] {
  const rawStr = raw || ''
  const normalized = rawStr.replace(/\r\n?|\n/g, '\n')
  const lines = normalized.split('\n').map((s) => s.trim()).filter(Boolean)
  const result: ParsedScheduleRow[] = []
  for (const line of lines) {
    const half = line.indexOf(':')
    const full = line.indexOf('：')
    const colonIdx = half >= 0 && (full < 0 || half <= full) ? half : full >= 0 ? full : -1
    if (colonIdx < 0) continue
    const visitPoint = line.slice(0, colonIdx).trim()
    const datePart = line.slice(colonIdx + 1).trim()
    if (!visitPoint || !datePart) continue
    const dates = expandAndFormatDates(datePart)
    if (dates.length === 0) continue
    result.push({
      visitPoint,
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      dates,
    })
  }
  return result
}

/** 从「YYYY年M月D日」解析为时间戳便于比较 */
function parseChineseDateToTime(s: string): number {
  const m = (s || '').trim().match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return NaN
  const y = parseInt(m[1], 10)
  const mon = parseInt(m[2], 10) - 1
  const d = parseInt(m[3], 10)
  const date = new Date(y, mon, d)
  return date.getTime()
}

/**
 * 排期计划整体执行开始/结束：取所有访视点日期中的最早与最晚，格式为 YYYY年M月D日。
 */
export function getSchedulePlanOverallStartEnd(rows: ParsedScheduleRow[]): { overallStart: string; overallEnd: string } {
  let overallStart = ''
  let overallEnd = ''
  let minTs = Infinity
  let maxTs = -Infinity
  for (const row of rows) {
    for (const d of row.dates) {
      const ts = parseChineseDateToTime(d)
      if (!Number.isNaN(ts)) {
        if (ts < minTs) {
          minTs = ts
          overallStart = d
        }
        if (ts > maxTs) {
          maxTs = ts
          overallEnd = d
        }
      }
    }
  }
  return { overallStart, overallEnd }
}

function expandAndFormatDates(datePart: string): string[] {
  const sep = /[、，]\s*/
  /** 只去掉括号及括号内内容，括号外保留。支持半角 () 与全角 （） */
  const stripParens = (s: string) =>
    s
      .replace(/\s*\([^)]*\)\s*/g, '')
      .replace(/\s*（[^）]*）\s*/g, '')
      .trim()
  const segments = datePart.split(sep).map((s) => stripParens(s.trim())).filter(Boolean)
  /** 删除线等组合字符（U+0335 短划线、U+0336 长划线）：带删除线的片段不参与解析 */
  const hasStrikethrough = (s: string) => /\u0335|\u0336/.test(s)
  const out: string[] = []
  let lastY: number | null = null
  let lastM: number | null = null
  let lastD: number | null = null
  const defaultYear = new Date().getFullYear()
  for (const seg of segments) {
    if (hasStrikethrough(seg)) continue
    const fullYMD = seg.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
    if (fullYMD) {
      const y = parseInt(fullYMD[1], 10)
      const m = parseInt(fullYMD[2], 10)
      const d = parseInt(fullYMD[3], 10)
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        out.push(`${y}年${m}月${d}日`)
        lastY = y
        lastM = m
        lastD = d
        continue
      }
    }
    const md = seg.match(/^(\d{1,2})\/(\d{1,2})$/)
    if (md && lastY != null) {
      const m = parseInt(md[1], 10)
      const d = parseInt(md[2], 10)
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        out.push(`${lastY}年${m}月${d}日`)
        lastM = m
        lastD = d
        continue
      }
    }
    const dayOnly = /^\d{1,2}$/.test(seg)
    if (dayOnly && lastY != null && lastM != null) {
      const d = parseInt(seg, 10)
      if (d >= 1 && d <= 31) {
        out.push(`${lastY}年${lastM}月${d}日`)
        lastD = d
        continue
      }
    }
  }
  return out
}

function extractExecutionCycleFromText(text: string): string[] {
  const vals: string[] = []
  const regex = /(?:Field\s+work|执行周期)\s*[：:]\s*([^\n\r]+?)(?=\s*(?:Field\s+work|执行周期|$))/gi
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    const v = m[1].trim()
    if (v && !vals.includes(v)) vals.push(v)
  }
  if (vals.length > 0) return vals
  const simple = /(?:Field\s+work|执行周期)\s*[：:]\s*([^\n\r]+)/gi
  while ((m = simple.exec(text)) !== null) {
    const v = m[1].trim()
    if (v && !vals.includes(v)) vals.push(v)
  }
  return vals
}

/**
 * 执行排期区块：扫描表格，找到单元格内容为「执行排期」或「测试具体排期」后，取其右侧格子的内容。
 */
function getExecutionScheduleBlockFromSheet(sheetData: string[][]): string {
  const trim = (s: string) => (s ?? '').trim()
  const rowEnd = Math.min(sheetData.length, 80)
  const colEnd = 8
  for (let ri = 0; ri < rowEnd; ri++) {
    const row = sheetData[ri]
    if (!row) continue
    for (let ci = 0; ci < colEnd && ci < row.length; ci++) {
      const cell = trim(String(row[ci] ?? ''))
      if (!cell) continue
      const norm = normalizeHeaderForMatch(cell)
      const isLabel = norm === normalizeHeaderForMatch('执行排期') || cell.includes('测试具体排期')
      if (isLabel && ci + 1 < row.length) {
        const rightCell = trim(String(row[ci + 1] ?? ''))
        return rightCell
      }
    }
  }
  return ''
}

/**
 * 扫描表格，找到单元格内容匹配锚点后，取其右侧第一个非空单元格的内容（用于交付计划等）。
 * 若锚点为合并单元格，右侧紧邻格可能为空，则继续向右取第一个有内容的格。
 * 匹配时忽略单元格内换行，如「交付\n（访视节点）」与锚点「交付（访视节点）」视为一致。
 * @param stopBefore 可选：向右扫描时若遇到内容匹配该字符串的单元格则停止，不将其作为返回值（用于避免交付节点取到「交付形式」标题）
 */
function getCellRightOfAnchor(sheetData: string[][], anchor: string, stopBefore?: string): string {
  const trim = (s: string) => (s ?? '').trim()
  const anchorNorm = normalizeHeaderForMatch(anchor.replace(/\r\n?|\n/g, ''))
  const stopNorm = stopBefore ? normalizeHeaderForMatch(stopBefore.replace(/\r\n?|\n/g, '')) : ''
  const rowEnd = Math.min(sheetData.length, 80)
  const colEnd = 8
  for (let ri = 0; ri < rowEnd; ri++) {
    const row = sheetData[ri]
    if (!row) continue
    for (let ci = 0; ci < colEnd && ci < row.length; ci++) {
      const raw = String(row[ci] ?? '')
      const cell = trim(raw)
      if (!cell) continue
      const cellNorm = normalizeHeaderForMatch(cell.replace(/\r\n?|\n/g, ''))
      if (cellNorm === anchorNorm || cellNorm.includes(anchorNorm) || anchorNorm.includes(cellNorm)) {
        for (let cj = ci + 1; cj < row.length; cj++) {
          const val = trim(String(row[cj] ?? ''))
          if (!val) continue
          if (stopNorm) {
            const valNorm = normalizeHeaderForMatch(val.replace(/\r\n?|\n/g, ''))
            if (valNorm === stopNorm || valNorm.includes(stopNorm) || stopNorm.includes(valNorm)) return ''
          }
          return val
        }
        return ''
      }
    }
  }
  return ''
}

/** 交付节点多值分隔符（同单元格内展示） */
const DELIVERY_NODE_SEP = '、'

/**
 * 扫描表格，找到所有匹配锚点的单元格，分别取其右侧第一个非空值（遇 stopBefore 停止），去重后按分隔符拼接为同一字符串。
 * 用于交付节点可能有两处时的解析。
 */
function getAllCellsRightOfAnchor(
  sheetData: string[][],
  anchor: string,
  stopBefore?: string,
  separator: string = DELIVERY_NODE_SEP
): string {
  const trim = (s: string) => (s ?? '').trim()
  const anchorNorm = normalizeHeaderForMatch(anchor.replace(/\r\n?|\n/g, ''))
  const stopNorm = stopBefore ? normalizeHeaderForMatch(stopBefore.replace(/\r\n?|\n/g, '')) : ''
  const rowEnd = Math.min(sheetData.length, 80)
  const colEnd = 8
  const collected: string[] = []
  const seen = new Set<string>()
  for (let ri = 0; ri < rowEnd; ri++) {
    const row = sheetData[ri]
    if (!row) continue
    for (let ci = 0; ci < colEnd && ci < row.length; ci++) {
      const raw = String(row[ci] ?? '')
      const cell = trim(raw)
      if (!cell) continue
      const cellNorm = normalizeHeaderForMatch(cell.replace(/\r\n?|\n/g, ''))
      if (cellNorm === anchorNorm || cellNorm.includes(anchorNorm) || anchorNorm.includes(cellNorm)) {
        for (let cj = ci + 1; cj < row.length; cj++) {
          const val = trim(String(row[cj] ?? ''))
          if (!val) continue
          if (stopNorm) {
            const valNorm = normalizeHeaderForMatch(val.replace(/\r\n?|\n/g, ''))
            if (valNorm === stopNorm || valNorm.includes(stopNorm) || stopNorm.includes(valNorm)) break
          }
          if (!seen.has(val)) {
            seen.add(val)
            collected.push(val)
          }
          break
        }
      }
    }
  }
  return collected.join(separator)
}

/**
 * 执行时间周期：在 B、C 列多行中查找「Field work」或「执行周期」字段，取其后的值填充。
 * 行范围 B55–B65（0-based 54–64），再尝试 C 列同范围，支持 "Field work：3/2~4/8" 或 "执行周期：xxx" 等形式。
 */
function getExecutionTimeCycleFromSheet(sheetData: string[][]): string {
  const rowIndices = [54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64]
  for (const colIndex of [1, 2]) {
    let text = ''
    for (const ri of rowIndices) {
      const row = sheetData[ri]
      const cell = row && row.length > colIndex ? String(row[colIndex] ?? '').trim() : ''
      if (cell) text += (text ? ' ' : '') + cell
    }
    if (!text) continue
    const vals = extractExecutionCycleFromText(text)
    if (vals.length > 0) return vals.join('; ')
  }
  return ''
}

/**
 * 执行台字段 → 模版中「具体位置」（来自映射表「具体位置」列）。
 * 支持：单格 C2、多格逗号分隔 C12,C13,C14、区域 D25:D37。
 * 执行时间周期 不在此处取格，按备注从「Field work」或「执行周期」字段取数。
 */
export const EXECUTION_ORDER_CELL_MAP: Record<string, string> = {
  '项目编号': 'C2',
  '项目名称': 'C4',
  '业务类型': 'C10',
  '组别': 'H10',
  '场地要求': 'H9',
  '样品名称': 'C12,C13,C14',
  '预计到样时间': 'I15',
  '样品储存要求': 'E12,E13,E14',
  '用量要求': 'I12,I13,I14',
  '依从性管理要求': 'C15',
  '样本组别': 'I21',
  '样本数量': 'C16',
  '年龄范围': 'C17',
  '年龄配额': 'I17',
  '性别要求': 'C18',
  '性别配额': 'I18',
  '肤质类型': 'C19',
  '肤质配额': 'I19',
  '备份数量': 'E16',
  '访视时间点': 'E22',
  '访视次数': 'C22',
  '测试指标': 'D25:D37',
  '测试设备': 'C25:C37',
  '测试部位': 'E25:E37',
  '测试点位': 'F25:F37',
  '评估人员类别': 'C43:C45',
  '评估指标类别': 'E43:E45',
  '评估指标': 'D43:D45',
  '辅助操作名称': 'C40:C42',
  '操作部位': 'E40:E42',
  '操作方法': 'G40:G42',
  '比如特殊人员资质': 'F43:F45',
}

/**
 * 各计划模块锚点文案（与模版表头一致，用于动态确定行范围；找不到时回退硬编码）。
 * 匹配时忽略换行与多余空白。
 */
export const ANCHOR_CONFIG = {
  /** 设备计划：任一击中即视为该区块起始行 */
  equipment: [
    '仪器测量指标（对应日期有测试，则填写样本量）',
    '仪器测量指标-客户设备（对应日期有测试，则填写样本量）',
    '图像拍摄分析（特殊设置要求：（例）设备/光源）（对应日期有测试，则填写样本量）',
    '图像拍摄分析-客户设备（特殊设置要求：（例）设备/光源）（对应日期有测试，则填写样本量）',
  ],
  /** 评估计划：模版中为强制换行两行——第一行「临床评估指标」、第二行「（对应日期有测试，则填写样本量）」；匹配时 normalize 会去掉换行与空白，故仍能命中 */
  evaluation: ['临床评估指标（对应日期有测试，则填写样本量）'],
  /** 辅助测量计划：模版可能动态，仅完全符合下列锚点才命中（含产品带括号的合并格形式） */
  auxiliary: [
    '操作',
    '产品',
    '产品（对应日期有测试，则填写样本量）',
    '受试者自评（对应日期有测试，则填写样本量）',
  ],
} as const

/** 锚点匹配用：去掉所有空白（含换行）便于模版单元格与配置一致 */
function normalizeForAnchor(s: string): string {
  return String(s ?? '').replace(/\s+/g, '').trim()
}

/** 设备/评估/辅助因模版表格可能动态，仅按锚点取值且必须完全符合锚点（归一化后相等）才命中，避免误匹配 */
function cellMatchesAnchor(cellText: string, anchor: string): boolean {
  const c = normalizeForAnchor(cellText)
  const a = normalizeForAnchor(anchor)
  if (!a) return false
  return c === a
}

/** 访视时间点列起始列：H 列 = 0-based 7 */
const VISIT_COL_START = 7
const VISIT_COL_MAX = 30

/** 整表第 24 行（1-based）= 0-based 索引 23，设备/评估/辅助统一用此行作为访视时间点列名行 */
const VISIT_HEADER_ROW_0 = 23

/** 从 H 列向右扫描时，连续空列数达到此值即停止 */
const CONSECUTIVE_EMPTY_STOP = 2

/** 未识别到表头时使用的默认列名（H 起向右），保证仍能取到勾选 */
const DEFAULT_VISIT_HEADERS = ['T0', 'Timm', 'T8h', 'T2w', 'T4w']

/**
 * 从整表第 24 行（1-based）取访视时间点列名：从 H 列向右扫描，连续若干列都为空则停止。
 * 设备/评估/辅助三个区块统一使用此行。若第 24 行不存在或 H 起全空，则在前 31 行内找首行在 H 列及右侧有非空且非纯勾选符号的行作为表头行。
 */
/** 访视时间点表头：按列索引对齐的数组，labels[k] 对应列 VISIT_COL_START + k，空列为 ''；保证向右扫到 VISIT_COL_MAX 不因连续空列提前停 */
function getVisitHeadersFromRow24(sheetData: string[][]): string[] {
  const colCount = VISIT_COL_MAX - VISIT_COL_START
  function collectLabelsFromRow(r: string[] | undefined): string[] {
    if (!r) return new Array(colCount).fill('')
    const labels: string[] = []
    for (let c = VISIT_COL_START; c < VISIT_COL_MAX; c++) {
      const v = (r[c] ?? '').toString().trim()
      labels.push(v)
    }
    return labels
  }

  const row24 = sheetData[VISIT_HEADER_ROW_0]
  const from24 = collectLabelsFromRow(row24)
  if (from24.some((v) => v && !isCheckmarkSymbolOnly(v))) return from24

  const maxScan = Math.min(31, sheetData.length)
  for (let r = 0; r < maxScan; r++) {
    const row = sheetData[r]
    const labels = collectLabelsFromRow(row)
    const hasRealLabel = labels.some((v) => v && !isCheckmarkSymbolOnly(v))
    if (hasRealLabel) return labels
  }
  return []
}

/** 锚点扫描列数：A~F（0~5），覆盖操作/产品/受试者自评等合并单元格可能出现的列 */
const ANCHOR_SEARCH_COL_COUNT = 6

/** 在指定行、指定列范围内是否匹配任一锚点；同时用「行内多列拼接后归一」再匹配一次，以支持换行或分两格（如受试者自评 + 对应日期…） */
function rowMatchesAnchors(row: string[] | undefined, anchors: readonly string[], colIndices: number[]): boolean {
  if (!row || !anchors.length) return false
  for (const ci of colIndices) {
    const cell = (row[ci] ?? '').toString().trim()
    if (!cell) continue
    for (const anchor of anchors) {
      if (cellMatchesAnchor(cell, anchor)) return true
    }
  }
  // 模版中锚点可能为合并单元格或换行拆成多列：将行内前几列拼成一段再匹配（归一后含「受试者自评」「产品」等即可命中）
  const concatRaw = row
    .slice(0, ANCHOR_SEARCH_COL_COUNT)
    .map((c) => (c ?? '').toString().trim())
    .join('')
  const concatNorm = normalizeForAnchor(concatRaw)
  if (concatNorm) {
    for (const anchor of anchors) {
      if (cellMatchesAnchor(concatNorm, anchor)) return true
    }
  }
  return false
}

type BlockRange = { startRow: number; endRow: number; rowIndices: number[] }

/** 扫描 sheet 前几列（默认 A~F），返回各区块的起止行与按锚点分段后的行号列表（0-based）。行归属规则：从每个锚点行延伸到「下一个属于其他块的锚点行」之前的所有行归属该锚点所在块，避免评估两行数据中第二行被算进辅助。 */
function findBlockRanges(
  sheetData: string[][],
  searchCols: number[] = [0, 1, 2, 3, 4, 5],
  maxRow: number = 120
): { equipment: BlockRange | null; evaluation: BlockRange | null; auxiliary: BlockRange | null } {
  const result = {
    equipment: null as BlockRange | null,
    evaluation: null as BlockRange | null,
    auxiliary: null as BlockRange | null,
  }
  type BlockKey = keyof typeof result
  const matches: { rowIndex: number; block: BlockKey }[] = []
  for (let r = 0; r < Math.min(sheetData.length, maxRow); r++) {
    const row = sheetData[r]
    if (rowMatchesAnchors(row, ANCHOR_CONFIG.equipment, searchCols)) matches.push({ rowIndex: r, block: 'equipment' })
    if (rowMatchesAnchors(row, ANCHOR_CONFIG.evaluation, searchCols)) matches.push({ rowIndex: r, block: 'evaluation' })
    if (rowMatchesAnchors(row, ANCHOR_CONFIG.auxiliary, searchCols)) matches.push({ rowIndex: r, block: 'auxiliary' })
  }
  const sortedAnchorRows = [...new Set(matches.map((m) => m.rowIndex))].sort((a, b) => a - b)
  const anchorRowToBlocks = new Map<number, Set<BlockKey>>()
  for (const { rowIndex, block } of matches) {
    if (!anchorRowToBlocks.has(rowIndex)) anchorRowToBlocks.set(rowIndex, new Set())
    anchorRowToBlocks.get(rowIndex)!.add(block)
  }
  /** 辅助块整体边界：任一辅助段向下延伸时，遇到此行即停止，不包含该行 */
  const AUXILIARY_STOP_TEXT = '其他要求（详述）'
  const rowContainsStopText = (row: string[] | undefined) => {
    if (!row) return false
    const stopNorm = normalizeForAnchor(AUXILIARY_STOP_TEXT)
    const fromFirstCols = row.slice(0, ANCHOR_SEARCH_COL_COUNT).map((c) => (c ?? '').toString().trim()).join('')
    if (normalizeForAnchor(fromFirstCols).includes(stopNorm)) return true
    const fromWholeRow = row.map((c) => (c ?? '').toString().trim()).join('')
    return normalizeForAnchor(fromWholeRow).includes(stopNorm)
  }
  const endRowLimit = Math.min(sheetData.length, maxRow)
  let auxiliaryStopRow = endRowLimit
  for (let row = 0; row < endRowLimit; row++) {
    if (rowContainsStopText(sheetData[row])) {
      auxiliaryStopRow = row
      break
    }
  }
  const rowIndicesByBlock: Record<BlockKey, number[]> = { equipment: [], evaluation: [], auxiliary: [] }
  for (const { rowIndex: r, block } of matches) {
    let end: number
    const isAuxiliaryLastBlock = block === 'auxiliary' && rowMatchesAnchors(sheetData[r], ['受试者自评（对应日期有测试，则填写样本量）'], searchCols)
    if (isAuxiliaryLastBlock) {
      // 受试者自评段：向下延伸直到「其他要求（详述）」则停止（不包含该行）
      end = r + 1
      while (end < auxiliaryStopRow && !rowContainsStopText(sheetData[end])) end++
      for (let row = r; row < end; row++) rowIndicesByBlock[block].push(row)
      continue
    }
    const nextOtherBlockAnchor = sortedAnchorRows.find(
      (ar) => ar > r && !anchorRowToBlocks.get(ar)?.has(block)
    )
    end = nextOtherBlockAnchor ?? endRowLimit
    if (block === 'auxiliary') end = Math.min(end, auxiliaryStopRow)
    for (let row = r; row < end; row++) rowIndicesByBlock[block].push(row)
  }
  for (const block of ['equipment', 'evaluation', 'auxiliary'] as BlockKey[]) {
    const indices = [...new Set(rowIndicesByBlock[block])].sort((a, b) => a - b)
    if (indices.length === 0) continue
    result[block] = { startRow: indices[0], endRow: indices[indices.length - 1], rowIndices: indices }
  }
  return result
}

/** 设备计划表中「访视时间点」勾选列：从 H 列起依次为 T0、Timm、T2w、T4w */
const EQUIPMENT_VISIT_COLUMNS: Record<string, string> = {
  T0: 'H25:H37',
  Timm: 'I25:I37',
  T2w: 'J25:J37',
  T4w: 'K25:K37',
}

/** 评估计划表（C43:C45 等）访视时间点勾选列 */
const EVALUATION_VISIT_COLUMNS: Record<string, string> = {
  T0: 'H43:H45',
  Timm: 'I43:I45',
  T2w: 'J43:J45',
  T4w: 'K43:K45',
}

/** 辅助测量计划表（C40:C42 等）访视时间点勾选列 */
const AUXILIARY_VISIT_COLUMNS: Record<string, string> = {
  T0: 'H40:H42',
  Timm: 'I40:I42',
  T2w: 'J40:J42',
  T4w: 'K40:K42',
}

function isCheckmark(cellValue: string): boolean {
  const v = (cellValue ?? '').toString().trim()
  if (!v) return false
  if (/^[√✔☑✓]$/u.test(v)) return true
  if (/^[vVxX]$/.test(v) && v.length <= 2) return true
  if (/^(是|Y|y|1)$/.test(v)) return true
  if (/^[●■◆×✕✖]$/u.test(v)) return true
  if (v.length === 1) return true
  if (v.length <= 3 && /^[0-9]*$/.test(v) === false) return true
  return false
}

/** 仅判断是否为「勾选符号」（√、✓ 等），用于表头：表头为 T0/Timm 等时仍作为访视时间点名称展示，不当作勾选符号过滤 */
function isCheckmarkSymbolOnly(s: string): boolean {
  const v = (s ?? '').trim()
  if (!v) return true
  if (/^[√✔☑✓●■◆×✕✖]$/u.test(v)) return true
  if (/^(是|Y|y|1)$/.test(v)) return true
  if (v.length === 1 && /[vV]/.test(v)) return true
  return false
}

/** Excel 列字母 → 0-based 列索引（A=0, B=1, ..., Z=25, AA=26） */
function columnLetterToIndex(colStr: string): number {
  let n = 0
  for (let i = 0; i < colStr.length; i++) {
    n = n * 26 + (colStr.charCodeAt(i) - 64)
  }
  return n - 1
}

/** 解析单个单元格引用 "C2" → { rowIndex: 1, colIndex: 2 }（0-based） */
function parseOneCellRef(ref: string): { rowIndex: number; colIndex: number } | null {
  const m = ref.trim().match(/^([A-Z]+)(\d+)$/i)
  if (!m) return null
  const colIndex = columnLetterToIndex(m[1].toUpperCase())
  const rowIndex = parseInt(m[2], 10) - 1
  return { rowIndex, colIndex }
}

/**
 * 解析「具体位置」字符串，返回所有 (rowIndex, colIndex) 0-based。
 * 支持：C2 | C12,C13,C14 | D25:D37
 */
function parsePositionToCells(position: string): { rowIndex: number; colIndex: number }[] {
  const parts = position.split(',').map((p) => p.trim()).filter(Boolean)
  const cells: { rowIndex: number; colIndex: number }[] = []
  for (const part of parts) {
    if (part.includes(':')) {
      const [start, end] = part.split(':').map((s) => s.trim())
      const s = parseOneCellRef(start)
      const e = parseOneCellRef(end)
      if (!s || !e || s.colIndex !== e.colIndex) {
        const one = parseOneCellRef(part)
        if (one) cells.push(one)
        continue
      }
      for (let r = s.rowIndex; r <= e.rowIndex; r++) {
        cells.push({ rowIndex: r, colIndex: s.colIndex })
      }
    } else {
      const one = parseOneCellRef(part)
      if (one) cells.push(one)
    }
  }
  return cells
}

/** 设备计划表格一行（按方法/仪器一行，访视时间点由 T0/Timm/T2w/T4w 勾选列推导） */
export interface EquipmentTableRow {
  测试设备: string
  测试指标: string
  测试部位: string
  测试点位: string
  访视时间点: string
}

/** 评估计划表格一行 */
export interface EvaluationTableRow {
  评估人员类别: string
  评估指标类别: string
  评估指标: string
  访视时间点: string
  比如特殊人员资质: string
}

/** 辅助测量计划表格一行 */
export interface AuxiliaryTableRow {
  辅助操作名称: string
  操作部位: string
  操作方法: string
  访视时间点: string
}

/** 耗材计划表格一行（单行时也走表格式布局） */
export interface ConsumableTableRow {
  耗材名称: string
  耗材数量: string
  特殊要求: string
  耗材使用访视点: string
  耗材使用场景: string
  耗材使用要求: string
}

/**
 * 按锚点获取「评估计划」块在 sheet 中的行范围与表格数据，供 AI 解析或回退用。
 * 若未找到评估块则返回 { block: [], evaluationRowIndices: [] }。
 */
export function getEvaluationBlockFromSheet(sheetData: string[][]): {
  block: string[][]
  evaluationRowIndices: number[]
} {
  const anchorRanges = findBlockRanges(sheetData)
  let evaluationRowIndices: number[] = []
  if (anchorRanges.evaluation?.rowIndices?.length) {
    evaluationRowIndices = anchorRanges.evaluation.rowIndices
  }
  if (evaluationRowIndices.length === 0) {
    const position = EXECUTION_ORDER_CELL_MAP['评估人员类别']
    if (position) {
      const cells = parsePositionToCells(position)
      evaluationRowIndices = [...new Set(cells.map((c) => c.rowIndex))].sort((a, b) => a - b)
    }
  }
  const block = evaluationRowIndices.map((ri) => (sheetData[ri] ?? []).map((c) => String(c ?? '')))
  return { block, evaluationRowIndices }
}

/**
 * 按「具体位置」从 sheet 二维数组（header:1，即 rowIndex/colIndex 0-based）中取值，拼成一条记录。
 * 若存在设备计划行范围（如 C25:C37），则按行读取 T0/Timm/T2w/T4w 勾选列，生成 equipmentTable，
 * 并通过 __equipmentTable 传入详情页，用于表格展示「每行方法对应其访视时间点」。
 * @param optionalEvaluationTable 若传入且非空，则评估计划使用该表（如 AI 解析结果），否则用规则解析
 */
export function extractByCellMap(
  sheetData: string[][],
  cellMap: Record<string, string> = EXECUTION_ORDER_CELL_MAP,
  optionalEvaluationTable?: EvaluationTableRow[] | null
): { headers: string[]; rows: string[][] } {
  const headers: string[] = []
  const values: string[] = []
  const order = EXECUTION_ORDER_ALL_FIELD_LABELS
  for (const label of order) {
    let val = ''
    if (label === '执行时间周期') {
      val = getExecutionTimeCycleFromSheet(sheetData)
    } else if (label === '执行排期') {
      const position = cellMap[label]
      if (position) {
        const cells = parsePositionToCells(position)
        const vals: string[] = []
        for (const { rowIndex, colIndex } of cells) {
          const row = sheetData[rowIndex]
          if (row && colIndex >= 0 && colIndex < row.length) {
            const v = String(row[colIndex] ?? '').trim()
            if (v) vals.push(v)
          }
        }
        val = vals.join('\n')
      }
      if (!val) val = getExecutionScheduleBlockFromSheet(sheetData)
    } else if (label === '交付节点') {
      val = getAllCellsRightOfAnchor(sheetData, '交付（访视节点）', '交付形式')
    } else if (label === '交付形式') {
      val = getCellRightOfAnchor(sheetData, '交付形式')
    } else {
      const position = cellMap[label]
      if (!position) continue
      const cells = parsePositionToCells(position)
      const vals: string[] = []
      for (const { rowIndex, colIndex } of cells) {
        const row = sheetData[rowIndex]
        if (row && colIndex >= 0 && colIndex < row.length) {
          const v = String(row[colIndex] ?? '').trim()
          if (v) vals.push(v)
        }
      }
      val = vals.join('; ')
    }
    if (DATE_LIKE_FIELD_LABELS.has(label) && val) {
      val = formatExcelSerialToDateDisplay(val)
    }
    headers.push(label)
    values.push(val)
  }

  const anchorRanges = findBlockRanges(sheetData)
  const DATA_COLS = { 测试设备: 2, 测试指标: 3, 测试部位: 4, 测试点位: 5 }
  const C_COL_INDEX = 2
  /** 约束规则：先由锚点确定区块（设备/评估/辅助），区块内某行 C 列为空则该行整行不参与解析。 */
  /** C 列做数据验证时占位符等视为空：以下为「无效空」 */
  const C_EMPTY_LIKE = ['', '-', '—', '--', '请选择', '请选择...', '请选择…', '请选择……']
  const isCellEffectivelyEmpty = (val: unknown): boolean => {
    const s = (val ?? '').toString().trim()
    if (s === '') return true
    if (C_EMPTY_LIKE.includes(s)) return true
    if (/^[\s\-—]+$/.test(s)) return true
    return false
  }
  /** 区块内该行 C 列非空（非无效空）才参与解析 */
  const rowHasNonEmptyC = (ri: number) => !isCellEffectivelyEmpty(sheetData[ri]?.[C_COL_INDEX])
  /** 仅属辅助测量计划的值，不得进入评估计划表（列表/详情的评估人员类别均来自 __evaluationTable，故在此过滤） */
  const EVAL_EXCLUDE_CATEGORIES = ['产品上妆']
  const isExcludedEvaluatorCategory = (v: string) =>
    EVAL_EXCLUDE_CATEGORIES.some((s) => (v || '').trim() === s || (v || '').trim().includes(s))
  const getColByFixed = (rowIndices: number[], colIndex: number): string[] =>
    rowIndices.map((ri) => {
      const row = sheetData[ri]
      return row && colIndex < row.length ? String(row[colIndex] ?? '').trim() : ''
    })

  /** 设备/评估/辅助统一：按第 24 行表头从 H 列起向右扫到 VISIT_COL_MAX，有勾选则取该列表头名；不因连续空列提前停止，避免漏掉 T2w 等 */
  function buildVisitTimePointsFromHeaderRow(rowIndices: number[], visitHeaders: string[]): string[] {
    const colCount = VISIT_COL_MAX - VISIT_COL_START
    const base = visitHeaders.length > 0 ? visitHeaders : DEFAULT_VISIT_HEADERS
    const headers = base.length >= colCount ? base.slice(0, colCount) : [...base, ...new Array(colCount - base.length).fill('')]
    return rowIndices.map((_, i) => {
      const row = sheetData[rowIndices[i]]
      if (!row) return ''
      const rowIdx = rowIndices[i]
      const rowAbove = rowIdx > 0 ? sheetData[rowIdx - 1] : undefined
      const parts: string[] = []
      for (let k = 0; k < colCount; k++) {
        const col = VISIT_COL_START + k
        const raw = row[col]
        const cell = (raw !== undefined && raw !== null ? String(raw) : '').trim()
        let label = (headers[k] ?? '').toString().trim()
        if (!label || isCheckmarkSymbolOnly(label)) {
          const above = rowAbove && col < rowAbove.length ? String(rowAbove[col] ?? '').trim() : ''
          if (above && !isCheckmarkSymbolOnly(above)) label = above
        }
        if (!cell) continue
        if (label && !isCheckmarkSymbolOnly(label)) parts.push(label)
      }
      return parts.join(', ')
    })
  }

  let equipmentRowIndices: number[] = []
  let equipmentStartRow = 0
  let equipmentEndRow = 0
  let equipmentFromAnchor = false
  if (anchorRanges.equipment?.rowIndices?.length) {
    equipmentRowIndices = anchorRanges.equipment.rowIndices
    equipmentStartRow = anchorRanges.equipment.startRow
    equipmentEndRow = anchorRanges.equipment.endRow
    equipmentFromAnchor = true
  }
  if (equipmentRowIndices.length === 0) {
    const equipmentPos = cellMap['测试设备']
    if (equipmentPos) {
      const equipmentCells = parsePositionToCells(equipmentPos)
      equipmentRowIndices = [...new Set(equipmentCells.map((c) => c.rowIndex))].sort((a, b) => a - b)
      if (equipmentRowIndices.length > 0) {
        equipmentStartRow = equipmentRowIndices[0]
        equipmentEndRow = equipmentRowIndices[equipmentRowIndices.length - 1]
      }
    }
  }
  if (equipmentRowIndices.length > 0) {
    equipmentRowIndices = equipmentRowIndices.filter(rowHasNonEmptyC) // 区块内 C 列为空则该行不参与
    const eqVisitHeaders = getVisitHeadersFromRow24(sheetData)
    const equipmentDataRows = equipmentRowIndices
    const devices = getColByFixed(equipmentDataRows, DATA_COLS.测试设备)
    const indicators = getColByFixed(equipmentDataRows, DATA_COLS.测试指标)
    const locations = getColByFixed(equipmentDataRows, DATA_COLS.测试部位)
    const details = getColByFixed(equipmentDataRows, DATA_COLS.测试点位)
    const visitPoints = buildVisitTimePointsFromHeaderRow(equipmentDataRows, eqVisitHeaders)
    const equipmentTable: EquipmentTableRow[] = equipmentDataRows.map((_, i) => ({
      测试设备: devices[i] ?? '',
      测试指标: indicators[i] ?? '',
      测试部位: locations[i] ?? '',
      测试点位: details[i] ?? '',
      访视时间点: visitPoints[i] ?? '',
    }))
    const hasCColumn = (r: EquipmentTableRow) => !isCellEffectivelyEmpty(r.测试设备)
    const filteredTable = equipmentTable.filter(hasCColumn)
    if (filteredTable.length > 0) {
      headers.push('__equipmentTable')
      values.push(JSON.stringify(filteredTable))
    }
  }

  function buildSectionTable<T extends Record<string, string>>(
    firstColKey: string,
    colKeys: (keyof T)[],
    visitCols: Record<string, string>,
    rowFilter: (r: T) => boolean
  ): T[] | null {
    const pos = cellMap[firstColKey as string]
    if (!pos) return null
    const cells = parsePositionToCells(pos)
    if (cells.length === 0) return null
    const rowIndices = [...new Set(cells.map((c) => c.rowIndex))].sort((a, b) => a - b)
    const getCol = (posKey: string): string[] => {
      const p = posKey in cellMap ? cellMap[posKey] : visitCols[posKey]
      if (!p) return []
      const cs = parsePositionToCells(p)
      return rowIndices.map((ri) => {
        const c = cs.find((x) => x.rowIndex === ri)
        if (!c) return ''
        const row = sheetData[c.rowIndex]
        return row && c.colIndex < row.length ? String(row[c.colIndex] ?? '').trim() : ''
      })
    }
    const cols = colKeys.filter((k) => k !== '访视时间点') as string[]
    const dataCols = cols.map((k) => getCol(k))
    const t0Col = getCol('T0')
    const timmCol = getCol('Timm')
    const t2wCol = getCol('T2w')
    const t4wCol = getCol('T4w')
    const sel = (v: string) => (v ?? '').trim() !== ''
    const table: T[] = rowIndices.map((_, i) => {
      const parts: string[] = []
      if (sel(t0Col[i] ?? '')) parts.push('T0')
      if (sel(timmCol[i] ?? '')) parts.push('Timm')
      if (sel(t2wCol[i] ?? '')) parts.push('T2w')
      if (sel(t4wCol[i] ?? '')) parts.push('T4w')
      const row = {} as T
      cols.forEach((k, ci) => {
        row[k as keyof T] = (dataCols[ci][i] ?? '') as T[keyof T]
      })
      ;(row as Record<string, string>)['访视时间点'] = parts.join(', ')
      return row
    })
    const filtered = table.filter(rowFilter)
    return filtered.length > 0 ? filtered : null
  }

  const EVAL_DATA_COLS = { 评估人员类别: 2, 评估指标类别: 4, 评估指标: 3, 比如特殊人员资质: 5 }
  let evaluationRowIndices: number[] = []
  let evalStartRow = 0
  let evalEndRow = 0
  if (anchorRanges.evaluation?.rowIndices?.length) {
    evaluationRowIndices = anchorRanges.evaluation.rowIndices
    evalStartRow = anchorRanges.evaluation.startRow
    evalEndRow = anchorRanges.evaluation.endRow
  }
  if (evaluationRowIndices.length === 0) {
    const evaluationPos = cellMap['评估人员类别']
    if (evaluationPos) {
      const cells = parsePositionToCells(evaluationPos)
      evaluationRowIndices = [...new Set(cells.map((c) => c.rowIndex))].sort((a, b) => a - b)
      if (evaluationRowIndices.length > 0) {
        evalStartRow = evaluationRowIndices[0]
        evalEndRow = evaluationRowIndices[evaluationRowIndices.length - 1]
      }
    }
  }
  if (evaluationRowIndices.length > 0) {
    evaluationRowIndices = evaluationRowIndices.filter(rowHasNonEmptyC) // 区块内 C 列为空则该行不参与
    if (optionalEvaluationTable && Array.isArray(optionalEvaluationTable) && optionalEvaluationTable.length > 0) {
      const filtered = optionalEvaluationTable
        .filter((r) => (r.评估人员类别 || '').trim() !== '')
        .filter((r) => !isExcludedEvaluatorCategory(r.评估人员类别 || ''))
      if (filtered.length > 0) {
        headers.push('__evaluationTable')
        values.push(JSON.stringify(filtered))
      }
    } else {
      const evalVisitHeaders = getVisitHeadersFromRow24(sheetData)
      const evaluationDataRows = evaluationRowIndices
      const visitPointsEval = buildVisitTimePointsFromHeaderRow(evaluationDataRows, evalVisitHeaders)
      const evaluationTable: EvaluationTableRow[] = evaluationDataRows.map((_, i) => ({
        评估人员类别: getColByFixed(evaluationDataRows, EVAL_DATA_COLS.评估人员类别)[i] ?? '',
        评估指标类别: getColByFixed(evaluationDataRows, EVAL_DATA_COLS.评估指标类别)[i] ?? '',
        评估指标: getColByFixed(evaluationDataRows, EVAL_DATA_COLS.评估指标)[i] ?? '',
        访视时间点: visitPointsEval[i] ?? '',
        比如特殊人员资质: getColByFixed(evaluationDataRows, EVAL_DATA_COLS.比如特殊人员资质)[i] ?? '',
      }))
      const filtered = evaluationTable
        .filter((r) => !isCellEffectivelyEmpty(r.评估人员类别))
        .filter((r) => !isExcludedEvaluatorCategory(r.评估人员类别 || ''))
      if (filtered.length > 0) {
        headers.push('__evaluationTable')
        values.push(JSON.stringify(filtered))
      }
    }
  }

  const AUX_DATA_COLS = { 辅助操作名称: 2, 操作部位: 4, 操作方法: 6 }
  let auxiliaryRowIndices: number[] = []
  let auxStartRow = 0
  let auxEndRow = 0
  if (anchorRanges.auxiliary?.rowIndices?.length) {
    auxiliaryRowIndices = anchorRanges.auxiliary.rowIndices
    auxStartRow = anchorRanges.auxiliary.startRow
    auxEndRow = anchorRanges.auxiliary.endRow
  }
  if (auxiliaryRowIndices.length === 0) {
    const auxiliaryPos = cellMap['辅助操作名称']
    if (auxiliaryPos) {
      const cells = parsePositionToCells(auxiliaryPos)
      auxiliaryRowIndices = [...new Set(cells.map((c) => c.rowIndex))].sort((a, b) => a - b)
      if (auxiliaryRowIndices.length > 0) {
        auxStartRow = auxiliaryRowIndices[0]
        auxEndRow = auxiliaryRowIndices[auxiliaryRowIndices.length - 1]
      }
    }
  }
  if (auxiliaryRowIndices.length > 0) {
    auxiliaryRowIndices = auxiliaryRowIndices.filter(rowHasNonEmptyC) // 区块内 C 列为空则该行不参与
    const auxVisitHeaders = getVisitHeadersFromRow24(sheetData)
    const auxiliaryDataRows = auxiliaryRowIndices
    const visitPointsAux = buildVisitTimePointsFromHeaderRow(auxiliaryDataRows, auxVisitHeaders)
    const auxiliaryTable: AuxiliaryTableRow[] = auxiliaryDataRows.map((_, i) => ({
      辅助操作名称: getColByFixed(auxiliaryDataRows, AUX_DATA_COLS.辅助操作名称)[i] ?? '',
      操作部位: getColByFixed(auxiliaryDataRows, AUX_DATA_COLS.操作部位)[i] ?? '',
      操作方法: getColByFixed(auxiliaryDataRows, AUX_DATA_COLS.操作方法)[i] ?? '',
      访视时间点: visitPointsAux[i] ?? '',
    }))
    const filtered = auxiliaryTable.filter((r) => !isCellEffectivelyEmpty(r.辅助操作名称))
    if (filtered.length > 0) {
      headers.push('__auxiliaryTable')
      values.push(JSON.stringify(filtered))
    }
  }

  const consumableFields: (keyof ConsumableTableRow)[] = [
    '耗材名称',
    '耗材数量',
    '特殊要求',
    '耗材使用访视点',
    '耗材使用场景',
    '耗材使用要求',
  ]
  const consumableRow: ConsumableTableRow = {
    耗材名称: '',
    耗材数量: '',
    特殊要求: '',
    耗材使用访视点: '',
    耗材使用场景: '',
    耗材使用要求: '',
  }
  consumableFields.forEach((f) => {
    const i = headers.indexOf(f as string)
    if (i >= 0 && values[i] !== undefined) consumableRow[f] = String(values[i] ?? '').trim()
  })
  if (Object.values(consumableRow).some((v) => v !== '')) {
    headers.push('__consumableTable')
    values.push(JSON.stringify([consumableRow]))
  }

  // 从 A1 遍历整表查找锚点「访视点」，取右侧内容解析为项目访视表并写入 __projectVisitTable
  const projectVisitRaw = getProjectVisitRawFromSheet(sheetData)
  const projectVisitTable = parseProjectVisitRawToTable(projectVisitRaw)
  headers.push('__projectVisitTable')
  values.push(JSON.stringify(projectVisitTable))

  return { headers, rows: [values] }
}

/** 是否存在单元格映射（有配置则优先按格取数） */
export function hasCellMap(): boolean {
  return Object.keys(EXECUTION_ORDER_CELL_MAP).length > 0
}

/**
 * 模版中「左右布局」的字段（仅用于注释；有具体位置时优先用 extractByCellMap）。
 */
export const VERTICAL_LAYOUT_LEFT_RIGHT_FIELDS: string[] = [
  '最低样本量',
  '备份数量',
  '是否分组',
  '分组要求',
  '详述',
]

/** 所有已知字段名（label + aliases）标准化后的集合，用于在全表任意列识别「字段名」单元格 */
function buildKnownFieldNameSet(): Set<string> {
  const set = new Set<string>()
  for (const sec of EXECUTION_ORDER_PLAN_SECTIONS) {
    for (const f of sec.fields) {
      const label = f.label.trim()
      set.add(normalizeHeaderForMatch(label))
      for (const a of f.aliases ?? []) {
        set.add(normalizeHeaderForMatch(String(a).trim()))
      }
    }
  }
  return set
}

const knownFieldNameSet = buildKnownFieldNameSet()

function isKnownFieldName(cell: string): boolean {
  const n = normalizeHeaderForMatch(cell)
  return n.length > 0 && knownFieldNameSet.has(n)
}

/**
 * 判断并转换「纵向」模版：遍历表格所有行、所有列，只要某格是已知字段名则下一格为其值。
 * 不限于 B 列：上下布局一行一对、左右布局一行多对，均通过「全表遍历」统一识别。
 */
export function convertVerticalLayoutToHeadersRows(rawRows: string[][]): { headers: string[]; rows: string[][] } | null {
  if (!Array.isArray(rawRows) || rawRows.length < 2) return null
  const trim = (s: unknown) => String(s ?? '').trim()
  const firstRow = rawRows[0] ?? []
  const firstCell = trim(firstRow[0])
  const secondCell = trim(firstRow[1])
  const looksLikeTitleRow = firstCell.includes('执行订单') || (firstCell.includes('测试') && secondCell.length === 0)
  const rows = looksLikeTitleRow ? rawRows.slice(1) : rawRows
  if (rows.length < 2) return null
  let verticalRowCount = 0
  for (const row of rows) {
    const col1 = trim(row[1])
    if (col1 && col1.length < 80) verticalRowCount++
    if (verticalRowCount >= 3) break
  }
  if (verticalRowCount < 3) return null

  const valueByField = new Map<string, string>()
  for (const row of rows) {
    const arr = (row ?? []).map((c) => trim(c))
    let i = 1
    while (i < arr.length - 1) {
      const cell = arr[i]
      if (cell && isKnownFieldName(cell)) {
        const value = (arr[i + 1] ?? '').trim()
        const existing = valueByField.get(cell)
        valueByField.set(cell, existing ? `${existing}; ${value}` : value)
        i += 2
      } else {
        i += 1
      }
    }
  }
  if (valueByField.size === 0) return null

  const orderedHeaders: string[] = []
  const orderedValues: string[] = []
  const matchedExcelKeys = new Set<string>()
  for (const sec of EXECUTION_ORDER_PLAN_SECTIONS) {
    for (const f of sec.fields) {
      const label = f.label.trim()
      const candidates = [label, ...(f.aliases ?? [])]
      const vals: string[] = []
      for (const excelKey of valueByField.keys()) {
        const n = normalizeHeaderForMatch(excelKey)
        if (!n) continue
        const match = candidates.some((c) => normalizeHeaderForMatch(c) === n || excelKey === c)
        if (match) {
          vals.push(valueByField.get(excelKey) ?? '')
          matchedExcelKeys.add(excelKey)
        }
      }
      if (vals.length > 0) {
        orderedHeaders.push(label)
        orderedValues.push(vals.join('; '))
      }
    }
  }
  for (const [k, v] of valueByField) {
    if (matchedExcelKeys.has(k)) continue
    orderedHeaders.push(k)
    orderedValues.push(v)
  }
  return { headers: orderedHeaders, rows: [orderedValues] }
}

/** 表头（标准化后）→ 所属 sectionKey + 展示用字段名；同一表头可属于多模块（如 访视时间点 在访视/设备/评估），需全部填值 */
function buildHeaderToSectionField(
  sections: PlanSectionDef[]
): Map<string, { sectionKey: string; fieldLabel: string }[]> {
  const map = new Map<string, { sectionKey: string; fieldLabel: string }[]>()
  for (const sec of sections) {
    for (const f of sec.fields) {
      const label = f.label.trim()
      const normLabel = normalizeHeaderForMatch(label)
      const entry = { sectionKey: sec.key, fieldLabel: label }
      const existing = map.get(normLabel) ?? []
      if (!existing.some((e) => e.sectionKey === sec.key && e.fieldLabel === label)) {
        existing.push(entry)
        map.set(normLabel, existing)
      }
      if (f.aliases) {
        for (const a of f.aliases) {
          const n = normalizeHeaderForMatch(a)
          const list = map.get(n) ?? []
          if (!list.some((e) => e.sectionKey === sec.key && e.fieldLabel === label)) {
            list.push(entry)
            map.set(n, list)
          }
        }
      }
    }
  }
  return map
}

const headerToSectionField = buildHeaderToSectionField(EXECUTION_ORDER_PLAN_SECTIONS)

export interface SectionDisplayRow {
  sectionKey: string
  sectionTitle: string
  /** 按配置顺序的 (字段名, 值) */
  pairs: { label: string; value: string }[]
}

/** 从一行数据取与 headers 对应的字符串数组 */
function rowToValues(row: unknown, headers: string[]): string[] {
  if (Array.isArray(row)) {
    return (row as unknown[]).map((c) => String(c ?? ''))
  }
  const obj = row as Record<string, unknown>
  return headers.map((h) => String(obj[h] ?? ''))
}

/** 将「访视点」右侧取到的原始字符串（分号分段、冒号分左右）解析为项目访视表 */
function parseProjectVisitRawToTable(raw: string): { 访视时间点: string; 访视层次: string }[] {
  const s = (raw ?? '').trim()
  if (!s) return []
  const segments = s.split(/\s*[;；]\s*/).map((seg) => seg.trim()).filter(Boolean)
  const result: { 访视时间点: string; 访视层次: string }[] = []
  for (const seg of segments) {
    const colonHalf = seg.indexOf(':')
    const colonFull = seg.indexOf('：')
    const colonIdx = colonHalf >= 0 && (colonFull < 0 || colonHalf <= colonFull) ? colonHalf : colonFull >= 0 ? colonFull : -1
    const left = (colonIdx >= 0 ? seg.slice(0, colonIdx) : seg).trim()
    const right = (colonIdx >= 0 ? seg.slice(colonIdx + 1) : '').trim()
    result.push({ 访视时间点: left, 访视层次: right })
  }
  return result
}

/** 从原始表 sheetData 自 A1 遍历整表查找锚点「访视点」，取该行锚点右侧第一个非空单元格内容（与 getCellRightOfAnchor 一致：相等或互相包含、忽略换行） */
function getProjectVisitRawFromSheet(sheetData: string[][]): string {
  const anchor = '访视点'
  const anchorNorm = normalizeHeaderForMatch(anchor.replace(/\r\n?|\n/g, ''))
  const trim = (s: string) => (s ?? '').trim()
  for (let ri = 0; ri < sheetData.length; ri++) {
    const row = sheetData[ri]
    if (!row) continue
    for (let ci = 0; ci < row.length; ci++) {
      const raw = String(row[ci] ?? '')
      const cell = trim(raw)
      if (!cell) continue
      const cellNorm = normalizeHeaderForMatch(cell.replace(/\r\n?|\n/g, ''))
      const isMatch =
        cell.includes('访视点') ||
        cellNorm === anchorNorm ||
        cellNorm.includes(anchorNorm) ||
        anchorNorm.includes(cellNorm)
      if (isMatch) {
        for (let cj = ci + 1; cj < row.length; cj++) {
          const val = trim(String(row[cj] ?? ''))
          if (val) return val
        }
        return ''
      }
    }
  }
  return ''
}

/**
 * 项目访视：从 A1 开始遍历整张表（先行后列、不限制行数列数），用与交付形式一致的匹配规则（相等或互相包含、忽略换行）查找锚点「访视点」，找到后在该行从锚点右侧扫到行末取第一个非空，再按分号、冒号拆分为「访视时间点」+「访视层次」表格。
 * 格式示例：T0&Timm&T8h : V1; T1w : V2; → [{ 访视时间点: 'T0&Timm&T8h', 访视层次: 'V1' }, { 访视时间点: 'T1w', 访视层次: 'V2' }]
 */
export function parseProjectVisitFromVisitPointRightCell(
  headers: string[],
  rows: unknown[]
): { 访视时间点: string; 访视层次: string }[] {
  const anchor = '访视点'
  const anchorNorm = normalizeHeaderForMatch(anchor.replace(/\r\n?|\n/g, ''))
  if (!headers.length) return []

  // 构建整表：第 0 行为表头，后续行为数据
  const grid: string[][] = [headers.map((h) => String(h ?? ''))]
  const rowList = Array.isArray(rows) ? rows : []
  for (const r of rowList) {
    grid.push(rowToValues(r, headers))
  }

  let anchorRowIdx = -1
  let anchorColIdx = -1
  for (let ri = 0; ri < grid.length; ri++) {
    const row = grid[ri]
    if (!row) continue
    for (let ci = 0; ci < row.length; ci++) {
      const raw = String(row[ci] ?? '')
      const cell = raw.trim()
      if (!cell) continue
      const cellNorm = normalizeHeaderForMatch(cell.replace(/\r\n?|\n/g, ''))
      const isMatch =
        cell.includes('访视点') ||
        cellNorm === anchorNorm ||
        cellNorm.includes(anchorNorm) ||
        anchorNorm.includes(cellNorm)
      if (isMatch) {
        anchorRowIdx = ri
        anchorColIdx = ci
        break
      }
    }
    if (anchorColIdx >= 0) break
  }

  if (anchorRowIdx < 0 || anchorColIdx < 0) return []
  const rowValues = grid[anchorRowIdx]
  if (anchorColIdx + 1 >= rowValues.length) return []
  // 从锚点右侧扫到行末，取第一个非空（不限制列数）
  let raw = ''
  for (let i = anchorColIdx + 1; i < rowValues.length; i++) {
    const v = (rowValues[i] ?? '').trim()
    if (v) {
      raw = v
      break
    }
  }
  if (!raw) return []
  return parseProjectVisitRawToTable(raw)
}

/**
 * 将解析得到的 headers + 第一行，按计划模块聚合并保持字段顺序（用于资源需求 Tab 单条执行订单展示）
 * 每个计划一个模块，模块内为「字段 → 解析出的内容」横向排列
 */
export function mapExecutionOrderToSections(
  headers: string[],
  rows: unknown[]
): SectionDisplayRow[] {
  const rowArrays = Array.isArray(rows) ? rows : []
  const firstRow = rowArrays[0]
  const values = headers.length && firstRow != null ? rowToValues(firstRow, headers) : []

  const sectionOrder = EXECUTION_ORDER_PLAN_SECTIONS.map((s) => s.key)
  const titleByKey = new Map(EXECUTION_ORDER_PLAN_SECTIONS.map((s) => [s.key, s.title]))
  const fieldsByKey = new Map(
    EXECUTION_ORDER_PLAN_SECTIONS.map((s) => [s.key, s.fields.map((f) => f.label)])
  )

  /** 表头索引 → 该列可能归属的多个 (sectionKey, fieldLabel)，同一表头可填多模块 */
  const headerIndexToMeta: { sectionKey: string; fieldLabel: string }[][] = []
  for (const h of headers) {
    const normalized = normalizeHeaderForMatch(String(h ?? ''))
    const list = normalized ? headerToSectionField.get(normalized) ?? null : null
    if (list && list.length > 0) {
      headerIndexToMeta.push(list)
    } else {
      headerIndexToMeta.push([{ sectionKey: '', fieldLabel: (h && String(h)) || '' }])
    }
  }

  const bySection = new Map<string, Map<string, string>>()
  for (const key of sectionOrder) {
    bySection.set(key, new Map())
  }
  /** 辅助专有词：这些值只应出现在辅助测量计划，不写入评估计划（思路三） */
  const AUXILIARY_ONLY_VALUES = ['产品上妆']
  const isAuxiliaryOnlyValue = (v: string) =>
    AUXILIARY_ONLY_VALUES.some((s) => (v || '').trim() === s || (v || '').trim().includes(s))

  headers.forEach((h, i) => {
    const metas = headerIndexToMeta[i]
    const value = (values[i] ?? '').trim()
    const sourceHeader = (h && String(h).trim()) || ''
    for (const meta of metas) {
      if (!meta.sectionKey) continue
      if (meta.sectionKey === 'evaluation' && isAuxiliaryOnlyValue(value)) continue
      const map = bySection.get(meta.sectionKey)!
      if (meta.sectionKey === 'facility' && meta.fieldLabel === '场地类型') {
        const current = map.get(meta.fieldLabel) || ''
        const part = sourceHeader ? `${sourceHeader}${value ? ': ' + value : ''}` : value
        map.set(meta.fieldLabel, current ? `${current}; ${part}` : part)
      } else {
        map.set(meta.fieldLabel, value)
      }
    }
  })

  // 评估/辅助：先行后列——先查对应行（B 列「临床评估指标」「操作」），再查对应列取单元格
  const ROW_TYPE_COL_INDEX = 1 // B 列
  const colTestMethod = findColumnIndexByKeyword(headers, '测试/评估方法')
  const colTestPosition = findColumnIndexByKeyword(headers, '测试/评估位置')
  const colTestIndicator = findColumnIndexByKeyword(headers, '测试/评估指标')
  const colDetail = findColumnIndexByKeyword(headers, '详述要求')
  const evalMap = bySection.get('evaluation')!
  const auxMap = bySection.get('auxiliary')!
  const appendOrSet = (map: Map<string, string>, label: string, val: string) => {
    const v = (val ?? '').trim()
    if (!v) return
    const cur = map.get(label) || ''
    map.set(label, cur ? `${cur}; ${v}` : v)
  }
  for (const row of rowArrays) {
    const rowVals = rowToValues(row, headers)
    const rowTypeCell = (rowVals[ROW_TYPE_COL_INDEX] ?? '').trim()
    const normRowType = normalizeHeaderForMatch(rowTypeCell)
    const isProductMakeupRow = normRowType.includes('产品上妆') || rowTypeCell.includes('产品上妆')
    if (
      (normRowType.includes('临床评估指标') || rowTypeCell.includes('临床评估指标')) &&
      !isProductMakeupRow
    ) {
      if (colTestMethod >= 0) appendOrSet(evalMap, '评估人员类别', rowVals[colTestMethod])
      if (colTestPosition >= 0) appendOrSet(evalMap, '评估指标类别', rowVals[colTestPosition])
      if (colTestIndicator >= 0) appendOrSet(evalMap, '评估指标', rowVals[colTestIndicator])
    }
    if (normRowType.includes('操作')) {
      if (colTestMethod >= 0) appendOrSet(auxMap, '辅助操作名称', rowVals[colTestMethod])
      if (colTestPosition >= 0) appendOrSet(auxMap, '操作部位', rowVals[colTestPosition])
      if (colDetail >= 0) appendOrSet(auxMap, '操作方法', rowVals[colDetail])
    }
    if (isProductMakeupRow) {
      if (colTestMethod >= 0) appendOrSet(auxMap, '辅助操作名称', rowVals[colTestMethod])
      if (colTestPosition >= 0) appendOrSet(auxMap, '操作部位', rowVals[colTestPosition])
      if (colDetail >= 0) appendOrSet(auxMap, '操作方法', rowVals[colDetail])
    }
  }

  const result: SectionDisplayRow[] = []
  for (const key of sectionOrder) {
    const title = titleByKey.get(key) || key
    const fieldLabels = fieldsByKey.get(key) || []
    const valueMap = bySection.get(key)!
    const pairs = fieldLabels.map((label) => ({
      label,
      value: valueMap.get(label) ?? '',
    }))
    result.push({ sectionKey: key, sectionTitle: title, pairs })
  }
  return result
}

/** 资源需求列表展示用：每行摘要字段及表头别名（含模版列名） */
export const RESOURCE_DEMAND_LIST_FIELDS = [
  { key: 'project_code', label: '项目编号', headerAliases: ['项目编号'] },
  { key: 'business_type', label: '业务类型', headerAliases: ['业务类型'] },
  { key: 'group', label: '组别', headerAliases: ['组别'] },
  { key: 'sample_size', label: '样本量', headerAliases: ['样本量', '样本数量', '最低样本量'] },
  { key: 'backup_sample_size', label: '备份样本量', headerAliases: ['备份样本量', '备份数量'] },
  { key: 'visit_timepoint', label: '访视时间点', headerAliases: ['访视时间点'] },
  { key: 'execution_period', label: '执行周期', headerAliases: ['执行周期', '执行时间周期', '排期时间', 'Field work'] },
  { key: 'test_equipment', label: '测试设备', headerAliases: ['测试设备', '测试/评估方法'] },
  { key: 'evaluator_category', label: '评估人员类别', headerAliases: ['评估人员类别'] },
] as const

export type ResourceDemandSummary = {
  project_code: string
  business_type: string
  group: string
  sample_size: string
  backup_sample_size: string
  visit_timepoint: string
  execution_period: string
  test_equipment: string
  evaluator_category: string
}

/** 从一行数据中按表头匹配摘要字段（用于资源需求列表）；模版列名与资源需求字段别名做标准化后匹配，空值返回空字符串 */
function getRowValueByHeader(
  headers: string[],
  row: unknown,
  headerAliases: string[]
): string {
  const normalizedAliases = headerAliases.map((a) => normalizeHeaderForMatch(String(a)))
  const idx = headers.findIndex((h) => {
    const n = normalizeHeaderForMatch(String(h ?? ''))
    return n && normalizedAliases.some((a) => a === n)
  })
  if (idx < 0) return ''
  if (Array.isArray(row)) {
    return String((row as unknown[])[idx] ?? '').trim()
  }
  const obj = row as Record<string, unknown>
  const headerName = headers[idx]
  return String(obj[headerName] ?? '').trim()
}

/** 列表「评估人员类别」展示时也排除仅属辅助的值（与解析层 EVAL_EXCLUDE 一致） */
const LIST_EVAL_EXCLUDE_CATEGORIES = ['产品上妆']
const isExcludedForList = (s: string) =>
  LIST_EVAL_EXCLUDE_CATEGORIES.some((x) => (s || '').trim() === x || (s || '').trim().includes(x))

/** 从当前行的 __evaluationTable 中取出所有「评估人员类别」并用 ； 拼接，与详情页评估计划一致；无表或解析失败返回空；仅属辅助的值不展示 */
function getEvaluatorCategoryFromEvaluationTable(headers: string[], row: unknown): string {
  const idx = headers.indexOf('__evaluationTable')
  if (idx < 0) return ''
  let raw: unknown
  if (Array.isArray(row)) {
    raw = (row as unknown[])[idx]
  } else {
    raw = (row as Record<string, unknown>)['__evaluationTable']
  }
  if (raw == null || typeof raw !== 'string') return ''
  try {
    const arr = JSON.parse(raw) as unknown[]
    if (!Array.isArray(arr)) return ''
    const values = arr
      .map((r) => (r && typeof r === 'object' && '评估人员类别' in r ? String((r as Record<string, unknown>).评估人员类别 ?? '').trim() : ''))
      .filter((s) => s !== '' && !isExcludedForList(s))
    return values.join('；')
  } catch {
    return ''
  }
}

/**
 * 将一行解析数据转为资源需求列表摘要（项目编号、样本量、备份样本量、访视时间点、执行周期、测试设备、评估人员类别）
 * 评估人员类别：取自详情页评估计划表 __evaluationTable 中每行的「评估人员类别」字段，多行用 ； 区分
 */
export function getResourceDemandSummaryRow(
  headers: string[],
  row: unknown
): ResourceDemandSummary {
  const get = (aliases: readonly string[]) =>
    getRowValueByHeader(headers, row, [...aliases])
  const evaluatorFromTable = getEvaluatorCategoryFromEvaluationTable(headers, row)
  const fallbackEval = get(RESOURCE_DEMAND_LIST_FIELDS[8].headerAliases)
  const evaluatorCategory =
    evaluatorFromTable || (isExcludedForList(fallbackEval) ? '' : fallbackEval)
  return {
    project_code: get(RESOURCE_DEMAND_LIST_FIELDS[0].headerAliases),
    business_type: get(RESOURCE_DEMAND_LIST_FIELDS[1].headerAliases),
    group: get(RESOURCE_DEMAND_LIST_FIELDS[2].headerAliases),
    sample_size: get(RESOURCE_DEMAND_LIST_FIELDS[3].headerAliases),
    backup_sample_size: get(RESOURCE_DEMAND_LIST_FIELDS[4].headerAliases),
    visit_timepoint: get(RESOURCE_DEMAND_LIST_FIELDS[5].headerAliases),
    execution_period: get(RESOURCE_DEMAND_LIST_FIELDS[6].headerAliases),
    test_equipment: get(RESOURCE_DEMAND_LIST_FIELDS[7].headerAliases),
    evaluator_category: evaluatorCategory,
  }
}

/**
 * 单行模式：按计划模块展示某一行（用于详情页）
 */
export function mapExecutionOrderToSectionsForRow(
  headers: string[],
  row: unknown
): SectionDisplayRow[] {
  return mapExecutionOrderToSections(headers, row != null ? [row] : [])
}
