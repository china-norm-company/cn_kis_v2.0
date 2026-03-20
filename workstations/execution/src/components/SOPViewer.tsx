/**
 * SOP 内联展示组件
 *
 * P3.2: 工单详情页"操作规范"Tab
 * - 若 SOP 有 feishu_doc_url 则 iframe 嵌入飞书文档
 * - 若有 description 则渲染 Markdown
 * - 支持从 SOP 提取关键步骤生成 Checklist
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { qualityApi, workorderApi } from '@cn-kis/api-client'
import type { SOP } from '@cn-kis/api-client'
import { Badge, Empty, Button } from '@cn-kis/ui-kit'
import { FileText, ExternalLink, BookOpen, CheckCircle } from 'lucide-react'

interface SOPViewerProps {
  sopId: number | null | undefined
  workOrderId?: number
  sopConfirmed?: boolean
  className?: string
}

export default function SOPViewer({ sopId, workOrderId, sopConfirmed, className = '' }: SOPViewerProps) {
  const queryClient = useQueryClient()

  const confirmMutation = useMutation({
    mutationFn: () => workorderApi.confirmSop(workOrderId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workorder', 'detail', workOrderId] })
    },
  })

  const { data: sopRes, isLoading } = useQuery({
    queryKey: ['quality', 'sop', sopId],
    queryFn: () => qualityApi.getSOP(sopId!),
    enabled: !!sopId,
  })

  const sop = sopRes?.data as SOP | undefined

  if (!sopId) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 p-5 ${className}`}>
        <Empty message="此活动未关联 SOP" />
      </div>
    )
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-slate-400">加载 SOP...</div>
  }

  if (!sop) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 p-5 ${className}`}>
        <Empty message="SOP 未找到" />
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-xl border border-slate-200 ${className}`}>
      {/* SOP Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-primary-500" />
          <div>
            <div className="text-sm font-semibold text-slate-800">{sop.title}</div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span>{sop.code}</span>
              <span>v{sop.version}</span>
              <Badge variant={sop.status === 'effective' ? 'success' : 'default'}>
                {sop.status === 'effective' ? '生效中' : sop.status}
              </Badge>
            </div>
          </div>
        </div>
        {sop.feishu_doc_url && (
          <a
            href={sop.feishu_doc_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
          >
            <ExternalLink className="w-3 h-3" />
            在飞书中打开
          </a>
        )}
      </div>

      {/* SOP Content */}
      <div className="p-4">
        {sop.feishu_doc_url ? (
          <iframe
            src={sop.feishu_doc_url}
            className="w-full h-[500px] border-0 rounded-lg"
            title={sop.title}
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        ) : sop.description ? (
          <div className="prose prose-sm prose-slate max-w-none">
            <div dangerouslySetInnerHTML={{ __html: markdownToHtml(sop.description) }} />
          </div>
        ) : (
          <p className="text-sm text-slate-400">暂无操作规范内容</p>
        )}
      </div>

      {/* P2-2: SOP 确认按钮 */}
      {workOrderId && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3">
          {sopConfirmed ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span>已确认阅读并理解操作规范</span>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
            >
              {confirmMutation.isPending ? '确认中...' : '我已阅读并理解此操作规范'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** Simple markdown-to-HTML (for inline display, not a full parser) */
function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}
