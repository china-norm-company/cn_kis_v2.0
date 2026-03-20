/**
 * LIMS 集成管理页
 *
 * P3.4: 展示 LIMS 连接状态、同步日志、手动触发同步
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Badge, Empty, Tabs } from '@cn-kis/ui-kit'
import {
  Link, RefreshCw, CheckCircle, XCircle, AlertCircle,
  Database, Clock, Thermometer,
} from 'lucide-react'

interface LIMSConnection {
  id: number
  name: string
  api_base_url: string
  status: string
  last_sync_at: string | null
  sync_interval_minutes: number
  is_active: boolean
}

interface SyncLog {
  id: number
  sync_type: string
  status: string
  records_synced: number
  error_message: string
  retry_count: number
  create_time: string
  finish_time: string | null
}

const STATUS_ICONS: Record<string, typeof CheckCircle> = {
  connected: CheckCircle,
  disconnected: XCircle,
  syncing: RefreshCw,
  error: AlertCircle,
}

const STATUS_COLORS: Record<string, string> = {
  connected: 'text-green-600',
  disconnected: 'text-slate-400',
  syncing: 'text-blue-500 animate-spin',
  error: 'text-red-500',
}

export default function LIMSPage() {
  const [activeTab, setActiveTab] = useState('connections')
  const queryClient = useQueryClient()

  const { data: connRes, isLoading: connLoading } = useQuery({
    queryKey: ['lims', 'connections'],
    queryFn: () => api.get<LIMSConnection[]>('/lims/connections'),
  })

  const connections = connRes?.data ?? []
  const activeConn = connections.find((c) => c.is_active)

  const { data: logsRes } = useQuery({
    queryKey: ['lims', 'sync-logs', activeConn?.id],
    queryFn: () => api.get<SyncLog[]>('/lims/sync/logs', {
      params: { connection_id: activeConn!.id, limit: 20 },
    }),
    enabled: !!activeConn && activeTab === 'logs',
  })

  const syncCalMutation = useMutation({
    mutationFn: () => api.post('/lims/sync/calibration', { connection_id: activeConn!.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lims'] }),
  })

  const syncEnvMutation = useMutation({
    mutationFn: () => api.post('/lims/sync/environment', { connection_id: activeConn!.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lims'] }),
  })

  const logs = logsRes?.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">LIMS 集成管理</h2>
        <p className="text-sm text-slate-500 mt-1">仪器数据与环境数据同步</p>
      </div>

      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: 'connections', label: '连接状态' },
          { value: 'logs', label: '同步日志' },
        ]}
      />

      {activeTab === 'connections' && (
        <div className="space-y-4">
          {connLoading ? (
            <div className="text-sm text-slate-400">加载中...</div>
          ) : connections.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <Empty message="暂未配置 LIMS 连接" />
            </div>
          ) : (
            connections.map((conn) => {
              const Icon = STATUS_ICONS[conn.status] || AlertCircle
              return (
                <div key={conn.id} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Database className="w-5 h-5 text-primary-500" />
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{conn.name}</div>
                        <div className="text-xs text-slate-400">{conn.api_base_url}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon className={`w-5 h-5 ${STATUS_COLORS[conn.status] || ''}`} />
                      <Badge variant={conn.status === 'connected' ? 'success' : conn.status === 'error' ? 'error' : 'default'}>
                        {conn.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                    <div>
                      <span className="text-slate-400">同步间隔：</span>
                      <span className="text-slate-700">{conn.sync_interval_minutes} 分钟</span>
                    </div>
                    <div>
                      <span className="text-slate-400">上次同步：</span>
                      <span className="text-slate-700">
                        {conn.last_sync_at ? new Date(conn.last_sync_at).toLocaleString() : '从未'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">状态：</span>
                      <span className="text-slate-700">{conn.is_active ? '启用' : '禁用'}</span>
                    </div>
                  </div>

                  {conn.is_active && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => syncCalMutation.mutate()}
                        disabled={syncCalMutation.isPending}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncCalMutation.isPending ? 'animate-spin' : ''}`} />
                        同步校准数据
                      </button>
                      <button
                        onClick={() => syncEnvMutation.mutate()}
                        disabled={syncEnvMutation.isPending}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Thermometer className={`w-4 h-4 ${syncEnvMutation.isPending ? 'animate-spin' : ''}`} />
                        同步环境数据
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl border border-slate-200">
          {logs.length === 0 ? (
            <div className="p-6"><Empty message="暂无同步日志" /></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="text-sm text-slate-700">
                        {log.sync_type === 'calibration' ? '校准数据同步' : '环境数据同步'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {new Date(log.create_time).toLocaleString()}
                        {log.records_synced > 0 && ` | 同步 ${log.records_synced} 条`}
                        {log.error_message && ` | 错误: ${log.error_message.substring(0, 50)}`}
                      </div>
                    </div>
                  </div>
                  <Badge variant={
                    log.status === 'connected' ? 'success' :
                    log.status === 'error' ? 'error' : 'warning'
                  }>
                    {log.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
