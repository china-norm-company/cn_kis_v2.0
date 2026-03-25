/**
 * @cn-kis/ui-kit - IBKD 设计系统 UI 组件库
 *
 * 所有飞书 H5 工作台共享此组件库
 */

// UI 组件
export { Button } from './components/Button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/Button'

export { Card } from './components/Card'
export type { CardProps, CardVariant } from './components/Card'

export { Input } from './components/Input'
export type { InputProps } from './components/Input'

export { Select } from './components/Select'
export type { SelectProps, SelectOption } from './components/Select'

export { Badge } from './components/Badge'
export type { BadgeProps, BadgeVariant, BadgeSize } from './components/Badge'

export { Modal } from './components/Modal'
export type { ModalProps } from './components/Modal'

export { DataTable } from './components/DataTable'
export type { DataTableProps, Column } from './components/DataTable'

export { StatCard } from './components/StatCard'
export type { StatCardProps } from './components/StatCard'

export { Tabs } from './components/Tabs'
export type { TabsProps, TabItem } from './components/Tabs'

export { Empty } from './components/Empty'
export type { EmptyProps } from './components/Empty'

export { ExportButton } from './components/ExportButton'
export type { ExportButtonProps } from './components/ExportButton'

export { AIInsightWidget } from './components/AIInsightWidget'

export { ClawQuickPanel, useClawQuickActions } from './components/ClawQuickPanel'
export type { ClawQuickPanelProps, QuickAction } from './components/ClawQuickPanel'

export { DigitalWorkerSuggestionBar } from './components/DigitalWorkerSuggestionBar'
export type { DigitalWorkerSuggestionBarProps, SuggestionItem as UISuggestionItem, SuggestionAction } from './components/DigitalWorkerSuggestionBar'

export { DigitalWorkerActionCard } from './components/DigitalWorkerActionCard'
export type { DigitalWorkerActionCardProps, ActionItem } from './components/DigitalWorkerActionCard'

export { ErrorBoundary } from './components/ErrorBoundary'
export type { ErrorBoundaryProps } from './components/ErrorBoundary'

export { OfflineBanner } from './components/OfflineBanner'
export type { OfflineBannerProps } from './components/OfflineBanner'

export { HealthPage } from './components/HealthPage'
export type { HealthPageProps } from './components/HealthPage'

export { ApprovalTimeline, type ApprovalStep, type ApprovalTimelineProps } from './components/ApprovalTimeline'

export { ActionCard, type ActionCardProps, type ActionCardItem } from './components/ActionCard'
export {
  MobileWorkstationLayout,
  type MobileWorkstationLayoutProps,
  type MobileWorkstationNavItem,
} from './components/MobileWorkstationLayout'

// LIMS 数据来源标识
export {
  LimsSourceBadge,
  isLimsImported,
  getLimsBatchNo,
} from './components/LimsSourceBadge'
export type { } from './components/LimsSourceBadge'

// 工具函数
export { exportData, exportToCSV, exportToJSON, exportToExcel, formatFilename } from './utils/exportUtils'
export type { ExportFormat, ExportOptions } from './utils/exportUtils'
