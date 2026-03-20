/**
 * 客户详情页（研究台精简版）
 *
 * 客户基本信息 + 关联项目列表 + 沟通历史时间线 + AI 洞察
 */
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { crmApi, api } from '@cn-kis/api-client'
import { Tabs, Badge, Empty, Card, StatCard, Button, AIInsightWidget } from '@cn-kis/ui-kit'
import {
  ArrowLeft, Building2, User, Phone, Mail, MapPin,
  Briefcase, MessageSquare, Brain, Clock,
} from 'lucide-react'

const COMM_TYPE_MAP: Record<string, { label: string; color: string }> = {
  email: { label: '邮件', color: 'bg-blue-100 text-blue-700' },
  phone: { label: '电话', color: 'bg-green-100 text-green-700' },
  meeting: { label: '会议', color: 'bg-amber-100 text-amber-700' },
  feishu: { label: '飞书', color: 'bg-indigo-100 text-indigo-700' },
  visit: { label: '拜访', color: 'bg-purple-100 text-purple-700' },
  document: { label: '文件', color: 'bg-slate-100 text-slate-700' },
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const clientId = Number(id)
  const [activeTab, setActiveTab] = useState('projects')

  const { data: clientRes, isLoading } = useQuery({
    queryKey: ['crm', 'client', clientId],
    queryFn: () => crmApi.getClient(clientId),
    enabled: !!clientId,
  })

  const { data: commsRes } = useQuery({
    queryKey: ['crm', 'client', clientId, 'communications'],
    queryFn: () => (api as any).get(`/crm/clients/${clientId}/communications`),
    enabled: activeTab === 'communications' && !!clientId,
  })

  const client = (clientRes?.data as any)
  const communications = (commsRes?.data as any)?.items ?? []

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/clients')}>
          返回客户列表
        </Button>
        <Empty title="客户不存在" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/clients')} className="p-2 hover:bg-slate-100 rounded-lg" title="返回客户列表">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-slate-800">{client.name}</h2>
          <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
            <Badge variant={client.level === 'strategic' ? 'primary' : client.level === 'key' ? 'info' : 'default'}>
              {client.level === 'strategic' ? '战略' : client.level === 'key' ? '重点' : '标准'}
            </Badge>
            {client.industry && <span>{client.industry}</span>}
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="项目数" value={client.total_projects ?? 0} icon={<Briefcase className="w-5 h-5" />} color="blue" />
        <StatCard
          title="累计营收"
          value={client.total_revenue ? `¥${(client.total_revenue / 10000).toFixed(1)}万` : '¥0'}
          icon={<Building2 className="w-5 h-5" />}
          color="green"
        />
        <StatCard title="商机数" value={client.opportunity_count ?? 0} icon={<Briefcase className="w-5 h-5" />} color="amber" />
        <StatCard title="沟通记录" value={communications.length || '-'} icon={<MessageSquare className="w-5 h-5" />} color="purple" />
      </div>

      {/* Contact */}
      <Card>
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400" />
            <div><div className="text-xs text-slate-500">联系人</div><div className="font-medium">{client.contact_name || '-'}</div></div>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-slate-400" />
            <div><div className="text-xs text-slate-500">电话</div><div className="font-medium">{client.contact_phone || '-'}</div></div>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-slate-400" />
            <div><div className="text-xs text-slate-500">邮箱</div><div className="font-medium">{client.contact_email || '-'}</div></div>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-400" />
            <div><div className="text-xs text-slate-500">地址</div><div className="font-medium truncate">{client.address || '-'}</div></div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: 'projects', label: '项目总览' },
          { value: 'communications', label: '沟通历史' },
          { value: 'insight', label: 'AI 洞察' },
        ]}
      />

      {/* Projects Tab */}
      {activeTab === 'projects' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">关联项目</h3>
          {(client.projects ?? []).length === 0 ? (
            <Empty description="暂无关联项目" />
          ) : (
            <div className="space-y-3">
              {(client.projects ?? []).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50">
                  <div>
                    <div className="text-sm font-medium text-slate-700">{p.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{p.code}</div>
                  </div>
                  <Badge variant={p.status === 'active' ? 'success' : p.status === 'completed' ? 'default' : 'warning'}>
                    {p.status === 'active' ? '进行中' : p.status === 'completed' ? '已完成' : p.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Communications Tab */}
      {activeTab === 'communications' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">沟通时间线</h3>
          {communications.length === 0 ? (
            <Empty description="暂无沟通记录" />
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-2 bottom-2 w-px bg-slate-200" />
              <div className="space-y-5">
                {communications.map((c: any) => {
                  const typeInfo = COMM_TYPE_MAP[c.type] || { label: c.type, color: 'bg-slate-100 text-slate-700' }
                  return (
                    <div key={c.id} className="flex items-start gap-4 relative">
                      <div className="relative z-10 w-8 h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <div className="flex-1 bg-slate-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-700">{c.sender || c.created_by_name || '-'}</span>
                          <span className={`text-[11px] px-1.5 py-0.5 rounded ${typeInfo.color}`}>{typeInfo.label}</span>
                          <span className="text-[11px] text-slate-400 ml-auto flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {c.create_time ? new Date(c.create_time).toLocaleString('zh-CN') : ''}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 whitespace-pre-line">{c.content}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Insight Tab */}
      {activeTab === 'insight' && (
        <AIInsightWidget
          agentId="insight-agent"
          contextType="client_analysis"
          contextData={{ client_id: clientId, client_name: client.name }}
          title="AI 客户洞察"
          onTrigger={async (agentId, contextType, contextData) => {
            const res = await (api as any).post('/agents/trigger-insight', {
              agent_id: agentId,
              context_type: contextType,
              context_data: contextData,
            })
            return res.data?.content || '暂无洞察'
          }}
        />
      )}
    </div>
  )
}
