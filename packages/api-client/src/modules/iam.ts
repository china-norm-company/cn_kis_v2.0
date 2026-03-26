/**
 * 鹿鸣·治理台（Governance）专用 API 模块
 *
 * 聚合来自 identity、audit、secretary token 相关接口，
 * 为治理台提供统一入口。
 */
import { api } from '../client'

// ── 用户管理 ──

export interface AccountSummary {
  id: number
  username: string
  display_name: string
  email: string
  feishu_open_id: string
  roles: string[]
  is_active: boolean
  last_login?: string
  create_time: string
}

export const governanceApi = {
  // ── 用户 ──
  /** 账号列表（分页搜索） */
  listAccounts(params?: { page?: number; page_size?: number; keyword?: string; is_active?: boolean }) {
    return api.get<{ items: AccountSummary[]; total: number }>('/auth/accounts/list', { params })
  },

  /** 账号详情 */
  getAccount(id: number) {
    return api.get<AccountSummary>(`/auth/accounts/${id}`)
  },

  /** 分配角色（使用 role_name，与后端 AssignRoleIn schema 匹配） */
  assignRole(accountId: number, roleName: string, projectId?: number) {
    return api.post('/auth/roles/assign', { account_id: accountId, role_name: roleName, project_id: projectId })
  },

  /** 撤销角色（使用 role_name，与后端 RevokeRoleIn schema 匹配） */
  revokeRole(accountId: number, roleName: string, projectId?: number) {
    return api.post('/auth/roles/revoke', { account_id: accountId, role_name: roleName, project_id: projectId })
  },

  // ── 角色/权限 ──
  /** 角色列表（返回 data 直接是数组，非 items 包装；字段：name/display_name/level/category/description/is_system） */
  listRoles() {
    return api.get('/auth/roles/list')
  },

  /** 角色权限矩阵 */
  listPermissions() {
    return api.get<{ items: Array<{ id: number; code: string; name: string; category: string }> }>(
      '/auth/permissions/list'
    )
  },

  // ── 会话/Token 健康 ──
  /** 活跃会话列表 */
  listSessions(params?: { page?: number; page_size?: number }) {
    return api.get('/auth/sessions/list', { params })
  },

  /** 吊销会话 */
  revokeSession(sessionId: string) {
    return api.post(`/auth/sessions/${sessionId}/revoke`)
  },

  /** Token 健康状态（飞书 token 诊断） */
  tokenHealth() {
    return api.get<{
      items: Array<{
        account_id: number
        username: string
        has_token: boolean
        access_token_expires_at: string | null
        refresh_token_expires_at: string | null
        is_healthy: boolean
        days_until_refresh_expires: number | null
      }>
    }>('/auth/token-health')
  },

  // ── 审计日志 ──
  /** 登录活动日志（筛选 action=LOGIN 的审计记录） */
  listLoginActivity(params?: { page?: number; page_size?: number; account_id?: number; from_date?: string; to_date?: string }) {
    return api.get('/audit/logs', {
      params: { ...params, action: 'LOGIN' },
    })
  },

  /** 操作审计日志 */
  listAuditLogs(params?: { page?: number; page_size?: number; account_id?: number; action?: string }) {
    return api.get('/audit/logs', { params })
  },

  // ── 仪表盘统计 ──
  /** 治理台驾驶舱汇总 */
  dashboard() {
    return api.get<{
      total_accounts: number
      active_accounts: number
      total_roles: number
      active_sessions: number
      today_logins: number
      token_alerts: number
    }>('/auth/iam/dashboard')
  },
}

/** @deprecated 请使用 governanceApi，iamApi 将在后续版本移除 */
export const iamApi = governanceApi
