/**
 * 项目全链路 - 列表页（与 KIS 一致）
 *
 * 表格展示项目列表，关键词/状态筛选、分页；行展开展示首个方案、删除方案；编辑/查看跳转详情与编辑页；排程进度与 KIS 一致。
 */
import { useState, useEffect, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { projectFullLinkApi, type ProjectFullLinkProject } from '@cn-kis/api-client'
import { Button, Badge, Card, Input } from '@cn-kis/ui-kit'
import type { BadgeVariant } from '@cn-kis/ui-kit'
import { Loader2, Search, ChevronDown, ChevronRight, ChevronLeft, Edit, Eye, FolderOpen, FileCheck, Trash2, FileText } from 'lucide-react'
import { getSchedulingProgress, getSchedulingProgressConfig } from '../utils/getSchedulingProgress'

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  pending_execution: { label: '待执行', variant: 'default' },
  in_progress: { label: '进行中', variant: 'info' },
  completed: { label: '已完成', variant: 'success' },
  cancelled: { label: '已取消', variant: 'default' },
}

const PRIORITY_MAP: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

/** 方案行内容（用于嵌入表格中，展示在对应项目行正下方） */
function ProjectProtocolRow({
  projectId,
  onDelete,
  colSpan,
}: {
  projectId: number
  onDelete: (protocolId: number, protocolName: string) => void
  colSpan: number
}) {
  const { data: res, isLoading } = useQuery({
    queryKey: ['project-full-link', 'protocols', projectId, 1, 20],
    queryFn: () => projectFullLinkApi.listProtocols(projectId, { page: 1, pageSize: 20 }),
  })
  const list = res?.data?.list ?? []
  const first = list[0]

  if (isLoading) {
    return (
      <tr>
        <td colSpan={colSpan} className="bg-slate-50/80 px-4 py-4">
          <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> 加载方案…
          </div>
        </td>
      </tr>
    )
  }
  if (!first) {
    return (
      <tr>
        <td colSpan={colSpan} className="bg-slate-50/80 px-4 py-6">
          <div className="flex flex-col items-center justify-center text-slate-500 text-sm" onClick={(e) => e.stopPropagation()}>
            <FileText className="h-8 w-8 mb-2 opacity-50 text-slate-400" />
            <p className="font-medium">暂无方案</p>
            <p className="mt-1">请进入项目详情点击「AI解析」上传并解析方案</p>
          </div>
        </td>
      </tr>
    )
  }
  return (
    <tr>
      <td colSpan={colSpan} className="bg-slate-50/80 p-0 align-top">
        <div
          className="flex items-center justify-between gap-4 px-4 py-3 mx-2 my-2 rounded-lg border border-slate-200 bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 min-w-0">
            <FileCheck className="h-5 w-5 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-medium text-slate-800 truncate">{first.protocol_name || '未命名方案'}</div>
              <div className="text-sm text-slate-500 mt-0.5">
                方案编号: {first.protocol_no || '-'} | 上传时间: {first.created_at ? new Date(first.created_at).toLocaleString('zh-CN') : '-'}
              </div>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="text-red-600 hover:bg-red-50 shrink-0"
            icon={<Trash2 className="w-4 h-4" />}
            onClick={() => onDelete(first.id, first.protocol_name)}
          >
            删除
          </Button>
        </div>
      </td>
    </tr>
  )
}

