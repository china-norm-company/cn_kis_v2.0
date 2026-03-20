import type { UserInfo } from './types'
import { isUserInfo } from './helpers'
import type { StorageAdapter } from '../adapters/storage'

export async function getLocalUserInfo(storage: StorageAdapter): Promise<UserInfo | null> {
  try {
    const raw = await storage.get('userInfo')
    const parsed = raw ? JSON.parse(String(raw)) : null
    return isUserInfo(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function isLoggedIn(storage: StorageAdapter): Promise<boolean> {
  return !!(await storage.get('token'))
}

export async function saveLogin(storage: StorageAdapter, token: string, user: UserInfo): Promise<void> {
  await storage.set('token', token)
  await storage.set('userInfo', JSON.stringify(user))
}

export async function logout(storage: StorageAdapter): Promise<void> {
  await storage.remove('token')
  await storage.remove('userInfo')
}
