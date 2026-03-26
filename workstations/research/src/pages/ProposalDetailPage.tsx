/**
 * B2: 方案详情
 *
 * 基本信息 + 3 Tab（版本历史 / 检查清单 / 沟通记录）
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Tabs, Card, Badge, Button, Empty } from '@cn-kis/ui-kit'
import type { BadgeVariant } from '@cn-kis/ui-kit'
import {
  ArrowLeft, FileText, Building2, FlaskConical, TestTubes,
  GitBranch, CheckSquare, MessageSquare, Square, CheckSquare2,
  Clock, User,
} from 'lucide-react'

interface ProposalDetail {
  id: number
  title: string
  client_name: string
  status: string
  stage: string
  product_category: string
  test_method: string
  estimated_amount: number | null
  create_time: string
  update_time: string
}

interface ProposalVersion {
  id: number
  version_number: string
  change_description: string
  created_by: string
  create_time: string
}

interface ChecklistItem {
  id: number
  label: string
  checked: boolean
  item_name?: string
  is_completed?: boolean
  checked_by: string | null
  checked_at: string | null
}

interface Communication {
  id: number
  type: string
  content: string
  sender: string
  create_time: string
}

const STAGE_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  drafting: { label: '起草中', variant: 'default' },
  internal_review: { label: '内部审核', variant: 'info' },
  client_review: { label: '客户审阅', variant: 'warning' },
  revision: { label: '修订中', variant: 'primary' },
  finalized: { label: '已定稿', variant: 'success' },
}

const COMM_TYPE_MAP: Record<string, { label: string; color: string }> = {
  email: { label: '邮件', color: 'bg-blue-100 text-blue-700' },
  meeting: { label: '会议', color: 'bg-green-100 text-green-700' },
  phone: { label: '电话', color: 'bg-amber-100 text-amber-700' },
  internal: { label: '内部', color: 'bg-slate-100 text-slate-700' },
  comment: { label: '备注', color: 'bg-purple-100 text-purple-700' },
}

function formatAmount(value: number | null): string {
  if (value == null) return '-'
  if (value >= 10000) return `¥${(value / 10000).toFixed(1)}万`
  return `¥${value.toLocaleString()}`
}

export default function ProposalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const proposalId = Number(id)
  const proposalIdOk = Number.isFinite(proposalId)
  const [activeTab, setActiveTab] = useState('versions')

  /* ---- Queries ---- */

  const { data: proposalRes, isLoading } = useQuery({
    queryKey: ['proposal', proposalId],
    queryFn: () => api.get<ProposalDetail>(`/proposal/${proposalId}`),
    enabled: proposalIdOk,
  })

  const { data: versionsRes } = useQuery({
    queryKey: ['proposal', proposalId, 'versions'],
    queryFn: () => api.get<{ items: ProposalVersion[] }>(`/proposal/${proposalId}/versions`),
    enabled: proposalIdOk && activeTab === 'versions',
  })

  const { data: checklistRes } = useQuery({
    queryKey: ['proposal', proposalId, 'checklist'],
    queryFn: () => api.get<{ items: ChecklistItem[] }>(`/proposal/${proposalId}/checklist`),
    enabled: proposalIdOk && activeTab === 'checklist',
  })

  const { data: commsRes } = useQuery({
    queryKey: ['proposal', proposalId, 'communications'],
    queryFn: () =>
      api.get<{ items: Communication[] }>(
        '/proposal/communications/list',
        { params: { proposal_id: proposalId } },
      ),
    enabled: proposalIdOk && activeTab === 'communications',
  })

  /* ---- Mutations ---- */

  const toggleCheckMutation = useMutation({
    mutationFn: (item: ChecklistItem) =>
      api.post(`/proposal/${proposalId}/checklist/update`, {
        item_name: item.item_name ?? item.label,
        is_completed: !(item.is_completed ?? item.checked),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal', proposalId, 'checklist'] })
    },
  })

  const proposal = proposalRes?.data
  const versions = versionsRes?.data?.items ?? []
  const checklist = checklistRes?.data?.items ?? []
  const communications = commsRes?.data?.items ?? []

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
  }

  if (!proposal) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/proposals')}>
          返回列表
        </Button>
        <Card>
          <Empty icon={<FileText className="w-16 h-16" />} title="方案不存在" />
        </Card>
      </div>
    )
  }

  const stageInfo = STAGE_MAP[proposal.stage] ?? { label: proposal.stage, variant: 'default' as BadgeVariant }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            icon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate('/proposals')}
          >
            返回
          </Button>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{proposal.title}</h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              <Badge variant={stageInfo.variant}>{stageInfo.label}</Badge>
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {proposal.client_name || '-'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 基本信息卡片 */}
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoItem
            icon={<Building2 className="w-4 h-4 text-slate-400" />}
            label="客户"
            value={proposal.client_name || '-'}
          />
          <InfoItem
            icon={<FlaskConical className="w-4 h-4 text-slate-400" />}
            label="产品类别"
            value={proposal.product_category || '-'}
          />
          <InfoItem
            icon={<TestTubes className="w-4 h-4 text-slate-400" />}
            label="测试方法"
            value={proposal.test_method || '-'}
          />
          <InfoItem
            icon={<FileText className="w-4 h-4 text-slate-400" />}
            label="预估金额"
            value={formatAmount(proposal.estimated_amount)}
          />
        </div>
      </Card>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: 'versions', label: '版本历史' },
          { value: 'checklist', label: '检查清单' },
          { value: 'communications', label: '沟通记录' },
        ]}
      />

      {/* 版本历史 Tab */}
      {activeTab === 'versions' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5" data-tab="versions">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-5">
            <GitBranch className="w-4 h-4 text-slate-400" />
            版本历史
          </h3>

          {versions.length === 0 ? (
            <Empty description="暂无版本记录" />
          ) : (
            <div className="relative">
              {/* 时间线竖线 */}
              <div className="absolute left-4 top-2 bottom-2 w-px bg-slate-200" />

              <div className="space-y-6">
                {versions.map((ver, idx) => (
                  <div key={ver.id} className="flex items-start gap-4 relative">
                    {/* 时间线节点 */}
                    <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      idx === 0 ? 'bg-blue-500 text-white' : 'bg-white border-2 border-slate-300 text-slate-400'
                    }`}>
                      <GitBranch className="w-3.5 h-3.5" />
                    </div>

                    {/* 版本内容 */}
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${idx === 0 ? 'text-blue-600' : 'text-slate-700'}`}>
                          {ver.version_number}
                        </span>
                        {idx === 0 && (
                          <Badge variant="info">最新</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{ver.change_description}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {ver.created_by}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(ver.create_time).toLocaleString('zh-CN')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 检查清单 Tab */}
      {activeTab === 'checklist' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5" data-tab="checklist">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-5">
            <CheckSquare className="w-4 h-4 text-slate-400" />
            检查清单
            {checklist.length > 0 && (
              <span className="text-xs font-normal text-slate-400 ml-1">
                ({checklist.filter((c) => c.checked).length}/{checklist.length} 已完成)
              </span>
            )}
          </h3>

          {checklist.length === 0 ? (
            <Empty description="暂无检查项" />
          ) : (
            <div className="space-y-2">
              {checklist.map((item: any) => (
                <div
                  key={item.id || item.item_name}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition cursor-pointer hover:bg-slate-50 ${
                    item.is_completed ? 'border-green-200 bg-green-50/50' : 'border-slate-100'
                  }`}
                  onClick={() => toggleCheckMutation.mutate(item)}
                >
                  {item.is_completed ? (
                    <CheckSquare2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-300 flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${item.is_completed ? 'text-slate-500 line-through' : 'text-slate-700 font-medium'}`}>
                      {item.item_name_display || item.item_name}
                    </span>
                  </div>

                  {item.is_completed && item.completed_at && (
                    <span className="text-[11px] text-slate-400 flex-shrink-0">
                      {new Date(item.completed_at).toLocaleDateString('zh-CN')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 沟通记录 Tab */}
      {activeTab === 'communications' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5" data-tab="communications">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-5">
            <MessageSquare className="w-4 h-4 text-slate-400" />
            沟通记录
          </h3>

          {communications.length === 0 ? (
            <Empty description="暂无沟通记录" />
          ) : (
            <div className="relative">
              {/* 时间线竖线 */}
              <div className="absolute left-4 top-2 bottom-2 w-px bg-slate-200" />

              <div className="space-y-5">
                {communications.map((comm) => {
                  const typeInfo = COMM_TYPE_MAP[comm.type] ?? { label: comm.type, color: 'bg-slate-100 text-slate-700' }

                  return (
                    <div key={comm.id} className="flex items-start gap-4 relative">
                      {/* 时间线节点 */}
                      <div className="relative z-10 w-8 h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                      </div>

                      {/* 沟通内容 */}
                      <div className="flex-1 min-w-0 bg-slate-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm font-medium text-slate-700">{comm.sender}</span>
                          <span className={`text-[11px] px-1.5 py-0.5 rounded ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                          <span className="text-[11px] text-slate-400 ml-auto">
                            {new Date(comm.create_time).toLocaleString('zh-CN')}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 whitespace-pre-line">{comm.content}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
      </div>
    </div>
  )
}
