/**
 * B1: 可行性评估
 *
 * 评估列表 + 状态筛选 + 评估详情弹窗（6维评分 + 自动检查）
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { DataTable, Badge, Card, Button, Modal, Empty } from '@cn-kis/ui-kit'
import type { Column, BadgeVariant } from '@cn-kis/ui-kit'
import {
  ClipboardCheck, Plus, Search, ChevronDown,
  CheckCircle, XCircle, Loader2, BarChart3,
} from 'lucide-react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Tooltip,
} from 'recharts'

interface Feasibility {
  id: number
  title: string
  opportunity_name: string | null
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  overall_score: number | null
  create_time: string
  update_time: string
  [key: string]: unknown
}

interface DimensionScore {
  dimension: string
  label: string
  score: number
  max_score: number
  notes: string
}

interface AutoCheckItem {
  key: string
  label: string
  passed: boolean
  message: string
}

interface FeasibilityDetail {
  id: number
  title: string
  opportunity_name: string | null
  status: string
  overall_score: number | null
  dimension_scores: DimensionScore[]
  auto_checks: AutoCheckItem[]
  create_time: string
  update_time: string
}

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: '草稿', variant: 'default' },
  submitted: { label: '已提交', variant: 'info' },
  approved: { label: '已批准', variant: 'success' },
  rejected: { label: '已驳回', variant: 'error' },
}

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'submitted', label: '已提交' },
  { value: 'approved', label: '已批准' },
  { value: 'rejected', label: '已驳回' },
]

export default function FeasibilityPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const pageSize = 10

  const { data: listRes, isLoading } = useQuery({
    queryKey: ['feasibility', 'list', page, pageSize, statusFilter],
    queryFn: () =>
      api.get<{ items: Feasibility[]; total: number }>(
        '/feasibility/list',
        { params: { page, page_size: pageSize, ...(statusFilter ? { status: statusFilter } : {}) } },
      ),
  })

  const { data: detailRes, isLoading: detailLoading } = useQuery({
    queryKey: ['feasibility', 'detail', selectedId],
    queryFn: () => api.get<FeasibilityDetail>(`/feasibility/${selectedId}`),
    enabled: !!selectedId,
  })

  const createMutation = useMutation({
    mutationFn: (payload: { title: string }) =>
      api.post('/feasibility/create', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feasibility', 'list'] })
      setShowCreate(false)
      setNewTitle('')
    },
  })

  const autoCheckMutation = useMutation({
    mutationFn: (id: number) => api.post(`/feasibility/${id}/auto-check`),
    onSuccess: () => {
      if (selectedId) {
        queryClient.invalidateQueries({ queryKey: ['feasibility', 'detail', selectedId] })
      }
    },
  })

  const items = listRes?.data?.items ?? []
  const total = listRes?.data?.total ?? 0
  const detail = detailRes?.data

  const columns: Column<Feasibility>[] = [
    {
      key: 'title',
      title: '评估标题',
      render: (_, record) => (
        <span className="font-medium text-slate-800">{record.title}</span>
      ),
    },
    {
      key: 'opportunity_name',
      title: '关联商机',
      width: 160,
      render: (_, record) => (
        <span className="text-sm text-slate-600">{record.opportunity_name || '-'}</span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (_, record) => {
        const info = STATUS_MAP[record.status] ?? { label: record.status, variant: 'default' as BadgeVariant }
        return <Badge variant={info.variant}>{info.label}</Badge>
      },
    },
    {
      key: 'overall_score',
      title: '综合评分',
      width: 100,
      render: (_, record) => {
        if (record.overall_score == null) return <span className="text-slate-400">-</span>
        const color =
          record.overall_score >= 80 ? 'text-green-600' :
          record.overall_score >= 60 ? 'text-amber-600' : 'text-red-600'
        return <span className={`font-semibold ${color}`}>{record.overall_score}</span>
      },
    },
    {
      key: 'create_time',
      title: '创建时间',
      width: 170,
      render: (_, record) => (
        <span className="text-slate-500 text-sm">
          {new Date(record.create_time).toLocaleString('zh-CN')}
        </span>
      ),
    },
  ]

  const radarData = (detail?.dimension_scores ?? []).map((d) => ({
    dimension: d.label,
    score: d.score,
    fullMark: d.max_score,
  }))

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">可行性评估</h2>
          <p className="mt-1 text-sm text-slate-500">
            管理项目可行性评估，查看6维度评分和自动检查结果
          </p>
        </div>
        <PermissionGuard permission="research.feasibility.create">
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            创建评估
          </Button>
        </PermissionGuard>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <select
            aria-label="状态筛选"
            className="appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* 数据表格 */}
      <Card className="!p-0">
        <DataTable<Feasibility>
          columns={columns}
          data={items}
          loading={isLoading}
          rowKey="id"
          onRowClick={(record) => setSelectedId(record.id)}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
          }}
        />
      </Card>

      {/* 评估详情弹窗 */}
      <Modal
        isOpen={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={detail?.title ?? '评估详情'}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            加载中...
          </div>
        ) : detail ? (
          <div className="space-y-6">
            {/* 基本信息 */}
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-slate-500">状态</span>
                <div className="mt-1">
                  <Badge variant={STATUS_MAP[detail.status]?.variant ?? 'default'}>
                    {STATUS_MAP[detail.status]?.label ?? detail.status}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-slate-500">关联商机</span>
                <div className="mt-1 font-medium text-slate-800">{detail.opportunity_name || '-'}</div>
              </div>
              <div>
                <span className="text-slate-500">综合评分</span>
                <div className="mt-1 font-bold text-lg text-slate-800">{detail.overall_score ?? '-'}</div>
              </div>
            </div>

            {/* 6维雷达图 */}
            {radarData.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-slate-400" />
                  维度评分
                </h4>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Radar
                      name="评分"
                      dataKey="score"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.2}
                    />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  {detail.dimension_scores.map((d) => (
                    <div key={d.dimension} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                      <span className="text-slate-600">{d.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-200 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${(d.score / d.max_score) * 100}%` }}
                          />
                        </div>
                        <span className="font-medium text-slate-700 w-10 text-right">{d.score}/{d.max_score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 自动检查结果 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-slate-400" />
                  自动检查结果
                </h4>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => autoCheckMutation.mutate(detail.id)}
                  disabled={autoCheckMutation.isPending}
                >
                  {autoCheckMutation.isPending ? '检查中...' : '重新检查'}
                </Button>
              </div>

              {(detail.auto_checks ?? []).length > 0 ? (
                <div className="space-y-2">
                  {detail.auto_checks.map((check) => (
                    <div
                      key={check.key}
                      className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-100"
                    >
                      {check.passed ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-slate-700">{check.label}</span>
                        <p className="text-xs text-slate-500 mt-0.5">{check.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">点击"重新检查"运行自动检查</p>
              )}
            </div>
          </div>
        ) : (
          <Empty description="未找到评估数据" />
        )}
      </Modal>

      {/* 创建评估弹窗 */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="创建可行性评估"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">评估标题 *</label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="输入评估标题"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
            <Button
              onClick={() => createMutation.mutate({ title: newTitle })}
              disabled={!newTitle.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? '创建中...' : '创建'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
