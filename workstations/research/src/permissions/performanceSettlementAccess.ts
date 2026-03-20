/**
 * 绩效结算模块访问白名单（仅以下人员可见/可访问）
 *
 * 说明：
 * - 以飞书登录后的姓名为主进行匹配（user.name / profile.display_name）
 * - 额外兼容 profile.username（若后续需要按账号ID控制，可补充）
 */
const ALLOWED_NAME_SET = new Set([
  '马蓓丽',
  '宋小沫',
  '杨管晟',
  '顾晶',
  '卫婷婷',
  '刘畅',
  '安慧',
  '孙瑶',
  '孙馨',
  '茅晓珏',
  '王劲浦',
  '姚志成',
])

function normalizeIdentity(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

interface PerfAccessContext {
  user?: { name?: string | null } | null
  profile?: {
    display_name?: string | null
    username?: string | null
    roles?: Array<{ name?: string | null } | string> | null
    permissions?: string[] | null
    visible_menu_items?: Record<string, string[]> | null
  } | null
}

function isAdminProfile(profile: PerfAccessContext['profile']): boolean {
  if (!profile) return false
  const roleNames = (profile.roles || [])
    .map((role) => (typeof role === 'string' ? role : role?.name || ''))
    .map((name) => normalizeIdentity(name).toLowerCase())
    .filter(Boolean)

  if (roleNames.some((name) => ['admin', 'superadmin', 'manager'].includes(name))) {
    return true
  }

  const permissions = (profile.permissions || []).map((p) => normalizeIdentity(p))
  return permissions.includes('system.role.manage')
}

export function canAccessPerformanceSettlement(ctx: PerfAccessContext | null | undefined): boolean {
  if (isAdminProfile(ctx?.profile)) return true

  // 优先使用后端画像菜单信号（单一真源）
  const researchMenus = ctx?.profile?.visible_menu_items?.research || []
  const normalizedMenus = researchMenus.map((m) => normalizeIdentity(m).toLowerCase())
  if (normalizedMenus.includes('closeout/settlement') || normalizedMenus.includes('closeout.settlement')) {
    return true
  }

  // 兼容后续新增权限码（若后端已下发）
  const permissions = (ctx?.profile?.permissions || []).map((p) => normalizeIdentity(p))
  if (permissions.includes('closeout.settlement.read')) return true

  const candidates = [
    normalizeIdentity(ctx?.user?.name),
    normalizeIdentity(ctx?.profile?.display_name),
    normalizeIdentity(ctx?.profile?.username),
  ].filter(Boolean)

  return candidates.some((name) => ALLOWED_NAME_SET.has(name))
}

export const PERFORMANCE_SETTLEMENT_ALLOWED_NAMES = Array.from(ALLOWED_NAME_SET)

