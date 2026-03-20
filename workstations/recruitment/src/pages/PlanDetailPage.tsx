import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { recruitmentApi } from '@cn-kis/api-client'
import { toast } from '../hooks/useToast'
import { ErrorAlert } from '../components/ErrorAlert'
import { BarChart, Bar, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

type Tab = 'info' | 'criteria' | 'channels' | 'ads'

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const planId = Number(id)
  const [activeTab, setActiveTab] = useState<Tab>('info')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recruitment', 'plan', planId],
    queryFn: async () => { const res = await recruitmentApi.getPlan(planId); if (!res?.data) throw new Error('获取计划详情失败'); return res },
    enabled: !!planId,
  })

  const plan = data?.data

  if (isLoading) return <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />)}</div>
  if (error) return <div className="py-6"><ErrorAlert message={(error as Error).message} onRetry={() => refetch()} /></div>
  if (!plan) return <div className="text-sm text-slate-400 py-12 text-center">计划不存在</div>

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: '基本信息' }, { key: 'criteria', label: '入排标准' },
    { key: 'channels', label: '渠道管理' }, { key: 'ads', label: '广告管理' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/plans')} className="text-sm text-slate-400 hover:text-slate-600">&larr; 返回列表</button>
        <h2 className="text-xl font-bold text-slate-800">{plan.title}</h2>
        <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">{plan.status}</span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatMini label="目标" value={plan.target_count} />
        <StatMini label="报名" value={plan.registered_count} />
        <StatMini label="筛选" value={plan.screened_count} />
        <StatMini label="入组" value={plan.enrolled_count} />
      </div>

      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.key ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{tab.label}</button>
          ))}
        </div>
      </div>

      {activeTab === 'info' && <PlanInfoTab plan={plan} />}
      {activeTab === 'criteria' && <CriteriaTab planId={planId} />}
      {activeTab === 'channels' && <ChannelsTab planId={planId} />}
      {activeTab === 'ads' && <AdsTab planId={planId} />}
    </div>
  )
}

function StatMini({ label, value }: { label: string; value: number }) {
  return <div className="bg-white rounded-lg border border-slate-200 p-4"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-800 mt-1">{value}</p></div>
}

