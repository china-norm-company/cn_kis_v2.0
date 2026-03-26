import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// 本地开发时使用服务器生成的测试 JWT，直接注入到 /v2/api 代理请求中
// 避免 dev-bypass-token 被 V2 后端拒绝
const DEV_V2_TOKEN = process.env.DEV_V2_TOKEN ?? ''

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 3009,
    proxy: {
      '/v2/api': {
        target: 'https://china-norm.com',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          if (!DEV_V2_TOKEN) return
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Authorization', `Bearer ${DEV_V2_TOKEN}`)
          })
        },
      },
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  base: '/recruitment/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
