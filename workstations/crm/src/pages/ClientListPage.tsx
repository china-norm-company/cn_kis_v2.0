import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, StatCard, Modal, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Building2, Star, TrendingUp, Users, Plus, Pencil, Eye, Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Client {
  id: number
  name: string
  short_name: string
  level: 'strategic' | 'key' | 'normal' | 'potential'
  industry: string
  contact_name: string
  contact_phone: string
  total_projects: number
  total_revenue: string
  partnership_tier: string
  company_type: string
  create_time: string
  [key: string]: unknown
}

const levelMap: Record<string, { label: string; variant: 'error' | 'warning' | 'primary' | 'default' }> = {
  strategic: { label: '战略', variant: 'error' },
  key: { label: '重点', variant: 'warning' },
  normal: { label: '普通', variant: 'primary' },
  potential: { label: '潜在', variant: 'default' },
}

const tierMap: Record<string, string> = {
  platinum: '铂金', gold: '黄金', silver: '银牌', developing: '发展中', prospect: '潜在',
}

const companyTypeMap: Record<string, string> = {
  global_top20: '全球Top20', china_top10: '国内Top10', multinational: '跨国',
  domestic_large: '国内大型', emerging_brand: '新锐', oem_odm: 'OEM/ODM',
  health_wellness: '大健康', other: '其他',
}

