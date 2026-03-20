import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      // AI 解析服务代理（与 KIS 一致：/aiapi -> ProtocolExtractV2 服务，默认用 KIS 同一地址）
      '/aiapi': {
        target: process.env.VITE_AIAPI_TARGET || 'http://11nzxz3591157.vicp.fun:49846',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/aiapi/, ''),
      },
    },
  },
  base: '/research/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
