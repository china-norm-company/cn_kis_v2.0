import { useLayoutEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { tryNavigateExecutionPostAuthDeepLink } from '../utils/executionPostAuthDeepLink'

/**
 * 替换 index 上的 `<Navigate to="/dashboard" />`，避免与 PostAuth 竞态：
 * React 会先执行更深子树的 layout effect，Navigate 会先推到 /dashboard，覆盖知情深链恢复。
 * 此处在同一处 effect 内：先 restore_hash / peek，再默认进仪表盘。
 */
export function ExecutionHomeRedirect() {
  const navigate = useNavigate()
  const location = useLocation()

  useLayoutEffect(() => {
    let done = false
    const delays = [0, 40, 120, 280, 500]
    const timers: number[] = []
    delays.forEach((ms, i) => {
      const id = window.setTimeout(() => {
        if (done) return
        if (tryNavigateExecutionPostAuthDeepLink(navigate, location.pathname)) {
          done = true
          return
        }
        const isLast = i === delays.length - 1
        if (isLast) {
          if (import.meta.env.DEV && typeof window !== 'undefined') {
            console.error('[ExecutionHomeRedirect]', 'fallback to /dashboard', {
              pathname: location.pathname,
              key: location.key,
              hash: window.location.hash,
            })
          }
          navigate('/dashboard', { replace: true })
        }
      }, ms)
      timers.push(id)
    })
    return () => {
      done = true
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [navigate, location.pathname, location.key])

  return null
}
