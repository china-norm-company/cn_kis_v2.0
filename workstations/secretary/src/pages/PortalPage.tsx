import { useCallback, useEffect } from 'react'
import { useFeishuContext, getWorkstationUrl } from '@cn-kis/feishu-sdk'
import { Card, ClawQuickPanel, useClawQuickActions } from '@cn-kis/ui-kit'
import type { QuickAction } from '@cn-kis/ui-kit'
import { clawRegistryApi } from '@cn-kis/api-client'
import { LayoutGrid } from 'lucide-react'

const CNKIS_PORTAL_READY = 'cnkis_portal_ready'
const CNKIS_TOKEN_HANDOFF = 'cnkis_token_handoff'

const workstations = [
  { key: 'secretary', name: '子衿·秘书台', path: '/secretary/', icon: '衿', color: 'bg-indigo-600' },
  { key: 'finance', name: '管仲·财务台', path: '/finance/', icon: '仲', color: 'bg-emerald-600' },
  { key: 'research', name: '采苓·研究台', path: '/research/', icon: '苓', color: 'bg-blue-600' },
  { key: 'execution', name: '维周·执行台', path: '/execution/', icon: '周', color: 'bg-orange-600' },
  { key: 'quality', name: '怀瑾·质量台', path: '/quality/', icon: '瑾', color: 'bg-teal-600' },
  { key: 'hr', name: '时雨·人事台', path: '/hr/', icon: '雨', color: 'bg-violet-600' },
  { key: 'crm', name: '进思·客户台', path: '/crm/', icon: '思', color: 'bg-rose-600' },
  { key: 'recruitment', name: '招招·招募台', path: '/recruitment/', icon: '招', color: 'bg-pink-600' },
  { key: 'equipment', name: '器衡·设备台', path: '/equipment/', icon: '衡', color: 'bg-cyan-600' },
  { key: 'material', name: '度支·物料台', path: '/material/', icon: '度', color: 'bg-amber-600' },
  { key: 'facility', name: '坤元·设施台', path: '/facility/', icon: '坤', color: 'bg-lime-600' },
  { key: 'evaluator', name: '衡技·评估台', path: '/evaluator/', icon: '技', color: 'bg-sky-600' },
  { key: 'lab-personnel', name: '共济·人员台', path: '/lab-personnel/', icon: '济', color: 'bg-purple-600' },
  { key: 'ethics', name: '御史·伦理台', path: '/ethics/', icon: '史', color: 'bg-red-600' },
  { key: 'reception', name: '和序·接待台', path: '/reception/', icon: '序', color: 'bg-fuchsia-600' },
  { key: 'control-plane', name: '天工·统管台', path: '/control-plane/', icon: '工', color: 'bg-slate-700' },
  { key: 'digital-workforce', name: '中书·智能台', path: '/digital-workforce/', icon: '书', color: 'bg-violet-700' },
  { key: 'admin', name: '鹿鸣·治理台', path: '/admin/', icon: '鸣', color: 'bg-stone-600' },
]

const clawFetcher = (key: string) => clawRegistryApi.getByWorkstation(key)

export function PortalPage() {
  const ctx = useFeishuContext()
  const { canAccessWorkbench } = ctx
  const filterFn = typeof canAccessWorkbench === 'function' ? canAccessWorkbench : () => true
  const platformKeys = ['control-plane', 'admin', 'digital-workforce']
  const visible = workstations.filter((ws) =>
    platformKeys.includes(ws.key) ? (ctx.isAdmin ?? false) : filterFn(ws.key),
  )

  const { actions, loading, error } = useClawQuickActions('secretary', clawFetcher)

  // 其他工作台从本门户打开时通过 postMessage 请求 token，实现跨端口免二次登录
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== CNKIS_PORTAL_READY) return
      try {
        if (new URL(e.origin).hostname !== window.location.hostname) return
      } catch {
        return
      }
      const token = localStorage.getItem('auth_token')
      const tokenTs = localStorage.getItem('auth_token_ts')
      const authUser = localStorage.getItem('auth_user')
      if (!token || !e.source) return
      try {
        ;(e.source as Window).postMessage(
          { type: CNKIS_TOKEN_HANDOFF, token, tokenTs, authUser },
          e.origin,
        )
      } catch {}
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const handleWorkstationClick = useCallback((ws: (typeof workstations)[0]) => {
    const url = getWorkstationUrl(ws.key)
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null
    if (token) {
      window.open(url, '_blank')
    } else {
      window.location.assign(url)
    }
  }, [])

  const handleClawAction = useCallback((action: QuickAction) => {
    window.location.assign(
      getWorkstationUrl('digital-workforce', `#/chat?skill=${action.skill}&script=${action.script || ''}&action=${action.id}`)
    )
  }, [])

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800 md:text-xl">工作台门户</h2>
        <p className="mt-1 text-sm text-slate-500">快速访问你有权限的工作台</p>
      </div>

      <ClawQuickPanel
        workstationKey="secretary"
        actions={actions}
        loading={loading}
        error={error}
        onAction={handleClawAction}
        title="AI 快捷操作"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 md:gap-4">
        {visible.map((ws) => (
          <Card
            key={ws.key}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => handleWorkstationClick(ws)}
          >
            <div className="flex items-center gap-3 md:gap-4">
              <div
                className={`h-11 w-11 shrink-0 rounded-lg ${ws.color} flex items-center justify-center text-base font-bold text-white md:h-12 md:w-12 md:text-lg`}
              >
                {ws.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800 truncate">{ws.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                  <LayoutGrid className="w-3 h-3" />
                  点击在新标签页打开
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
