import { useCallback, useEffect, useState } from 'react'
import type { AuthProvider, UserInfo } from '../auth/types'

export function useProfileAuth(authProvider: AuthProvider) {
  const [loggedIn, setLoggedIn] = useState(false)
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)

  const refresh = useCallback(async () => {
    const tokenOk = await authProvider.isLoggedIn()
    setLoggedIn(tokenOk)
    const info = await authProvider.getLocalUserInfo()
    setUserInfo(info)
  }, [authProvider])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const doLogout = async () => {
    await authProvider.logout()
    await refresh()
  }

  return { loggedIn, userInfo, refresh, doLogout }
}
