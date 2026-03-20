/**
 * AI 解析过程弹窗（与 KIS 一致）
 * 实时展示 subagent 调用进度与日志，支持单独解析入口；日志区支持滚动查看。
 */
import { Modal, Button, Badge } from '@cn-kis/ui-kit'

export type AiParseStatus = 'pending' | 'running' | 'success' | 'failed'

export interface AiParseProgressItem {
  subagent: string
  status: AiParseStatus
  startedAt?: string
  endedAt?: string
  durationMs?: number
  httpStatus?: number
  errorMessage?: string
}

export interface AiParseLogItem {
  id: string
  timestamp: string
  level: 'info' | 'success' | 'error'
  message: string
  subagent?: string
}

export interface AiParseProgressDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: AiParseProgressItem[]
  logs: AiParseLogItem[]
  isRunning: boolean
  showSingleParse?: boolean
  onSingleParse?: (subagent: string) => void
}

const statusVariant = (s: AiParseStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (s === 'success') return 'default'
  if (s === 'failed') return 'destructive'
  if (s === 'running') return 'secondary'
  return 'outline'
}

const statusLabel = (s: AiParseStatus): string => {
  switch (s) {
    case 'success': return '成功'
    case 'failed': return '失败'
    case 'running': return '进行中'
    default: return '待处理'
  }
}

export function AiParseProgressDialog({
  open,
  onOpenChange,
  items,
  logs,
  isRunning,
  showSingleParse = false,
  onSingleParse,
}: AiParseProgressDialogProps) {
  const total = items.length
  const completed = items.filter((i) => i.status === 'success' || i.status === 'failed').length
  const allowSingle = showSingleParse && typeof onSingleParse === 'function'

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="AI 解析过程"
      footer={null}
      size="xl"
      closeOnOverlay={!isRunning}
    >
      <div className="flex flex-col gap-4 max-h-[80vh] min-h-0 overflow-hidden flex-1">
        <div className="flex items-center justify-between gap-4 shrink-0">
          <span className="text-sm font-medium text-slate-800">进度</span>
          <Badge variant={isRunning ? 'secondary' : 'outline'}>
            {completed}/{total} 已完成
          </Badge>
        </div>
        <div className="min-h-0 shrink-0 max-h-[35vh] overflow-y-auto pr-1 space-y-2">
          {items.map((item) => (
            <div
              key={item.subagent}
              className="flex items-start justify-between gap-4 rounded-md border border-slate-200 px-3 py-2"
            >
              <div className="space-y-1">
                <div className="text-sm font-medium text-slate-800">{item.subagent}</div>
                <div className="text-xs text-slate-500">
                  {item.startedAt ? `开始：${item.startedAt}` : '未开始'}
                  {item.endedAt ? ` | 结束：${item.endedAt}` : ''}
                  {typeof item.durationMs === 'number' ? ` | 耗时：${item.durationMs}ms` : ''}
                </div>
                {item.errorMessage && (
                  <div className="text-xs text-red-600">{item.errorMessage}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {allowSingle && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSingleParse?.(item.subagent)}
                  >
                    单独解析
                  </Button>
                )}
                {typeof item.httpStatus === 'number' && (
                  <span className="text-xs text-slate-500">{item.httpStatus}</span>
                )}
                <Badge variant={statusVariant(item.status)}>
                  {statusLabel(item.status)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        <div className="flex-1 min-h-0 flex flex-col rounded-lg border-2 border-slate-200 bg-slate-50/50 overflow-hidden">
          <div className="text-sm font-medium shrink-0 px-3 py-2 border-b border-slate-200 bg-white/80">
            调用日志
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 text-xs">
            {logs.length === 0 ? (
              <div className="text-slate-500">暂无日志</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2">
                  <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                  <span
                    className={
                      log.level === 'error'
                        ? 'text-red-600 shrink-0'
                        : log.level === 'success'
                          ? 'text-green-600 shrink-0'
                          : 'text-slate-500 shrink-0'
                    }
                  >
                    {log.subagent ? `[${log.subagent}]` : '[系统]'}
                  </span>
                  <span className="break-words">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
