import type { UserInfo } from './types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isUserInfo(value: unknown): value is UserInfo {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.subjectNo === 'string' &&
    typeof value.enrollDate === 'string' &&
    typeof value.projectName === 'string'
  )
}

export function normalizeUser(rawUser: Record<string, unknown>): UserInfo {
  return {
    id: String(rawUser.id || ''),
    name: String(rawUser.display_name || rawUser.username || '受试者'),
    subjectNo: String(rawUser.subject_no || ''),
    enrollDate: String(rawUser.enroll_date || ''),
    projectName: String(rawUser.project_name || ''),
    account_type: (rawUser.account_type as UserInfo['account_type']) || undefined,
    roles: Array.isArray(rawUser.roles) ? (rawUser.roles as string[]) : undefined,
    primary_role: typeof rawUser.primary_role === 'string' ? rawUser.primary_role : undefined,
  }
}

export function extractLoginPayload(res: unknown): { access_token?: string; user?: Record<string, unknown>; msg?: string } {
  if (!isRecord(res)) return {}
  if (isRecord(res.data)) {
    return {
      access_token: typeof res.data.access_token === 'string' ? res.data.access_token : undefined,
      user: isRecord(res.data.user) ? res.data.user : undefined,
      msg: typeof res.msg === 'string' ? res.msg : undefined,
    }
  }
  return {
    access_token: typeof res.access_token === 'string' ? res.access_token : undefined,
    user: isRecord(res.user) ? res.user : undefined,
    msg: typeof res.msg === 'string' ? res.msg : undefined,
  }
}
