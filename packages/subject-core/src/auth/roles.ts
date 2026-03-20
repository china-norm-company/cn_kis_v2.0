/**
 * 角色工具函数 — 跨端（微信小程序、RN App）共享
 *
 * 角色来自后端 GET /auth/profile 的 roles[] 字段。
 * 三种账号类型对应的分流逻辑：
 *   subject  → 受试者端页面
 *   internal → 按角色组分流（FIELD_EXECUTOR → 技术员台，其他 → 默认）
 *   external → 默认受试者端
 */

export const ROLE_GROUPS = {
  /** 现场执行人员：技术员、评估员、临床执行、前台接待 */
  FIELD_EXECUTOR: ['evaluator', 'technician', 'clinical_executor', 'receptionist'] as const,
  /** 运营支持：招募、QA、排程、实验室人员 */
  OPERATION_SUPPORT: ['recruiter', 'qa', 'scheduler', 'lab_personnel'] as const,
  /** 管理层：超管、管理员、总经理、项目负责人 */
  MANAGEMENT: ['superadmin', 'admin', 'general_manager', 'project_director'] as const,
  /** 研究职能：PI、CRC、研究助理 */
  RESEARCH: ['pi', 'crc', 'research_assistant'] as const,
} as const

/** 角色优先级，数值越大优先级越高（用于 primary_role 计算） */
const ROLE_PRIORITY: Record<string, number> = {
  superadmin: 100,
  admin: 90,
  general_manager: 85,
  project_director: 80,
  pi: 70,
  crc: 60,
  evaluator: 50,
  technician: 50,
  clinical_executor: 45,
  receptionist: 40,
  recruiter: 35,
  qa: 35,
  scheduler: 30,
  lab_personnel: 25,
  research_assistant: 20,
  viewer: 5,
}

/**
 * 从 roles 数组计算主角色（最高优先级）
 */
export function computePrimaryRole(roles: string[]): string {
  if (!roles || roles.length === 0) return 'viewer'
  return roles.reduce((best, role) => {
    const bestPriority = ROLE_PRIORITY[best] ?? 0
    const rolePriority = ROLE_PRIORITY[role] ?? 0
    return rolePriority > bestPriority ? role : best
  }, roles[0])
}

/**
 * 是否为现场执行人员（技术员、评估员等）
 * 这类用户登录后应跳转到技术员/工单界面
 */
export function isFieldExecutor(roles: string[]): boolean {
  if (!roles || roles.length === 0) return false
  return ROLE_GROUPS.FIELD_EXECUTOR.some((r) => roles.includes(r))
}

/**
 * 是否为接待员（登录后跳转接待队列看板）
 */
export function isReceptionist(roles: string[]): boolean {
  if (!roles || roles.length === 0) return false
  return roles.includes('receptionist')
}

/**
 * 是否为质检人员（QA）
 */
export function isQA(roles: string[]): boolean {
  if (!roles || roles.length === 0) return false
  return roles.includes('qa')
}

/**
 * 是否为管理层
 */
export function isManagement(roles: string[]): boolean {
  if (!roles || roles.length === 0) return false
  return ROLE_GROUPS.MANAGEMENT.some((r) => roles.includes(r))
}

/**
 * 是否为受试者账号类型
 */
export function isSubjectAccount(accountType?: string): boolean {
  return accountType === 'subject'
}

/**
 * 是否为内部员工账号类型
 */
export function isInternalAccount(accountType?: string): boolean {
  return accountType === 'internal'
}

/**
 * 根据 accountType 和 roles 决定登录后的导航目标
 * 返回路由 key，由各端自行映射到实际页面路径
 */
export type RouteTarget =
  | 'subject_home'
  | 'technician_workbench'
  | 'reception_board'
  | 'staff_home'

export function resolveLoginRoute(accountType?: string, roles?: string[]): RouteTarget {
  if (isSubjectAccount(accountType)) return 'subject_home'

  if (!roles || roles.length === 0) return 'subject_home'

  // 接待员优先跳转接待台
  if (isReceptionist(roles)) return 'reception_board'

  // 现场执行人员跳转技术员工作台
  if (isFieldExecutor(roles)) return 'technician_workbench'

  // 其他内部员工（管理、研究等）
  if (isInternalAccount(accountType)) return 'staff_home'

  return 'subject_home'
}
