import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Badge, Button, Modal, Input, DataTable, AIInsightWidget, DigitalWorkerActionCard, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  ArrowLeft, ArrowRight, Clock, Save, Plus,
} from 'lucide-react'

type DeviationStatus = 'identified' | 'reported' | 'investigating' | 'capa_pending' | 'capa_executing' | 'capa_complete' | 'closed'

interface DeviationDetail {
  id: number
  code: string
  title: string
  category: string
  severity: string
  status: DeviationStatus
  reporter: string
  reported_at: string
  project: string
  description: string
  root_cause: string
  resolution: string
  closed_at: string | null
  create_time: string
  update_time: string
  capas: CAPAItem[]
  timeline: TimelineEntry[]
}

interface CAPAItem {
  id: number
  code: string
  title: string
  type: string
  status: string
  responsible: string
  due_date: string
}

interface TimelineEntry {
  action: string
  operator: string
  time: string
  detail: string
}

const statusMap: Record<string, { label: string; variant: 'default' | 'error' | 'warning' | 'primary' | 'success' | 'info' }> = {
  identified: { label: '已识别', variant: 'default' },
  reported: { label: '已报告', variant: 'info' },
  investigating: { label: '调查中', variant: 'warning' },
  capa_pending: { label: 'CAPA待建', variant: 'warning' },
  capa_executing: { label: 'CAPA执行中', variant: 'primary' },
  capa_complete: { label: 'CAPA已完成', variant: 'primary' },
  closed: { label: '已关闭', variant: 'success' },
}

const NEXT_STATUS: Record<string, { target: DeviationStatus; label: string }> = {
  identified: { target: 'reported', label: '报告' },
  reported: { target: 'investigating', label: '开始调查' },
  investigating: { target: 'capa_pending', label: '提交CAPA' },
  capa_pending: { target: 'capa_executing', label: '开始执行' },
  capa_executing: { target: 'capa_complete', label: '标记完成' },
  capa_complete: { target: 'closed', label: '关闭' },
}

const severityMap: Record<string, { label: string; variant: 'error' | 'warning' | 'info' }> = {
  critical: { label: '严重', variant: 'error' },
  major: { label: '重大', variant: 'warning' },
  minor: { label: '轻微', variant: 'info' },
}

const capaColumns: Column<CAPAItem>[] = [
  { key: 'code', title: '编号', width: 120 },
  { key: 'title', title: '措施描述' },
  { key: 'type', title: '类型', width: 80, render: (v) => v === 'corrective' ? '纠正' : '预防' },
  {
    key: 'status', title: '状态', width: 90,
    render: (v) => {
      const map: Record<string, string> = { planned: '待执行', in_progress: '执行中', verification: '验证中', closed: '已关闭', overdue: '超期' }
      return <Badge variant="default">{map[v as string] ?? v}</Badge>
    },
  },
  { key: 'responsible', title: '责任人', width: 90 },
  { key: 'due_date', title: '到期日', width: 110 },
]

