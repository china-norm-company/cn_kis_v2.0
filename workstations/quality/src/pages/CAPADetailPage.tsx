import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Badge, Button, Modal, Input, AIInsightWidget, DigitalWorkerActionCard } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ArrowLeft, Plus, Check, Clock, ShieldCheck } from 'lucide-react'

interface ActionItem {
  id: number
  sequence: number
  title: string
  responsible_name: string
  due_date: string
  status: string
  completion_note: string
  completed_at: string | null
}

interface CAPADetail {
  id: number
  code: string
  deviation_id: number
  deviation_code: string
  type: string
  title: string
  responsible: string
  due_date: string
  status: string
  effectiveness: string
  action_detail: string
  verification_note: string
  create_time: string
  update_time: string
  action_items: ActionItem[]
  progress: { total: number; completed: number; percentage: number }
}

const statusMap: Record<string, { label: string; variant: 'default' | 'warning' | 'primary' | 'success' | 'error' }> = {
  planned: { label: '待执行', variant: 'default' },
  in_progress: { label: '执行中', variant: 'warning' },
  verification: { label: '验证中', variant: 'primary' },
  closed: { label: '已关闭', variant: 'success' },
  overdue: { label: '超期', variant: 'error' },
}

const actionItemStatus: Record<string, { label: string; variant: 'default' | 'warning' | 'success' | 'error' }> = {
  pending: { label: '待执行', variant: 'default' },
  in_progress: { label: '执行中', variant: 'warning' },
  completed: { label: '已完成', variant: 'success' },
  overdue: { label: '超期', variant: 'error' },
}

