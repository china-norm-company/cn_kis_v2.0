import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'

const AUTH_TOKEN_KEY = 'auth_token'
const AUTH_USER_KEY = 'auth_user'
const AUTH_TOKEN_TS_KEY = 'auth_token_ts'

const DEV_USER = { name: '联调用户', id: 'dev-inject', email: 'dev@cn-kis.local', avatar: '' }

export function DevTokenInjectPage() {
  const [token, setToken] = useState('')
  const [done, setDone] = useState(false)
  const navigate = useNavigate()

  const handleInject = () => {
    const t = token.trim()
    if (!t) return
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, t)
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(DEV_USER))
      localStorage.setItem(AUTH_TOKEN_TS_KEY, String(Date.now()))
      setDone(true)
      setTimeout(() => navigate('/portal', { replace: true }), 600)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-slate-700">
          <KeyRound className="h-5 w-5" />
          <h1 className="text-lg font-semibold">中书联调：注入 Token</h1>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          用于本地联调中书·智能台。粘贴已登录环境中的 <code className="rounded bg-slate-100 px-1">auth_token</code> 后进入工作台。
        </p>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="粘贴 auth_token..."
          className="mb-4 h-24 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-mono"
          rows={4}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleInject}
            disabled={!token.trim() || done}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {done ? '已注入，跳转中…' : '注入并进入中书'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
