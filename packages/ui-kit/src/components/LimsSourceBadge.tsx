/**
 * LimsSourceBadge - LIMS 数据来源标识组件
 *
 * 用于在工作台列表/详情页标记该记录来自 LIMS 历史导入，
 * 让业务人员清楚区分历史数据与新系统录入数据。
 *
 * 使用示例：
 *   <LimsSourceBadge batchNo="20260318_143000" />
 *   <LimsSourceBadge compact />      // 只显示小图标
 *   <LimsSourceBadge showTooltip />  // 带说明文字
 */

interface LimsSourceBadgeProps {
  /** 来源批次号 */
  batchNo?: string
  /** 紧凑模式（只显示点标记） */
  compact?: boolean
  /** 是否显示说明文字 */
  showTooltip?: boolean
  /** 自定义类名 */
  className?: string
}

export function LimsSourceBadge({
  batchNo,
  compact = false,
  showTooltip = false,
  className = '',
}: LimsSourceBadgeProps) {
  const label = compact ? 'L' : 'LIMS导入'
  const title = showTooltip
    ? `此数据从 LIMS 系统历史导入${batchNo ? `，批次: ${batchNo}` : ''}`
    : undefined

  if (compact) {
    return (
      <span
        title={title}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold ${className}`}
      >
        L
      </span>
    )
  }

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
      {label}
    </span>
  )
}

/**
 * isLimsImported - 判断记录是否来自 LIMS 导入
 *
 * 检查 record.properties._lims_source 或 record._lims_source 字段
 */
export function isLimsImported(record: Record<string, any>): boolean {
  if (!record) return false
  const props = record.properties || record.metadata || {}
  return Boolean(
    record._lims_source ||
    props._lims_source ||
    record.source === 'lims' ||
    props.source === 'lims'
  )
}

/**
 * getLimsBatchNo - 从记录中提取 LIMS 批次号
 */
export function getLimsBatchNo(record: Record<string, any>): string {
  if (!record) return ''
  const props = record.properties || record.metadata || {}
  return (
    record._lims_batch ||
    props._source_batch ||
    props._lims_batch ||
    ''
  )
}
