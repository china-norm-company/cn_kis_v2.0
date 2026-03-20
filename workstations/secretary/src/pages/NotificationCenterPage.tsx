import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, Badge } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { Bell } from 'lucide-react'

const WORKSTATION_NAMES: Record<string, string> = {
  secretary: '子衿·秘书台',
  finance: '管仲·财务台',
  research: '采苓·研究台',
  execution: '维周·执行台',
  quality: '怀瑾·质量台',
  hr: '时雨·人事台',
  crm: '进思·客户台',
  recruitment: '招招·招募台',
  equipment: '器衡·设备台',
  material: '度支·物料台',
  facility: '坤元·设施台',
  evaluator: '衡技·评估台',
  'lab-personnel': '共济·人员台',
  ethics: '御史·伦理台',
}

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return d.toLocaleDateString('zh-CN')
}

function truncate(str: string, len: number): string {
  if (!str) return ''
  return str.length <= len ? str : str.slice(0, len) + '...'
}

interface NotificationItem {
  id: string
  title: string
  content?: string
  channel?: string
  status?: string
  created_at: string
  source_workstation?: string
}

interface NotificationListResponse {
  items: NotificationItem[]
  total: number
}

export function NotificationCenterPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read'>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['notification', 'list', page, statusFilter],
    queryFn: () =>
      api.get<NotificationListResponse>('/notification/list', {
        params: { page, page_size: 20, status: statusFilter === 'all' ? undefined : statusFilter },
      }),
  })

  const items: NotificationItem[] = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 md:text-xl">通知中心</h2>
        <p className="mt-1 text-sm text-slate-500">查看各工作台通知消息</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 -mb-px">
        {(['all', 'unread', 'read'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`shrink-0 min-h-11 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === key
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
            title={`${key === 'all' ? '全部' : key === 'unread' ? '未读' : '已读'}通知`}
          >
            {key === 'all' ? '全部' : key === 'unread' ? '未读' : '已读'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">暂无通知</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-medium ${
                      item.status === 'unread' ? 'text-slate-900 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    {item.title}
                  </p>
                  {item.content && (
                    <p className="text-sm text-slate-500 mt-1">{truncate(item.content, 120)}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {item.source_workstation && (
                      <Badge variant="default" size="sm">
                        {WORKSTATION_NAMES[item.source_workstation] ?? item.source_workstation}
                      </Badge>
                    )}
                    <span className="text-xs text-slate-400">
                      {formatRelative(item.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {total > 20 && (
        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="min-h-10 px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
            title="上一页"
          >
            上一页
          </button>
          <span className="px-3 py-1.5 text-sm text-slate-600">
            {page} / {Math.ceil(total / 20)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / 20)}
            className="min-h-10 px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
            title="下一页"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}
