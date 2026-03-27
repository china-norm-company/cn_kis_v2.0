/**
 * 动作中心 — 中书·数字员工中心
 * 全局动作箱，按状态/系统筛选，支持确认/拒绝
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assistantActionsApi, type ActionItem } from '@cn-kis/api-client'
import { Card, Button, ActionCard } from '@cn-kis/ui-kit'

export default function ActionsCenterPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('pending_confirm')
  const [systemFilter, setSystemFilter] = useState<'all' | 'feishu' | 'cn_kis' | 'kimi_claw'>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['digital-workforce', 'actions-inbox', status],
    queryFn: () => assistantActionsApi.getInbox({ status }),
  })

  const rawItems = (data as { data?: { items?: ActionItem[] } } | undefined)?.data?.items ?? []
  const items = useMemo(() => {
    if (systemFilter === 'all') return rawItems
    return rawItems.filter((i) => (i.target_system || 'cn_kis') === systemFilter)
  }, [rawItems, systemFilter])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'actions-inbox'] })

  const confirmMutation = useMutation({
    mutationFn: (id: number) => assistantActionsApi.confirm(id),
    onSuccess: refresh,
  })
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => assistantActionsApi.reject(id, reason),
    onSuccess: refresh,
  })

  return (
    <div data-testid="actions-center-page" className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">动作中心</h2>
        <p className="mt-1 text-sm text-slate-500">全局动作箱，支持按状态、系统筛选；可确认或拒绝</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {['pending_confirm', 'confirmed', 'executed', 'rejected', 'all'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`shrink-0 min-h-11 rounded-lg border px-3 py-1.5 text-sm ${
              status === s ? 'border-primary-500 text-primary-600' : 'border-slate-200 text-slate-600'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: 'all' as const, label: '全部系统' },
          { id: 'feishu' as const, label: '飞书' },
          { id: 'cn_kis' as const, label: 'CN_KIS' },
          { id: 'kimi_claw' as const, label: 'Kimi Claw' },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setSystemFilter(s.id)}
            className={`shrink-0 min-h-10 rounded-lg border px-3 py-1.5 text-xs ${
              systemFilter === s.id ? 'border-indigo-500 text-indigo-600' : 'border-slate-200 text-slate-600'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card>
          <div className="py-8 text-center text-slate-500">加载中...</div>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-slate-500">暂无动作</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ActionCard key={item.id} item={item as unknown as import('@cn-kis/ui-kit').ActionCardItem}>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/replay?action_id=${item.id}`)}>
                查看回放
              </Button>
              {item.status === 'pending_confirm' && (
                <>
                  <Button size="sm" onClick={() => confirmMutation.mutate(item.id)} disabled={confirmMutation.isPending}>
                    确认
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const reason = window.prompt('拒绝原因（可选）') || ''
                      rejectMutation.mutate({ id: item.id, reason })
                    }}
                    disabled={rejectMutation.isPending}
                  >
                    拒绝
                  </Button>
                </>
              )}
            </ActionCard>
          ))}
        </div>
      )}
    </div>
  )
}
