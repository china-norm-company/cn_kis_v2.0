import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Button, Badge, Empty, DigitalWorkerActionCard } from '@cn-kis/ui-kit'
import type { BadgeVariant, ActionItem } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { ArrowLeft, FileText, Zap, Clock } from 'lucide-react'
import { ProtocolSampleOverview } from '../components/ProtocolSampleOverview'

interface Protocol {
  id: number
  title: string
  code: string
  file_path: string
  status: string
  parsed_data: Record<string, unknown> | null
  efficacy_type: string
  sample_size: number | null
  create_time: string
  update_time: string
}

interface ParseLog {
  id: number
  status: string
  error_message: string
  create_time: string
  finish_time: string | null
}

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: '草稿', variant: 'default' },
  uploaded: { label: '已上传', variant: 'info' },
  parsing: { label: '解析中', variant: 'warning' },
  parsed: { label: '已解析', variant: 'primary' },
  active: { label: '生效中', variant: 'success' },
  archived: { label: '已归档', variant: 'default' },
}

export function ProtocolDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: protocolRes, isLoading } = useQuery({
    queryKey: ['protocol', id],
    queryFn: () => api.get<Protocol>(`/protocol/${id}`),
    enabled: !!id,
  })

  const { data: logsRes } = useQuery({
    queryKey: ['protocol-logs', id],
    queryFn: () => api.get<{ items: ParseLog[] }>(`/protocol/${id}/logs`),
    enabled: !!id,
  })

  const parseMutation = useMutation({
    mutationFn: () => api.post(`/protocol/${id}/parse`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol', id] })
      queryClient.invalidateQueries({ queryKey: ['protocol-logs', id] })
    },
  })

  const acceptParsedMutation = useMutation({
    mutationFn: (parsedData: Record<string, unknown>) =>
      api.post(`/protocol/${id}/accept-parsed`, { parsed_data: parsedData }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol', id] })
    },
  })

  const activateMutation = useMutation({
    mutationFn: () => api.post(`/protocol/${id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol', id] })
      queryClient.invalidateQueries({ queryKey: ['protocol-logs', id] })
    },
  })

  const protocol = protocolRes?.data
  const logs = logsRes?.data?.items ?? []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        加载中...
      </div>
    )
  }

  if (!protocol) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/protocols')}>
          返回列表
        </Button>
        <Card>
          <Empty icon={<FileText className="w-16 h-16" />} title="协议不存在" />
        </Card>
      </div>
    )
  }

  const statusInfo = STATUS_MAP[protocol.status] ?? { label: protocol.status, variant: 'default' as BadgeVariant }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => navigate('/protocols')}>
            返回
          </Button>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{protocol.title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {protocol.code && <span className="font-mono mr-3">{protocol.code}</span>}
              <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {(protocol.status === 'uploaded' || protocol.status === 'draft') && (
            <Button
              icon={<Zap className="w-4 h-4" />}
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
            >
              {activateMutation.isPending ? '激活中...' : '激活协议'}
            </Button>
          )}
          {(protocol.status === 'uploaded' || protocol.status === 'draft') && protocol.file_path && (
            <Button
              icon={<Zap className="w-4 h-4" />}
              onClick={() => parseMutation.mutate()}
              disabled={parseMutation.isPending}
            >
              {parseMutation.isPending ? 'AI 解析中...' : '触发 AI 解析'}
            </Button>
          )}
        </div>
      </div>

      {/* M4 跨工作台：关联样品概览 */}
      <Card>
        <ProtocolSampleOverview protocolId={protocol.id} projectCode={protocol.code || ''} />
      </Card>

      {/* 基本信息 */}
      <Card>
        <h3 className="text-base font-semibold text-slate-800 mb-4">基本信息</h3>
        <div className="grid grid-cols-2 gap-4">
          <InfoItem label="协议编号" value={protocol.code || '-'} />
          <InfoItem label="功效类型" value={protocol.efficacy_type || '-'} />
          <InfoItem label="样本量" value={protocol.sample_size?.toString() || '-'} />
          <InfoItem label="文件路径" value={protocol.file_path || '未上传'} />
          <InfoItem label="创建时间" value={new Date(protocol.create_time).toLocaleString('zh-CN')} />
          <InfoItem label="更新时间" value={new Date(protocol.update_time).toLocaleString('zh-CN')} />
        </div>
      </Card>

      {/* AI 解析结果 */}
      <Card>
        <h3 className="text-base font-semibold text-slate-800 mb-4">AI 解析结果</h3>
        {protocol.parsed_data ? (
          <pre className="bg-slate-50 p-4 rounded-lg text-sm text-slate-700 overflow-auto max-h-96">
            {JSON.stringify(protocol.parsed_data, null, 2)}
          </pre>
        ) : (
          <Empty
            icon={<Zap className="w-12 h-12" />}
            title="暂无解析结果"
            description="上传协议文件后，可触发 AI 解析"
          />
        )}
      </Card>

      {/* 数字员工动作卡片：协议解析员 */}
      {(() => {
        const pd = protocol.parsed_data as Record<string, unknown> | null
        const actionItems: ActionItem[] = []
        if (pd) {
          if (pd.sponsor) actionItems.push({ key: 'sponsor', label: '申办方', value: String(pd.sponsor) })
          if (pd.sample_size) actionItems.push({ key: 'sample_size', label: '样本量', value: JSON.stringify(pd.sample_size) })
          if (Array.isArray(pd.inclusion_criteria)) actionItems.push({ key: 'inclusion', label: '入组标准', value: (pd.inclusion_criteria as string[]).join('；') })
          if (Array.isArray(pd.exclusion_criteria)) actionItems.push({ key: 'exclusion', label: '排除标准', value: (pd.exclusion_criteria as string[]).join('；') })
          if (Array.isArray(pd.visits)) actionItems.push({ key: 'visits', label: '访视计划', value: `共 ${(pd.visits as unknown[]).length} 个访视节点` })
          if (Array.isArray(pd.endpoints)) actionItems.push({ key: 'endpoints', label: '研究终点', value: (pd.endpoints as string[]).join('；') })
        }
        return (
          <DigitalWorkerActionCard
            roleCode="solution_designer"
            roleName="协议解析员"
            title={pd ? '解析结果已就绪，可采纳写入协议' : '协议解析员已就绪'}
            description={pd ? '以下为 AI 解析提取的协议关键要素，确认无误后可一键采纳写入协议记录。' : '点击开始解析，协议解析员将自动提取入排标准、访视计划、样本量等关键要素。'}
            items={actionItems}
            loading={parseMutation.isPending || acceptParsedMutation.isPending}
            onAccept={pd ? () => acceptParsedMutation.mutate(pd) : undefined}
            acceptLabel="采纳写入协议"
            onTrigger={!pd && protocol.file_path ? () => parseMutation.mutate() : undefined}
            triggerLabel="开始 AI 解析"
          />
        )
      })()}

      {/* 解析日志 */}
      {logs.length > 0 && (
        <Card>
          <h3 className="text-base font-semibold text-slate-800 mb-4">解析日志</h3>
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center gap-4 text-sm border-b border-slate-100 pb-3">
                <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-slate-500">{new Date(log.create_time).toLocaleString('zh-CN')}</span>
                <Badge variant={log.status === 'parsed' ? 'success' : log.error_message ? 'error' : 'info'}>
                  {log.status}
                </Badge>
                {log.error_message && <span className="text-red-500">{log.error_message}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-800">{value}</dd>
    </div>
  )
}
