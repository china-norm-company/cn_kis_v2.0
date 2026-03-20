import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, Badge } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { CheckSquare, ExternalLink } from 'lucide-react'

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
  'control-plane': '天工·资源统一智能化管理平台',
}

const FILTER_TABS = [
  { key: 'all', label: '全部' },
  { key: 'execution', label: '工单' },
  { key: 'approval', label: '审批' },
  { key: 'quality', label: '质量' },
  { key: 'hr', label: '培训' },
]

interface TodoItem {
  source_workstation: string
  type: string
  title: string
  due_date?: string
  priority?: 'high' | 'medium' | 'low'
  link?: string
  status?: string
}

interface MyTodoResponse {
  items: TodoItem[]
}

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false
  return new Date(dueDate) < new Date()
}

function getPriorityVariant(priority?: string): 'error' | 'warning' | 'default' {
  if (priority === 'high') return 'error'
  if (priority === 'medium') return 'warning'
  return 'default'
}

const WORKSTATION_PATHS = [
  '/secretary/', '/finance/', '/research/', '/execution/', '/quality/',
  '/hr/', '/crm/', '/recruitment/', '/equipment/', '/material/',
  '/facility/', '/evaluator/', '/lab-personnel/', '/ethics/', '/control-plane/',
]

function hasWorkstationPath(link?: string): boolean {
  if (!link) return false
  return WORKSTATION_PATHS.some((p) => link.includes(p))
}

export function TodoCenterPage() {
  const [filter, setFilter] = useState('all')

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'my-todo'],
    queryFn: () => api.get<MyTodoResponse>('/dashboard/my-todo'),
  })

  const items: TodoItem[] = data?.data?.items ?? []
  const filtered =
    filter === 'all'
      ? items
      : items.filter((i) => i.source_workstation === filter)

  const handleItemClick = (item: TodoItem) => {
    if (item.link && hasWorkstationPath(item.link)) {
      const url = item.link.startsWith('http') ? item.link : window.location.origin + item.link
      window.open(url, '_blank')
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 md:text-xl">统一待办中心</h2>
        <p className="mt-1 text-sm text-slate-500">聚合各工作台待办任务</p>
      </div>

      <div className="-mb-px flex gap-1 overflow-x-auto border-b border-slate-200 pb-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors md:px-4 md:py-3 ${
              filter === tab.key
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <CheckSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">暂无待办</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2.5 md:space-y-3">
          {filtered.map((item, idx) => (
            <Card
              key={idx}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleItemClick(item)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant="default" size="sm">
                      {WORKSTATION_NAMES[item.source_workstation] ?? item.source_workstation}
                    </Badge>
                    {item.priority && (
                      <Badge variant={getPriorityVariant(item.priority)} size="sm">
                        {item.priority === 'high' ? '高' : item.priority === 'medium' ? '中' : '低'}
                      </Badge>
                    )}
                  </div>
                  <p className="font-medium text-slate-800">{item.title}</p>
                  {item.due_date && (
                    <p
                      className={`text-xs mt-1 ${
                        isOverdue(item.due_date) ? 'text-red-600 font-medium' : 'text-slate-500'
                      }`}
                    >
                      截止: {item.due_date}
                    </p>
                  )}
                </div>
                {item.link && hasWorkstationPath(item.link) && (
                  <ExternalLink className="w-4 h-4 text-slate-400 flex-shrink-0" />
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
