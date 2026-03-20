/**
 * 工单分配弹窗
 *
 * 选择未分配工单，批量分配给指定团队成员
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Button, Badge, Empty } from '@cn-kis/ui-kit'
import { workorderApi } from '@cn-kis/api-client'
import { CheckSquare, Square, Loader2 } from 'lucide-react'

interface AssignWorkOrderModalProps {
  isOpen: boolean
  onClose: () => void
  memberId: number
  memberName: string
}

export function AssignWorkOrderModal({ isOpen, onClose, memberId, memberName }: AssignWorkOrderModalProps) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const { data: workordersRes, isLoading } = useQuery({
    queryKey: ['workorders', 'unassigned'],
    queryFn: () => workorderApi.list({ status: 'pending', page_size: 50 }),
    enabled: isOpen,
  })

  const items = (workordersRes?.data?.items ?? []).filter(
    (wo) => !wo.assigned_to
  )

  const mutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected)
      for (const id of ids) {
        await workorderApi.manualAssign(id, memberId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'team-overview'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'team-capacity'] })
      queryClient.invalidateQueries({ queryKey: ['workorders'] })
      handleClose()
    },
  })

  function handleClose() {
    setSelected(new Set())
    mutation.reset()
    onClose()
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map((wo) => wo.id)))
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`分配工单给 ${memberName}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={selected.size === 0 || mutation.isPending}
          >
            {mutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1" />分配中...</>
            ) : (
              `分配 ${selected.size} 个工单`
            )}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className="py-8 text-center text-sm text-slate-400">加载未分配工单...</div>
      ) : items.length === 0 ? (
        <Empty title="无待分配工单" description="当前所有工单已分配" />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={toggleAll}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {selected.size === items.length ? '取消全选' : '全选'}
            </button>
            <span className="text-xs text-slate-400">{items.length} 个未分配工单</span>
          </div>

          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {items.map((wo) => (
              <button
                key={wo.id}
                onClick={() => toggleSelect(wo.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition ${
                  selected.has(wo.id)
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-slate-100 hover:bg-slate-50'
                }`}
              >
                {selected.has(wo.id) ? (
                  <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-5 h-5 text-slate-300 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{wo.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="default" size="sm">{wo.status}</Badge>
                    {wo.due_date && (
                      <span className="text-xs text-slate-400">
                        截止: {new Date(wo.due_date).toLocaleDateString('zh-CN')}
                      </span>
                    )}
                    {wo.protocol_title && (
                      <span className="text-xs text-slate-400 truncate">{wo.protocol_title}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-600 mt-2">分配失败，请重试</p>
          )}
        </div>
      )}
    </Modal>
  )
}
