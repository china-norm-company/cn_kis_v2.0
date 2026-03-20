/**
 * 通用登录回退组件
 *
 * 当飞书端内免登失败或在浏览器打开时，显示登录按钮引导用户跳转 OAuth。
 */
import type { ReactNode } from 'react'

interface LoginFallbackProps {
  /** 工作台名称 */
  title?: string
  /** 点击登录按钮的回调 */
  onLogin: () => void
  /** 自定义内容 */
  children?: ReactNode
}

export function LoginFallback({ title = 'CN KIS', onLogin, children }: LoginFallbackProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      gap: '24px',
      background: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 16,
        background: '#3b82f6',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        fontWeight: 700,
      }}>
        KIS
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: '#1e293b', margin: 0 }}>
        {title}
      </h1>
      <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
        请使用飞书账号登录后继续
      </p>
      {children}
      <button
        onClick={onLogin}
        style={{
          padding: '12px 32px',
          background: '#3b82f6',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        飞书登录
      </button>
    </div>
  )
}
