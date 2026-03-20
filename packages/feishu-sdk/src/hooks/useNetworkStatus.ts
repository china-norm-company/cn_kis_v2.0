/**
 * 网络状态感知 Hook
 *
 * 监听 online/offline 事件，恢复在线后自动重新验证 token。
 */
import { useState, useEffect, useCallback } from 'react'

export interface UseNetworkStatusOptions {
  onReconnect?: () => void
}

export function useNetworkStatus(options?: UseNetworkStatusOptions) {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  const revalidateToken = useCallback(() => {
    try {
      const token = localStorage.getItem('auth_token')
      const ts = localStorage.getItem('auth_token_ts')
      if (token && ts) {
        const age = Date.now() - Number(ts)
        if (age > 24 * 60 * 60 * 1000) {
          localStorage.removeItem('auth_token')
          localStorage.removeItem('auth_user')
          localStorage.removeItem('auth_profile')
          localStorage.removeItem('auth_roles')
          localStorage.removeItem('auth_workbenches')
          localStorage.removeItem('auth_token_ts')
          window.location.reload()
          return
        }
      }
    } catch { /* ignore */ }
    options?.onReconnect?.()
  }, [options])

  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      revalidateToken()
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [revalidateToken])

  return { online, offline: !online }
}
