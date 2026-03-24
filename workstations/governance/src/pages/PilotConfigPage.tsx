/**
 * 试点用户渐进上线配置页（R1）
 *
 * 功能：
 * - 搜索内部账号（管理员、PM 等）
 * - 查看当前工作台访问配置
 * - 批量授权/禁用特定工作台
 * - 用于灰度上线新工作台或限制特定用户访问范围
 */
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Search, Shield, CheckCircle, XCircle, Save, RefreshCw } from 'lucide-react'

const ALL_WORKSTATIONS = [
  { key: 'secretary', name: '子衿·秘书台' },
  { key: 'finance', name: '管仲·财务台' },
  { key: 'research', name: '采苓·研究台' },
  { key: 'execution', name: '维周·执行台' },
  { key: 'quality', name: '怀瑾·质量台' },
  { key: 'hr', name: '时雨·人事台' },
  { key: 'crm', name: '进思·客户台' },
  { key: 'recruitment', name: '招招·招募台' },
  { key: 'equipment', name: '器衡·设备台' },
  { key: 'material', name: '度支·物料台' },
  { key: 'facility', name: '坤元·设施台' },
  { key: 'evaluator', name: '衡技·评估台' },
  { key: 'lab-personnel', name: '共济·人员台' },
  { key: 'ethics', name: '御史·伦理台' },
  { key: 'reception', name: '和序·接待台' },
]

interface AccountItem {
  id: number
  name: string
  phone?: string
  email?: string
  roles?: string[]
}

interface WorkstationConfigItem {
  workstation_key: string
  is_enabled: boolean
  override_type: 'allow' | 'deny' | 'inherit'
}

