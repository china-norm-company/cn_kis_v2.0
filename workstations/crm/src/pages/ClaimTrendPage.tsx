import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, Modal, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { TrendingUp, Plus, Search } from 'lucide-react'

interface Trend {
  id: number
  claim_category: string
  claim_text: string
  region: string
  trending_score: number
  year: number
  test_methods: string
  [key: string]: unknown
}

const regionOptions = ['中国', '美国', '欧盟', '日本']

export function ClaimTrendPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [filters, setFilters] = useState({
    claim_category: '',
    region: '',
    year: '',
    keyword: '',
  })
  const [form, setForm] = useState({
    claim_category: '',
    claim_text: '',
    region: '中国',
    regulatory_basis: '',
    test_methods: '',
    trending_score: 50,
    year: new Date().getFullYear(),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['trends', page, pageSize, filters],
    queryFn: () =>
      api.get<{ items: Trend[]; total: number }>('/crm/trends/list', {
        params: {
          page,
          page_size: pageSize,
          ...(filters.claim_category ? { claim_category: filters.claim_category } : {}),
          ...(filters.region ? { region: filters.region } : {}),
          ...(filters.year ? { year: Number(filters.year) } : {}),
          ...(filters.keyword ? { keyword: filters.keyword } : {}),
        },
      }),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/crm/trends/create', {
      ...form,
      trending_score: Number(form.trending_score),
      year: Number(form.year),
      test_methods: form.test_methods.split(',').map(s => s.trim()).filter(Boolean).join(','),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trends'] })
      setShowCreate(false)
      setForm({ claim_category: '', claim_text: '', region: '中国', regulatory_basis: '', test_methods: '', trending_score: 50, year: new Date().getFullYear() })
    },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  const columns: Column<Trend>[] = [
    { key: 'claim_category', title: '宣称类别', width: 120 },
    { key: 'claim_text', title: '宣称内容' },
    {
      key: 'region',
      title: '地区',
      width: 100,
      render: (val) => String(val || '-'),
    },
    {
      key: 'trending_score',
      title: '趋势得分',
      width: 150,
      render: (val) => {
        const score = Number(val) || 0
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-100 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
              />
            </div>
            <span className="text-xs text-slate-600 w-8">{score}</span>
          </div>
        )
      },
    },
    {
      key: 'year',
      title: '年份',
      width: 80,
      align: 'center',
    },
    {
      key: 'test_methods',
      title: '测试方法',
      render: (val) => {
        const methods = String(val || '').split(',').filter(Boolean)
        return (
          <div className="flex flex-wrap gap-1">
            {methods.map((m, idx) => (
              <Badge key={idx} variant="default">{m.trim()}</Badge>
            ))}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">宣称趋势</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> 新建趋势
        </button>
      </div>

      <div className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            value={filters.keyword}
            onChange={(e) => { setFilters(p => ({ ...p, keyword: e.target.value })); setPage(1) }}
            placeholder="搜索关键词..."
            className="flex-1 text-sm border-0 focus:outline-none"
          />
        </div>
        <input
          value={filters.claim_category}
          onChange={(e) => { setFilters(p => ({ ...p, claim_category: e.target.value })); setPage(1) }}
          placeholder="宣称类别"
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-32"
        />
        <select
          value={filters.region}
          onChange={(e) => { setFilters(p => ({ ...p, region: e.target.value })); setPage(1) }}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">全部地区</option>
          {regionOptions.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input
          type="number"
          value={filters.year}
          onChange={(e) => { setFilters(p => ({ ...p, year: e.target.value })); setPage(1) }}
          placeholder="年份"
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm w-24"
        />
      </div>

      <Card>
        <div className="p-1">
          <DataTable<Trend>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无趋势数据"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[600px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">新建宣称趋势</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">宣称类别 *</label>
                  <input
                    value={form.claim_category}
                    onChange={e => setForm(p => ({ ...p, claim_category: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">地区 *</label>
                  <select
                    value={form.region}
                    onChange={e => setForm(p => ({ ...p, region: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  >
                    {regionOptions.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">宣称内容 *</label>
                <input
                  value={form.claim_text}
                  onChange={e => setForm(p => ({ ...p, claim_text: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">法规依据</label>
                <textarea
                  value={form.regulatory_basis}
                  onChange={e => setForm(p => ({ ...p, regulatory_basis: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">测试方法（逗号分隔）</label>
                <input
                  value={form.test_methods}
                  onChange={e => setForm(p => ({ ...p, test_methods: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  placeholder="方法1, 方法2, 方法3"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">趋势得分 (0-100) *</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.trending_score}
                    onChange={e => setForm(p => ({ ...p, trending_score: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">年份 *</label>
                  <input
                    type="number"
                    value={form.year}
                    onChange={e => setForm(p => ({ ...p, year: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowCreate(false); setForm({ claim_category: '', claim_text: '', region: '中国', regulatory_basis: '', test_methods: '', trending_score: 50, year: new Date().getFullYear() }) }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              <button onClick={() => createMutation.mutate()} disabled={!form.claim_category || !form.claim_text || createMutation.isPending} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {createMutation.isPending ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
