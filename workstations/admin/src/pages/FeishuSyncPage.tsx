import { useState } from 'react'
import { MessageSquare, RefreshCw, Users, Table2, FileCheck, AlertCircle } from 'lucide-react'

interface SyncTask {
  id: string
  name: string
  icon: React.ElementType
  lastSync: string | null
  status: 'idle' | 'syncing' | 'success' | 'error'
  description: string
}

const INITIAL_TASKS: SyncTask[] = [
  { id: 'contacts', name: '通讯录同步', icon: Users, lastSync: null, status: 'idle', description: '从飞书导入组织架构和员工信息' },
  { id: 'bitable', name: '多维表格同步', icon: Table2, lastSync: null, status: 'idle', description: '同步飞书多维表格数据到系统' },
  { id: 'approval', name: '审批流同步', icon: FileCheck, lastSync: null, status: 'idle', description: '同步飞书审批模板和审批记录' },
  { id: 'message', name: '消息推送通道', icon: MessageSquare, lastSync: null, status: 'idle', description: '飞书消息推送与通知' },
]

export function FeishuSyncPage() {
  const [tasks, setTasks] = useState<SyncTask[]>(INITIAL_TASKS)

  const handleSync = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: 'syncing' as const } : t,
      ),
    )

    setTimeout(() => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: 'success' as const, lastSync: new Date().toISOString().slice(0, 16).replace('T', ' ') }
            : t,
        ),
      )
    }, 2000)
  }

  const statusStyles: Record<string, string> = {
    idle: 'text-slate-400',
    syncing: 'text-blue-500 animate-spin',
    success: 'text-emerald-500',
    error: 'text-red-500',
  }

  const statusLabels: Record<string, string> = {
    idle: '待同步',
    syncing: '同步中...',
    success: '同步成功',
    error: '同步失败',
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">飞书集成管理</h2>
        <p className="text-sm text-slate-400 mt-1">管理飞书数据同步和集成状态</p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium text-amber-800">集成说明</div>
            <div className="text-xs text-amber-600 mt-1">
              飞书同步功能需要在飞书开放平台完成应用配置后使用。
              当前系统已配置 OAuth 登录、H5 内嵌、消息通知、多维表格等能力。
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tasks.map((task) => (
          <div key={task.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                <task.icon className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-800">{task.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{task.description}</div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className={`w-4 h-4 ${statusStyles[task.status]}`} />
                <span className={`text-xs font-medium ${statusStyles[task.status]}`}>
                  {statusLabels[task.status]}
                </span>
                {task.lastSync && (
                  <span className="text-xs text-slate-400 ml-2">上次: {task.lastSync}</span>
                )}
              </div>
              <button
                onClick={() => handleSync(task.id)}
                disabled={task.status === 'syncing'}
                className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-40"
              >
                同步
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
