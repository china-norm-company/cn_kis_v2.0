import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, StatCard, Badge } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { AlertTriangle, AlertCircle, Info } from 'lucide-react'

const CATEGORY_LABELS: Record<string, string> = {
  quality: '质量',
  compliance: '合规',
  resource: '资源',
  progress: '进度',
  safety: '安全',
}

const CATEGORY_TABS = [
  { key: 'all', label: '全部' },
  { key: 'quality', label: '质量' },
  { key: 'compliance', label: '合规' },
  { key: 'resource', label: '资源' },
  { key: 'progress', label: '进度' },
  { key: 'safety', label: '安全' },
]

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

interface AlertItem {
  category: string
  level: 'critical' | 'warning' | 'info'
  title: string
  description?: string
  source?: string
  created_at: string
}

interface AlertsResponse {
  items: AlertItem[]
}

const LEVEL_BORDER = {
  critical: 'border-l-red-500',
  warning: 'border-l-amber-500',
  info: 'border-l-blue-500',
}

const LEVEL_ICON = {
  critical: <AlertTriangle className="w-5 h-5 text-red-500" />,
  warning: <AlertCircle className="w-5 h-5 text-amber-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
}

export function AlertCenterPage() {
  const [categoryFilter, setCategoryFilter] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'alerts'],
    queryFn: () => api.get<AlertsResponse>('/dashboard/alerts'),
  })

  const items: AlertItem[] = data?.data?.items ?? []
  const filtered =
    categoryFilter === 'all'
      ? items
      : items.filter((i) => i.category === categoryFilter)

  const criticalCount = items.filter((i) => i.level === 'critical').length
  const warningCount = items.filter((i) => i.level === 'warning').length
  const infoCount = items.filter((i) => i.level === 'info').length

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 md:text-xl">预警中心</h2>
        <p className="mt-1 text-sm text-slate-500">多维预警信息汇总</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 -mb-px">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCategoryFilter(tab.key)}
            className={`shrink-0 min-h-11 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              categoryFilter === tab.key
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
            title={`${tab.label}预警`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
        <StatCard
          title="严重"
          value={criticalCount}
          icon={LEVEL_ICON.critical}
        />
        <StatCard
          title="警告"
          value={warningCount}
          icon={LEVEL_ICON.warning}
        />
        <StatCard
          title="提示"
          value={infoCount}
          icon={LEVEL_ICON.info}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">暂无预警</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((item, idx) => (
            <Card
              key={idx}
              className={`border-l-4 ${LEVEL_BORDER[item.level] ?? 'border-l-slate-300'}`}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-0.5">
                  {LEVEL_ICON[item.level]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={item.level === 'critical' ? 'error' : item.level === 'warning' ? 'warning' : 'default'} size="sm">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </Badge>
                    {item.source && (
                      <span className="text-xs text-slate-500">{item.source}</span>
                    )}
                  </div>
                  <p className="font-medium text-slate-800">{item.title}</p>
                  {item.description && (
                    <p className="text-sm text-slate-600 mt-1">{item.description}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-2">
                    {formatRelative(item.created_at)}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
