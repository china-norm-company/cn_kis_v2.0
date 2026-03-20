import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createApiClient } from '@cn-kis/api-client'
import App from './App'
import './styles/globals.css'

// 最早初始化 API 客户端（含 dev-bypass token），确保首次请求即携带认证
const DEV_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === '1'
const DEV_TOKEN = 'dev-bypass-token'
if (DEV_BYPASS) {
  try {
    if (!localStorage.getItem('auth_token')) localStorage.setItem('auth_token', DEV_TOKEN)
  } catch { /* ignore */ }
}
createApiClient({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 30000,
  getToken: () => {
    const stored = localStorage.getItem('auth_token')
    if (DEV_BYPASS && !stored) return DEV_TOKEN
    return stored
  },
  onUnauthorized: () => {
    if (DEV_BYPASS) return
    localStorage.removeItem('auth_token')
    window.location.hash = '#/login'
  },
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 0,
      refetchOnWindowFocus: false,
      throwOnError: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
