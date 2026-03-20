/**
 * 离线提示条 — 网络断开时显示在页面顶部
 */
export interface OfflineBannerProps {
  visible: boolean
}

export function OfflineBanner({ visible }: OfflineBannerProps) {
  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#fbbf24', color: '#78350f',
      padding: '6px 16px', fontSize: 13, fontWeight: 500,
      textAlign: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    }}>
      网络已断开，部分功能不可用。请检查网络连接。
    </div>
  )
}
