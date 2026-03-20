/**
 * 前端健康检查页 — 快速定位前端/后端/认证问题
 */
import { useState, useEffect } from 'react'

export interface HealthPageProps {
  workstation: string
  appId?: string
  apiBaseUrl?: string
}

interface CheckResult {
  label: string
  status: 'ok' | 'error' | 'checking'
  detail?: string
}

export function HealthPage({ workstation, appId, apiBaseUrl = '/api/v1' }: HealthPageProps) {
  const [checks, setChecks] = useState<CheckResult[]>([])
  const [ts] = useState(() => new Date().toLocaleString('zh-CN'))

  useEffect(() => {
    const results: CheckResult[] = [
      { label: '工作台名称', status: 'ok', detail: workstation },
      { label: 'App ID', status: appId ? 'ok' : 'error', detail: appId || '未配置' },
      {
        label: 'Token 状态',
        status: 'checking',
      },
      { label: 'API 连通性', status: 'checking' },
      { label: '网络状态', status: navigator.onLine ? 'ok' : 'error', detail: navigator.onLine ? '在线' : '离线' },
      { label: '浏览器环境', status: 'ok', detail: /lark|feishu/i.test(navigator.userAgent) ? '飞书客户端' : '浏览器' },
    ]
    setChecks([...results])

    const token = localStorage.getItem('auth_token')
    const tokenTs = localStorage.getItem('auth_token_ts')
    if (token) {
      const age = tokenTs ? Math.round((Date.now() - Number(tokenTs)) / 1000 / 60) : -1
      const expired = age > 24 * 60
      results[2] = {
        label: 'Token 状态',
        status: expired ? 'error' : 'ok',
        detail: expired ? `已过期（${age} 分钟前获取）` : `有效（${age >= 0 ? age + ' 分钟前获取' : '无时间戳'}）`,
      }
    } else {
      results[2] = { label: 'Token 状态', status: 'error', detail: '未登录' }
    }
    setChecks([...results])

    fetch(`${apiBaseUrl}/health`)
      .then((r) => r.json())
      .then((json) => {
        results[3] = {
          label: 'API 连通性',
          status: json?.data?.status === 'healthy' ? 'ok' : 'error',
          detail: `DB: ${json?.data?.database || 'unknown'}, Django: ${json?.data?.django || 'unknown'}`,
        }
        setChecks([...results])
      })
      .catch((err) => {
        results[3] = { label: 'API 连通性', status: 'error', detail: err.message }
        setChecks([...results])
      })
  }, [workstation, appId, apiBaseUrl])

  const statusIcon = (s: CheckResult['status']) =>
    s === 'ok' ? '✓' : s === 'error' ? '✗' : '…'
  const statusColor = (s: CheckResult['status']) =>
    s === 'ok' ? '#16a34a' : s === 'error' ? '#dc2626' : '#94a3b8'

  return (
    <div style={{ maxWidth: 520, margin: '40px auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1e293b', margin: '0 0 4px' }}>
        健康检查
      </h2>
      <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 20px' }}>
        {ts}
      </p>
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {checks.map((c, i) => (
          <div
            key={c.label}
            style={{
              display: 'flex', alignItems: 'center', padding: '12px 16px',
              borderBottom: i < checks.length - 1 ? '1px solid #f1f5f9' : 'none',
            }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: 6, marginRight: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: c.status === 'ok' ? '#f0fdf4' : c.status === 'error' ? '#fef2f2' : '#f8fafc',
              color: statusColor(c.status), fontSize: 13, fontWeight: 700,
            }}>
              {statusIcon(c.status)}
            </span>
            <span style={{ flex: 1, fontSize: 14, color: '#334155' }}>{c.label}</span>
            <span style={{ fontSize: 13, color: statusColor(c.status) }}>{c.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
