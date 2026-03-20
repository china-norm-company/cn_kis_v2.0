/**
 * 客户全景详情 — 管理驾驶舱视角
 *
 * 11个Tab: 客户画像 / 关键联系人 / 组织架构 / 产品矩阵 / 创新日历 /
 *          项目总览 / 财务概况 / 商机跟踪 / 售后工单 / 沟通记录 / AI洞察
 */
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import { useState } from 'react'
import { Tabs, Badge, DataTable, StatCard, Empty, Card, DigitalWorkerActionCard } from '@cn-kis/ui-kit'
import {
  ArrowLeft, Building2, FlaskConical, Banknote, TrendingUp, Headphones,
  MessageSquare, Brain, Mail, Phone, Calendar, Send, FileText, Users,
  UserCheck, Network, ShoppingBag, Sparkles, Activity, Shield,
} from 'lucide-react'

const LEVEL_MAP: Record<string, { label: string; color: 'error' | 'warning' | 'primary' | 'default' }> = {
  strategic: { label: '战略', color: 'error' },
  key: { label: '重点', color: 'warning' },
  normal: { label: '普通', color: 'primary' },
  potential: { label: '潜在', color: 'default' },
}

const TIER_MAP: Record<string, string> = {
  platinum: '铂金', gold: '黄金', silver: '银牌', developing: '发展中', prospect: '潜在',
}

const COMPANY_TYPE_MAP: Record<string, string> = {
  global_top20: '全球Top20', china_top10: '国内Top10', multinational: '跨国企业',
  domestic_large: '国内大型', emerging_brand: '新锐品牌', oem_odm: 'OEM/ODM',
  health_wellness: '大健康', other: '其他',
}

const ROLE_TYPE_MAP: Record<string, string> = {
  decision_maker: '决策者', influencer: '影响者', gatekeeper: '把关人',
  user: '使用者', champion: '内部推荐人',
}

const REL_LEVEL_MAP: Record<string, { label: string; color: 'error' | 'warning' | 'primary' | 'success' | 'default' }> = {
  strategic: { label: '战略伙伴', color: 'success' },
  trusted: { label: '信任关系', color: 'primary' },
  working: { label: '工作关系', color: 'warning' },
  new: { label: '初步接触', color: 'default' },
  cold: { label: '疏远', color: 'error' },
}

const STAGE_MAP: Record<string, string> = {
  lead: '线索', contact: '接洽中', proposal: '方案提交',
  negotiation: '商务谈判', won: '已成交', lost: '已丢失',
}

const CATEGORY_MAP: Record<string, string> = {
  skincare: '护肤', makeup: '彩妆', haircare: '护发', bodycare: '身体护理',
  suncare: '防晒', fragrance: '香水', oral_care: '口腔', mens_care: '男士',
  baby_care: '婴童', health_supplement: '健康补充',
}