export function CAPADetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const capaId = Number(id)

  const [showAddAction, setShowAddAction] = useState(false)
  const [showComplete, setShowComplete] = useState<number | null>(null)
  const [showVerify, setShowVerify] = useState(false)
  const [actionForm, setActionForm] = useState({ title: '', responsible_name: '', due_date: '' })
  const [completionNote, setCompletionNote] = useState('')
  const [verifyForm, setVerifyForm] = useState({ verification_note: '', effectiveness: 'effective' })

  const { data, isLoading } = useQuery({
    queryKey: ['capa-detail', capaId],
    queryFn: () => api.get<CAPADetail>(`/quality/capas/${capaId}`),
    enabled: !!capaId,
  })

  const capa = data?.data

  const addActionMutation = useMutation({
    mutationFn: () => api.post<any>(`/quality/capas/${capaId}/action-items/create`, actionForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capa-detail', capaId] })
      setShowAddAction(false)
      setActionForm({ title: '', responsible_name: '', due_date: '' })
    },
  })

  const completeActionMutation = useMutation({
    mutationFn: (itemId: number) => api.post<any>(`/quality/action-items/${itemId}/complete`, { completion_note: completionNote }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capa-detail', capaId] })
      setShowComplete(null)
      setCompletionNote('')
    },
  })

  const verifyMutation = useMutation({
    mutationFn: () => api.post<any>(`/quality/capas/${capaId}/verify`, verifyForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capa-detail', capaId] })
      setShowVerify(false)
    },
  })

  if (isLoading || !capa) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Clock className="w-5 h-5 animate-spin mr-2" /> 加载中...
      </div>
    )
  }

  const stInfo = statusMap[capa.status]
  const progress = capa.progress

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Button className="min-h-11" variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/capa')}>
          返回
        </Button>
        <h1 className="text-lg font-bold text-slate-800 md:text-xl">{capa.code}</h1>
        {stInfo && <Badge variant={stInfo.variant}>{stInfo.label}</Badge>}
        <Badge variant={capa.type === 'corrective' ? 'warning' : 'info'}>
          {capa.type === 'corrective' ? '纠正措施' : '预防措施'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:gap-6">
        {/* 左侧 */}
        <div className="space-y-5">
          {/* 基本信息 */}
          <Card>
            <div className="p-4 md:p-5">
              <h2 className="text-base font-semibold text-slate-700 mb-3">基本信息</h2>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 sm:gap-4">
                <div><span className="text-slate-500">措施描述：</span>{capa.title}</div>
                <div><span className="text-slate-500">责任人：</span>{capa.responsible}</div>
                <div><span className="text-slate-500">到期日：</span>{capa.due_date}</div>
                <div>
                  <span className="text-slate-500">关联偏差：</span>
                  <button className="text-primary-600 hover:underline" onClick={() => navigate(`/deviations/${capa.deviation_id}`)}>
                    {capa.deviation_code}
                  </button>
                </div>
              </div>
              {capa.action_detail && (
                <div className="mt-3 text-sm">
                  <span className="text-slate-500">详细说明：</span>
                  <p className="mt-1 text-slate-700">{capa.action_detail}</p>
                </div>
              )}
            </div>
          </Card>

          {/* 行动项 */}
          <Card>
            <div className="p-4 md:p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-slate-700">
                  行动项 ({progress.completed}/{progress.total})
                </h2>
                {capa.status !== 'closed' && (
                  <Button className="min-h-10" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddAction(true)}>
                    添加行动项
                  </Button>
                )}
              </div>

              {/* 进度条 */}
              {progress.total > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>完成进度</span>
                    <span>{progress.percentage}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all"
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                </div>
              )}

              {(capa.action_items?.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">暂无行动项</p>
              ) : (
                <div className="space-y-2">
                  {capa.action_items.map((item) => {
                    const itemSt = actionItemStatus[item.status]
                    return (
                      <div key={item.id} className="border border-slate-200 rounded-lg p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">#{item.sequence}</span>
                              <p className="text-sm font-medium text-slate-700">{item.title}</p>
                              {itemSt && <Badge variant={itemSt.variant}>{itemSt.label}</Badge>}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>执行人: {item.responsible_name || '-'}</span>
                              <span>到期: {item.due_date || '-'}</span>
                              {item.completed_at && <span>完成: {new Date(item.completed_at).toLocaleDateString('zh-CN')}</span>}
                            </div>
                            {item.completion_note && (
                              <p className="text-xs text-slate-500 mt-1 bg-slate-50 p-2 rounded">完成说明: {item.completion_note}</p>
                            )}
                          </div>
                          {item.status !== 'completed' && capa.status !== 'closed' && (
                            <Button className="min-h-9" variant="success" size="xs" icon={<Check className="w-3 h-3" />} onClick={() => setShowComplete(item.id)}>
                              完成
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* 右侧 */}
        <div className="space-y-5">
          {/* 验证关闭 */}
          {capa.status === 'verification' && (
            <Card>
              <div className="p-4 md:p-5">
                <h2 className="text-base font-semibold text-slate-700 mb-3">验证关闭</h2>
                <p className="text-sm text-slate-600 mb-3">所有行动项已完成，请进行有效性验证并关闭 CAPA。</p>
                <Button className="min-h-11" fullWidth icon={<ShieldCheck className="w-4 h-4" />} onClick={() => setShowVerify(true)}>
                  验证并关闭
                </Button>
              </div>
            </Card>
          )}

          {/* 效力结果 */}
          {capa.status === 'closed' && (
            <Card>
              <div className="p-4 md:p-5">
                <h2 className="text-base font-semibold text-slate-700 mb-3">验证结果</h2>
                <div className="text-sm space-y-2">
                  <div><span className="text-slate-500">有效性：</span>
                    <Badge variant={capa.effectiveness === 'effective' ? 'success' : 'error'}>
                      {capa.effectiveness === 'effective' ? '有效' : '无效'}
                    </Badge>
                  </div>
                  {capa.verification_note && (
                    <div><span className="text-slate-500">验证记录：</span>
                      <p className="mt-1 text-slate-700">{capa.verification_note}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* 关键日期 */}
          <Card>
            <div className="p-4 md:p-5">
              <h2 className="text-base font-semibold text-slate-700 mb-3">关键日期</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">创建时间</span>
                  <span className="text-slate-700">{new Date(capa.create_time).toLocaleDateString('zh-CN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">到期日期</span>
                  <span className={`font-medium ${new Date(capa.due_date) < new Date() && capa.status !== 'closed' ? 'text-red-600' : 'text-slate-700'}`}>
                    {capa.due_date}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">最后更新</span>
                  <span className="text-slate-700">{new Date(capa.update_time).toLocaleDateString('zh-CN')}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* AI CAPA 措施推荐 */}
          <AIInsightWidget
            agentId="protocol-agent"
            contextType="capa_recommendation"
            contextData={{
              code: capa.code,
              title: capa.title,
              type: capa.type,
              deviation_code: capa.deviation_code,
            }}
            title="AI CAPA 建议"
            onTrigger={async (agentId, contextType, contextData) => {
              try {
                const res = await api.post<{ content: string }>('/agent/chat', {
                  agent_id: agentId,
                  context_type: contextType,
                  context_data: contextData,
                  prompt: `请针对以下 CAPA 提供措施建议和行动项推荐：\nCAPA: ${contextData.title}\n类型: ${contextData.type === 'corrective' ? '纠正措施' : '预防措施'}\n关联偏差: ${contextData.deviation_code}`,
                })
                return res?.data?.content || '暂无建议'
              } catch {
                return '仅供参考：AI 分析服务暂不可用'
              }
            }}
          />

          {/* 数字员工动作卡片：建议行动项 */}
          {capa.status !== 'closed' && (
            <DigitalWorkerActionCard
              roleCode="quality_guardian"
              roleName="质量守护员"
              title="建议追加行动项"
              description={`针对 CAPA「${capa.code}」，质量守护员建议以下行动项。确认后可直接追加到行动项列表。`}
              items={[
                { key: 'action1', label: '纠正措施', value: `针对「${capa.title}」实施纠正措施，消除偏差直接原因` },
                { key: 'action2', label: '预防措施', value: '修订相关 SOP 或培训计划，防止同类偏差再发' },
                { key: 'action3', label: '效果验证', value: '完成整改后 30 天内跟踪验证，确认措施有效' },
              ]}
              onAcceptSingle={async (item) => {
                try {
                  const nextSeq = (capa.action_items?.length ?? 0) + 1
                  await api.post(`/quality/capas/${capa.id}/action-items/create`, {
                    title: item.value,
                    sequence: nextSeq,
                    responsible_name: capa.responsible,
                  })
                  queryClient.invalidateQueries({ queryKey: ['capa', capaId] })
                } catch {
                  // handled by UI
                }
              }}
            />
          )}
        </div>
      </div>

      {/* 添加行动项弹窗 */}
      <Modal
        isOpen={showAddAction}
        onClose={() => setShowAddAction(false)}
        title="添加行动项"
        size="md"
        footer={
          <>
            <Button className="min-h-11" variant="ghost" onClick={() => setShowAddAction(false)}>取消</Button>
            <Button className="min-h-11" loading={addActionMutation.isPending} disabled={!actionForm.title} onClick={() => addActionMutation.mutate()}>
              添加
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="行动描述 *" value={actionForm.title} onChange={(e) => setActionForm(p => ({ ...p, title: e.target.value }))} placeholder="请描述行动项内容" inputClassName="min-h-11" title="行动描述" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="执行人" value={actionForm.responsible_name} onChange={(e) => setActionForm(p => ({ ...p, responsible_name: e.target.value }))} placeholder="执行人姓名" inputClassName="min-h-11" title="执行人" />
            <Input label="到期日" type="date" value={actionForm.due_date} onChange={(e) => setActionForm(p => ({ ...p, due_date: e.target.value }))} inputClassName="min-h-11" title="到期日" />
          </div>
        </div>
      </Modal>

      {/* 完成行动项弹窗 */}
      <Modal
        isOpen={showComplete !== null}
        onClose={() => { setShowComplete(null); setCompletionNote('') }}
        title="完成行动项"
        size="sm"
        footer={
          <>
            <Button className="min-h-11" variant="ghost" onClick={() => { setShowComplete(null); setCompletionNote('') }}>取消</Button>
            <Button className="min-h-11" loading={completeActionMutation.isPending} onClick={() => showComplete && completeActionMutation.mutate(showComplete)}>
              确认完成
            </Button>
          </>
        }
      >
        <div>
          <label htmlFor="completion-note" className="block text-sm font-medium text-slate-700 mb-1.5">完成说明</label>
          <textarea
            id="completion-note"
            value={completionNote}
            onChange={(e) => setCompletionNote(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm min-h-[80px] focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:outline-none"
            placeholder="请填写完成说明..."
            title="完成说明"
          />
        </div>
      </Modal>

      {/* 验证关闭弹窗 */}
      <Modal
        isOpen={showVerify}
        onClose={() => setShowVerify(false)}
        title="CAPA 验证关闭"
        size="md"
        footer={
          <>
            <Button className="min-h-11" variant="ghost" onClick={() => setShowVerify(false)}>取消</Button>
            <Button className="min-h-11" loading={verifyMutation.isPending} onClick={() => verifyMutation.mutate()}>
              确认关闭
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">有效性判定</label>
            <select
              value={verifyForm.effectiveness}
              onChange={(e) => setVerifyForm(p => ({ ...p, effectiveness: e.target.value }))}
              className="w-full min-h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:outline-none"
              title="有效性判定"
            >
              <option value="effective">有效</option>
              <option value="ineffective">无效</option>
              <option value="partially_effective">部分有效</option>
            </select>
          </div>
          <div>
            <label htmlFor="verify-note" className="block text-sm font-medium text-slate-700 mb-1.5">验证记录</label>
            <textarea
              id="verify-note"
              value={verifyForm.verification_note}
              onChange={(e) => setVerifyForm(p => ({ ...p, verification_note: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm min-h-[100px] focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:outline-none"
              placeholder="请填写验证过程和结论..."
              title="验证记录"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
