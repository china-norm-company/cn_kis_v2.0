import { Component, type ErrorInfo, type ReactNode } from 'react'

export interface ErrorBoundaryProps {
  children: ReactNode
  workstation?: string
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo)
    try {
      const payload = {
        workstation: this.props.workstation || 'unknown',
        error_type: 'react_boundary',
        message: error.message,
        stack: error.stack?.slice(0, 2000),
      }
      navigator.sendBeacon?.('/api/v1/log/frontend-error', JSON.stringify(payload))
    } catch { /* best-effort */ }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  private handleClearAndReload = () => {
    try {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      localStorage.removeItem('auth_profile')
      localStorage.removeItem('auth_roles')
      localStorage.removeItem('auth_workbenches')
    } catch { /* ignore */ }
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: '#f8fafc',
      }}>
        <div style={{
          maxWidth: 420, padding: 32, textAlign: 'center',
          background: '#fff', borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
            background: '#fef2f2', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#dc2626', fontSize: 24,
          }}>!</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1e293b', margin: '0 0 8px' }}>
            页面出现异常
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px', lineHeight: 1.6 }}>
            {this.state.error?.message || '未知错误，请重试或清除缓存重新登录。'}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={this.handleRetry} style={{
              padding: '8px 20px', borderRadius: 8, border: '1px solid #e2e8f0',
              background: '#fff', color: '#334155', fontSize: 14,
              fontWeight: 500, cursor: 'pointer',
            }}>
              重试
            </button>
            <button onClick={this.handleClearAndReload} style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: '#3b82f6', color: '#fff', fontSize: 14,
              fontWeight: 500, cursor: 'pointer',
            }}>
              清除缓存重新登录
            </button>
          </div>
        </div>
      </div>
    )
  }
}
