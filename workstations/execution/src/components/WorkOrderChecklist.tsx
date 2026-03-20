/**
 * P3.3: 工单检查清单组件
 *
 * 展示工单关联的操作检查清单，支持逐项勾选。
 * 必须项全部勾选后才能完成工单。
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workorderApi } from '@cn-kis/api-client'
import { Badge, Empty } from '@cn-kis/ui-kit'
import { CheckSquare, Square, ShieldCheck, Clock } from 'lucide-react'

interface ChecklistItem {
  id: number
  sequence: number
  item_text: string
  is_mandatory: boolean
  is_checked: boolean
  checked_at: string | null
  checked_by: number | null
}

interface WorkOrderChecklistProps {
  workOrderId: number
  readOnly?: boolean
  onAllMandatoryChecked?: (allChecked: boolean) => void
}

export default function WorkOrderChecklist({
  workOrderId,
  readOnly = false,
  onAllMandatoryChecked,
}: WorkOrderChecklistProps) {
  const queryClient = useQueryClient()

  const { data: res, isLoading } = useQuery({
    queryKey: ['workorder', 'checklists', workOrderId],
    queryFn: () => workorderApi.getChecklists(workOrderId),
    enabled: !!workOrderId,
  })

  const items = (res?.data || []) as ChecklistItem[]
  const mandatoryItems = items.filter((i) => i.is_mandatory)
  const allMandatoryChecked = mandatoryItems.length > 0 && mandatoryItems.every((i) => i.is_checked)
  const checkedCount = items.filter((i) => i.is_checked).length

  const toggleMutation = useMutation({
    mutationFn: ({ checklistId, isChecked }: { checklistId: number; isChecked: boolean }) =>
      workorderApi.toggleChecklist(workOrderId, checklistId, { is_checked: isChecked }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workorder', 'checklists', workOrderId] })
    },
  })

  // Notify parent about mandatory check status
  if (onAllMandatoryChecked) {
    onAllMandatoryChecked(allMandatoryChecked)
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-slate-400">加载检查清单...</div>
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <Empty message="暂无检查清单" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <ShieldCheck className="w-4 h-4" />
          操作检查清单
        </h3>
        <span className="text-xs text-slate-400">
          {checkedCount}/{items.length} 项已完成
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
              item.is_checked
                ? 'bg-green-50/50 border-green-200'
                : item.is_mandatory
                ? 'bg-white border-slate-200'
                : 'bg-white border-slate-100'
            }`}
          >
            <button
              onClick={() => {
                if (!readOnly) {
                  toggleMutation.mutate({
                    checklistId: item.id,
                    isChecked: !item.is_checked,
                  })
                }
              }}
              disabled={readOnly || toggleMutation.isPending}
              className="mt-0.5 shrink-0 disabled:opacity-50"
            >
              {item.is_checked ? (
                <CheckSquare className="w-5 h-5 text-green-600" />
              ) : (
                <Square className="w-5 h-5 text-slate-300" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <span className={`text-sm ${
                item.is_checked ? 'text-slate-400 line-through' : 'text-slate-700'
              }`}>
                {item.item_text}
              </span>
              <div className="flex items-center gap-2 mt-1">
                {item.is_mandatory && <Badge variant="primary">必须</Badge>}
                {item.checked_at && (
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    {new Date(item.checked_at).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!allMandatoryChecked && mandatoryItems.length > 0 && (
        <div className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
          请先完成所有必须检查项后再完成工单
        </div>
      )}
    </div>
  )
}
