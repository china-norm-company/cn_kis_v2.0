import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { UserInfo } from '@cn-kis/subject-core'
import { rnAuthProvider, fetchAndMergeProfile } from '../adapters/rnAuthProvider'
import * as SecureStore from 'expo-secure-store'

interface AuthState {
  isLoggedIn: boolean
  user: UserInfo | null
  roles: string[]
  accountType: string
  loading: boolean
  login: (phone: string, code: string) => Promise<UserInfo | null>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  isLoggedIn: false,
  user: null,
  roles: [],
  accountType: '',
  loading: true,
  login: async () => null,
  logout: async () => {},
  refresh: async () => {},
})

export function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const loggedIn = await rnAuthProvider.isLoggedIn()
    setIsLoggedIn(loggedIn)
    if (loggedIn) {
      // 冷启动角色刷新：调 /auth/profile 刷新角色信息，更新 SecureStore
      try {
        const currentInfo = await rnAuthProvider.getLocalUserInfo()
        if (currentInfo) {
          const refreshed = await fetchAndMergeProfile(currentInfo)
          await SecureStore.setItemAsync('userInfo', JSON.stringify(refreshed))
          setUser(refreshed)
          return
        }
      } catch {
        // 刷新失败，使用缓存数据
      }
      const info = await rnAuthProvider.getLocalUserInfo()
      setUser(info)
    } else {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const login = useCallback(async (phone: string, code: string) => {
    const result = await rnAuthProvider.loginWithSms?.({ phone, code }) ?? null
    if (result) {
      setUser(result)
      setIsLoggedIn(true)
    }
    return result
  }, [])

  const logout = useCallback(async () => {
    await rnAuthProvider.logout()
    setUser(null)
    setIsLoggedIn(false)
  }, [])

  const roles = Array.isArray(user?.roles) ? (user!.roles as string[]) : []
  const accountType = user?.account_type || ''

  return (
    <AuthContext.Provider value={{ isLoggedIn, user, roles, accountType, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
