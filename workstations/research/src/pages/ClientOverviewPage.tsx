/**
 * CRM 客户概览（研究台精简版）
 *
 * 复用 crmApi，只展示"我负责的客户"，支持搜索
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { crmApi } from '@cn-kis/api-client'
import { DataTable, StatCard, Badge, Empty } from '@cn-kis/ui-kit'
import type { Column, BadgeVariant } from '@cn-kis/ui-kit'
import { Link } from 'react-router-dom'
import { Building2, Search, Users, DollarSign, ChevronRight } from 'lucide-react'

interface Client {
  id: number
  name: string
  level: string
  industry: string
  contact_name: string
  contact_phone: string
  total_projects: number
  total_revenue: number
  [key: string]: unknown
}

const LEVEL_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  strategic: { label: '战略', variant: 'primary' },
  key: { label: '重点', variant: 'info' },
  standard: { label: '标准', variant: 'default' },
  potential: { label: '潜力', variant: 'warning' },
}

export default function ClientOverviewPage() {
  const [search, setSearch] = useState('')

  const { data: listRes, isLoading } = useQuery({
    queryKey: ['crm', 'clients', 'research'],
    queryFn: () => crmApi.listClients({ page: 1, page_size: 100 }),
  })

  const { data: statsRes } = useQuery({
    queryKey: ['crm', 'clients', 'stats'],
    queryFn: () => crmApi.getClientStats(),
  })

  const allClients: Client[] = (listRes?.data as any)?.items ?? []
  const stats = (statsRes?.data as any) ?? {}

  const clients = search
    ? allClients.filter((c) =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.contact_name?.toLowerCase().includes(search.toLowerCase())
      )
    : allClients

  const columns: Column<Client>[] = [
    {
      key: 'name',
      title: '客户名称',
      render: (_, r) => (
        <Link to={`/clients/${r.id}`} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium">
          <Building2 className="w-4 h-4 text-slate-400" />
          {r.name}
        </Link>
      ),
    },
    {
      key: 'level',
      title: '等级',
      width: 90,
      render: (_, r) => {
        const info = LEVEL_MAP[r.level] || { label: r.level, variant: 'default' as BadgeVariant }
        return <Badge variant={info.variant}>{info.label}</Badge>
      },
    },
    { key: 'industry', title: '行业', width: 120 },
    { key: 'contact_name', title: '联系人', width: 100 },
    {
      key: 'total_projects',
      title: '项目数',
      width: 80,
      render: (_, r) => <span className="font-medium text-slate-700">{r.total_projects || 0}</span>,
    },
    {
      key: 'total_revenue',
      title: '累计营收',
      width: 120,
      render: (_, r) => {
        const v = r.total_revenue || 0
        return <span className="text-slate-700">{v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`}</span>
      },
    },
    {
      key: 'action',
      title: '',
      width: 40,
      render: (_, r) => (
        <Link to={`/clients/${r.id}`}>
          <ChevronRight className="w-4 h-4 text-slate-300 hover:text-blue-500" />
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">我的客户</h2>
        <p className="mt-1 text-sm text-slate-500">查看和管理客户关系、项目合作历史</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard title="客户总数" value={stats.total_count ?? allClients.length} icon={<Building2 className="w-5 h-5" />} color="blue" />
        <StatCard title="活跃项目客户" value={stats.active_client_count ?? 0} icon={<Users className="w-5 h-5" />} color="green" />
        <StatCard
          title="累计营收"
          value={stats.total_revenue ? `¥${(stats.total_revenue / 10000).toFixed(1)}万` : '¥0'}
          icon={<DollarSign className="w-5 h-5" />}
          color="amber"
        />
      </div>

      <div className="relative w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索客户名称或联系人..."
          className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <DataTable<Client>
          columns={columns}
          data={clients}
          loading={isLoading}
          rowKey="id"
        />
        {!isLoading && clients.length === 0 && (
          <div className="py-8">
            <Empty icon={<Building2 className="w-12 h-12" />} title="暂无客户数据" />
          </div>
        )}
      </div>
    </div>
  )
}
