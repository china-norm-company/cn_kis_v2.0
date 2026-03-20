/**
 * 策略中心 — 中书·数字员工中心
 * 动作策略列表与编辑（与 admin AiOpsPoliciesPage 等价）
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  assistantPoliciesApi,
  type PolicyItem,
  type PolicyRiskLevel,
} from '@cn-kis/api-client'
import { Card, Badge, Button, Input } from '@cn-kis/ui-kit'

function toRiskCsv(levels: string[]) {
  return levels.join(',')
}

function fromRiskCsv(csv: string): PolicyRiskLevel[] {
  const values = csv
    .split(',')
    .map((i) => i.trim().toLowerCase())
    .filter(Boolean)
  return values.filter((i): i is PolicyRiskLevel => i === 'low' || i === 'medium' || i === 'high')
}

export default function PolicyCenterPage() {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Record<string, PolicyItem>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['digital-workforce', 'policies'],
    queryFn: () => assistantPoliciesApi.list(),
  })

  const saveMutation = useMutation({
    mutationFn: (item: PolicyItem) =>
      assistantPoliciesApi.upsert(item.action_type, {
        enabled: item.enabled,
        requires_confirmation: item.requires_confirmation,
        allowed_risk_levels: item.allowed_risk_levels,
        min_priority_score: item.min_priority_score,
        min_confidence_score: item.min_confidence_score,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'policies'] }),
  })

  const items = (data as { data?: { items?: PolicyItem[] } } | undefined)?.data?.items ?? []

  return (
    <div data-testid="policy-center-page" className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">策略中心</h2>
        <p className="mt-1 text-sm text-slate-500">动作策略列表与阈值编辑（系统视角）</p>
      </div>

      {isLoading ? (
        <Card>
          <div className="py-8 text-center text-slate-500">加载中...</div>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-slate-500">暂无策略配置</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((raw) => {
            const local = editing[raw.action_type] ?? raw
            return (
              <Card key={raw.action_type}>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-800">{raw.action_type}</p>
                      <Badge variant={raw.source === 'custom' ? 'warning' : 'default'} size="sm">
                        {raw.source === 'custom' ? '自定义' : '默认'}
                      </Badge>
                      <Badge variant="default" size="sm">
                        {raw.target_system || 'cn_kis'}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditing((prev) => ({ ...prev, [raw.action_type]: raw }))}>
                        重置
                      </Button>
                      <Button
                        size="sm"
                        data-testid={`policy-${raw.action_type}-save`}
                        onClick={() => saveMutation.mutate(local)}
                        loading={saveMutation.isPending}
                      >
                        保存
                      </Button>
                    </div>
                  </div>
                  <div className="rounded border border-slate-200 p-2 text-xs text-slate-500">
                    能力键: {raw.capability_key || '-'} · 执行器: {raw.executor || '-'} · 模式: {raw.operator_mode || '-'}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={local.enabled}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [raw.action_type]: { ...local, enabled: e.target.checked },
                        }))
                      }
                    />
                    启用动作
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={local.requires_confirmation}
                      onChange={(e) =>
                        setEditing((prev) => ({
                          ...prev,
                          [raw.action_type]: { ...local, requires_confirmation: e.target.checked },
                        }))
                      }
                    />
                    执行前必须确认
                  </label>
                  <Input
                    label="允许风险等级（逗号分隔：low,medium,high）"
                    value={toRiskCsv(local.allowed_risk_levels)}
                    className="min-h-11"
                    onChange={(e) =>
                      setEditing((prev) => ({
                        ...prev,
                        [raw.action_type]: { ...local, allowed_risk_levels: fromRiskCsv(e.target.value) },
                      }))
                    }
                  />
                  <Input
                    label="最低优先级分（0-100）"
                    type="number"
                    data-testid={`policy-${raw.action_type}-min-priority`}
                    value={String(local.min_priority_score)}
                    className="min-h-11"
                    onChange={(e) =>
                      setEditing((prev) => ({
                        ...prev,
                        [raw.action_type]: { ...local, min_priority_score: Number(e.target.value || 0) },
                      }))
                    }
                  />
                  <Input
                    label="最低置信度分（0-100）"
                    type="number"
                    data-testid={`policy-${raw.action_type}-min-confidence`}
                    value={String(local.min_confidence_score)}
                    className="min-h-11"
                    onChange={(e) =>
                      setEditing((prev) => ({
                        ...prev,
                        [raw.action_type]: { ...local, min_confidence_score: Number(e.target.value || 0) },
                      }))
                    }
                  />
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
