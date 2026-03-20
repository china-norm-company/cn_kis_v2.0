export const AUTH_LEVEL = {
  GUEST: 'guest',
  PHONE_VERIFIED: 'phone_verified',
  IDENTITY_VERIFIED: 'identity_verified',
} as const

export type AuthLevel = (typeof AUTH_LEVEL)[keyof typeof AUTH_LEVEL]

export interface IdentityStatusData {
  auth_level: AuthLevel
  identity_verified_at: string | null
  identity_verify_status: string | null
  phone_masked: string | null
  id_card_masked: string | null
  trace_id: string | null
}

export function isL2(authLevel: AuthLevel | string | null | undefined): boolean {
  return authLevel === AUTH_LEVEL.IDENTITY_VERIFIED
}
