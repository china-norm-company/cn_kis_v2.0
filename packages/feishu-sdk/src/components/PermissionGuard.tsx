/**
 * 权限守卫组件
 *
 * 根据角色/权限控制子组件的显示。
 * 支持权限检查、角色检查、工作台检查。
 */
import type { ReactNode } from 'react'
import { useFeishuContext } from '../provider'

interface PermissionGuardProps {
  /** 需要的权限（单个） */
  permission?: string
  /** 需要的权限（任一满足） */
  anyPermission?: string[]
  /** 需要的权限（全部满足） */
  allPermissions?: string[]
  /** 需要的角色（单个） */
  role?: string
  /** 需要的角色（任一满足） */
  anyRole?: string[]
  /** 需要的工作台访问权限 */
  workbench?: string
  /** 无权限时显示的后备内容 */
  fallback?: ReactNode
  /** 子组件 */
  children: ReactNode
}

/**
 * 权限守卫组件
 *
 * @example
 * // 单权限检查
 * <PermissionGuard permission="crm.client.create">
 *   <CreateClientButton />
 * </PermissionGuard>
 *
 * // 角色检查
 * <PermissionGuard anyRole={['admin', 'project_manager']}>
 *   <AdminPanel />
 * </PermissionGuard>
 *
 * // 工作台检查
 * <PermissionGuard workbench="finance">
 *   <FinanceLink />
 * </PermissionGuard>
 */
export function PermissionGuard({
  permission,
  anyPermission,
  allPermissions,
  role,
  anyRole,
  workbench,
  fallback = null,
  children,
}: PermissionGuardProps) {
  const ctx = useFeishuContext()

  const { isAdmin, hasPermission, hasAnyPermission, hasAllPermissions, hasRole, hasAnyRole, canAccessWorkbench } = ctx

  if (isAdmin) return <>{children}</>

  if (permission && !hasPermission(permission)) {
    return <>{fallback}</>
  }

  if (anyPermission && anyPermission.length > 0 && !hasAnyPermission(anyPermission)) {
    return <>{fallback}</>
  }

  if (allPermissions && allPermissions.length > 0 && !hasAllPermissions(allPermissions)) {
    return <>{fallback}</>
  }

  if (role && !hasRole(role)) {
    return <>{fallback}</>
  }

  if (anyRole && anyRole.length > 0 && !hasAnyRole(anyRole)) {
    return <>{fallback}</>
  }

  if (workbench && !canAccessWorkbench(workbench)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

export default PermissionGuard