export default function ProjectFullLinkListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const { data: listRes, isLoading, isError, error } = useQuery({
    queryKey: ['project-full-link', 'list', page, pageSize, keyword, statusFilter],
    queryFn: () =>
      projectFullLinkApi.list({
        page,
        pageSize,
        keyword: keyword || undefined,
        execution_status: statusFilter === '取消' ? 'cancelled' : undefined,
      }),
  })

  const deleteProtocol = useMutation({
    mutationFn: (id: number) => projectFullLinkApi.deleteProtocol(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-full-link'] })
    },
    onError: (err: Error) => {
      alert(`删除方案失败：${err.message || '请检查权限或网络连接'}`)
    },
  })

  // 兼容：axios 返回 response.data 为 { code, msg, data: { list, total } }，取 data.data；若上游已解包则取 data
  const raw = listRes?.data
  const payload = raw && typeof raw === 'object' && 'data' in raw ? (raw as { data?: { list?: unknown[]; total?: number } }).data : (raw as { list?: unknown[]; total?: number } | undefined)
  let list = (payload?.list ?? []) as ProjectFullLinkProject[]
  if (statusFilter === '正常') {
    list = list.filter((p) => p.execution_status !== 'cancelled')
  }
  const total = payload?.total ?? 0
  const isEmpty = !isLoading && !isError && list.length === 0 && total === 0

  const handleDeleteProtocol = (protocolId: number, protocolName: string) => {
    if (!window.confirm(`确定要删除方案「${protocolName}」吗？此操作不可恢复。`)) return
    deleteProtocol.mutate(protocolId)
  }

  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: ['project-full-link', 'list'] })
    window.addEventListener('schedulerProjectsUpdated', handler)
    return () => window.removeEventListener('schedulerProjectsUpdated', handler)
  }, [queryClient])

  const colCount = 11

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">项目全链路</h2>
        <p className="mt-1 text-sm text-slate-500">
          管理项目信息与方案文档，AI 自动解析入排标准、访视计划等关键信息
        </p>
      </div>

      {isError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">列表加载失败</p>
          <p className="mt-1">{error instanceof Error ? error.message : '请检查网络或后端是否启动'}</p>
          <p className="mt-2 text-amber-700">
            若为无权限：请用已分配 researcher 的账号登录，或在后端 DEBUG 模式下用任意账号登录后再试。
          </p>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="搜索项目名称、编号或客户编号…"
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className="rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
        >
          <option value="all">全部状态</option>
          <option value="正常">正常</option>
          <option value="取消">取消</option>
        </select>
      </div>

      <Card className="!p-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <FolderOpen className="w-5 h-5 text-slate-500" />
          <span className="font-medium text-slate-700">项目列表 ({total})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-12 px-4 py-3 text-left text-sm font-semibold text-slate-700" />
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">项目编号</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">项目名称</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">客户编号</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">优先级</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">业务类型</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">项目阶段</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">项目状态</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">研究组</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">排程进度</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-8 text-center text-slate-500">
                    <Loader2 className="h-6 w-6 animate-spin inline-block mr-2" /> 加载中…
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-8 text-center text-slate-500">
                    暂无数据
                  </td>
                </tr>
              ) : (
                list.map((r) => {
                  const isExpanded = expandedId === r.id
                  const progress = getSchedulingProgress(r.id)
                  const progressConfig = getSchedulingProgressConfig(progress)
                  return (
                    <Fragment key={r.id}>
                      <tr
                        key={r.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedId((prev) => (prev === r.id ? null : r.id))}
                      >
                        <td className="w-12 px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            icon={isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedId((prev) => (prev === r.id ? null : r.id))
                            }}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-slate-700">{r.project_no || r.opportunity_no || `#${r.id}`}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{r.project_name || '未命名项目'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{r.sponsor_no || '-'}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={r.priority === 'high' ? 'bg-red-50 text-red-700 border-red-200' : r.priority === 'low' ? 'bg-slate-50 text-slate-700 border-slate-200' : 'bg-amber-50 text-amber-700 border-amber-200'}
                          >
                            {PRIORITY_MAP[r.priority] ?? r.priority}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{r.business_type || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">-</td>
                        <td className="px-4 py-3">
                          <Badge variant={r.execution_status === 'cancelled' ? 'destructive' : 'default'}>
                            {r.execution_status === 'cancelled' ? '取消' : '正常'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">-</td>
                        <td className="px-4 py-3">
                          <Badge variant={progressConfig.variant} className={progressConfig.color}>
                            {progressConfig.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" icon={<Edit className="w-4 h-4" />} onClick={() => navigate(`/project-full-link/${r.id}/edit`)}>
                              编辑
                            </Button>
                            <Button variant="ghost" size="sm" icon={<Eye className="w-4 h-4" />} onClick={() => navigate(`/project-full-link/${r.id}`)}>
                              查看
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <ProjectProtocolRow projectId={r.id} onDelete={handleDeleteProtocol} colSpan={colCount} />
                      )}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {list.length > 0 && total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-600">
            <span>共 {total} 条</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span>
                {page} / {Math.ceil(total / pageSize) || 1}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= Math.ceil(total / pageSize)}
                onClick={() => setPage((p) => Math.min(Math.ceil(total / pageSize), p + 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
        {isEmpty && (
          <div className="border-t border-slate-100 p-6 text-center text-slate-500 text-sm">
            <p className="font-medium">暂无项目数据</p>
            <p className="mt-2">
              请在后端执行：<code className="rounded bg-slate-100 px-1.5 py-0.5">python manage.py seed_project_full_link --with-protocols</code>
            </p>
            <p className="mt-1">并确保后端以 <code className="rounded bg-slate-100 px-1.5 py-0.5">DJANGO_DEBUG=true</code> 启动（DEBUG 下任意登录用户可查看）。</p>
            <p className="mt-3 text-amber-600">若已执行过种子仍无数据：请<strong>重启后端</strong>，确保 <code className="rounded bg-slate-100 px-1.5 py-0.5">.env</code> 中 <code className="rounded bg-slate-100 px-1.5 py-0.5">USE_SQLITE=true</code>，与种子使用同一数据库。</p>
          </div>
        )}
      </Card>
    </div>
  )
}
