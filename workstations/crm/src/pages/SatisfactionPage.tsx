import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, StatCard, Modal, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { Star, Plus, CheckCircle } from 'lucide-react'

interface Survey {
  id: number
  client_id: number
  client_name?: string
  survey_type: 'project_completion' | 'quarterly' | 'annual' | 'nps'
  overall_satisfaction: number
  quality_score: number
  timeliness_score: number
  communication_score: number
  nps_score: number | null
  followed_up: boolean
  create_time: string
  [key: string]: unknown
}

const surveyTypeMap: Record<string, { label: string; variant: 'error' | 'warning' | 'primary' | 'default' }> = {
  project_completion: { label: '项目完成', variant: 'primary' },
  quarterly: { label: '季度', variant: 'warning' },
  annual: { label: '年度', variant: 'error' },
  nps: { label: 'NPS', variant: 'default' },
}

export function SatisfactionPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    client_id: '',
    survey_type: 'project_completion',
    overall_satisfaction: 8,
    quality_score: 8,
    timeliness_score: 8,
    communication_score: 8,
    nps_score: 8,
    strengths: '',
    improvements: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['surveys', page, pageSize],
    queryFn: () =>
      api.get<{ items: Survey[]; total: number }>('/crm/surveys/list', {
        params: { page, page_size: pageSize },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['survey-stats'],
    queryFn: () => api.get<{ avg_overall: number; avg_quality: number; avg_timeliness: number; avg_communication: number; avg_nps: number }>('/crm/surveys/stats'),
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients', 'all'],
    queryFn: () => api.get<{ items: Array<{ id: number; name: string }> }>('/crm/clients/list', { params: { page: 1, page_size: 1000 } }),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/crm/surveys/create', {
      ...form,
      client_id: Number(form.client_id) || undefined,
      overall_satisfaction: Number(form.overall_satisfaction),
      quality_score: Number(form.quality_score),
      timeliness_score: Number(form.timeliness_score),
      communication_score: Number(form.communication_score),
      nps_score: form.survey_type === 'nps' ? Number(form.nps_score) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['surveys'] })
      queryClient.invalidateQueries({ queryKey: ['survey-stats'] })
      setShowCreate(false)
      setForm({ client_id: '', survey_type: 'project_completion', overall_satisfaction: 8, quality_score: 8, timeliness_score: 8, communication_score: 8, nps_score: 8, strengths: '', improvements: '' })
    },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data
  const clients = clientsData?.data?.items ?? []

  const columns: Column<Survey>[] = [
    {
      key: 'client_id',
      title: '客户',
      width: 150,
      render: (val, row) => row?.client_name || `客户#${val}`,
    },
    {
      key: 'survey_type',
      title: '类型',
      width: 120,
      render: (val) => {
        const info = surveyTypeMap[val as string]
        return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
      },
    },
    {
      key: 'overall_satisfaction',
      title: '总体满意度',
      width: 120,
      align: 'center',
      render: (val) => `${val}/10`,
    },
    {
      key: 'quality_score',
      title: '质量',
      width: 80,
      align: 'center',
      render: (val) => `${val}/10`,
    },
    {
      key: 'timeliness_score',
      title: '及时性',
      width: 80,
      align: 'center',
      render: (val) => `${val}/10`,
    },
    {
      key: 'communication_score',
      title: '沟通',
      width: 80,
      align: 'center',
      render: (val) => `${val}/10`,
    },
    {
      key: 'nps_score',
      title: 'NPS',
      width: 80,
      align: 'center',
      render: (val) => val != null ? `${val}/10` : '-',
    },
    {
      key: 'followed_up',
      title: '已跟进',
      width: 100,
      render: (val) => (
        <Badge variant={val ? 'success' : 'default'}>
          {val ? '是' : '否'}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">满意度调研</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> 新建调研
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="总体满意度" value={stats?.avg_overall ? `${stats.avg_overall.toFixed(1)}/10` : '-'} icon={<Star className="w-6 h-6" />} />
        <StatCard title="质量评分" value={stats?.avg_quality ? `${stats.avg_quality.toFixed(1)}/10` : '-'} icon={<Star className="w-6 h-6" />} />
        <StatCard title="及时性评分" value={stats?.avg_timeliness ? `${stats.avg_timeliness.toFixed(1)}/10` : '-'} icon={<Star className="w-6 h-6" />} />
        <StatCard title="沟通评分" value={stats?.avg_communication ? `${stats.avg_communication.toFixed(1)}/10` : '-'} icon={<Star className="w-6 h-6" />} />
        <StatCard title="NPS评分" value={stats?.avg_nps ? `${stats.avg_nps.toFixed(1)}/10` : '-'} icon={<Star className="w-6 h-6" />} />
      </div>

      <Card>
        <div className="p-1">
          <DataTable<Survey>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无调研数据"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[600px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">新建满意度调研</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">客户 *</label>
                  <select
                    value={form.client_id}
                    onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  >
                    <option value="">请选择</option>
                    {clients.map(c => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">调研类型 *</label>
                  <select
                    value={form.survey_type}
                    onChange={e => setForm(p => ({ ...p, survey_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  >
                    {Object.entries(surveyTypeMap).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">总体满意度 (1-10) *</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={form.overall_satisfaction}
                    onChange={e => setForm(p => ({ ...p, overall_satisfaction: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">质量评分 (1-10) *</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={form.quality_score}
                    onChange={e => setForm(p => ({ ...p, quality_score: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">及时性评分 (1-10) *</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={form.timeliness_score}
                    onChange={e => setForm(p => ({ ...p, timeliness_score: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">沟通评分 (1-10) *</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={form.communication_score}
                    onChange={e => setForm(p => ({ ...p, communication_score: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  />
                </div>
              </div>
              {form.survey_type === 'nps' && (
                <div>
                  <label className="text-xs text-slate-500">NPS评分 (1-10)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={form.nps_score}
                    onChange={e => setForm(p => ({ ...p, nps_score: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  />
                </div>
              )}
              <div>
                <label className="text-xs text-slate-500">优势</label>
                <textarea
                  value={form.strengths}
                  onChange={e => setForm(p => ({ ...p, strengths: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">改进建议</label>
                <textarea
                  value={form.improvements}
                  onChange={e => setForm(p => ({ ...p, improvements: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowCreate(false); setForm({ client_id: '', survey_type: 'project_completion', overall_satisfaction: 8, quality_score: 8, timeliness_score: 8, communication_score: 8, nps_score: 8, strengths: '', improvements: '' }) }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              <button onClick={() => createMutation.mutate()} disabled={!form.client_id || createMutation.isPending} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {createMutation.isPending ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
