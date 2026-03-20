import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Users, UserPlus, UserMinus } from 'lucide-react'

interface AccountItem {
  id: number
  username: string
  display_name: string
  email: string
  avatar: string | null
  account_type: string
  status: string
  roles: string[]
  last_login_time: string | null
  create_time: string
}

interface RoleItem {
  name: string
  display_name: string
  level: number
  category: string
}

export function AccountsPage() {
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [assignModal, setAssignModal] = useState<AccountItem | null>(null)
  const [roleToAssign, setRoleToAssign] = useState('')
  const [roleToRemove, setRoleToRemove] = useState<{ account: AccountItem; roleName: string } | null>(null)
  const queryClient = useQueryClient()
  const pageSize = 20

  const { data, isLoading, error } = useQuery({
    queryKey: ['auth', 'accounts', page, keyword],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (keyword) params.set('keyword', keyword)
      const res = await api.get<{ items: AccountItem[]; total: number; page: number; page_size: number }>(
        `/auth/accounts/list?${params}`,
      )
      if (res.code !== 200 || !res.data) throw new Error(res.msg || '获取账号列表失败')
      return res.data
    },
  })

  const assignMutation = useMutation({
    mutationFn: async ({ account_id, role_name }: { account_id: number; role_name: string }) => {
      const res = await api.post('/auth/roles/assign', { account_id, role_name })
      if (res.code !== 200) throw new Error(res.msg || '分配角色失败')
      return res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'accounts'] })
      setAssignModal(null)
      setRoleToAssign('')
    },
  })

  const removeMutation = useMutation({
    mutationFn: async ({ account_id, role_name }: { account_id: number; role_name: string }) => {
      const res = await api.post('/auth/roles/remove', { account_id, role_name })
      if (res.code !== 200) throw new Error(res.msg || '移除角色失败')
      return res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'accounts'] })
      setRoleToRemove(null)
    },
  })

  const { data: rolesData } = useQuery({
    queryKey: ['auth', 'roles'],
    queryFn: async () => {
      const res = await api.get<RoleItem[]>('/auth/roles/list')
      if (res.code !== 200 || !res.data) return []
      return res.data as unknown as RoleItem[]
    },
    enabled: !!assignModal,
  })
  const roles = Array.isArray(rolesData) ? rolesData : []

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        加载账号列表中...
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3">
        {error instanceof Error ? error.message : '加载失败'}
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-slate-600" />
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">账号与角色</h2>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center mb-4">
        <input
          type="search"
          placeholder="搜索姓名、用户名、邮箱"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setPage(1)}
          className="min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          onClick={() => setPage(1)}
          className="min-h-11 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
        >
          搜索
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-700">ID</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">姓名</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">用户名</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">角色</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 text-slate-600">{a.id}</td>
                <td className="px-4 py-3 text-slate-800">{a.display_name || a.username}</td>
                <td className="px-4 py-3 text-slate-600">{a.username}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {a.roles.map((r) => (
                      <span
                        key={r}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs"
                      >
                        {r}
                        <button
                          type="button"
                          onClick={() => setRoleToRemove({ account: a, roleName: r })}
                          className="text-slate-400 hover:text-red-600"
                          title="移除角色"
                        >
                          <UserMinus className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setAssignModal(a)}
                    className="inline-flex min-h-9 items-center gap-1 px-2 py-1 text-primary-600 hover:bg-primary-50 rounded text-xs font-medium"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    分配角色
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mt-4 text-sm text-slate-600">
          <span>共 {total} 条</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="min-h-10 px-3 py-1 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50"
            >
              上一页
            </button>
            <span className="px-2 py-1">
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="min-h-10 px-3 py-1 rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {/* 分配角色弹层 */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAssignModal(null)}>
          <div
            className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-800 mb-2">
              为 {assignModal.display_name || assignModal.username} 分配角色
            </h3>
            <select
              aria-label="选择角色"
              value={roleToAssign}
              onChange={(e) => setRoleToAssign(e.target.value)}
              className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">选择角色</option>
              {roles.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.display_name} ({r.name})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAssignModal(null)}
                className="min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
              >
                取消
              </button>
              <button
                disabled={!roleToAssign || assignMutation.isPending}
                onClick={() =>
                  roleToAssign &&
                  assignMutation.mutate({ account_id: assignModal.id, role_name: roleToAssign })
                }
                className="min-h-11 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
              >
                {assignMutation.isPending ? '提交中...' : '确定'}
              </button>
            </div>
            {assignMutation.isError && (
              <p className="mt-2 text-sm text-red-600">{assignMutation.error?.message}</p>
            )}
          </div>
        </div>
      )}

      {/* 移除角色确认 */}
      {roleToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRoleToRemove(null)}>
          <div
            className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-sm max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-800 mb-2">确认移除角色</h3>
            <p className="text-sm text-slate-600 mb-4">
              从「{roleToRemove.account.display_name || roleToRemove.account.username}」移除角色「{roleToRemove.roleName}」？
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRoleToRemove(null)}
                className="min-h-11 px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
              >
                取消
              </button>
              <button
                disabled={removeMutation.isPending}
                onClick={() =>
                  removeMutation.mutate({
                    account_id: roleToRemove.account.id,
                    role_name: roleToRemove.roleName,
                  })
                }
                className="min-h-11 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {removeMutation.isPending ? '提交中...' : '移除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
