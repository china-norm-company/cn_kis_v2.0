import { displayOwnerName } from '../utils/displayOwnerName'

/**
 * 与 backend/apps/crm/opportunity_constants.COMMERCIAL_OWNER_NAME_ORDER 一致
 */
export const COMMERCIAL_OWNER_NAME_ORDER = [
  '马蓓丽',
  '顾雯雯',
  '孙华',
  '蒋艳雯',
  '李韶',
  '杨管晟',
  '顾晶',
  '卫婷婷',
  '伍虹宇',
  '张红霞',
  '未确认',
] as const

/** 编辑回填：有 owner_id 用正 id；否则按姓名匹配名单负 id */
export function commercialOwnerSelectValue(
  ownerId: number | null | undefined,
  commercialOwnerName: string | undefined,
  ownerFallback: string | undefined,
): string {
  if (ownerId != null && ownerId !== undefined) return String(ownerId)
  const nm = displayOwnerName((commercialOwnerName || ownerFallback || '').trim())
  const idx = (COMMERCIAL_OWNER_NAME_ORDER as readonly string[]).indexOf(nm)
  if (idx >= 0) return String(-(idx + 1))
  return ''
}
