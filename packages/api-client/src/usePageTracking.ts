/**
 * usePageTracking — 前端埋点 Hook（Wave 5 Task 5-3）
 *
 * 在每个工作台的路由组件中调用，自动完成：
 *   1. 路由变更时发送 page_view 事件
 *   2. 页面卸载/隐藏时发送 session_end 事件（携带停留时长）
 *
 * 用法：
 *   // 在 AppLayout 或根路由组件中
 *   import { usePageTracking } from '@cn-kis/api-client'
 *   usePageTracking('governance')     // 鹿鸣·治理台
 *   usePageTracking('data-platform')  // 洞明·数据台
 *
 * 工作台标识（workstation）：
 *   governance / data-platform / secretary / research / finance /
 *   reception / evaluator / material / facility / quality / safety /
 *   recruitment / workflow / closeout / ethics / equipment / digital-workforce
 */
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { auditApi } from './modules/audit'

const MIN_TRACK_INTERVAL_MS = 500  // 防抖：同一页面 500ms 内不重复上报

export function usePageTracking(workstation: string) {
  const location = useLocation()
  const enterTimeRef = useRef<number>(Date.now())
  const lastPageRef = useRef<string>('')
  const lastTrackTimeRef = useRef<number>(0)

  useEffect(() => {
    const page = location.pathname || '/'
    const now = Date.now()

    // 防抖：同一页面短时间内不重复上报
    if (page === lastPageRef.current && now - lastTrackTimeRef.current < MIN_TRACK_INTERVAL_MS) {
      return
    }

    // 如果从上一个页面离开，发送 session_end
    if (lastPageRef.current && lastPageRef.current !== page) {
      const duration = now - enterTimeRef.current
      auditApi.trackEvent({
        event_type: 'session_end',
        workstation,
        page: lastPageRef.current,
        duration_ms: duration,
      }).catch(() => { /* 静默失败 */ })
    }

    // 发送新页面的 page_view
    auditApi.trackEvent({
      event_type: 'page_view',
      workstation,
      page,
    }).catch(() => { /* 静默失败 */ })

    lastPageRef.current = page
    enterTimeRef.current = now
    lastTrackTimeRef.current = now
  }, [location.pathname, workstation])

  // 页面卸载时发送最后一条 session_end
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && lastPageRef.current) {
        const duration = Date.now() - enterTimeRef.current
        // 使用 sendBeacon 保证页面关闭时也能发送
        const payload = JSON.stringify({
          event_type: 'session_end',
          workstation,
          page: lastPageRef.current,
          duration_ms: duration,
        })
        try {
          const apiBase = (window as any).__CN_KIS_API_BASE__ || '/v2/api/v1'
          navigator.sendBeacon(`${apiBase}/audit/track`, new Blob([payload], { type: 'application/json' }))
        } catch {
          // sendBeacon 不支持时静默失败
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [workstation])
}

/**
 * trackFeatureClick — 功能点击埋点工具函数
 *
 * 在关键操作按钮的 onClick 中调用，记录功能使用频次。
 *
 * 用法：
 *   <button onClick={() => { trackFeatureClick('governance', '/roles', 'assign_role'); doAssign() }}>
 *     分配角色
 *   </button>
 */
export function trackFeatureClick(workstation: string, page: string, feature: string, extra?: Record<string, unknown>) {
  auditApi.trackEvent({
    event_type: 'feature_click',
    workstation,
    page,
    feature,
    extra,
  }).catch(() => { /* 静默失败 */ })
}
