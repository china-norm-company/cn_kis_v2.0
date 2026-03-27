import { useEffect } from 'react'
import { createApiClient } from '@cn-kis/api-client'

let initialized = false

export interface UseApiInitOptions {
  onUnauthorized?: () => void
}

export function useApiInit(options?: UseApiInitOptions) {
  const { onUnauthorized } = options ?? {}
  useEffect(() => {
    if (initialized) return
    initialized = true

    createApiClient({
      baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
      timeout: 30000,
      getToken: () => localStorage.getItem('auth_token'),
      onUnauthorized: () => {
        try {
          localStorage.removeItem('auth_token')
          localStorage.removeItem('auth_user')
          localStorage.removeItem('auth_profile')
          localStorage.removeItem('auth_profile_token')
        } catch {
          /* ignore */
        }
        onUnauthorized?.()
      },
    })
  }, [onUnauthorized])
}