export function PilotConfigPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedAccount, setSelectedAccount] = useState<AccountItem | null>(null)
  const [pendingConfig, setPendingConfig] = useState<Record<string, boolean>>({})
  const [saveMsg, setSaveMsg] = useState('')

  const { data: accountsRes, isLoading: accountsLoading } = useQuery({
    queryKey: ['governance', 'accounts-search', search],
    queryFn: () => api.get<{ items: AccountItem[] }>('/auth/accounts/list', {
      params: { search, page: 1, page_size: 20, account_type: 'internal' },
    }),
    enabled: search.length >= 2,
  })

  const { data: configRes, isLoading: configLoading, refetch: refetchConfig } = useQuery({
    queryKey: ['governance', 'workstation-config', selectedAccount?.id],
    queryFn: () => api.get<{ configs: WorkstationConfigItem[] }>(
      `/auth/workstation-config/${selectedAccount!.id}`
    ),
    enabled: !!selectedAccount,
  })

  const saveMutation = useMutation({
    mutationFn: (data: { workstations: { key: string; is_enabled: boolean; override_type: 'allow' | 'deny' | 'inherit' }[] }) =>
      api.put(`/auth/workstation-config/${selectedAccount!.id}`, data),
    onSuccess: () => {
      setSaveMsg('配置已保存')
      setPendingConfig({})
      queryClient.invalidateQueries({ queryKey: ['governance', 'workstation-config', selectedAccount?.id] })
      setTimeout(() => setSaveMsg(''), 3000)
    },
    onError: () => setSaveMsg('保存失败，请重试'),
  })

  const handleSelectAccount = (account: AccountItem) => {
    setSelectedAccount(account)
    setPendingConfig({})
    setSaveMsg('')
  }

  const getEffectiveState = useCallback((wsKey: string): boolean => {
    if (wsKey in pendingConfig) return pendingConfig[wsKey]
    const existing = configRes?.data?.configs?.find(
      (c: WorkstationConfigItem) => c.workstation_key === wsKey
    )
    if (existing) return existing.is_enabled
    return true
  }, [pendingConfig, configRes])

  const toggleWorkstation = (wsKey: string) => {
    setPendingConfig((prev) => ({
      ...prev,
      [wsKey]: !getEffectiveState(wsKey),
    }))
  }

  const handleSave = () => {
    if (!selectedAccount) return
    const workstations = ALL_WORKSTATIONS.map((ws) => ({
      key: ws.key,
      is_enabled: getEffectiveState(ws.key),
      override_type: (ws.key in pendingConfig ? (pendingConfig[ws.key] ? 'allow' : 'deny') : 'inherit') as 'allow' | 'deny' | 'inherit',
    }))
    saveMutation.mutate({ workstations })
  }

  const handleEnableAll = () => {
    const all: Record<string, boolean> = {}
    ALL_WORKSTATIONS.forEach((ws) => { all[ws.key] = true })
    setPendingConfig(all)
  }

  const handleDisableAll = () => {
    const all: Record<string, boolean> = {}
    ALL_WORKSTATIONS.forEach((ws) => { all[ws.key] = false })
    setPendingConfig(all)
  }

  const hasPendingChanges = Object.keys(pendingConfig).length > 0

  const accounts = accountsRes?.data?.items ?? []

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">试点用户工作台配置</h2>
        <p className="text-sm text-slate-400 mt-1">
          按用户精细控制可访问的工作台，用于灰度上线和权限范围限制
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 左：账号搜索 */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">选择账号</h3>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="输入姓名或手机号搜索"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>

          {accountsLoading && (
            <div className="text-center text-xs text-slate-400 py-4">搜索中...</div>
          )}

          {accounts.length > 0 ? (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => handleSelectAccount(acc)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedAccount?.id === acc.id
                      ? 'bg-blue-50 border border-blue-200 text-blue-700'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="font-medium">{acc.name}</div>
                  <div className="text-xs text-slate-400">{acc.phone || acc.email || `ID: ${acc.id}`}</div>
                  {acc.roles && acc.roles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {acc.roles.slice(0, 3).map((r) => (
                        <span key={r} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-xs rounded">{r}</span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : search.length >= 2 && !accountsLoading ? (
            <div className="text-center text-xs text-slate-400 py-4">未找到账号</div>
          ) : search.length < 2 ? (
            <div className="text-center text-xs text-slate-400 py-4">请输入至少 2 个字符</div>
          ) : null}
        </div>

        {/* 右：工作台配置 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          {!selectedAccount ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
              <Shield className="w-10 h-10 opacity-30" />
              <p className="text-sm">请先在左侧选择一个账号</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">
                    {selectedAccount.name} 的工作台访问配置
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">蓝色表示已启用，灰色表示已禁用</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void refetchConfig()}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                    title="刷新配置"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleEnableAll}
                    className="px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded-lg border border-green-200"
                  >
                    全部启用
                  </button>
                  <button
                    onClick={handleDisableAll}
                    className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg border border-red-200"
                  >
                    全部禁用
                  </button>
                </div>
              </div>

              {configLoading ? (
                <div className="text-center text-xs text-slate-400 py-6">加载配置中...</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ALL_WORKSTATIONS.map((ws) => {
                    const enabled = getEffectiveState(ws.key)
                    const isDirty = ws.key in pendingConfig
                    return (
                      <button
                        key={ws.key}
                        onClick={() => toggleWorkstation(ws.key)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                          enabled
                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        } ${isDirty ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
                      >
                        {enabled
                          ? <CheckCircle className="w-4 h-4 shrink-0 text-blue-500" />
                          : <XCircle className="w-4 h-4 shrink-0 text-slate-300" />
                        }
                        <span className="text-xs font-medium truncate">{ws.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {saveMsg ? (
                  <span className={`text-sm ${saveMsg.includes('失败') ? 'text-red-500' : 'text-green-600'}`}>
                    {saveMsg}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">
                    {hasPendingChanges ? `有 ${Object.keys(pendingConfig).length} 项未保存的改动` : '配置与当前一致'}
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={!hasPendingChanges || saveMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
                >
                  <Save className="w-4 h-4" />
                  {saveMutation.isPending ? '保存中...' : '保存配置'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