function PlanInfoTab({ plan }: { plan: any }) {
  const planId = plan.id as number
  const [trendDays, setTrendDays] = useState(30)

  const trendsQuery = useQuery({
    queryKey: ['recruitment', 'trends', planId, trendDays],
    queryFn: () => recruitmentApi.getTrends(planId, trendDays),
    enabled: !!planId,
  })

  const trendItems = trendsQuery.data?.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <InfoRow label="计划编号" value={String(plan.plan_no)} /><InfoRow label="协议 ID" value={String(plan.protocol_id)} />
          <InfoRow label="开始日期" value={String(plan.start_date)} /><InfoRow label="结束日期" value={String(plan.end_date)} />
          <InfoRow label="完成率" value={`${((plan.completion_rate as number) * 100).toFixed(1)}%`} /><InfoRow label="创建时间" value={String(plan.create_time).slice(0, 10)} />
        </div>
        {plan.description && <div className="mt-4 pt-4 border-t border-slate-100"><p className="text-xs text-slate-500 mb-1">描述</p><p className="text-sm text-slate-700">{String(plan.description)}</p></div>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">招募趋势</h3>
          <div className="flex gap-1">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setTrendDays(d)}
                className={`px-2 py-1 text-xs rounded ${trendDays === d ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {d}天
              </button>
            ))}
          </div>
        </div>
        {trendsQuery.isLoading ? (
          <div className="h-48 bg-slate-100 rounded animate-pulse" />
        ) : trendItems.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-slate-400">暂无趋势数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendItems}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip labelFormatter={(d: string) => `日期: ${d}`} />
              <Line type="monotone" dataKey="registered" name="报名" stroke="#3b82f6" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="screened" name="筛选" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="enrolled" name="入组" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-500">{label}</p><p className="text-slate-700 mt-0.5">{value}</p></div>
}

function CriteriaTab({ planId }: { planId: number }) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [newCriteria, setNewCriteria] = useState({ criteria_type: 'inclusion', description: '', sequence: 1 })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recruitment', 'criteria', planId],
    queryFn: () => recruitmentApi.listCriteria(planId),
  })

  const addMutation = useMutation({
    mutationFn: () => recruitmentApi.addCriteria(planId, newCriteria),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'criteria', planId] })
      toast.success('入排标准已添加')
      setShowAdd(false)
      setNewCriteria({ criteria_type: 'inclusion', description: '', sequence: 1 })
    },
    onError: (err) => toast.error((err as Error).message || '添加失败'),
  })

  const items = data?.data?.items ?? []

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">入排标准</h3>
        <button onClick={() => setShowAdd(true)} className="text-sm text-emerald-600 hover:underline">+ 新增</button>
      </div>
      {isLoading ? <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        : error ? <ErrorAlert message="加载入排标准失败" onRetry={() => refetch()} />
        : items.length === 0 ? <div className="text-sm text-slate-400 py-6 text-center">暂无入排标准</div>
        : <div className="space-y-2">{items.map((c) => (
          <div key={c.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.criteria_type === 'inclusion' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{c.criteria_type === 'inclusion' ? '纳入' : '排除'}</span>
            <span className="text-sm text-slate-700 flex-1">{c.description}</span>
            {c.is_mandatory && <span className="text-xs text-amber-600">必填</span>}
          </div>
        ))}</div>}

      {showAdd && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center gap-3">
            <select value={newCriteria.criteria_type} onChange={(e) => setNewCriteria({ ...newCriteria, criteria_type: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" title="标准类型"><option value="inclusion">纳入标准</option><option value="exclusion">排除标准</option></select>
            <input type="number" value={newCriteria.sequence} onChange={(e) => setNewCriteria({ ...newCriteria, sequence: Number(e.target.value) })} className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="序号" />
          </div>
          <textarea value={newCriteria.description} onChange={(e) => setNewCriteria({ ...newCriteria, description: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={2} placeholder="标准描述" />
          <div className="flex gap-2">
            <button onClick={() => addMutation.mutate()} disabled={!newCriteria.description || addMutation.isPending} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">{addMutation.isPending ? '添加中...' : '添加'}</button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-slate-600">取消</button>
          </div>
        </div>
      )}
    </div>
  )
}

const CHANNEL_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

function ChannelsTab({ planId }: { planId: number }) {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ channel_type: 'online', name: '' })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recruitment', 'channels', planId],
    queryFn: () => recruitmentApi.listChannels(planId),
  })

  const addMutation = useMutation({
    mutationFn: () => {
      if (!form.name.trim()) throw new Error('请输入渠道名称')
      return recruitmentApi.addChannel(planId, form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'channels', planId] })
      toast.success('渠道已添加')
      setShowAdd(false); setForm({ channel_type: 'online', name: '' })
    },
    onError: (err) => toast.error((err as Error).message || '添加失败'),
  })

  const items: Array<{ id: number; channel_type: string; name: string; registered_count: number; screened_count: number; enrolled_count: number; status: string }> = data?.data?.items ?? []
  const chartData = items.map((ch) => ({
    name: ch.name,
    报名: ch.registered_count,
    筛选: ch.screened_count,
    入组: ch.enrolled_count,
    转化率: ch.registered_count > 0 ? Math.round(ch.enrolled_count / ch.registered_count * 100) : 0,
  }))

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">渠道管理</h3>
          <button onClick={() => setShowAdd(true)} className="text-sm text-emerald-600 hover:underline">+ 新增</button>
        </div>
        {isLoading ? <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
          : error ? <ErrorAlert message="加载渠道数据失败" onRetry={() => refetch()} />
          : items.length === 0 ? <div className="text-sm text-slate-400 py-6 text-center">暂无渠道</div>
          : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 text-slate-600 font-medium">渠道名称</th>
                  <th className="text-left py-2 text-slate-600 font-medium">类型</th>
                  <th className="text-right py-2 text-slate-600 font-medium">报名</th>
                  <th className="text-right py-2 text-slate-600 font-medium">筛选</th>
                  <th className="text-right py-2 text-slate-600 font-medium">入组</th>
                  <th className="text-right py-2 text-slate-600 font-medium">转化率</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ch) => (
                  <tr key={ch.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-700 font-medium">{ch.name}</td>
                    <td className="py-2"><span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{ch.channel_type}</span></td>
                    <td className="py-2 text-right text-slate-600">{ch.registered_count}</td>
                    <td className="py-2 text-right text-slate-600">{ch.screened_count}</td>
                    <td className="py-2 text-right text-emerald-600 font-medium">{ch.enrolled_count}</td>
                    <td className="py-2 text-right text-slate-600">{ch.registered_count > 0 ? `${(ch.enrolled_count / ch.registered_count * 100).toFixed(1)}%` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        {showAdd && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3">
            <select value={form.channel_type} onChange={(e) => setForm({ ...form, channel_type: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" title="渠道类型"><option value="online">线上</option><option value="offline">线下</option><option value="referral">转介</option><option value="social_media">社交媒体</option></select>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="渠道名称" />
            <button onClick={() => addMutation.mutate()} disabled={!form.name || addMutation.isPending} className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">{addMutation.isPending ? '添加中...' : '添加'}</button>
            <button onClick={() => setShowAdd(false)} className="px-3 py-2 text-sm text-slate-600">取消</button>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">渠道效果对比</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} barGap={2}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="报名" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="筛选" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="入组" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

const adTypeLabels: Record<string, string> = { poster: '海报', video: '视频', article: '文章', wechat: '微信推文' }
const adStatusLabels: Record<string, string> = { draft: '草稿', approved: '已审核', published: '已发布' }
const adStatusColors: Record<string, string> = { draft: 'bg-slate-100 text-slate-600', approved: 'bg-blue-100 text-blue-700', published: 'bg-emerald-100 text-emerald-700' }

function AdsTab({ planId }: { planId: number }) {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editingAd, setEditingAd] = useState<{ id: number; title: string; content: string; ad_type: string } | null>(null)
  const [form, setForm] = useState({ ad_type: 'poster', title: '', content: '' })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recruitment', 'ads', planId],
    queryFn: () => recruitmentApi.listAds(planId),
  })

  const createMutation = useMutation({
    mutationFn: () => {
      if (!form.title.trim()) throw new Error('请输入广告标题')
      return recruitmentApi.createAd(planId, form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'ads', planId] })
      toast.success('广告已创建')
      setShowCreate(false); setForm({ ad_type: 'poster', title: '', content: '' })
    },
    onError: (err) => toast.error((err as Error).message || '创建失败'),
  })

  const publishMutation = useMutation({
    mutationFn: (adId: number) => recruitmentApi.publishAd(adId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'ads', planId] })
      toast.success('广告已发布')
    },
    onError: (err) => toast.error((err as Error).message || '发布失败'),
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingAd) return Promise.reject()
      return recruitmentApi.updateAd(editingAd.id, { title: editingAd.title, content: editingAd.content, ad_type: editingAd.ad_type })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'ads', planId] })
      toast.success('广告已更新')
      setEditingAd(null)
    },
    onError: (err) => toast.error((err as Error).message || '更新失败'),
  })

  const ads: Array<{ id: number; ad_type: string; title: string; content: string; status: string; published_at: string | null; create_time: string }> = data?.data?.items ?? []

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">广告管理 <span className="text-slate-400 font-normal">({ads.length})</span></h3>
        <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700">+ 新增广告</button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />)}</div>
      ) : error ? (
        <ErrorAlert message="加载广告列表失败" onRetry={() => refetch()} />
      ) : ads.length === 0 ? (
        <div className="text-sm text-slate-400 py-8 text-center">暂无广告，点击"新增广告"开始创建</div>
      ) : (
        <div className="space-y-3">
          {ads.map((ad) => (
            <div key={ad.id} className="border border-slate-200 rounded-lg p-4">
              {editingAd?.id === ad.id ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <select value={editingAd.ad_type} onChange={(e) => setEditingAd({ ...editingAd, ad_type: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" title="广告类型">
                      <option value="poster">海报</option><option value="video">视频</option><option value="article">文章</option><option value="wechat">微信推文</option>
                    </select>
                    <input value={editingAd.title} onChange={(e) => setEditingAd({ ...editingAd, title: e.target.value })} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="广告标题" />
                  </div>
                  <textarea value={editingAd.content} onChange={(e) => setEditingAd({ ...editingAd, content: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={2} placeholder="广告内容" />
                  <div className="flex gap-2">
                    <button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">{updateMutation.isPending ? '保存中...' : '保存'}</button>
                    <button onClick={() => setEditingAd(null)} className="px-3 py-1.5 text-sm text-slate-600">取消</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-800">{ad.title}</span>
                      <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500">{adTypeLabels[ad.ad_type] || ad.ad_type}</span>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${adStatusColors[ad.status] || 'bg-slate-100'}`}>{adStatusLabels[ad.status] || ad.status}</span>
                    </div>
                    {ad.content && <p className="text-sm text-slate-500 line-clamp-2">{ad.content}</p>}
                    <p className="text-xs text-slate-400 mt-1">
                      创建于 {ad.create_time?.slice(0, 10)}
                      {ad.published_at && ` · 发布于 ${ad.published_at.slice(0, 10)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {ad.status === 'draft' && (
                      <>
                        <button onClick={() => setEditingAd({ id: ad.id, title: ad.title, content: ad.content, ad_type: ad.ad_type })} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">编辑</button>
                        <button onClick={() => publishMutation.mutate(ad.id)} disabled={publishMutation.isPending} className="px-2 py-1 text-xs text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-50">发布</button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center gap-3">
            <select value={form.ad_type} onChange={(e) => setForm({ ...form, ad_type: e.target.value })} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" title="广告类型"><option value="poster">海报</option><option value="video">视频</option><option value="article">文章</option><option value="wechat">微信推文</option></select>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="广告标题" />
          </div>
          <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" rows={2} placeholder="广告内容" />
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!form.title || createMutation.isPending} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50">{createMutation.isPending ? '创建中...' : '创建'}</button>
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-sm text-slate-600">取消</button>
          </div>
        </div>
      )}
    </div>
  )
}
