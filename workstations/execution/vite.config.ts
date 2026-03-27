import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 与 workstations/wechat-mini 一致：开发/打包直接解析源码，不依赖先 tsc 出 dist（package 仍导出 dist 供 Node/发布）
      '@cn-kis/consent-placeholders': path.resolve(
        __dirname,
        '../../packages/consent-placeholders/src/index.ts',
      ),
    },
  },
  server: {
    host: true,
    port: 3007,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  base: '/execution/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