export function DeviationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const deviationId = Number(id)

  const [rootCause, setRootCause] = useState('')
  const [resolution, setResolution] = useState('')
  const [editingRootCause, setEditingRootCause] = useState(false)
  const [editingResolution, setEditingResolution] = useState(false)
  const [showAdvance, setShowAdvance] = useState(false)
  const [showCreateCapa, setShowCreateCapa] = useState(false)
  const [capaForm, setCapaForm] = useState({ title: '', type: 'corrective', responsible: '', due_date: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['deviation-detail', deviationId],
    queryFn: () => api.get<DeviationDetail>(`/quality/deviations/${deviationId}`),
    enabled: !!deviationId,
  })

  const dev = data?.data

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      api.put<any>(`/quality/deviations/${deviationId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviation-detail', deviationId] })
      setEditingRootCause(false)
      setEditingResolution(false)
    },
  })

  const advanceMutation = useMutation({
    mutationFn: (new_status: string) =>
      api.post<any>(`/quality/deviations/${deviationId}/advance`, { new_status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviation-detail', deviationId] })
      setShowAdvance(false)
    },
  })

  const createCapaMutation = useMutation({
    mutationFn: () =>
      api.post<any>('/quality/capas/create', {
        code: `CAPA-${Date.now()}`,
        deviation_id: deviationId,
        ...capaForm,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviation-detail', deviationId] })
      setShowCreateCapa(false)
      setCapaForm({ title: '', type: 'corrective', responsible: '', due_date: '' })
    },
  })

  if (isLoading || !dev) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Clock className="w-5 h-5 animate-spin mr-2" /> 加载中...
      </div>
    )
  }

  const sevInfo = severityMap[dev.severity]
  const statusInfo = statusMap[dev.status]
  const next = NEXT_STATUS[dev.status]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Button className="min-h-11" variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/deviations')}>
          返回
        </Button>
        <h1 className="text-lg font-bold text-slate-800 md:text-xl">{dev.code}</h1>
        {statusInfo && <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>}
        {sevInfo && <Badge variant={sevInfo.variant}>{sevInfo.label}</Badge>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:gap-6">
        {/* 左侧主体 */}
        <div className="space-y-5">
          {/* 基本信息 */}
          <Card>
            <div className="p-4 md:p-5">
              <h2 className="text-base font-semibold text-slate-700 mb-3">基本信息</h2>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 sm:gap-4">
                <div><span className="text-slate-500">分类：</span>{dev.category}</div>
                <div><span className="text-slate-500">项目：</span>{dev.project || '-'}</div>
                <div><span className="text-slate-500">报告人：</span>{dev.reporter}</div>
                <div><span className="text-slate-500">报告日期：</span>{dev.reported_at}</div>
              </div>
              <div className="mt-3 text-sm">
                <span className="text-slate-500">描述：</span>
                <p className="mt-1 text-slate-700">{dev.description || dev.title}</p>
              </div>
            </div>
          </Card>

          {/* 根因分析 */}
          <Card>
            <div className="p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-700">根因分析</h2>
                {!editingRootCause && dev.status !== 'closed' && (
                  <Button className="min-h-9" variant="ghost" size="xs" onClick={() => { setRootCause(dev.root_cause || ''); setEditingRootCause(true) }}>
                    编辑
                  </Button>
                )}
              </div>
              {editingRootCause ? (
                <div className="space-y-3">
                  <textarea
                    value={rootCause}
                    onChange={(e) => setRootCause(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm min-h-[100px] focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:outline-none"
                    placeholder="请填写根因分析..."
                    title="根因分析"
                  />
                  <div className="flex gap-2">
                    <Button className="min-h-10" size="sm" icon={<Save className="w-3.5 h-3.5" />} loading={updateMutation.isPending} onClick={() => updateMutation.mutate({ root_cause: rootCause })}>
                      保存
                    </Button>
                    <Button className="min-h-10" variant="ghost" size="sm" onClick={() => setEditingRootCause(false)}>取消</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{dev.root_cause || '尚未填写根因分析'}</p>
              )}
            </div>
          </Card>

          {/* 即时纠正措施 */}
          <Card>
            <div className="p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-700">即时纠正措施</h2>
                {!editingResolution && dev.status !== 'closed' && (
                  <Button className="min-h-9" variant="ghost" size="xs" onClick={() => { setResolution(dev.resolution || ''); setEditingResolution(true) }}>
                    编辑
                  </Button>
                )}
              </div>
              {editingResolution ? (
                <div className="space-y-3">
                  <textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm min-h-[100px] focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:outline-none"
                    placeholder="请填写纠正措施..."
                    title="即时纠正措施"
                  />
                  <div className="flex gap-2">
                    <Button className="min-h-10" size="sm" icon={<Save className="w-3.5 h-3.5" />} loading={updateMutation.isPending} onClick={() => updateMutation.mutate({ resolution })}>
                      保存
                    </Button>
                    <Button className="min-h-10" variant="ghost" size="sm" onClick={() => setEditingResolution(false)}>取消</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{dev.resolution || '尚未填写纠正措施'}</p>
              )}
            </div>
          </Card>

          {/* 关联 CAPA */}
          <Card>
            <div className="p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-slate-700">关联 CAPA ({dev.capas?.length ?? 0})</h2>
                {dev.status !== 'closed' && (
                  <Button className="min-h-10" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateCapa(true)}>
                    新建 CAPA
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[980px]">
                  <DataTable<CAPAItem>
                    columns={[
                      ...capaColumns,
                      {
                        key: 'id' as any,
                        title: '',
                        width: 60,
                        render: (_, row) => (
                          <Button className="min-h-9" variant="ghost" size="xs" onClick={() => navigate(`/capa/${(row as CAPAItem).id}`)}>
                            详情
                          </Button>
                        ),
                      },
                    ]}
                    data={dev.capas ?? []}
                    emptyText="暂无关联 CAPA"
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* 右侧面板 */}
        <div className="space-y-5">
          {/* 状态推进 */}
          {next && (
            <Card>
              <div className="p-4 md:p-5">
                <h2 className="text-base font-semibold text-slate-700 mb-3">状态推进</h2>
                <div className="text-sm text-slate-600 mb-3">
                  当前状态：<Badge variant={statusInfo?.variant ?? 'default'}>{statusInfo?.label}</Badge>
                </div>
                <Button
                  className="min-h-11"
                  fullWidth
                  icon={<ArrowRight className="w-4 h-4" />}
                  onClick={() => setShowAdvance(true)}
                >
                  {next.label} → {statusMap[next.target]?.label}
                </Button>
              </div>
            </Card>
          )}

          {/* 状态时间线 */}
          <Card>
            <div className="p-4 md:p-5">
              <h2 className="text-base font-semibold text-slate-700 mb-3">操作记录</h2>
              {(dev.timeline?.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">暂无操作记录</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200" />
                  <div className="space-y-3">
                    {dev.timeline?.map((entry, i) => (
                      <div key={i} className="relative pl-8">
                        <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-primary-500 border-2 border-white" />
                        <div>
                          <p className="text-sm font-medium text-slate-700">{entry.action}</p>
                          <p className="text-xs text-slate-500">
                            {entry.operator} · {entry.time ? new Date(entry.time).toLocaleString('zh-CN') : ''}
                          </p>
                          {entry.detail && <p className="text-xs text-slate-400 mt-0.5">{entry.detail}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* AI 根因分析建议 */}
          <AIInsightWidget
            agentId="protocol-agent"
            contextType="deviation_root_cause"
            contextData={{
              code: dev.code,
              title: dev.title,
              category: dev.category,
              severity: dev.severity,
              description: dev.description || dev.title,
            }}
            title="AI 根因分析建议"
            onTrigger={async (agentId, contextType, contextData) => {
              try {
                const res = await api.post<{ content: string }>('/agent/chat', {
                  agent_id: agentId,
                  context_type: contextType,
                  context_data: contextData,
                  prompt: `请对以下偏差进行根因分析，提供 5-Why 分析方向和建议：\n偏差描述: ${contextData.description}\n分类: ${contextData.category}\n严重度: ${contextData.severity}`,
                })
                return res?.data?.content || '暂无分析结果'
              } catch {
                return '仅供参考：AI 分析服务暂不可用'
              }
            }}
          />

          {/* 数字员工动作卡片：自动创建 CAPA 草稿 */}
          {(!dev.capas || dev.capas.length === 0) && dev.status !== 'closed' && (
            <DigitalWorkerActionCard
              roleCode="quality_guardian"
              roleName="质量守护员"
              title="建议为该偏差创建 CAPA"
              description={`偏差「${dev.code}」尚无关联 CAPA。质量守护员建议创建纠正与预防措施草稿，确认后可一键创建。`}
              items={[
                { key: 'title', label: 'CAPA 标题', value: `针对偏差 ${dev.code} 的纠正与预防措施` },
                { key: 'action', label: '建议措施', value: `根据偏差「${dev.title}」的根因分析，建议采取纠正措施并防止再发。` },
                { key: 'responsible', label: '建议责任人', value: dev.reporter || '待指定' },
                { key: 'due', label: '建议完成期限', value: '30 天内' },
              ]}
              onAccept={async () => {
                try {
                  await api.post(`/quality/deviations/${dev.id}/create-capa-draft`, {
                    title: `针对偏差 ${dev.code} 的纠正与预防措施`,
                    action_detail: `根据偏差「${dev.title}」的根因分析，建议采取纠正措施并防止再发。`,
                    responsible: dev.reporter || '待指定',
                    due_days: 30,
                  })
                  queryClient.invalidateQueries({ queryKey: ['deviation', id] })
                } catch {
                  // handled by UI
                }
              }}
              acceptLabel="创建 CAPA 草稿"
            />
          )}
        </div>
      </div>

      {/* 状态推进确认弹窗 */}
      <Modal
        isOpen={showAdvance}
        onClose={() => setShowAdvance(false)}
        title="确认状态推进"
        size="sm"
        footer={
          <>
            <Button className="min-h-11" variant="ghost" onClick={() => setShowAdvance(false)}>取消</Button>
            <Button className="min-h-11" loading={advanceMutation.isPending} onClick={() => next && advanceMutation.mutate(next.target)}>
              确认推进
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          确认将偏差 <strong>{dev.code}</strong> 从
          「{statusInfo?.label}」推进到「{next ? statusMap[next.target]?.label : ''}」？
        </p>
      </Modal>

      {/* 新建 CAPA 弹窗 */}
      <Modal
        isOpen={showCreateCapa}
        onClose={() => setShowCreateCapa(false)}
        title="新建 CAPA"
        size="md"
        footer={
          <>
            <Button className="min-h-11" variant="ghost" onClick={() => setShowCreateCapa(false)}>取消</Button>
            <Button className="min-h-11" loading={createCapaMutation.isPending} disabled={!capaForm.title || !capaForm.due_date} onClick={() => createCapaMutation.mutate()}>
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="措施描述 *" value={capaForm.title} onChange={(e) => setCapaForm(p => ({ ...p, title: e.target.value }))} placeholder="请输入 CAPA 措施描述" inputClassName="min-h-11" title="措施描述" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">类型</label>
              <select
                value={capaForm.type}
                onChange={(e) => setCapaForm(p => ({ ...p, type: e.target.value }))}
                className="w-full min-h-11 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 focus:outline-none"
                title="CAPA类型"
              >
                <option value="corrective">纠正措施</option>
                <option value="preventive">预防措施</option>
              </select>
            </div>
            <Input label="责任人" value={capaForm.responsible} onChange={(e) => setCapaForm(p => ({ ...p, responsible: e.target.value }))} placeholder="责任人" inputClassName="min-h-11" title="责任人" />
          </div>
          <Input label="到期日 *" type="date" value={capaForm.due_date} onChange={(e) => setCapaForm(p => ({ ...p, due_date: e.target.value }))} inputClassName="min-h-11" title="到期日" />
        </div>
      </Modal>
    </div>
  )
}