const INNOVATION_STATUS_MAP: Record<string, { label: string; color: 'default' | 'primary' | 'warning' | 'success' }> = {
  intelligence: { label: '情报', color: 'default' },
  confirmed: { label: '已确认', color: 'primary' },
  engaged: { label: '已介入', color: 'warning' },
  project_created: { label: '已立项', color: 'success' },
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const clientId = Number(id)
  const [activeTab, setActiveTab] = useState('profile')
  const queryClient = useQueryClient()

  const { data: clientRes } = useQuery({
    queryKey: ['crm', 'client', clientId],
    queryFn: () => api.get<any>(`/crm/clients/${clientId}`),
    enabled: !!clientId,
  })

  const { data: contactsRes } = useQuery({
    queryKey: ['crm', 'contacts', clientId],
    queryFn: () => api.get<any[]>(`/crm/clients/${clientId}/contacts`),
    enabled: activeTab === 'contacts',
  })

  const { data: orgRes } = useQuery({
    queryKey: ['crm', 'org-map', clientId],
    queryFn: () => api.get<any>(`/crm/clients/${clientId}/org-map`),
    enabled: activeTab === 'org',
  })

  const { data: productLinesRes } = useQuery({
    queryKey: ['crm', 'product-lines', clientId],
    queryFn: () => api.get<any[]>(`/crm/clients/${clientId}/product-lines`),
    enabled: activeTab === 'products',
  })

  const { data: innovationsRes } = useQuery({
    queryKey: ['crm', 'innovations', clientId],
    queryFn: () => api.get<any[]>(`/crm/clients/${clientId}/innovation-calendar`),
    enabled: activeTab === 'innovation',
  })

  const { data: healthRes } = useQuery({
    queryKey: ['crm', 'health', clientId],
    queryFn: () => api.get<any>(`/crm/clients/${clientId}/health-score`),
    enabled: activeTab === 'profile',
  })

  const { data: protocolsRes } = useQuery({
    queryKey: ['protocols', 'by-sponsor', clientId],
    queryFn: () => api.get<any>('/protocol/list', { params: { sponsor_id: clientId, page: 1, page_size: 50 } }),
    enabled: activeTab === 'projects',
  })

  const { data: contractsRes } = useQuery({
    queryKey: ['contracts', 'by-client', clientId],
    queryFn: () => api.get<any>('/finance/contracts/list', { params: { client_id: clientId, page: 1, page_size: 50 } }),
    enabled: activeTab === 'finance',
  })

  const { data: invoicesRes } = useQuery({
    queryKey: ['invoices', 'by-client', clientId],
    queryFn: () => api.get<any>('/finance/invoices/list', { params: { client_id: clientId, page: 1, page_size: 50 } }),
    enabled: activeTab === 'finance',
  })

  const { data: oppsRes } = useQuery({
    queryKey: ['opportunities', 'by-client', clientId],
    queryFn: () => api.get<any>('/crm/opportunities/list', { params: { client_id: clientId, page: 1, page_size: 50 } }),
    enabled: activeTab === 'opportunities',
  })

  const { data: ticketsRes } = useQuery({
    queryKey: ['tickets', 'by-client', clientId],
    queryFn: () => api.get<any>('/crm/tickets/list', { params: { client_id: clientId, page: 1, page_size: 50 } }),
    enabled: activeTab === 'tickets',
  })

  const { data: commsRes } = useQuery({
    queryKey: ['communications', 'by-client', clientId],
    queryFn: () => api.get<any>('/proposal/communications/list', { params: { client_id: clientId, page: 1, page_size: 50 } }),
    enabled: activeTab === 'communications',
  })

  const { data: insightRes } = useQuery({
    queryKey: ['crm', 'insight', clientId],
    queryFn: () => api.get<any>(`/crm/clients/${clientId}/insight`),
    enabled: activeTab === 'insight',
  })

  const client = clientRes?.data
  const lv = client ? (LEVEL_MAP[client.level] || { label: client.level, color: 'default' as const }) : { label: '--', color: 'default' as const }
  const health = healthRes?.data

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-lg" title="返回">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <Building2 className="w-8 h-8 text-rose-500" />
        <div className="flex-1">
          {client ? (
            <>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-800">{client.name}</h2>
                <Badge variant={lv.color}>{lv.label}客户</Badge>
                {client.partnership_tier && (
                  <Badge variant="primary">{TIER_MAP[client.partnership_tier] ?? client.partnership_tier}</Badge>
                )}
                {client.company_type && client.company_type !== 'other' && (
                  <Badge>{COMPANY_TYPE_MAP[client.company_type] ?? client.company_type}</Badge>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {client.industry || '--'} · {client.headquarters || '--'} · 联系人: {client.contact_name || '--'}
              </p>
            </>
          ) : (
            <div className="animate-pulse space-y-2">
              <div className="h-6 w-48 bg-slate-200 rounded" />
              <div className="h-4 w-64 bg-slate-100 rounded" />
            </div>
          )}
        </div>
        {health && (
          <div className="text-center px-4">
            <div className={`text-2xl font-bold ${health.overall_score >= 70 ? 'text-green-600' : health.overall_score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {health.overall_score}
            </div>
            <div className="text-xs text-slate-400">健康度</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="项目数" value={client?.total_projects ?? 0} icon={<FlaskConical className="w-5 h-5" />} color="blue" />
        <StatCard title="累计营收" value={`¥${Number(client?.total_revenue || 0).toLocaleString()}`} icon={<Banknote className="w-5 h-5" />} color="green" />
        <StatCard title="合作等级" value={TIER_MAP[client?.partnership_tier] ?? '--'} icon={<Shield className="w-5 h-5" />} color="purple" />
        <StatCard title="估算份额" value={client?.our_share_estimate ? `${client.our_share_estimate}%` : '--'} icon={<Activity className="w-5 h-5" />} color="amber" />
      </div>

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: 'profile', label: '客户画像' },
          { value: 'contacts', label: '关键联系人' },
          { value: 'org', label: '组织架构' },
          { value: 'products', label: '产品矩阵' },
          { value: 'innovation', label: '创新日历' },
          { value: 'projects', label: '项目总览' },
          { value: 'finance', label: '财务概况' },
          { value: 'opportunities', label: '商机跟踪' },
          { value: 'tickets', label: '售后工单' },
          { value: 'communications', label: '沟通记录' },
          { value: 'insight', label: 'AI 洞察' },
        ]}
      />

      {activeTab === 'profile' && (
        <div className="grid grid-cols-2 gap-6">
          <Card title="基础信息" className="p-5">
            <dl className="space-y-2 text-sm">
              {[
                ['公司类型', COMPANY_TYPE_MAP[client?.company_type] ?? '--'],
                ['总部', client?.headquarters || '--'],
                ['中国实体', client?.china_entity || '--'],
                ['员工规模', client?.employee_count_range || '--'],
                ['年营收', client?.annual_revenue_estimate || '--'],
                ['合作起始', client?.partnership_start_date || '--'],
                ['账期', client?.payment_terms_days ? `${client.payment_terms_days}天` : '--'],
                ['沟通偏好', client?.communication_preference || '--'],
                ['报告语言', client?.report_language === 'zh' ? '中文' : (client?.report_language || '--')],
              ].map(([k, v]) => (
                <div key={k} className="flex">
                  <dt className="w-24 text-slate-400 shrink-0">{k}</dt>
                  <dd className="text-slate-700">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="业务特征" className="p-5">
            <div className="space-y-3">
              <div>
                <div className="text-xs text-slate-400 mb-1">主要品类</div>
                <div className="flex flex-wrap gap-1">
                  {(client?.main_categories || []).map((c: string) => (
                    <Badge key={c}>{CATEGORY_MAP[c] ?? c}</Badge>
                  ))}
                  {(!client?.main_categories || client.main_categories.length === 0) && <span className="text-sm text-slate-400">--</span>}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">宣称类型</div>
                <div className="flex flex-wrap gap-1">
                  {(client?.main_claim_types || []).map((c: string) => <Badge key={c}>{c}</Badge>)}
                  {(!client?.main_claim_types || client.main_claim_types.length === 0) && <span className="text-sm text-slate-400">--</span>}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">法规区域</div>
                <div className="flex flex-wrap gap-1">
                  {(client?.regulatory_regions || []).map((r: string) => <Badge key={r}>{r}</Badge>)}
                  {(!client?.regulatory_regions || client.regulatory_regions.length === 0) && <span className="text-sm text-slate-400">--</span>}
                </div>
              </div>
            </div>
          </Card>

          <Card title="竞争情报" className="p-5">
            <div className="space-y-3">
              <div>
                <div className="text-xs text-slate-400 mb-1">已知竞争CRO</div>
                <div className="flex flex-wrap gap-1">
                  {(Array.isArray(client?.known_competitors)
                    ? client.known_competitors
                    : typeof client?.known_competitors === 'string'
                      ? client.known_competitors.split(',').map((s: string) => s.trim()).filter(Boolean)
                      : []
                  ).map((c: string) => <Badge key={c} variant="warning">{c}</Badge>)}
                  {(!client?.known_competitors || (Array.isArray(client.known_competitors) && client.known_competitors.length === 0)) && <span className="text-sm text-slate-400">--</span>}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">我方优势</div>
                <div className="flex flex-wrap gap-1">
                  {(client?.competitive_advantages || []).map((a: string) => <Badge key={a} variant="success">{a}</Badge>)}
                  {(!client?.competitive_advantages || client.competitive_advantages.length === 0) && <span className="text-sm text-slate-400">--</span>}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">竞争风险</div>
                <div className="flex flex-wrap gap-1">
                  {(client?.competitive_risks || []).map((r: string) => <Badge key={r} variant="error">{r}</Badge>)}
                  {(!client?.competitive_risks || client.competitive_risks.length === 0) && <span className="text-sm text-slate-400">--</span>}
                </div>
              </div>
            </div>
          </Card>

          {health && (
            <Card title="健康度评分" className="p-5">
              <div className="space-y-3">
                {[
                  { label: '互动', score: health.engagement_score, weight: '20%' },
                  { label: '收入', score: health.revenue_score, weight: '25%' },
                  { label: '满意度', score: health.satisfaction_score, weight: '20%' },
                  { label: '增长', score: health.growth_score, weight: '15%' },
                  { label: '忠诚度', score: health.loyalty_score, weight: '10%' },
                  { label: '创新', score: health.innovation_score, weight: '10%' },
                ].map(({ label, score, weight }) => (
                  <div key={label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{label} ({weight})</span>
                      <span className="font-semibold">{score}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${score >= 70 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                ))}
                {health.risk_factors?.length > 0 && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-xs text-slate-400 mb-1">风险因素</div>
                    {health.risk_factors.map((f: string, i: number) => (
                      <div key={i} className="text-sm text-red-600">• {f}</div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'contacts' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {(contactsRes?.data || []).length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {(contactsRes?.data || []).map((c: any) => {
                const rel = REL_LEVEL_MAP[c.relationship_level] ?? { label: c.relationship_level, color: 'default' as const }
                const isOverdue = c.last_contact_date
                  ? (new Date().getTime() - new Date(c.last_contact_date).getTime()) / 86400000 > c.contact_frequency_days
                  : true
                return (
                  <div key={c.id} className="border border-slate-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">{c.name}</span>
                          <Badge>{ROLE_TYPE_MAP[c.role_type] ?? c.role_type}</Badge>
                          <Badge variant={rel.color}>{rel.label}</Badge>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">{c.title} · {c.department}</p>
                      </div>
                      {isOverdue && (
                        <Badge variant="error">超期</Badge>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                      {c.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</div>}
                      {c.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email}</div>}
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        最近联系: {c.last_contact_date ? new Date(c.last_contact_date).toLocaleDateString('zh-CN') : '从未'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty title="暂无关键联系人" />
          )}
        </div>
      )}

      {activeTab === 'org' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {orgRes?.data ? (() => {
            const chain = Array.isArray(orgRes.data.decision_chain)
              ? orgRes.data.decision_chain
              : typeof orgRes.data.decision_chain === 'string'
                ? orgRes.data.decision_chain.split(/[→,;]/).map((s: string) => s.trim()).filter(Boolean)
                : []
            const budget = Array.isArray(orgRes.data.budget_authority)
              ? orgRes.data.budget_authority
              : typeof orgRes.data.budget_authority === 'string'
                ? orgRes.data.budget_authority.split(/[,;，；\n]/).map((s: string) => s.trim()).filter(Boolean)
                : []
            return (
            <div className="space-y-4">
              {chain.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">采购决策链</h4>
                  <div className="flex items-center gap-2">
                    {chain.map((node: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                          {typeof node === 'string' ? node : node.name ?? JSON.stringify(node)}
                        </div>
                        {i < chain.length - 1 && <span className="text-slate-300">→</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {budget.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">预算审批层级</h4>
                  <div className="space-y-1">
                    {budget.map((level: any, i: number) => (
                      <div key={i} className="text-sm text-slate-600 pl-4 border-l-2 border-blue-200">
                        {typeof level === 'string' ? level : JSON.stringify(level)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Object.keys(orgRes.data.org_structure || {}).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">组织结构</h4>
                  <pre className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg overflow-auto">
                    {JSON.stringify(orgRes.data.org_structure, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            )})() : (
            <Empty title="暂无组织架构信息" />
          )}
        </div>
      )}

      {activeTab === 'products' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {(productLinesRes?.data || []).length > 0 ? (
            <DataTable
              columns={[
                { key: 'brand', title: '品牌' },
                { key: 'category', title: '品类', render: (_: any, r: any) => CATEGORY_MAP[r.category] ?? r.category },
                { key: 'sub_category', title: '子品类' },
                { key: 'price_tier', title: '定位', render: (_: any, r: any) => {
                  const labels: Record<string, string> = { luxury: '奢侈', premium: '高端', mid: '中端', mass: '大众' }
                  return labels[r.price_tier] ?? r.price_tier
                }},
                { key: 'annual_sku_count', title: '年均SKU' },
                { key: 'typical_claims', title: '常用宣称', render: (_: any, r: any) => (
                  <div className="flex flex-wrap gap-1">
                    {(r.typical_claims || []).slice(0, 3).map((c: string) => <Badge key={c}>{c}</Badge>)}
                  </div>
                )},
              ]}
              data={productLinesRes?.data || []}
            />
          ) : (
            <Empty title="暂无产品线数据" />
          )}
        </div>
      )}

      {activeTab === 'innovation' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {(innovationsRes?.data || []).length > 0 ? (
            <div className="space-y-3">
              {(innovationsRes?.data || []).map((item: any) => {
                const st = INNOVATION_STATUS_MAP[item.status] ?? { label: item.status, color: 'default' }
                return (
                  <div key={item.id} className="flex items-start gap-4 p-3 border border-slate-100 rounded-lg">
                    <div className="text-center min-w-[60px]">
                      <div className="text-lg font-bold text-slate-700">{item.year}</div>
                      <div className="text-xs text-slate-400">{item.season}</div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{item.product_concept}</span>
                        <Badge variant={st.color}>{st.label}</Badge>
                        <Badge>{item.innovation_type}</Badge>
                      </div>
                      {item.our_opportunity && (
                        <p className="text-sm text-slate-500 mt-1">{item.our_opportunity}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty title="暂无创新日历" />
          )}
        </div>
      )}

      {activeTab === 'projects' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {(protocolsRes?.data?.items || []).length > 0 ? (
            <DataTable
              columns={[
                { key: 'code', title: '编号' },
                { key: 'title', title: '项目名称' },
                { key: 'status', title: '状态', render: (_: any, r: any) => <Badge>{r.status}</Badge> },
                { key: 'efficacy_type', title: '功效类型' },
                { key: 'sample_size', title: '样本量' },
              ]}
              data={protocolsRes?.data?.items || []}
            />
          ) : (
            <Empty title="该客户暂无关联项目" />
          )}
        </div>
      )}

      {activeTab === 'finance' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">合同列表</h3>
            {(contractsRes?.data?.items || []).length > 0 ? (
              <DataTable
                columns={[
                  { key: 'code', title: '合同编号' },
                  { key: 'project', title: '项目' },
                  { key: 'amount', title: '金额', render: (_: any, r: any) => `¥${Number(r.amount || 0).toLocaleString()}` },
                  { key: 'status', title: '状态', render: (_: any, r: any) => <Badge>{r.status}</Badge> },
                  { key: 'signed_date', title: '签署日期' },
                ]}
                data={contractsRes?.data?.items || []}
              />
            ) : (
              <Empty title="暂无合同" />
            )}
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">发票列表</h3>
            {(invoicesRes?.data?.items || []).length > 0 ? (
              <DataTable
                columns={[
                  { key: 'code', title: '发票编号' },
                  { key: 'contract_code', title: '合同' },
                  { key: 'total', title: '含税金额', render: (_: any, r: any) => `¥${Number(r.total || 0).toLocaleString()}` },
                  { key: 'status', title: '状态', render: (_: any, r: any) => <Badge>{r.status}</Badge> },
                  { key: 'invoice_date', title: '开票日期' },
                ]}
                data={invoicesRes?.data?.items || []}
              />
            ) : (
              <Empty title="暂无发票" />
            )}
          </div>
        </div>
      )}

      {activeTab === 'opportunities' && (
        <div className="space-y-4">
          {(oppsRes?.data?.items || []).length > 0 && (
            <DigitalWorkerActionCard
              roleCode="quote_analyst"
              roleName="报价助手"
              title="基于当前商机创建报价草稿"
              description="报价助手可根据当前商机金额、客户与项目名称，直接创建报价草稿供财务完善。"
              items={(oppsRes?.data?.items || []).slice(0, 3).map((opp: any) => ({
                key: String(opp.id),
                label: opp.title,
                value: `预估金额 ¥${Number(opp.estimated_amount || 0).toLocaleString()} · 阶段 ${STAGE_MAP[opp.stage] || opp.stage}`,
              }))}
              onAcceptSingle={async (item) => {
                const opp = (oppsRes?.data?.items || []).find((o: any) => String(o.id) === item.key)
                if (!opp) return
                const code = `Q-${Date.now()}`
                await api.post('/finance/quotes/create', {
                  code,
                  project: opp.title,
                  client: client?.name || '待确认客户',
                  total_amount: Number(opp.estimated_amount || 0),
                  created_at: new Date().toISOString().slice(0, 10),
                })
                queryClient.invalidateQueries({ queryKey: ['quotes', 'by-client', clientId] })
              }}
            />
          )}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            {(oppsRes?.data?.items || []).length > 0 ? (
              <DataTable
                columns={[
                  { key: 'title', title: '商机名称' },
                  { key: 'stage', title: '阶段', render: (_: any, r: any) => <Badge>{STAGE_MAP[r.stage] || r.stage}</Badge> },
                  { key: 'estimated_amount', title: '预估金额', render: (_: any, r: any) => `¥${Number(r.estimated_amount || 0).toLocaleString()}` },
                  { key: 'probability', title: '概率', render: (_: any, r: any) => `${r.probability}%` },
                  { key: 'owner', title: '负责人' },
                  { key: 'expected_close_date', title: '预计成交' },
                ]}
                data={oppsRes?.data?.items || []}
              />
            ) : (
              <Empty title="暂无商机" />
            )}
          </div>
        </div>
      )}

      {activeTab === 'tickets' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {(ticketsRes?.data?.items || []).length > 0 ? (
            <DataTable
              columns={[
                { key: 'code', title: '工单编号' },
                { key: 'title', title: '标题' },
                { key: 'category', title: '分类' },
                { key: 'priority', title: '优先级', render: (_: any, r: any) => <Badge variant={r.priority === 'high' ? 'error' : r.priority === 'medium' ? 'warning' : 'default'}>{r.priority}</Badge> },
                { key: 'status', title: '状态', render: (_: any, r: any) => <Badge>{r.status}</Badge> },
                { key: 'assignee', title: '处理人' },
              ]}
              data={ticketsRes?.data?.items || []}
            />
          ) : (
            <Empty title="暂无售后工单" />
          )}
        </div>
      )}

      {activeTab === 'communications' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">沟通时间线（只读 — 数据来自采苓·研究台）</h3>
          {(commsRes?.data?.items || []).length > 0 ? (
            <div className="relative ml-4">
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-slate-200" />
              {(commsRes?.data?.items || []).map((c: any) => {
                const typeIcons: Record<string, React.ReactNode> = {
                  email: <Mail className="w-3.5 h-3.5" />,
                  phone: <Phone className="w-3.5 h-3.5" />,
                  meeting: <Calendar className="w-3.5 h-3.5" />,
                  feishu_message: <Send className="w-3.5 h-3.5" />,
                  visit: <Users className="w-3.5 h-3.5" />,
                  file_transfer: <FileText className="w-3.5 h-3.5" />,
                }
                const typeLabels: Record<string, string> = {
                  email: '邮件', phone: '电话', meeting: '会议',
                  feishu_message: '飞书消息', visit: '拜访', file_transfer: '文件',
                }
                return (
                  <div key={c.id} className="relative pl-6 pb-4">
                    <div className="absolute left-[-5px] w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                    <div className="flex items-start gap-2">
                      <div className="p-1.5 bg-blue-50 rounded text-blue-500">
                        {typeIcons[c.comm_type] || <MessageSquare className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">{c.subject}</span>
                          <Badge>{typeLabels[c.comm_type] || c.comm_type}</Badge>
                        </div>
                        {c.summary && <p className="text-xs text-slate-500 mt-1">{c.summary}</p>}
                        <div className="text-[10px] text-slate-400 mt-1">
                          {c.occurred_at ? new Date(c.occurred_at).toLocaleDateString('zh-CN') : c.create_time?.slice(0, 16)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <Empty title="暂无沟通记录" />
          )}
        </div>
      )}

      {activeTab === 'insight' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-100 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-5 h-5 text-purple-500" />
              <h3 className="text-sm font-semibold text-purple-700">AI 战略洞察</h3>
            </div>
            {insightRes?.data?.analysis ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {insightRes.data.analysis}
                </p>
                {insightRes.data.metrics && (
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-purple-100">
                    <div className="text-center">
                      <div className="text-lg font-semibold text-purple-700">{insightRes.data.metrics.total_projects}</div>
                      <div className="text-xs text-slate-500">合作项目</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-purple-700">¥{((insightRes.data.metrics.total_contract_amount || 0) / 10000).toFixed(1)}万</div>
                      <div className="text-xs text-slate-500">合同总额</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-semibold text-amber-600">¥{((insightRes.data.metrics.receivable || 0) / 10000).toFixed(1)}万</div>
                      <div className="text-xs text-slate-500">应收余额</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">正在生成 AI 洞察分析...</p>
            )}
          </div>

          <DigitalWorkerActionCard
            roleCode="customer_demand_analyst"
            roleName="客户需求分析员"
            title="生成需求摘要与缺口清单"
            description="客户需求分析员可根据该客户的沟通记录和项目历史，生成结构化需求摘要与缺口清单，供内部评审使用。"
            items={[]}
            onTrigger={() => {
              const params = new URLSearchParams({
                skill: 'protocol-parser',
                action: 'demand-analysis',
              })
              window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}&context_client_id=${id}`), '_blank')
            }}
            triggerLabel="生成需求分析"
          />
        </div>
      )}
    </div>
  )
}