export function ClientListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterIndustry, setFilterIndustry] = useState('')
  const [filterTier, setFilterTier] = useState('')
  const [filterType, setFilterType] = useState('')
  const [form, setForm] = useState({ name: '', short_name: '', level: 'normal', industry: '', contact_name: '', contact_phone: '', contact_email: '', address: '', company_type: 'other', partnership_tier: 'prospect' })

  const { data, isLoading } = useQuery({
    queryKey: ['clients', page, pageSize, keyword, filterLevel, filterIndustry, filterTier, filterType],
    queryFn: () =>
      api.get<{ items: Client[]; total: number }>('/crm/clients/list', {
        params: {
          page, page_size: pageSize,
          ...(keyword ? { keyword } : {}),
          ...(filterLevel ? { level: filterLevel } : {}),
          ...(filterIndustry ? { industry: filterIndustry } : {}),
          ...(filterTier ? { partnership_tier: filterTier } : {}),
          ...(filterType ? { company_type: filterType } : {}),
        },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['client-stats'],
    queryFn: () =>
      api.get<{ by_level: Record<string, number>; total: number; total_revenue: number }>(
        '/crm/clients/stats'
      ),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/crm/clients/create', form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['clients'] }); setShowCreate(false) },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data?.by_level ?? {}

  const columns: Column<Client>[] = [
    { key: 'name', title: '客户名称', render: (_, row) => (
      <button onClick={() => navigate(`/clients/${row!.id}`)} className="text-blue-600 hover:underline text-left">{row!.name}</button>
    )},
    {
      key: 'level',
      title: '等级',
      width: 80,
      render: (val) => {
        const info = levelMap[val as string]
        return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
      },
    },
    { key: 'partnership_tier', title: '合作等级', width: 90, render: (val) => val ? <Badge variant="primary">{tierMap[val as string] ?? val}</Badge> : '-' },
    { key: 'company_type', title: '类型', width: 90, render: (val) => val && val !== 'other' ? companyTypeMap[val as string] ?? val : '-' },
    { key: 'industry', title: '行业', width: 100, render: (val) => val ? String(val) : '-' },
    { key: 'total_projects', title: '项目数', width: 80, align: 'center' },
    {
      key: 'total_revenue',
      title: '累计营收',
      width: 130,
      align: 'right',
      render: (val) => {
        const num = Number(val)
        return num > 0 ? `¥${num.toLocaleString()}` : '-'
      },
    },
    {
      key: 'id' as any,
      title: '操作',
      width: 100,
      render: (_, row) => (
        <div className="flex gap-1">
          <button onClick={() => navigate(`/clients/${row!.id}`)} className="min-h-9 min-w-9 p-1 hover:bg-slate-100 rounded" title="查看">
            <Eye className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-bold text-slate-800 md:text-2xl">客户档案</h1>
        <PermissionGuard permission="crm.client.create">
          <button
            onClick={() => setShowCreate(true)}
            className="flex min-h-11 items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            title="新建客户"
          >
            <Plus className="w-4 h-4" /> 新建客户
          </button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="客户总数" value={statsData?.data?.total ?? 0} icon={<Building2 className="w-6 h-6" />} />
        <StatCard title="战略客户" value={stats.strategic ?? 0} icon={<Star className="w-6 h-6" />} />
        <StatCard title="重点客户" value={stats.key ?? 0} icon={<Users className="w-6 h-6" />} />
        <StatCard
          title="累计营收"
          value={`¥${((statsData?.data?.total_revenue ?? 0) / 10000).toFixed(0)}万`}
          icon={<TrendingUp className="w-6 h-6" />}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 overflow-x-auto rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex min-w-[220px] items-center gap-2 flex-1 sm:max-w-sm">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
            placeholder="搜索客户名称..."
            className="flex-1 min-h-11 text-sm border-0 focus:outline-none"
            title="搜索客户名称"
          />
        </div>
        <select value={filterLevel} onChange={(e) => { setFilterLevel(e.target.value); setPage(1) }} className="shrink-0 min-h-11 px-3 py-1.5 border border-slate-200 rounded-lg text-sm" title="客户等级筛选">
          <option value="">全部等级</option>
          <option value="strategic">战略</option>
          <option value="key">重点</option>
          <option value="normal">普通</option>
          <option value="potential">潜在</option>
        </select>
        <select value={filterTier} onChange={(e) => { setFilterTier(e.target.value); setPage(1) }} className="shrink-0 min-h-11 px-3 py-1.5 border border-slate-200 rounded-lg text-sm" title="合作等级筛选">
          <option value="">全部合作等级</option>
          <option value="platinum">铂金</option>
          <option value="gold">黄金</option>
          <option value="silver">银牌</option>
          <option value="developing">发展中</option>
          <option value="prospect">潜在</option>
        </select>
        <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1) }} className="shrink-0 min-h-11 px-3 py-1.5 border border-slate-200 rounded-lg text-sm" title="客户类型筛选">
          <option value="">全部类型</option>
          <option value="global_top20">全球Top20</option>
          <option value="china_top10">国内Top10</option>
          <option value="multinational">跨国企业</option>
          <option value="domestic_large">国内大型</option>
          <option value="emerging_brand">新锐品牌</option>
        </select>
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[980px]">
            <DataTable<Client>
              columns={columns}
              data={items}
              loading={isLoading}
              emptyText="暂无客户数据"
              pagination={{ current: page, pageSize, total, onChange: setPage }}
            />
          </div>
        </div>
      </Card>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="max-h-[90vh] w-[92vw] max-w-[500px] overflow-y-auto rounded-xl bg-white p-4 md:p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">新建客户</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">客户名称 *</label>
                <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="客户名称" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-500">简称</label>
                  <input value={form.short_name} onChange={e => setForm(p => ({...p, short_name: e.target.value}))} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="客户简称" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">等级</label>
                  <select value={form.level} onChange={e => setForm(p => ({...p, level: e.target.value}))} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="客户等级">
                    <option value="strategic">战略</option><option value="key">重点</option><option value="normal">普通</option><option value="potential">潜在</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-500">公司类型</label>
                  <select value={form.company_type} onChange={e => setForm(p => ({...p, company_type: e.target.value}))} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="公司类型">
                    <option value="global_top20">全球Top20</option><option value="china_top10">国内Top10</option>
                    <option value="multinational">跨国企业</option><option value="domestic_large">国内大型</option>
                    <option value="emerging_brand">新锐品牌</option><option value="oem_odm">OEM/ODM</option>
                    <option value="health_wellness">大健康</option><option value="other">其他</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">合作等级</label>
                  <select value={form.partnership_tier} onChange={e => setForm(p => ({...p, partnership_tier: e.target.value}))} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="合作等级">
                    <option value="platinum">铂金</option><option value="gold">黄金</option>
                    <option value="silver">银牌</option><option value="developing">发展中</option>
                    <option value="prospect">潜在</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">行业</label>
                <input value={form.industry} onChange={e => setForm(p => ({...p, industry: e.target.value}))} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="所属行业" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-500">联系人</label>
                  <input value={form.contact_name} onChange={e => setForm(p => ({...p, contact_name: e.target.value}))} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="联系人" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">联系电话</label>
                  <input value={form.contact_phone} onChange={e => setForm(p => ({...p, contact_phone: e.target.value}))} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="联系电话" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="min-h-11 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg" title="取消新建客户">取消</button>
              <button onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending} className="min-h-11 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50" title="创建客户">
                {createMutation.isPending ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
