import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useFeishuContext } from '@cn-kis/feishu-sdk'
import { tryNavigateExecutionPostAuthDeepLink } from '../utils/executionPostAuthDeepLink'

/**
 * 邮件核验页 → 未登录点「打开知情管理 / 双签名单」会先走飞书 OAuth，回调 reload 会丢失 hash 中的 focus 参数。
 * 1）换票成功后 cnkis.oauth.restore_hash（OAuth state 带回，解决 127.0.0.1 与 localhost 不同源）
 * 2）同源的 sessionStorage peek（兜底）
 *
 * 根路径 `/` 的默认跳转由 ExecutionHomeRedirect 处理，避免与 react-router 的 <Navigate> 竞态。
 */
export function PostAuthPendingDeepLink() {
  const { isAuthenticated, loading } = useFeishuContext()
  const navigate = useNavigate()
  const location = useLocation()
  const appliedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) appliedRef.current = false
  }, [isAuthenticated])

  useLayoutEffect(() => {
    if (loading || !isAuthenticated) return
    if (appliedRef.current) return
    /** OAuth 换票后 reload 与 storage 写入存在极短竞态，多试几次避免 raw 仍为 null 时误判 */
    let cancelled = false
    const delays = [0, 30, 80, 160, 320, 600]
    const timers: number[] = []
    delays.forEach((ms) => {
      const id = window.setTimeout(() => {
        if (cancelled || appliedRef.current) return
        if (tryNavigateExecutionPostAuthDeepLink(navigate, location.pathname)) {
          appliedRef.current = true
        }
      }, ms)
      timers.push(id)
    })
    return () => {
      cancelled = true
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [loading, isAuthenticated, location.pathname, location.key, navigate])

  return null
}
