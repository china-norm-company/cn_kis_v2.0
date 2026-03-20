import { useFeishuContext } from '@cn-kis/feishu-sdk'
import { Settings, User, Bell, Shield, HelpCircle, LogOut } from 'lucide-react'

export function SettingsPage() {
  const { user, logout } = useFeishuContext()

  const menuGroups = [
    {
      title: '个人',
      items: [
        { icon: User, label: '个人信息', desc: user?.name || '未登录' },
        { icon: Bell, label: '通知设置', desc: '工单提醒、排程通知' },
      ],
    },
    {
      title: '安全',
      items: [
        { icon: Shield, label: '电子签名', desc: '管理签名密码' },
      ],
    },
    {
      title: '其他',
      items: [
        { icon: HelpCircle, label: '帮助与反馈', desc: '操作指南、问题反馈' },
      ],
    },
  ]

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-slate-800">设置</h2>

      {user && (
        <div className="flex items-center gap-4 rounded-xl bg-white border border-slate-200 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white text-lg font-bold">
            {user.name?.charAt(0) || '?'}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800">{user.name}</div>
            <div className="text-xs text-slate-400">评估人员</div>
          </div>
        </div>
      )}

      {menuGroups.map((group) => (
        <div key={group.title}>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">
            {group.title}
          </div>
          <div className="rounded-xl bg-white border border-slate-200 divide-y divide-slate-100">
            {group.items.map((item) => (
              <div key={item.label} className="flex items-center gap-3 p-4 cursor-pointer active:bg-slate-50">
                <item.icon className="w-5 h-5 text-slate-400" />
                <div className="flex-1">
                  <div className="text-sm text-slate-700">{item.label}</div>
                  <div className="text-xs text-slate-400">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white py-3 text-sm font-medium text-red-500 active:bg-red-50"
      >
        <LogOut className="w-4 h-4" />
        退出登录
      </button>
    </div>
  )
}
