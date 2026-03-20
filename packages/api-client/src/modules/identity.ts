/**
 * 认证授权 API 模块
 *
 * 对应后端：/api/v1/auth/
 */
import { api } from '../client'
import type { Account, LoginResult } from '../types'

export const identityApi = {
  /** 飞书 OAuth 登录 */
  feishuLogin(code: string) {
    return api.post<LoginResult>('/auth/feishu/login', { code })
  },

  /** 获取当前用户信息 */
  me() {
    return api.get<Account>('/auth/me')
  },

  /** 刷新 Token */
  refreshToken() {
    return api.post<{ token: string }>('/auth/refresh')
  },

  /** 账号列表（管理员） */
  listAccounts(params?: { page?: number; page_size?: number; keyword?: string }) {
    return api.get('/auth/accounts/list', { params })
  },

  /** 角色列表 */
  listRoles() {
    return api.get('/auth/roles/list')
  },

  /** 用户角色列表 */
  listAccountRoles(accountId: number) {
    return api.get(`/auth/roles/account/${accountId}`)
  },

  /** 分配角色 */
  assignRole(accountId: number, roleName: string, projectId?: number) {
    return api.post('/auth/roles/assign', { account_id: accountId, role_name: roleName, project_id: projectId })
  },

  /** 移除角色 */
  removeRole(accountId: number, roleName: string, projectId?: number) {
    return api.post('/auth/roles/remove', { account_id: accountId, role_name: roleName, project_id: projectId })
  },

  /** 完整用户画像 */
  profile() {
    return api.get('/auth/profile')
  },

  /** 登出 */
  logout() {
    return api.post('/auth/logout')
  },
}
